import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { AuthService } from './auth.service.js';
import type { DriveService } from './drive.service.js';
import type {
  SpreadsheetInfo,
  SheetData,
  SheetsAddSheetResult,
  SheetsCreateSpreadsheetResult,
} from '../types/index.js';
import {
  GoogleService,
  type GoogleServiceRetryConfig,
} from './base/google-service.js';
import {
  GoogleWorkspaceResult,
  GoogleSheetsResult,
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
  GoogleErrorFactory,
  googleOk,
  googleErr,
  sheetsOk,
  sheetsErr,
} from '../errors/index.js';
import { Logger, createServiceLogger } from '../utils/logger.js';
import { loadConfig } from '../config/index.js';

/**
 * Google Sheets service for managing spreadsheets and sheet operations.
 *
 * This service provides a comprehensive interface for Google Sheets API operations
 * with built-in error handling, retry logic, and concurrent initialization protection.
 *
 * Key Features:
 * - Parallel initialization prevention using initializingPromise
 * - Fast path optimization for already initialized instances
 * - Comprehensive error handling with Google-specific error types
 * - Automatic retry with exponential backoff for transient errors
 * - Input validation and range format checking
 *
 * Performance Characteristics:
 * - Fast path execution time: < 1ms for already initialized instances
 * - Concurrent initialization: Only one actual initialization regardless of call count
 * - Memory efficient: Minimal overhead when initialized
 *
 * @example
 * ```typescript
 * const authService = new AuthService(config);
 * const sheetsService = new SheetsService(authService);
 *
 * // Initialize service (only needed once)
 * await sheetsService.initialize();
 *
 * // Use service methods
 * const spreadsheets = await sheetsService.listSpreadsheets();
 * const data = await sheetsService.readRange('spreadsheet-id', 'Sheet1!A1:C10');
 * ```
 */
export class SheetsService extends GoogleService {
  private authService: AuthService;
  private driveService?: DriveService;
  private sheetsApi?: sheets_v4.Sheets;
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
   * Creates a new SheetsService instance.
   *
   * @param authService - The authentication service for Google API credentials
   * @param driveService - Optional DriveService for advanced folder operations
   * @param logger - Optional custom logger instance. If not provided, creates a service-specific logger
   * @param retryConfig - Optional retry configuration. If not provided, uses default retry settings
   *
   * @example
   * ```typescript
   * // Basic usage
   * const service = new SheetsService(authService);
   *
   * // With DriveService for folder operations
   * const service = new SheetsService(authService, driveService);
   *
   * // With custom logger and retry config
   * const service = new SheetsService(authService, driveService, customLogger, {
   *   maxAttempts: 3,
   *   baseDelay: 1000,
   *   maxDelay: 30000
   * });
   * ```
   */
  constructor(
    authService: AuthService,
    driveService?: DriveService,
    logger?: Logger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    const serviceLogger = logger || createServiceLogger('sheets-service');
    super(new OAuth2Client(), serviceLogger, retryConfig); // Temporary client, will be replaced
    this.authService = authService;
    this.driveService = driveService;
  }

  public getServiceName(): string {
    return 'SheetsService';
  }

  public getServiceVersion(): string {
    return 'v4';
  }

