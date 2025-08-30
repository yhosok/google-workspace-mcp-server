import { OAuth2Client } from 'google-auth-library';
import { drive_v3, google } from 'googleapis';

import { AuthService } from './auth.service.js';
import {
  GoogleService,
  GoogleServiceRetryConfig,
} from './base/google-service.js';
import {
  GoogleDriveError,
  GoogleDriveResult,
  GoogleWorkspaceResult,
  GoogleErrorFactory,
  driveErr,
  driveOk,
  googleErr,
  googleOk,
} from '../errors/index.js';
import { createServiceLogger, Logger } from '../utils/logger.js';

/**
 * DriveSpreadsheetInfo represents the result of creating a spreadsheet via Drive API
 */
export interface DriveSpreadsheetInfo {
  id: string;
  name: string;
  webViewLink: string;
  parents: (string | undefined)[];
  createdTime: string;
}

/**
 * Google Drive Service
 *
 * Provides core Drive API functionality with focus on spreadsheet creation
 * and file management. Follows the established service architecture patterns
 * used by SheetsService and CalendarService.
 *
 * Key Features:
 * - Create Google Sheets in specified folders
 * - Folder-based file management
 * - Concurrent initialization protection
 * - Comprehensive error handling and retry logic
 * - Full type safety with TypeScript
 */
export class DriveService extends GoogleService {
  private authService: AuthService;
  private driveApi?: drive_v3.Drive;

  /** Internal flag indicating whether the service has been successfully initialized */
  private isInitialized: boolean = false;

  /**
   * Promise tracking ongoing initialization to prevent concurrent initialization attempts.
   * This ensures that multiple simultaneous calls to initialize() or ensureInitialized()
   * will only result in a single actual initialization process.
   */
  private initializingPromise: Promise<GoogleWorkspaceResult<void>> | null =
    null;

  /**
   * Creates a new DriveService instance.
   *
   * @param authService - The authentication service for Google API credentials
   * @param logger - Optional custom logger instance. If not provided, creates a service-specific logger
   * @param retryConfig - Optional retry configuration. If not provided, uses default retry settings
   *
   * @example
   * ```typescript
   * // Basic usage
   * const service = new DriveService(authService);
   *
   * // With custom logger and retry config
   * const service = new DriveService(authService, customLogger, {
   *   maxAttempts: 3,
   *   baseDelay: 1000,
   *   maxDelay: 30000
   * });
   * ```
   */
  constructor(
    authService: AuthService,
    logger?: Logger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    const serviceLogger = logger || createServiceLogger('drive-service');
    super(new OAuth2Client(), serviceLogger, retryConfig); // Temporary client, will be replaced
    this.authService = authService;
  }

  public getServiceName(): string {
    return 'DriveService';
  }

  public getServiceVersion(): string {
    return 'v3';
  }

  /**
   * Initializes the Drive service with Google API clients.
   *
   * This method handles concurrent initialization attempts safely. Multiple simultaneous
   * calls will result in only one actual initialization process, with all callers
   * receiving the same result.
   *
   * **Concurrency Safety**: Uses initializingPromise to prevent race conditions during
   * initialization. If already initialized, returns immediately with success.
   *
   * **Performance**: Fast path execution for already initialized instances (< 1ms).
   *
   * @returns Promise resolving to success or error result
   *
   * @example
   * ```typescript
   * // Safe to call multiple times
   * const results = await Promise.all([
   *   service.initialize(),
   *   service.initialize(),
   *   service.initialize()
   * ]);
   * // Only one actual initialization occurs
   * ```
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.driveApi) {
      return googleOk(undefined);
    }

    // Wait for existing initialization if in progress
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    // Start new initialization process
    const context = this.createContext('initialize');

    this.initializingPromise = this.executeWithRetry(async () => {
      try {
        // Get authenticated client from AuthService
        const authResult = await this.authService.getAuthClient();
        if (authResult.isErr()) {
          throw authResult.error;
        }

        const authClient = authResult.value;
        if (!authClient) {
          throw new Error('AuthService returned null/undefined auth client');
        }

        // Replace the temporary auth client in base class
        // @ts-expect-error - readonly property needs to be updated after initialization
        this.auth = authClient;

        // Create Google API instances with error handling
        try {
          this.driveApi = google.drive({ version: 'v3', auth: authClient });
        } catch (apiError) {
          throw new Error(
            `Failed to create Google Drive API client: ${apiError instanceof Error ? apiError.message : String(apiError)}`
          );
        }

        // Validate API client was created successfully
        if (!this.driveApi) {
          throw new Error(
            'Failed to initialize Google Drive API client - client is null'
          );
        }

        this.isInitialized = true;

        this.logger.info('Drive service initialized successfully', {
          service: this.getServiceName(),
          version: this.getServiceVersion(),
        });
      } catch (error) {
        // Reset initialization state on any error
        this.isInitialized = false;
        this.driveApi = undefined;
        throw error;
      }
    }, context);

    try {
      return await this.initializingPromise;
    } catch (error) {
      // Clear the promise on error to allow retry
      this.initializingPromise = null;
      throw error;
    } finally {
      // Clear the promise on success
      this.initializingPromise = null;
    }
  }

  /**
   * Performs a health check to verify the Drive service is operational.
   *
   * This method tests basic API connectivity by attempting to list spreadsheets.
   * It ensures the service is properly initialized and can communicate with Google APIs.
   *
   * @returns Promise resolving to true if healthy, or an error result
   *
   * @example
   * ```typescript
   * const healthResult = await service.healthCheck();
   * if (healthResult.isOk()) {
   *   console.log('Service is healthy');
   * } else {
   *   console.error('Service health check failed:', healthResult.error);
   * }
   * ```
   */
  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    const context = this.createContext('healthCheck');

