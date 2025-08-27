import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { AuthService } from './auth.service.js';
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

export class SheetsService extends GoogleService {
  private authService: AuthService;
  private sheetsApi?: sheets_v4.Sheets;
  private driveApi?: drive_v3.Drive;
  private isInitialized: boolean = false;

  constructor(
    authService: AuthService,
    logger?: Logger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    const serviceLogger = logger || createServiceLogger('sheets-service');
    super(new OAuth2Client(), serviceLogger, retryConfig); // Temporary client, will be replaced
    this.authService = authService;
  }

  public getServiceName(): string {
    return 'SheetsService';
  }

  public getServiceVersion(): string {
    return 'v4';
  }

  /**
   * Initialize the Sheets service
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    const context = this.createContext('initialize');

    return this.executeWithRetry(async () => {
      // Get authenticated client from AuthService
      const authResult = await this.authService.getAuthClient();
      if (authResult.isErr()) {
        throw authResult.error;
      }

      const authClient = authResult.value;

      // Replace the temporary auth client in base class
      (this.auth as OAuth2Client) = authClient;

      // Create Google API instances
      this.sheetsApi = google.sheets({ version: 'v4', auth: authClient });
      this.driveApi = google.drive({ version: 'v3', auth: authClient });

      this.isInitialized = true;

      this.logger.info('Sheets service initialized successfully', {
        service: this.getServiceName(),
        version: this.getServiceVersion(),
      });
    }, context);
  }

  /**
   * Health check for the Sheets service
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
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized || !this.sheetsApi || !this.driveApi) {
      const result = await this.initialize();
      if (result.isErr()) {
        throw result.error;
      }
    }
  }

  /**
   * List spreadsheets
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
   * Get spreadsheet information
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
   * Get complete spreadsheet metadata (for resources)
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
   * Read data from a range
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
   * Write data to a range
   */
  public async writeRange(
    spreadsheetId: string,
    range: string,
    values: string[][]
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
          values,
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
   * Append data to a range
   */
  public async appendData(
    spreadsheetId: string,
    range: string,
    values: string[][]
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
          values,
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
   * Convert service-specific errors
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
   * Convert a generic error to SheetsError
   */
  private convertToSheetsError(
    error: Error,
    spreadsheetId?: string,
    range?: string
  ): GoogleSheetsError {
    return GoogleErrorFactory.createSheetsError(error, spreadsheetId, range);
  }

  /**
   * Validate common inputs
   */
  private validateInputs(
    spreadsheetId: string,
    range: string
  ): GoogleSheetsError | null {
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty',
      });
    }

    if (!range || range.trim() === '' || !this.isValidRange(range)) {
      return new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Invalid range format',
      });
    }

    return null;
  }

  /**
   * Validate range format
   */
  private isValidRange(range: string): boolean {
    // Basic range format check
    // Examples: Sheet1!A1:B2, Sheet1!A1, A1:B2, A1
    const rangePattern = /^([^!]+!)?[A-Z]+\d+(:[A-Z]+\d+)?$/;
    return rangePattern.test(range) && !range.endsWith('!');
  }

  /**
   * Validate range and values dimensions match
   */
  private validateRangeAndValues(range: string, values: string[][]): boolean {
    // Simple dimension check - actual implementation would need more detailed validation
    if (values.length === 0) return true;

    // Estimate column count from range
    const rangeParts = range.split(':');
    if (rangeParts.length === 2) {
      // Remove sheet name
      const startPart = rangeParts[0].includes('!')
        ? rangeParts[0].split('!')[1]
        : rangeParts[0];
      const endPart = rangeParts[1].includes('!')
        ? rangeParts[1].split('!')[1]
        : rangeParts[1];

      const startCol = startPart.match(/[A-Z]+/)?.[0];
      const endCol = endPart.match(/[A-Z]+/)?.[0];

      if (startCol && endCol) {
        const startColIndex = this.columnToIndex(startCol);
        const endColIndex = this.columnToIndex(endCol);
        const expectedCols = endColIndex - startColIndex + 1;
        const actualCols = Math.max(...values.map(row => row.length));
        return actualCols <= expectedCols;
      }
    }
    return true; // OK for single cells or unestimatable cases
  }

  /**
   * Convert column letter to numeric index
   */
  private columnToIndex(column: string): number {
    let result = 0;
    for (let i = 0; i < column.length; i++) {
      result = result * 26 + (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
    }
    return result - 1;
  }

  /**
   * Add a new sheet to the spreadsheet
   */
  public async addSheet(
    spreadsheetId: string,
    title: string,
    index?: number
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
   * Create a new spreadsheet in the configured Drive folder
   */
  public async createSpreadsheet(
    title: string,
    sheetTitles?: string[]
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

    // Check for GOOGLE_DRIVE_FOLDER_ID
    const config = loadConfig();
    if (
      !config.GOOGLE_DRIVE_FOLDER_ID ||
      config.GOOGLE_DRIVE_FOLDER_ID.trim() === ''
    ) {
      return sheetsErr(
        new GoogleSheetsError(
          'GOOGLE_DRIVE_FOLDER_ID environment variable is required',
          'GOOGLE_SHEETS_CONFIG_ERROR',
          500
        )
      );
    }

    const context = this.createContext('createSpreadsheet', {
      title,
      sheetTitles,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.sheetsApi || !this.driveApi) {
        throw new GoogleSheetsError(
          'Sheets or Drive API not initialized',
          'GOOGLE_SHEETS_NOT_INITIALIZED',
          500
        );
      }

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
      const createResponse = await this.sheetsApi.spreadsheets.create({
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

      // Move the spreadsheet to the configured Drive folder
      try {
        await this.driveApi.files.update({
          fileId: spreadsheetId,
          addParents: config.GOOGLE_DRIVE_FOLDER_ID,
          removeParents: 'root',
          fields: 'id, parents',
        });
      } catch (driveError) {
        // Log the Drive API error but don't fail the entire operation
        this.logger.warn(
          'Failed to move spreadsheet to Drive folder, but spreadsheet was created',
          {
            spreadsheetId,
            folderId: config.GOOGLE_DRIVE_FOLDER_ID,
            error:
              driveError instanceof Error
                ? driveError.message
                : String(driveError),
            requestId: context.requestId,
          }
        );
      }

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

      this.logger.info('Successfully created new spreadsheet', {
        spreadsheetId,
        title: result.title,
        sheetsCount: sheets.length,
        folderId: config.GOOGLE_DRIVE_FOLDER_ID,
        requestId: context.requestId,
      });

      return result;
    }, context).andThen(result => sheetsOk(result));
  }

  /**
   * Get service statistics
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