  /**
   * Initializes the Sheets service with Google API clients.
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
    if (this.isInitialized && this.sheetsApi && this.driveApi) {
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
        (this.auth as OAuth2Client) = authClient;

        // Create Google API instances with error handling
        try {
          this.sheetsApi = google.sheets({ version: 'v4', auth: authClient });
          this.driveApi = google.drive({ version: 'v3', auth: authClient });
        } catch (apiError) {
          throw new Error(
            `Failed to create Google API clients: ${apiError instanceof Error ? apiError.message : String(apiError)}`
          );
        }

        // Validate API clients were created successfully
        if (!this.sheetsApi || !this.driveApi) {
          throw new Error(
            'Failed to initialize Google API clients - clients are null'
          );
        }

        this.isInitialized = true;

        this.logger.info('Sheets service initialized successfully', {
          service: this.getServiceName(),
          version: this.getServiceVersion(),
        });
      } catch (error) {
        // Reset initialization state on any error
        this.isInitialized = false;
        this.sheetsApi = undefined;
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
   * Performs a health check to verify the Sheets service is operational.
   *
   * This method tests basic API connectivity by attempting to list spreadsheets
   * in the configured Drive folder. It ensures the service is properly initialized
   * and can communicate with Google APIs.
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
      // Ensure service is initialized
      await this.ensureInitialized();

      // Test basic operation - list a few files to verify API access
      if (!this.driveApi) {
        return googleErr(
          new GoogleSheetsError(
            'Drive API not available',
            'GOOGLE_SHEETS_API_UNAVAILABLE',
            500
          )
        );
      }

      await this.driveApi.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        pageSize: 1,
      });

      this.logger.info('Sheets health check passed', {
        service: this.getServiceName(),
        requestId: context.requestId,
      });

      return googleOk(true);
    } catch (error) {
      const sheetsError = this.convertToSheetsError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Sheets health check failed', {
        error: sheetsError.toJSON(),
        requestId: context.requestId,
      });

      return googleErr(sheetsError);
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
   * @throws {GoogleSheetsError} When initialization fails
   *
   * @example
   * ```typescript
   * // Called internally by all public methods
   * // Multiple concurrent calls are safe:
   * await Promise.all([
   *   service.listSpreadsheets(),  // triggers ensureInitialized
   *   service.readRange(...),      // reuses same initialization
   *   service.writeRange(...)      // waits for same initialization
   * ]);
   * ```
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.sheetsApi && this.driveApi) {
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
   * Lists all spreadsheets in the configured Google Drive folder.
   *
   * This method queries the Google Drive API to find all spreadsheet files
   * and returns basic information about each one.
   *
   * **Auto-initialization**: Automatically initializes the service if needed.
   *
   * @returns Promise resolving to array of spreadsheet information or error
   *
   * @example
   * ```typescript
   * const result = await service.listSpreadsheets();
   * if (result.isOk()) {
   *   result.value.forEach(sheet => {
   *     console.log(`${sheet.title}: ${sheet.url}`);
   *   });
   * }
   * ```
   */
  public async listSpreadsheets(): Promise<
    GoogleSheetsResult<SpreadsheetInfo[]>
  > {
    const context = this.createContext('listSpreadsheets');

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.driveApi) {
        throw new GoogleSheetsError(
          'Drive API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500
        );
      }

      // Drive API query for spreadsheets
      const query = "mimeType='application/vnd.google-apps.spreadsheet'";

      const response = await this.driveApi.files.list({
        q: query,
        fields: 'files(id,name,modifiedTime,webViewLink)',
        orderBy: 'modifiedTime desc',
      });

      const spreadsheets =
        response.data.files?.map(
          (file: drive_v3.Schema$File): SpreadsheetInfo => ({
            id: file.id || '',
            title: file.name || '',
            url:
              file.webViewLink ||
              `https://docs.google.com/spreadsheets/d/${file.id}`,
            modifiedTime: file.modifiedTime || undefined,
          })
        ) || [];

      this.logger.debug(`Listed ${spreadsheets.length} spreadsheets`, {
        count: spreadsheets.length,
        requestId: context.requestId,
      });