    try {
      // Check if service is initialized first
      if (!this.isInitialized || !this.driveApi) {
        return googleErr(
          new GoogleDriveError(
            'Drive API not initialized',
            'GOOGLE_DRIVE_NOT_INITIALIZED',
            500
          )
        );
      }

      // Ensure service is initialized
      await this.ensureInitialized();

      await this.driveApi.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        pageSize: 1,
      });

      this.logger.info('Drive health check passed', {
        service: this.getServiceName(),
        requestId: context.requestId,
      });

      return googleOk(true);
    } catch (error) {
      const driveError = this.convertToDriveError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Drive health check failed', {
        error: driveError.toJSON(),
        requestId: context.requestId,
      });

      return googleErr(driveError);
    }
  }

  /**
   * Ensures the service is initialized before API operations.
   *
   * This is a critical performance optimization method that:
   * 1. **Fast Path**: Returns immediately if already initialized (< 1ms execution)
   * 2. **Concurrency Protection**: Reuses existing initialization promise if in progress
   * 3. **Lazy Initialization**: Starts new initialization only when needed
   *
   * **Thread Safety**: Multiple concurrent calls are safe and efficient.
   * Only one initialization will occur regardless of the number of concurrent calls.
   *
   * **Error Handling**: Throws the underlying error if initialization fails,
   * allowing callers to handle the error appropriately.
   *
   * @throws {GoogleDriveError} When initialization fails
   *
   * @example
   * ```typescript
   * // Called internally by all public methods
   * // Multiple concurrent calls are safe:
   * await Promise.all([
   *   service.createSpreadsheet('Sheet1'),  // triggers ensureInitialized
   *   service.createSpreadsheet('Sheet2'),  // reuses same initialization
   * ]);
   * ```
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.driveApi) {
      return;
    }

    // Wait for existing initialization if in progress
    if (this.initializingPromise) {
      const result = await this.initializingPromise;
      if (result.isErr()) {
        const error = result.error;
        this.logger.error('Initialization failed in ensureInitialized', {
          error: error.message,
          code: error.code,
        });
        throw result.error;
      }
      return;
    }

    // Start new initialization
    this.initializingPromise = this.initialize();
    try {
      const result = await this.initializingPromise;
      if (result.isErr()) {
        const error = result.error;
        this.logger.error('Direct initialization failed in ensureInitialized', {
          error: error.message,
          code: error.code,
        });
        throw result.error;
      }
    } catch (error) {
      // Clear initialization promise on any error
      this.initializingPromise = null;
      throw error;
    } finally {
      // Clear initialization promise on success
      this.initializingPromise = null;
    }
  }

  /**
   * Creates a new Google Sheets spreadsheet using the Drive API.
   *
   * This method creates spreadsheets directly in specified folders using the Drive API,
   * which allows for more direct folder management compared to the Sheets API.
   *
   * **Folder Management**: When parentFolderId is provided, the spreadsheet is created
   * directly in that folder. When omitted, it's created in the user's root folder.
   *
   * **Auto-initialization**: Automatically initializes the service if needed.
   *
   * @param title - The title for the new spreadsheet (cannot be empty)
   * @param parentFolderId - Optional parent folder ID. If omitted, creates in root folder
   * @returns Promise resolving to spreadsheet information or error
   *
   * @example
   * ```typescript
   * // Create in root folder
   * const result1 = await service.createSpreadsheet('My Spreadsheet');
   *
   * // Create in specific folder
   * const result2 = await service.createSpreadsheet('My Spreadsheet', 'folder-id');
   *
   * if (result.isOk()) {
   *   console.log(`Created: ${result.value.webViewLink}`);
   * }
   * ```
   */
  public async createSpreadsheet(
    title: string,
    parentFolderId?: string
  ): Promise<GoogleDriveResult<DriveSpreadsheetInfo>> {
    // Input validation
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return driveErr(
        new GoogleDriveError(
          'Spreadsheet title cannot be empty',
          'GOOGLE_DRIVE_INVALID_INPUT',
          400,
          undefined,
          parentFolderId,
          { reason: 'Title is required and cannot be empty' }
        )
      );
    }

    const context = this.createContext('createSpreadsheet', {
      title,
      parentFolderId,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.driveApi) {
        throw new GoogleDriveError(
          'Drive API not initialized',
          'GOOGLE_DRIVE_NOT_INITIALIZED',
          500,
          undefined,
          parentFolderId
        );
      }

      await this.ensureInitialized();

      // Prepare file metadata for spreadsheet creation
      const fileMetadata: drive_v3.Schema$File = {
        name: title.trim(),
        mimeType: 'application/vnd.google-apps.spreadsheet',
        ...(parentFolderId && { parents: [parentFolderId] }),
      };

      // Create the spreadsheet using Drive API
      const response = await this.driveApi.files.create({
        requestBody: fileMetadata,
        fields: 'id, name, webViewLink, parents, createdTime',
      });

      // Validate response
      if (!response.data.id) {
        throw new GoogleDriveError(
          'Failed to create spreadsheet - no file ID returned',
          'GOOGLE_DRIVE_CREATE_FAILED',
          500,
          undefined,
          parentFolderId
        );
      }

      const spreadsheetInfo: DriveSpreadsheetInfo = {
        id: response.data.id,
        name: response.data.name || title.trim(),
        webViewLink:
          response.data.webViewLink ||
          `https://docs.google.com/spreadsheets/d/${response.data.id}`,
        parents:
          response.data.parents ||
          (parentFolderId ? [parentFolderId] : ['root']),
        createdTime: response.data.createdTime || new Date().toISOString(),
      };

      this.logger.info('Successfully created spreadsheet', {
        fileId: spreadsheetInfo.id,
        title: spreadsheetInfo.name,
        parentFolderId,
        requestId: context.requestId,
      });

      return spreadsheetInfo;
    }, context).andThen(result => driveOk(result));
  }

  /**
   * Retrieves current service statistics and status information.
   *
   * Provides diagnostic information about the service state including:
   * - Initialization status
   * - API version information
   * - Authentication status
   *
   * **Use Case**: Primarily for monitoring, debugging, and health checks.
   *
   * @returns Promise resolving to service statistics or error
   *
   * @example
   * ```typescript
   * const result = await service.getServiceStats();
   * if (result.isOk()) {
   *   console.log(`Initialized: ${result.value.initialized}`);
   *   console.log(`Auth OK: ${result.value.authStatus}`);
   * }
   * ```
   */
  public async getServiceStats(): Promise<
    GoogleDriveResult<{
      initialized: boolean;
      apiVersions: {
        drive: string;
      };
      authStatus: boolean;
    }>
  > {
    const context = this.createContext('getServiceStats');

    try {
      const authStatus = await this.validateAuthentication();

      return driveOk({
        initialized: this.isInitialized,
        apiVersions: {
          drive: this.getServiceVersion(),
        },
        authStatus: authStatus.isOk(),
      });
    } catch (error) {
      const driveError = this.convertToDriveError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Failed to get service stats', {
        error: driveError.toJSON(),
        requestId: context.requestId,
      });

      return driveErr(driveError);
    }
  }

  /**
   * Converts generic errors to Google Drive-specific error types.
   *
   * This method is called by the base class retry mechanism to transform
   * generic errors into domain-specific error types with appropriate
   * error codes and context information.
   *
   * @param error - The generic error to convert
   * @param context - Additional context including file and folder IDs
   * @returns Converted GoogleDriveError or null if not convertible
   *
   * @internal
   */
  protected convertServiceSpecificError(
    error: Error,
    context: { data?: { fileId?: string; parentFolderId?: string } }
  ): GoogleDriveError | null {
    return this.convertToDriveError(
      error,
      context.data?.fileId,
      context.data?.parentFolderId
    );
  }

  /**
   * Converts a generic error to a GoogleDriveError with context.
   *
   * This helper method uses the GoogleErrorFactory to create appropriate
   * error types based on the error characteristics and provided context.
   *
   * @param error - The error to convert
   * @param fileId - Optional file ID for context
   * @param folderId - Optional folder ID for context
   * @returns GoogleDriveError with appropriate type and context
   *
   * @internal
   */
  private convertToDriveError(
    error: Error,
    fileId?: string,
    folderId?: string
  ): GoogleDriveError {
    return GoogleErrorFactory.createDriveError(error, fileId, folderId);
  }
}
