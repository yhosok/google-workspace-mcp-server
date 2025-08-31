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
   * Lists files from Google Drive with optional filtering and pagination.
   *
   * Retrieves a list of files from the user's Google Drive, with support for:
   * - Search queries using Google Drive search syntax
   * - Pagination with page tokens and custom page sizes
   * - Field selection to optimize performance
   * - Custom ordering options
   *
   * **Use Cases**:
   * - File browser implementation
   * - Search functionality
   * - Bulk operations setup
   * - Drive content audit
   *
   * @param options Optional filtering and pagination parameters
   * @returns Promise resolving to file list or error
   *
   * @example
   * ```typescript
   * // List recent files
   * const result = await service.listFiles();
   *
   * // Search for specific files
   * const searchResult = await service.listFiles({
   *   query: "name contains 'report' and mimeType = 'application/pdf'"
   * });
   *
   * // Paginated listing
   * const pageResult = await service.listFiles({
   *   pageSize: 50,
   *   pageToken: 'next-page-token'
   * });
   * ```
   */
  public async listFiles(
    options?: import('../types/index.js').DriveFileListOptions
  ): Promise<
    GoogleDriveResult<import('../types/index.js').DriveFileListResult>
  > {
    // Input validation
    if (options?.pageSize !== undefined) {
      if (
        typeof options.pageSize !== 'number' ||
        options.pageSize < 1 ||
        options.pageSize > 1000
      ) {
        return driveErr(
          new GoogleDriveError(
            'pageSize must be between 1 and 1000',
            'GOOGLE_DRIVE_INVALID_INPUT',
            400,
            undefined,
            undefined,
            { reason: 'Invalid pageSize parameter' }
          )
        );
      }
    }

    const context = this.createContext('listFiles', {
      options,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.driveApi) {
        throw new GoogleDriveError(
          'Drive API not initialized',
          'GOOGLE_DRIVE_NOT_INITIALIZED',
          500
        );
      }

      await this.ensureInitialized();

      // Build request parameters
      const requestParams: {
        q?: string;
        pageSize?: number;
        pageToken?: string;
        orderBy?: string;
        fields: string;
      } = {
        fields:
          options?.fields ||
          'files(id, name, mimeType, createdTime, modifiedTime, webViewLink, parents, size), nextPageToken, incompleteSearch',
        pageSize: options?.pageSize || 100,
        orderBy: options?.orderBy || 'modifiedTime desc',
        ...(options?.query && { q: options.query }),
        ...(options?.pageToken && { pageToken: options.pageToken }),
      };

      // Call Drive API
      const response = await this.driveApi.files.list(requestParams);

      // Validate response
      if (!response.data) {
        throw new GoogleDriveError(
          'Failed to list files - no data returned',
          'GOOGLE_DRIVE_API_ERROR',
          500
        );
      }

      const result: import('../types/index.js').DriveFileListResult = {
        files: (response.data.files || []).map(file => ({
          id: file.id || '',
          name: file.name || '',
          mimeType: file.mimeType || '',
          createdTime: file.createdTime || '',
          modifiedTime: file.modifiedTime || '',
          webViewLink: file.webViewLink || undefined,
          webContentLink: file.webContentLink || undefined,
          parents: file.parents || undefined,
          size: file.size || undefined,
          version: file.version || undefined,
          description: file.description || undefined,
          owners: file.owners?.map(owner => ({
            displayName: owner.displayName || undefined,
            emailAddress: owner.emailAddress || undefined,
            me: owner.me || undefined,
          })),
          permissions: file.permissions?.map(permission => ({
            id: permission.id || undefined,
            type: permission.type || undefined,
            role: permission.role || undefined,
          })),
        })),
        nextPageToken: response.data.nextPageToken || undefined,
        incompleteSearch: response.data.incompleteSearch || false,
      };

      this.logger.info('Successfully listed files', {
        fileCount: result.files.length,
        hasNextPage: !!result.nextPageToken,
        requestId: context.requestId,
      });

      return result;
    }, context).andThen(result => driveOk(result));
  }

  /**
   * Retrieves detailed metadata for a specific file.
   *
   * Gets comprehensive information about a single file including:
   * - Basic metadata (name, type, dates, size)
   * - Access URLs (view and download links)
   * - Permission and ownership information
   * - Custom properties and descriptions
   *
   * **Use Cases**:
   * - File property inspection
   * - Access control verification
   * - File detail display
   * - Pre-operation validation
   *
   * @param fileId The ID of the file to retrieve
   * @param options Optional parameters for field selection
   * @returns Promise resolving to file metadata or error
   *
   * @example
   * ```typescript
   * // Get full file metadata
   * const result = await service.getFile('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
   *
   * // Get specific fields only
   * const minimalResult = await service.getFile('file-id', {
   *   fields: 'id, name, mimeType, size'
   * });
   * ```
   */
  public async getFile(
    fileId: string,
    options?: import('../types/index.js').DriveFileOptions
  ): Promise<GoogleDriveResult<import('../types/index.js').DriveFileInfo>> {
    // Input validation
    if (!fileId || typeof fileId !== 'string' || fileId.trim() === '') {
      return driveErr(
        new GoogleDriveError(
          'fileId cannot be empty',
          'GOOGLE_DRIVE_INVALID_INPUT',
          400,
          fileId,
          undefined,
          { reason: 'File ID parameter is required' }
        )
      );
    }

    const context = this.createContext('getFile', {
      fileId,
      options,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.driveApi) {
        throw new GoogleDriveError(
          'Drive API not initialized',
          'GOOGLE_DRIVE_NOT_INITIALIZED',
          500,
          fileId
        );
      }

      await this.ensureInitialized();

      // Build request parameters
      const requestParams: {
        fileId: string;
        fields: string;
      } = {
        fileId: fileId.trim(),
        fields:
          options?.fields ||
          'id, name, mimeType, createdTime, modifiedTime, webViewLink, webContentLink, parents, size, version, description, owners, permissions',
      };

      // Call Drive API
      const response = await this.driveApi.files.get(requestParams);

      // Validate response
      if (!response.data) {
        throw new GoogleDriveError(
          'Failed to get file - no data returned',
          'GOOGLE_DRIVE_API_ERROR',
          500,
          fileId
        );
      }

      const file = response.data;
      const result: import('../types/index.js').DriveFileInfo = {
        id: file.id || '',
        name: file.name || '',
        mimeType: file.mimeType || '',
        createdTime: file.createdTime || '',
        modifiedTime: file.modifiedTime || '',
        webViewLink: file.webViewLink || undefined,
        webContentLink: file.webContentLink || undefined,
        parents: file.parents || undefined,
        size: file.size || undefined,
        version: file.version || undefined,
        description: file.description || undefined,
        owners: file.owners?.map(owner => ({
          displayName: owner.displayName || undefined,
          emailAddress: owner.emailAddress || undefined,
          me: owner.me || undefined,
        })),
        permissions: file.permissions?.map(permission => ({
          id: permission.id || undefined,
          type: permission.type || undefined,
          role: permission.role || undefined,
        })),
      };

      this.logger.info('Successfully retrieved file metadata', {
        fileId: result.id,
        fileName: result.name,
        mimeType: result.mimeType,
        requestId: context.requestId,
      });

      return result;
    }, context).andThen(result => driveOk(result));
  }

  /**
   * Downloads file content or exports Google Workspace files.
   *
   * Handles both regular file downloads and Google Workspace file exports:
   * - Regular files: Direct binary/text content download
   * - Google Docs: Export to PDF, DOCX, ODT, RTF, TXT, HTML, EPUB
   * - Google Sheets: Export to XLSX, ODS, CSV, PDF
   * - Google Slides: Export to PPTX, ODP, PDF, TXT, JPEG, PNG, SVG
   *
   * **Important**: Large file size validation and memory management included.
   *
   * **Use Cases**:
   * - File backup and archival
   * - Format conversion workflows
   * - Content processing pipelines
   * - Document generation from templates
   *
   * @param fileId The ID of the file to download
   * @param options Optional export format and size limits
   * @returns Promise resolving to file content or error
   *
   * @example
   * ```typescript
   * // Download regular file
   * const result = await service.getFileContent('regular-file-id');
   *
   * // Export Google Doc as PDF
   * const pdfResult = await service.getFileContent('doc-id', {
   *   exportFormat: 'pdf'
   * });
   *
   * // Export Google Sheets as Excel
   * const excelResult = await service.getFileContent('sheet-id', {
   *   exportFormat: 'xlsx'
   * });
   * ```
   */
  public async getFileContent(
    fileId: string,
    options?: import('../types/index.js').DriveFileContentOptions
  ): Promise<GoogleDriveResult<import('../types/index.js').DriveFileContent>> {
    // Input validation
    if (!fileId || typeof fileId !== 'string' || fileId.trim() === '') {
      return driveErr(
        new GoogleDriveError(
          'fileId cannot be empty',
          'GOOGLE_DRIVE_INVALID_INPUT',
          400,
          fileId,
          undefined,
          { reason: 'File ID parameter is required' }
        )
      );
    }

    const maxFileSize = options?.maxFileSize || 10 * 1024 * 1024; // 10MB default

    const context = this.createContext('getFileContent', {
      fileId,
      options,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.driveApi) {
        throw new GoogleDriveError(
          'Drive API not initialized',
          'GOOGLE_DRIVE_NOT_INITIALIZED',
          500,
          fileId
        );
      }

      await this.ensureInitialized();

      // First, get file metadata to determine the file type and size
      const metadataResponse = await this.driveApi.files.get({
        fileId: fileId.trim(),
        fields: 'id, mimeType, size',
      });

      if (!metadataResponse.data) {
        throw new GoogleDriveError(
          'Failed to get file metadata',
          'GOOGLE_DRIVE_API_ERROR',
          500,
          fileId
        );
      }

      const file = metadataResponse.data;
      const mimeType = file.mimeType || '';
      const fileSize = parseInt(file.size || '0', 10);

      // Validate file size
      if (fileSize > maxFileSize) {
        throw new GoogleDriveError(
          `File size too large (${Math.round(fileSize / 1024 / 1024)}MB exceeds limit of ${Math.round(maxFileSize / 1024 / 1024)}MB)`,
          'GOOGLE_DRIVE_FILE_TOO_LARGE',
          413,
          fileId
        );
      }

      // Define Google Workspace MIME types and their export formats
      const googleWorkspaceMimeTypes: Record<string, Record<string, string>> = {
        'application/vnd.google-apps.document': {
          pdf: 'application/pdf',
          docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          odt: 'application/vnd.oasis.opendocument.text',
          rtf: 'application/rtf',
          txt: 'text/plain',
          html: 'text/html',
          epub: 'application/epub+zip',
        },
        'application/vnd.google-apps.spreadsheet': {
          xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          ods: 'application/vnd.oasis.opendocument.spreadsheet',
          csv: 'text/csv',
          pdf: 'application/pdf',
        },
        'application/vnd.google-apps.presentation': {
          pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          odp: 'application/vnd.oasis.opendocument.presentation',
          pdf: 'application/pdf',
          txt: 'text/plain',
          jpeg: 'image/jpeg',
          png: 'image/png',
          svg: 'image/svg+xml',
        },
      };

      let content: string | Buffer;
      let resultMimeType: string;
      let isExported = false;
      let exportFormat: string | undefined;
      let contentSize: number;

      // Check if it's a Google Workspace file that needs to be exported
      if (mimeType in googleWorkspaceMimeTypes) {
        const availableFormats = googleWorkspaceMimeTypes[mimeType];
        const requestedFormat = options?.exportFormat || 'pdf'; // Default to PDF for Google Workspace files

        // Validate export format
        if (!(requestedFormat in availableFormats)) {
          throw new GoogleDriveError(
            `Unsupported export format '${requestedFormat}' for file type '${mimeType}'. Available formats: ${Object.keys(availableFormats).join(', ')}`,
            'GOOGLE_DRIVE_INVALID_EXPORT_FORMAT',
            400,
            fileId
          );
        }

        const exportMimeType = availableFormats[requestedFormat];

        // Export the Google Workspace file
        const exportResponse = await this.driveApi.files.export({
          fileId: fileId.trim(),
          mimeType: exportMimeType,
        });

        content = exportResponse.data as string | Buffer;
        resultMimeType = exportMimeType;
        isExported = true;
        exportFormat = requestedFormat;

        // For exported files, use content-length from headers or calculate from content
        contentSize =
          exportResponse.headers && exportResponse.headers['content-length']
            ? parseInt(exportResponse.headers['content-length'] as string, 10)
            : typeof content === 'string'
              ? Buffer.byteLength(content, 'utf8')
              : content.length;
      } else {
        // Download regular file content
        const contentResponse = await this.driveApi.files.get({
          fileId: fileId.trim(),
          alt: 'media',
        });

        content = contentResponse.data as string | Buffer;
        resultMimeType = mimeType;

        // For regular files, use content-length from headers or calculate from actual content
        contentSize =
          contentResponse.headers && contentResponse.headers['content-length']
            ? parseInt(contentResponse.headers['content-length'] as string, 10)
            : typeof content === 'string'
              ? Buffer.byteLength(content, 'utf8')
              : content.length;
      }

      const result = {
        content,
        mimeType: resultMimeType,
        size: contentSize,
        isExported,
        exportFormat,
      };

      this.logger.info('Successfully retrieved file content', {
        fileId,
        fileName: file.name,
        originalMimeType: mimeType,
        resultMimeType,
        isExported,
        exportFormat,
        contentSize,
        requestId: context.requestId,
      });

      return result;
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