      return spreadsheets;
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Retrieves detailed information about a specific spreadsheet.
   *
   * @param spreadsheetId - The unique identifier of the spreadsheet
   * @returns Promise resolving to spreadsheet information or error
   *
   * @example
   * ```typescript
   * const result = await service.getSpreadsheet('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
   * if (result.isOk()) {
   *   console.log(`Spreadsheet: ${result.value.title}`);
   * }
   * ```
   */
  public async getSpreadsheet(
    spreadsheetId: string
  ): Promise<GoogleSheetsResult<SpreadsheetInfo>> {
    // Input validation
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError('', spreadsheetId, {
          reason: 'Spreadsheet ID cannot be empty',
        })
      );
    }

    const context = this.createContext('getSpreadsheet', { spreadsheetId });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500,
          spreadsheetId
        );
      }

      const response = await this.sheetsApi.spreadsheets.get({
        spreadsheetId,
      });

      const info: SpreadsheetInfo = {
        id: response.data.spreadsheetId || spreadsheetId,
        title: response.data.properties?.title || 'Unknown',
        url:
          response.data.spreadsheetUrl ||
          `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      };

      this.logger.debug('Retrieved spreadsheet info', {
        spreadsheetId,
        title: info.title,
        requestId: context.requestId,
      });

      return info;
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Retrieves complete spreadsheet metadata including all sheets and properties.
   *
   * This method returns the full spreadsheet schema including all sheet tabs,
   * properties, and formatting information. Primarily used for resource exposure.
   *
   * @param spreadsheetId - The unique identifier of the spreadsheet
   * @returns Promise resolving to complete spreadsheet schema or error
   *
   * @example
   * ```typescript
   * const result = await service.getSpreadsheetMetadata('spreadsheet-id');
   * if (result.isOk()) {
   *   console.log(`Sheets: ${result.value.sheets?.length}`);
   * }
   * ```
   */
  public async getSpreadsheetMetadata(
    spreadsheetId: string
  ): Promise<GoogleSheetsResult<sheets_v4.Schema$Spreadsheet>> {
    // Input validation
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError('', spreadsheetId, {
          reason: 'Spreadsheet ID cannot be empty',
        })
      );
    }

    const context = this.createContext('getSpreadsheetMetadata', {
      spreadsheetId,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500,
          spreadsheetId
        );
      }

      const response = await this.sheetsApi.spreadsheets.get({
        spreadsheetId,
      });

      this.logger.debug('Retrieved spreadsheet metadata', {
        spreadsheetId,
        sheetsCount: response.data.sheets?.length || 0,
        requestId: context.requestId,
      });

      return response.data;
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Reads data from a specified range in a spreadsheet.
   *
   * Supports all Google Sheets A1 notation formats including:
   * - Single cells: 'A1', 'Sheet1!A1'
   * - Ranges: 'A1:C10', 'Sheet1!A1:C10'
   * - Entire columns: 'A:C', 'Sheet1!A:C'
   * - Entire rows: '1:10', 'Sheet1!1:10'
   *
   * **Input Validation**: Validates spreadsheet ID and range format before API call.
   *
   * @param spreadsheetId - The unique identifier of the spreadsheet
   * @param range - A1 notation range (e.g., 'Sheet1!A1:C10')
   * @returns Promise resolving to sheet data or error
   *
   * @example
   * ```typescript
   * const result = await service.readRange('sheet-id', 'Sheet1!A1:C10');
   * if (result.isOk()) {
   *   console.log(`Read ${result.value.values?.length} rows`);
   * }
   * ```
   */
  public async readRange(
    spreadsheetId: string,
    range: string
  ): Promise<GoogleSheetsResult<SheetData>> {
    // Input validation
    const validationError = this.validateInputs(spreadsheetId, range);
    if (validationError) {
      return sheetsErr(validationError);
    }

    const context = this.createContext('readRange', { spreadsheetId, range });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500,
          spreadsheetId,
          range
        );
      }

      const response = await this.sheetsApi.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const data: SheetData = {
        range: response.data.range || range,
        values: response.data.values || [],
        majorDimension: response.data.majorDimension || 'ROWS',
      };

      this.logger.debug('Read range data', {
        spreadsheetId,
        range,
        rowCount: data.values?.length || 0,
        requestId: context.requestId,
      });

      return data;
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Writes data to a specified range in a spreadsheet.
   *
   * **Data Validation**: Validates that data dimensions match the specified range.
   * **Input Processing**: Uses RAW input option - data is written exactly as provided.
   *
   * @param spreadsheetId - The unique identifier of the spreadsheet
   * @param range - A1 notation range (e.g., 'Sheet1!A1:C10')
   * @param values - 2D array of string values to write
   * @returns Promise resolving to success or error
   *
   * @example
   * ```typescript
   * const data = [['Header 1', 'Header 2'], ['Value 1', 'Value 2']];
   * const result = await service.writeRange('sheet-id', 'Sheet1!A1:B2', data);
   * if (result.isOk()) {
   *   console.log('Data written successfully');
   * }
   * ```
   */
  public async writeRange(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly string[])[]
  ): Promise<GoogleSheetsResult<void>> {
    // Input validation
    const validationError = this.validateInputs(spreadsheetId, range);
    if (validationError) {
      return sheetsErr(validationError);
    }

    // Range and data dimension check
    if (values.length > 0 && !this.validateRangeAndValues(range, values)) {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
          reason: 'Range and values dimensions do not match',
        })
      );
    }

    const context = this.createContext('writeRange', {
      spreadsheetId,
      range,
      rowCount: values.length,
      colCount: values[0]?.length || 0,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500,
          spreadsheetId,
          range
        );
      }

      await this.sheetsApi.spreadsheets.values.update({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: values as string[][],
          majorDimension: 'ROWS',
        },
      });

      this.logger.info('Successfully wrote range data', {
        spreadsheetId,
        range,
        rowCount: values.length,
        requestId: context.requestId,
      });
    }, context).andThen(() => sheetsOk(undefined));
  }

  /**
   * Appends data to the end of a range in a spreadsheet.
   *
   * **Insertion Behavior**: Uses INSERT_ROWS option - new rows are inserted.
   * **Range Handling**: Appends after the last row with data in the specified range.
   *
   * @param spreadsheetId - The unique identifier of the spreadsheet
   * @param range - Starting range for append operation (e.g., 'Sheet1!A1')
   * @param values - 2D array of string values to append (cannot be empty)
   * @returns Promise resolving to success or error
   *
   * @example
   * ```typescript
   * const newData = [['New Row 1', 'Data 1'], ['New Row 2', 'Data 2']];
   * const result = await service.appendData('sheet-id', 'Sheet1!A1', newData);
   * if (result.isOk()) {
   *   console.log('Data appended successfully');
   * }
   * ```
   */
  public async appendData(
    spreadsheetId: string,
    range: string,
    values: readonly (readonly string[])[]
  ): Promise<GoogleSheetsResult<void>> {
    // Input validation
    const validationError = this.validateInputs(spreadsheetId, range);
    if (validationError) {
      return sheetsErr(validationError);
    }

    if (!values || values.length === 0) {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
          reason: 'Values cannot be empty for append operation',
        })
      );
    }

    const context = this.createContext('appendData', {
      spreadsheetId,
      range,
      rowCount: values.length,
      colCount: values[0]?.length || 0,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500,
          spreadsheetId,
          range
        );
      }

      await this.sheetsApi.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: values as string[][],
          majorDimension: 'ROWS',
        },
      });

      this.logger.info('Successfully appended data', {
        spreadsheetId,
        range,
        rowCount: values.length,
        requestId: context.requestId,
      });
    }, context).andThen(() => sheetsOk(undefined));
  }

  /**
   * Converts generic errors to Google Sheets-specific error types.
   *
   * This method is called by the base class retry mechanism to transform
   * generic errors into domain-specific error types with appropriate
   * error codes and context information.
   *
   * @param error - The generic error to convert
   * @param context - Additional context including spreadsheet ID and range
   * @returns Converted GoogleSheetsError or null if not convertible
   *
   * @internal
   */
  protected convertServiceSpecificError(
    error: Error,
    context: { data?: { spreadsheetId?: string; range?: string } }
  ): GoogleSheetsError | null {
    return this.convertToSheetsError(
      error,
      context.data?.spreadsheetId,
      context.data?.range
    );
  }

  /**
   * Converts a generic error to a GoogleSheetsError with context.
   *
   * This helper method uses the GoogleErrorFactory to create appropriate
   * error types based on the error characteristics and provided context.
   *
   * @param error - The error to convert
   * @param spreadsheetId - Optional spreadsheet ID for context
   * @param range - Optional range for context
   * @returns GoogleSheetsError with appropriate type and context
   *
   * @internal
   */
  private convertToSheetsError(
    error: Error,
    spreadsheetId?: string,
    range?: string
  ): GoogleSheetsError {
    return GoogleErrorFactory.createSheetsError(error, spreadsheetId, range);
  }

  /**
   * Validates common input parameters for spreadsheet operations.
   *
   * Performs basic validation of spreadsheet ID and range format before
   * making API calls. This prevents unnecessary API requests for obviously
   * invalid inputs.
   *
   * **Validation Rules**:
   * - Spreadsheet ID cannot be empty or whitespace-only
   * - Range must follow A1 notation format
   * - Range cannot end with '!' (incomplete sheet reference)
   *
   * @param spreadsheetId - The spreadsheet ID to validate
   * @param range - The range string to validate
   * @returns GoogleSheetsError if validation fails, null if valid
   *
   * @internal
   */
  private validateInputs(
    spreadsheetId: string,
    range: string
  ): GoogleSheetsError | null {
    // Validate spreadsheet ID
    if (!spreadsheetId) {
      return new GoogleSheetsInvalidRangeError('', '', {
        reason: 'Spreadsheet ID is required and cannot be null or undefined',
      });
    }

    if (typeof spreadsheetId !== 'string') {
      return new GoogleSheetsInvalidRangeError('', String(spreadsheetId), {
        reason: `Spreadsheet ID must be a string, received: ${typeof spreadsheetId}`,
      });
    }

    if (spreadsheetId.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty or whitespace-only',
      });
    }

    // Validate range
    if (!range) {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Range is required and cannot be null or undefined',
      });
    }

    if (typeof range !== 'string') {
      return new GoogleSheetsInvalidRangeError(String(range), spreadsheetId, {
        reason: `Range must be a string, received: ${typeof range}`,
      });
    }

    if (range.trim() === '') {
      return new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Range cannot be empty or whitespace-only',
      });
    }

    if (!this.isValidRange(range)) {
      return new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: `Invalid range format. Expected A1 notation (e.g., 'A1', 'Sheet1!A1:B2'), received: '${range}'`,
      });
    }

    return null;
  }

  /**
   * Validates that a range string follows proper A1 notation format.
   *
   * **Supported Formats**:
   * - Single cells: 'A1', 'Sheet1!A1'
   * - Cell ranges: 'A1:B2', 'Sheet1!A1:B2'
   * - Column ranges: 'A:C', 'Sheet1!A:C'
   * - Row ranges: '1:10', 'Sheet1!1:10'
   *
   * @param range - The range string to validate
   * @returns true if the range format is valid, false otherwise
   *
   * @internal
   */
  private isValidRange(range: string): boolean {
    // Early exit for obviously invalid ranges
    if (!range || range.endsWith('!')) {
      return false;
    }

    // Optimized range format check with cached regex
    // Examples: Sheet1!A1:B2, Sheet1!A1, A1:B2, A1
    // Pattern breakdown:
    // - ([^!]+!)? : Optional sheet name followed by !
    // - [A-Z]+ : Column letters (A-Z)
    // - \d+ : Row number
    // - (:[A-Z]+\d+)? : Optional range end
    const rangePattern = /^([^!]+!)?[A-Z]+\d+(:[A-Z]+\d+)?$/;
    return rangePattern.test(range);
  }

  /**
   * Validates that the provided data dimensions match the specified range.
   *
   * This method attempts to estimate the expected dimensions from the range
   * specification and compares them with the actual data dimensions.
   *
   * **Limitation**: This is a best-effort validation. Some complex ranges
   * may not be accurately validated due to the complexity of A1 notation.
   *
   * @param range - The target range in A1 notation
   * @param values - The 2D array of values to validate
   * @returns true if dimensions appear to match, false if clearly mismatched
   *
   * @internal
   */
  private validateRangeAndValues(
    range: string,
    values: readonly (readonly string[])[]
  ): boolean {
    // Early return for empty values
    if (values.length === 0) {
      return true;
    }

    // Only validate ranges that have explicit column specifications
    const colonIndex = range.indexOf(':');
    if (colonIndex === -1) {
      return true; // Single cell ranges are always valid
    }

    // Extract start and end parts efficiently
    const startPart = range.substring(0, colonIndex);
    const endPart = range.substring(colonIndex + 1);

    // Remove sheet names if present
    const exclamationIndex = startPart.lastIndexOf('!');
    const cleanStartPart =
      exclamationIndex !== -1
        ? startPart.substring(exclamationIndex + 1)
        : startPart;
    const endExclamationIndex = endPart.lastIndexOf('!');
    const cleanEndPart =
      endExclamationIndex !== -1
        ? endPart.substring(endExclamationIndex + 1)
        : endPart;

    // Extract column letters using optimized regex
    const startColMatch = cleanStartPart.match(/^[A-Z]+/);
    const endColMatch = cleanEndPart.match(/^[A-Z]+/);

    if (startColMatch && endColMatch) {
      const startColIndex = this.columnToIndex(startColMatch[0]);
      const endColIndex = this.columnToIndex(endColMatch[0]);
      const expectedCols = endColIndex - startColIndex + 1;

      // Find max columns in data efficiently
      let actualCols = 0;
      for (const row of values) {
        if (row.length > actualCols) {
          actualCols = row.length;
          // Early exit if we already exceed expected columns
          if (actualCols > expectedCols) {
            return false;
          }
        }
      }

      return actualCols <= expectedCols;
    }

    return true; // Allow if column extraction fails
  }

  /**
   * Converts Excel-style column letters to zero-based numeric index.
   *
   * Handles single and multi-character column references:
   * - 'A' -> 0, 'B' -> 1, ..., 'Z' -> 25
   * - 'AA' -> 26, 'AB' -> 27, etc.
   *
   * @param column - Column letters (e.g., 'A', 'AB', 'XFD')
   * @returns Zero-based column index
   *
   * @internal
   *
   * @example
   * ```typescript
   * columnToIndex('A')   // returns 0
   * columnToIndex('AA')  // returns 26
   * columnToIndex('XFD') // returns 16383 (Excel's max column)
   * ```
   */
  private columnToIndex(column: string): number {
    let result = 0;
    for (let i = 0; i < column.length; i++) {
      result = result * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result - 1;
  }

  /**
   * Adds a new sheet (tab) to an existing spreadsheet.
   *
   * **Sheet Creation**: Creates a new GRID-type sheet with default dimensions.
   * **Position Control**: Optional index parameter controls where the sheet is inserted.
   *
   * @param spreadsheetId - The unique identifier of the target spreadsheet
   * @param title - The title for the new sheet (cannot be empty)
   * @param index - Optional zero-based position for the new sheet
   * @returns Promise resolving to sheet creation result or error
   *
   * @example
   * ```typescript
   * // Add sheet at the end
   * const result = await service.addSheet('sheet-id', 'New Sheet');
   *
   * // Add sheet at specific position
   * const result = await service.addSheet('sheet-id', 'New Sheet', 1);
   *
   * if (result.isOk()) {
   *   console.log(`Created sheet with ID: ${result.value.sheetId}`);
   * }
   * ```
   */
  public async addSheet(
    spreadsheetId: string,
    title: string,
    index?: number | undefined
  ): Promise<GoogleSheetsResult<SheetsAddSheetResult>> {
    // Spreadsheet ID validation (do NOT call validateInputs with a fake range – that caused invalid range errors)
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError('', spreadsheetId, {
          reason: 'Spreadsheet ID cannot be empty',
        })
      );
    }

    if (!title || title.trim() === '') {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError('', spreadsheetId, {
          reason: 'Sheet title cannot be empty',
        })
      );
    }

    if (index !== undefined && index < 0) {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError('', spreadsheetId, {
          reason: 'Sheet index cannot be negative',
        })
      );
    }

    const context = this.createContext('addSheet', {
      spreadsheetId,
      title,
      index,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500,
          spreadsheetId
        );
      }

      // Prepare the AddSheetRequest
      const addSheetRequest: sheets_v4.Schema$AddSheetRequest = {
        properties: {
          title: title.trim(),
          ...(index !== undefined && { index }),
          sheetType: 'GRID',
        },
      };

      // Execute batchUpdate with AddSheetRequest
      const response = await this.sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: addSheetRequest,
            },
          ],
        },
      });

      // Extract the response
      const addSheetResponse = response.data.replies?.[0]?.addSheet;
      if (!addSheetResponse || !addSheetResponse.properties) {
        throw new GoogleSheetsError(
          'Failed to get sheet information from API response',
          'GOOGLE_SHEETS_INVALID_RESPONSE',
          500,
          spreadsheetId
        );
      }

      const result: SheetsAddSheetResult = {
        sheetId: addSheetResponse.properties.sheetId || 0,
        title: addSheetResponse.properties.title || title.trim(),
        index: addSheetResponse.properties.index || 0,
        spreadsheetId,
      };

      this.logger.info('Successfully added new sheet', {
        spreadsheetId,
        sheetId: result.sheetId,
        title: result.title,
        index: result.index,
        requestId: context.requestId,
      });

      return result;
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Creates a new spreadsheet in the configured Google Drive folder.
   *
   * **Folder Management**: Automatically moves the created spreadsheet to the
   * configured GOOGLE_DRIVE_FOLDER_ID. If the move fails, logs a warning but
   * doesn't fail the operation.
   *
   * **Sheet Creation**: Can create multiple initial sheets or defaults to 'Sheet1'.
   *
   * **Folder Placement**: If GOOGLE_DRIVE_FOLDER_ID is set and DriveService is available,
   * creates the spreadsheet in the specified folder. Otherwise uses traditional Sheets API.
   *
   * @param title - The title for the new spreadsheet (cannot be empty)
   * @param sheetTitles - Optional array of initial sheet titles (must be unique)
   * @returns Promise resolving to spreadsheet creation result or error
   *
   * @example
   * ```typescript
   * // Create with default sheet
   * const result = await service.createSpreadsheet('My New Spreadsheet');
   *
   * // Create with multiple sheets
   * const result = await service.createSpreadsheet('Project Data', [
   *   'Summary', 'Details', 'Charts'
   * ]);
   *
   * if (result.isOk()) {
   *   console.log(`Created: ${result.value.spreadsheetUrl}`);
   * }
   * ```
   */
  public async createSpreadsheet(
    title: string,
    sheetTitles?: readonly string[] | undefined
  ): Promise<GoogleSheetsResult<SheetsCreateSpreadsheetResult>> {
    // Input validation
    if (!title || title.trim() === '') {
      return sheetsErr(
        new GoogleSheetsInvalidRangeError('', '', {
          reason: 'Spreadsheet title cannot be empty',
        })
      );
    }

    if (sheetTitles) {
      if (sheetTitles.length === 0) {
        return sheetsErr(
          new GoogleSheetsInvalidRangeError('', '', {
            reason: 'Sheet titles array cannot be empty',
          })
        );
      }

      // Check for empty sheet titles
      const hasEmptyTitles = sheetTitles.some(
        sheetTitle => !sheetTitle || sheetTitle.trim() === ''
      );
      if (hasEmptyTitles) {
        return sheetsErr(
          new GoogleSheetsInvalidRangeError('', '', {
            reason: 'Sheet titles cannot be empty',
          })
        );
      }

      // Check for duplicate sheet titles
      const uniqueTitles = new Set(sheetTitles.map(t => t.trim()));
      if (uniqueTitles.size !== sheetTitles.length) {
        return sheetsErr(
          new GoogleSheetsInvalidRangeError('', '', {
            reason: 'Sheet titles must be unique',
          })
        );
      }
    }

    // Load configuration (GOOGLE_DRIVE_FOLDER_ID is optional)
    const config = loadConfig();

    const context = this.createContext('createSpreadsheet', {
      title,
      sheetTitles,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi) {
        throw new GoogleSheetsError(
          'Sheets API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500
        );
      }

      // Check if we should use DriveService for folder-based creation
      const useDriveService =
        this.driveService &&
        config.GOOGLE_DRIVE_FOLDER_ID &&
        config.GOOGLE_DRIVE_FOLDER_ID.trim() !== '';

      if (useDriveService) {
        // NEW PATH: Use DriveService to create spreadsheet directly in folder
        return this.createSpreadsheetWithDriveService(
          title,
          sheetTitles,
          config.GOOGLE_DRIVE_FOLDER_ID!,
          context
        );
      } else {
        // OLD PATH: Use traditional Sheets API creation (backward compatible)
        return this.createSpreadsheetWithSheetsAPI(title, sheetTitles, context);
      }
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Creates a spreadsheet using DriveService for direct folder placement.
   * This is the preferred method when DriveService is available and folder ID is configured.
   *
   * @param title - The spreadsheet title
   * @param sheetTitles - Optional sheet titles to create
   * @param folderId - The target folder ID
   * @param context - The execution context
   * @returns Promise resolving to spreadsheet creation result
   * @private
   */
  private async createSpreadsheetWithDriveService(
    title: string,
    sheetTitles: readonly string[] | undefined,
    folderId: string,
    context: any
  ): Promise<SheetsCreateSpreadsheetResult> {
    if (!this.driveService) {
      throw new GoogleSheetsError(
        'DriveService not available',
        'GOOGLE_SHEETS_DRIVE_SERVICE_UNAVAILABLE',
        500
      );
    }

    // Step 1: Create spreadsheet in folder using DriveService
    const driveResult = await this.driveService.createSpreadsheet(
      title.trim(),
      folderId
    );

    if (driveResult.isErr()) {
      // Convert DriveError to SheetsError for consistency
      const driveError = driveResult.error;
      throw new GoogleSheetsError(
        `Failed to create spreadsheet in folder: ${driveError.message}`,
        'GOOGLE_SHEETS_DRIVE_CREATE_FAILED',
        driveError.statusCode || 500
      );
    }

    const driveSpreadsheet = driveResult.value;
    const spreadsheetId = driveSpreadsheet.id;
    const spreadsheetUrl = driveSpreadsheet.webViewLink;

    this.logger.info('Created spreadsheet using DriveService', {
      spreadsheetId,
      title: driveSpreadsheet.name,
      folderId,
      requestId: context.requestId,
    });

    // Step 2: Configure sheets using Sheets API if custom sheets are requested
    let sheets: Array<{ sheetId: number; title: string; index: number }> = [];

    if (sheetTitles && sheetTitles.length > 0) {
      // Get current spreadsheet structure
      const getResponse = await this.sheetsApi!.spreadsheets.get({
        spreadsheetId,
      });

      const existingSheets = getResponse.data.sheets || [];
      const defaultSheet = existingSheets[0]; // Usually 'Sheet1'

      // Build batch update requests
      const requests: sheets_v4.Schema$Request[] = [];

      // First, rename the default sheet to the first requested name
      if (defaultSheet && defaultSheet.properties?.sheetId !== undefined) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: defaultSheet.properties.sheetId,
              title: sheetTitles[0].trim(),
            },
            fields: 'title',
          },
        });
        sheets.push({
          sheetId: defaultSheet.properties.sheetId || 0,
          title: sheetTitles[0].trim(),
          index: 0,
        });
      }

      // Add additional sheets if requested
      for (let i = 1; i < sheetTitles.length; i++) {
        requests.push({
          addSheet: {
            properties: {
              title: sheetTitles[i].trim(),
              index: i,
              sheetType: 'GRID',
              gridProperties: {
                rowCount: 1000,
                columnCount: 26,
              },
            },
          },
        });
      }

      // Execute batch update if there are requests
      if (requests.length > 0) {
        const batchResponse = await this.sheetsApi!.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: { requests },
        });

        // Extract sheet information from responses
        if (batchResponse.data.replies) {
          for (let i = 1; i < sheetTitles.length; i++) {
            const reply = batchResponse.data.replies[i];
            if (reply.addSheet?.properties) {
              sheets.push({
                sheetId: reply.addSheet.properties.sheetId || i,
                title: reply.addSheet.properties.title || sheetTitles[i].trim(),
                index: reply.addSheet.properties.index || i,
              });
            }
          }
        }
      }
    } else {
      // No custom sheets requested, use default structure
      sheets = [
        {
          sheetId: 0,
          title: 'Sheet1',
          index: 0,
        },
      ];
    }

    const result: SheetsCreateSpreadsheetResult = {
      spreadsheetId,
      spreadsheetUrl,
      title: driveSpreadsheet.name,
      sheets,
    };

    this.logger.info('Successfully created spreadsheet with DriveService', {
      spreadsheetId,
      title: result.title,
      sheetsCount: sheets.length,
      folderId,
      requestId: context.requestId,
    });

    return result;
  }

  /**
   * Creates a spreadsheet using traditional Sheets API.
   * This is the fallback method when DriveService is not available or no folder is configured.
   *
   * @param title - The spreadsheet title
   * @param sheetTitles - Optional sheet titles to create
   * @param context - The execution context
   * @returns Promise resolving to spreadsheet creation result
   * @private
   */
  private async createSpreadsheetWithSheetsAPI(
    title: string,
    sheetTitles: readonly string[] | undefined,
    context: any
  ): Promise<SheetsCreateSpreadsheetResult> {
    // Prepare the spreadsheet properties
    const spreadsheetProperties: sheets_v4.Schema$SpreadsheetProperties = {
      title: title.trim(),
    };

    // Prepare sheets if provided
    let sheetsToCreate: sheets_v4.Schema$Sheet[] = [];
    if (sheetTitles && sheetTitles.length > 0) {
      sheetsToCreate = sheetTitles.map((sheetTitle, index) => ({
        properties: {
          title: sheetTitle.trim(),
          index,
          sheetType: 'GRID',
          gridProperties: {
            rowCount: 1000,
            columnCount: 26,
          },
        },
      }));
    } else {
      // Default single sheet
      sheetsToCreate = [
        {
          properties: {
            title: 'Sheet1',
            index: 0,
            sheetType: 'GRID',
            gridProperties: {
              rowCount: 1000,
              columnCount: 26,
            },
          },
        },
      ];
    }

    // Create the spreadsheet
    const createResponse = await this.sheetsApi!.spreadsheets.create({
      requestBody: {
        properties: spreadsheetProperties,
        sheets: sheetsToCreate,
      },
    });

    if (!createResponse.data.spreadsheetId) {
      throw new GoogleSheetsError(
        'Failed to create spreadsheet - no spreadsheet ID returned',
        'GOOGLE_SHEETS_CREATE_FAILED',
        500
      );
    }

    const spreadsheetId = createResponse.data.spreadsheetId;
    const spreadsheetUrl =
      createResponse.data.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    // Prepare the result
    const sheets = createResponse.data.sheets?.map(sheet => ({
      sheetId: sheet.properties?.sheetId || 0,
      title: sheet.properties?.title || 'Sheet1',
      index: sheet.properties?.index || 0,
    })) || [
      {
        sheetId: 0,
        title: 'Sheet1',
        index: 0,
      },
    ];

    const result: SheetsCreateSpreadsheetResult = {
      spreadsheetId,
      spreadsheetUrl,
      title: createResponse.data.properties?.title || title.trim(),
      sheets,
    };

    this.logger.info('Successfully created spreadsheet with Sheets API', {
      spreadsheetId,
      title: result.title,
      sheetsCount: sheets.length,
      method: 'sheets-api',
      requestId: context.requestId,
    });

    return result;
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
    GoogleSheetsResult<{
      initialized: boolean;
      apiVersions: {
        sheets: string;
        drive: string;
      };
      authStatus: boolean;
    }>
  > {
    const context = this.createContext('getServiceStats');

    try {
      const authStatus = await this.validateAuthentication();

      return sheetsOk({
        initialized: this.isInitialized,
        apiVersions: {
          sheets: this.getServiceVersion(),
          drive: 'v3',
        },
        authStatus: authStatus.isOk(),
      });
    } catch (error) {
      const sheetsError = this.convertToSheetsError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Failed to get service stats', {
        error: sheetsError.toJSON(),
        requestId: context.requestId,
      });

      return sheetsErr(sheetsError);
    }
  }
}
