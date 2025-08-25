import { google, sheets_v4, drive_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { AuthService } from './auth.service.js';
import type { SpreadsheetInfo, SheetData } from '../types/index.js';
import { GoogleService, type RetryConfig } from './base/google-service.js';
import {
  GoogleWorkspaceResult,
  GoogleSheetsResult,
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
  GoogleErrorFactory,
  googleOk,
  googleErr,
  sheetsOk,
  sheetsErr
} from '../errors/index.js';
import { Logger, createServiceLogger } from '../utils/logger.js';

export class SheetsService extends GoogleService {
  private authService: AuthService;
  private sheetsApi?: sheets_v4.Sheets;
  private driveApi?: drive_v3.Drive;
  private isInitialized: boolean = false;

  constructor(authService: AuthService, logger?: Logger, retryConfig?: RetryConfig) {
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
        version: this.getServiceVersion()
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
        return googleErr(new GoogleSheetsError(
          'Drive API not available',
          'GOOGLE_SHEETS_API_UNAVAILABLE',
          500
        ));
      }

      await this.driveApi.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        pageSize: 1
      });

      this.logger.info('Sheets health check passed', {
        service: this.getServiceName(),
        requestId: context.requestId
      });

      return googleOk(true);

    } catch (error) {
      const sheetsError = this.convertToSheetsError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Sheets health check failed', {
        error: sheetsError.toJSON(),
        requestId: context.requestId
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
  public async listSpreadsheets(): Promise<GoogleSheetsResult<SpreadsheetInfo[]>> {
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

      const spreadsheets = response.data.files?.map((file: drive_v3.Schema$File): SpreadsheetInfo => ({
        id: file.id || '',
        title: file.name || '',
        url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}`,
        modifiedTime: file.modifiedTime || undefined
      })) || [];

      this.logger.debug(`Listed ${spreadsheets.length} spreadsheets`, {
        count: spreadsheets.length,
        requestId: context.requestId
      });

      return spreadsheets;

    }, context).andThen((result) => sheetsOk(result));
  }

  /**
   * Get spreadsheet information
   */
  public async getSpreadsheet(spreadsheetId: string): Promise<GoogleSheetsResult<SpreadsheetInfo>> {
    // Input validation
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return sheetsErr(new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty'
      }));
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
        url: response.data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      };

      this.logger.debug('Retrieved spreadsheet info', {
        spreadsheetId,
        title: info.title,
        requestId: context.requestId
      });

      return info;

    }, context).andThen((result) => sheetsOk(result));
  }

  /**
   * Get complete spreadsheet metadata (for resources)
   */
  public async getSpreadsheetMetadata(spreadsheetId: string): Promise<GoogleSheetsResult<sheets_v4.Schema$Spreadsheet>> {
    // Input validation
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return sheetsErr(new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty'
      }));
    }

    const context = this.createContext('getSpreadsheetMetadata', { spreadsheetId });
    
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
        requestId: context.requestId
      });

      return response.data;

    }, context).andThen((result) => sheetsOk(result));
  }

  /**
   * Read data from a range
   */
  public async readRange(spreadsheetId: string, range: string): Promise<GoogleSheetsResult<SheetData>> {
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
        requestId: context.requestId
      });

      return data;

    }, context).andThen((result) => sheetsOk(result));
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
      return sheetsErr(new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Range and values dimensions do not match'
      }));
    }

    const context = this.createContext('writeRange', { 
      spreadsheetId, 
      range, 
      rowCount: values.length,
      colCount: values[0]?.length || 0
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
        requestId: context.requestId
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
      return sheetsErr(new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Values cannot be empty for append operation'
      }));
    }

    const context = this.createContext('appendData', { 
      spreadsheetId, 
      range, 
      rowCount: values.length,
      colCount: values[0]?.length || 0
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
        requestId: context.requestId
      });

    }, context).andThen(() => sheetsOk(undefined));
  }

  /**
   * Convert service-specific errors
   */
  protected convertServiceSpecificError(error: Error, context: { data?: { spreadsheetId?: string; range?: string } }): GoogleSheetsError | null {
    return this.convertToSheetsError(error, context.data?.spreadsheetId, context.data?.range);
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
  private validateInputs(spreadsheetId: string, range: string): GoogleSheetsError | null {
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty'
      });
    }
    
    if (!range || range.trim() === '' || !this.isValidRange(range)) {
      return new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Invalid range format'
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
      const startPart = rangeParts[0].includes('!') ? rangeParts[0].split('!')[1] : rangeParts[0];
      const endPart = rangeParts[1].includes('!') ? rangeParts[1].split('!')[1] : rangeParts[1];
      
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
   * Get service statistics
   */
  public async getServiceStats(): Promise<GoogleSheetsResult<{
    initialized: boolean;
    apiVersions: {
      sheets: string;
      drive: string;
    };
    authStatus: boolean;
  }>> {
    const context = this.createContext('getServiceStats');
    
    try {
      const authStatus = await this.validateAuthentication();
      
      return sheetsOk({
        initialized: this.isInitialized,
        apiVersions: {
          sheets: this.getServiceVersion(),
          drive: 'v3'
        },
        authStatus: authStatus.isOk()
      });
    } catch (error) {
      const sheetsError = this.convertToSheetsError(
        error instanceof Error ? error : new Error(String(error))
      );
      
      this.logger.error('Failed to get service stats', {
        error: sheetsError.toJSON(),
        requestId: context.requestId
      });
      
      return sheetsErr(sheetsError);
    }
  }
}