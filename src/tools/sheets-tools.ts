import { Result, ok, err } from 'neverthrow';
import type { AuthService } from '../services/auth.service.js';
import type { SheetsService } from '../services/sheets.service.js';
import type {
  SheetsListResult,
  SheetsReadResult,
  SheetsWriteResult,
  SheetsAppendResult,
} from '../types/index.js';
import {
  GoogleWorkspaceError,
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
  GoogleAuthError,
  GoogleErrorFactory,
} from '../errors/index.js';
import { Logger, createServiceLogger } from '../utils/logger.js';

export class SheetsTools {
  private authService: AuthService;
  private sheetsService: SheetsService;
  private logger: Logger;

  constructor(
    authService: AuthService,
    sheetsService: SheetsService,
    logger?: Logger
  ) {
    this.authService = authService;
    this.sheetsService = sheetsService;
    this.logger = logger || createServiceLogger('sheets-tools');
  }

  /**
   * List spreadsheets with Result pattern error handling
   */
  async sheetsList(): Promise<Result<SheetsListResult, GoogleWorkspaceError>> {
    const requestId = this.generateRequestId('sheetsList');

    this.logger.info('Starting spreadsheets list operation', { requestId });

    try {
      // Validate authentication
      const authResult = await this.authService.validateAuth();
      if (authResult.isErr()) {
        this.logger.error('Authentication failed for sheetsList', {
          error: authResult.error.toJSON(),
          requestId,
        });
        return err(authResult.error);
      }

      if (!authResult.value) {
        const authError = new GoogleAuthError(
          'Authentication validation failed',
          'service-account',
          { operation: 'sheetsList', requestId }
        );

        this.logger.error('Authentication invalid for sheetsList', {
          error: authError.toJSON(),
          requestId,
        });

        return err(authError);
      }

      // Use SheetsService to get spreadsheet list
      const spreadsheetsResult = await this.sheetsService.listSpreadsheets();
      if (spreadsheetsResult.isErr()) {
        this.logger.error('Failed to list spreadsheets', {
          error: spreadsheetsResult.error.toJSON(),
          requestId,
        });
        return err(spreadsheetsResult.error);
      }

      const spreadsheets = spreadsheetsResult.value;

      const result: SheetsListResult = {
        spreadsheets: spreadsheets.map(sheet => ({
          id: sheet.id,
          title: sheet.title,
          url: sheet.url,
          modifiedTime: sheet.modifiedTime,
        })),
      };

      this.logger.info('Successfully listed spreadsheets', {
        count: result.spreadsheets.length,
        requestId,
      });

      return ok(result);
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        undefined,
        { operation: 'sheetsList', requestId }
      );

      this.logger.error('Unexpected error in sheetsList', {
        error: sheetsError.toJSON(),
        requestId,
      });

      return err(sheetsError);
    }
  }

  /**
   * Read data from spreadsheet with Result pattern error handling
   */
  async sheetsRead(
    spreadsheetId: string,
    range: string
  ): Promise<Result<SheetsReadResult, GoogleWorkspaceError>> {
    const requestId = this.generateRequestId('sheetsRead');

    this.logger.info('Starting spreadsheet read operation', {
      spreadsheetId,
      range,
      requestId,
    });

    // Parameter validation
    const validationError = this.validateParameters(
      spreadsheetId,
      range,
      'read'
    );
    if (validationError) {
      this.logger.error('Parameter validation failed for sheetsRead', {
        error: validationError.toJSON(),
        spreadsheetId,
        range,
        requestId,
      });
      return err(validationError);
    }

    try {
      // Use SheetsService to read data
      const sheetDataResult = await this.sheetsService.readRange(
        spreadsheetId,
        range
      );
      if (sheetDataResult.isErr()) {
        this.logger.error('Failed to read spreadsheet data', {
          error: sheetDataResult.error.toJSON(),
          spreadsheetId,
          range,
          requestId,
        });
        return err(sheetDataResult.error);
      }

      const sheetData = sheetDataResult.value;

      const result: SheetsReadResult = {
        range: sheetData.range,
        values: sheetData.values || [],
        majorDimension: sheetData.majorDimension || 'ROWS',
      };

      this.logger.info('Successfully read spreadsheet data', {
        spreadsheetId,
        range,
        rowCount: result.values.length,
        requestId,
      });

      return ok(result);
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        spreadsheetId,
        range,
        { operation: 'sheetsRead', requestId }
      );

      this.logger.error('Unexpected error in sheetsRead', {
        error: sheetsError.toJSON(),
        spreadsheetId,
        range,
        requestId,
      });

      return err(sheetsError);
    }
  }

  /**
   * Write data to spreadsheet with Result pattern error handling
   */
  async sheetsWrite(
    spreadsheetId: string,
    range: string,
    values: string[][]
  ): Promise<Result<SheetsWriteResult, GoogleWorkspaceError>> {
    const requestId = this.generateRequestId('sheetsWrite');

    this.logger.info('Starting spreadsheet write operation', {
      spreadsheetId,
      range,
      rowCount: values.length,
      requestId,
    });

    // Parameter validation
    const validationError = this.validateParameters(
      spreadsheetId,
      range,
      'write',
      values
    );
    if (validationError) {
      this.logger.error('Parameter validation failed for sheetsWrite', {
        error: validationError.toJSON(),
        spreadsheetId,
        range,
        requestId,
      });
      return err(validationError);
    }

    try {
      // Use SheetsService to write data
      const writeResult = await this.sheetsService.writeRange(
        spreadsheetId,
        range,
        values
      );
      if (writeResult.isErr()) {
        this.logger.error('Failed to write spreadsheet data', {
          error: writeResult.error.toJSON(),
          spreadsheetId,
          range,
          requestId,
        });
        return err(writeResult.error);
      }

      // Calculate result statistics
      const updatedRows = values.length;
      const updatedColumns =
        values.length > 0 ? Math.max(...values.map(row => row.length)) : 0;
      const updatedCells = values.reduce((total, row) => total + row.length, 0);

      const result: SheetsWriteResult = {
        updatedCells,
        updatedRows,
        updatedColumns,
      };

      this.logger.info('Successfully wrote spreadsheet data', {
        spreadsheetId,
        range,
        ...result,
        requestId,
      });

      return ok(result);
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        spreadsheetId,
        range,
        { operation: 'sheetsWrite', requestId }
      );

      this.logger.error('Unexpected error in sheetsWrite', {
        error: sheetsError.toJSON(),
        spreadsheetId,
        range,
        requestId,
      });

      return err(sheetsError);
    }
  }

  /**
   * Append data to spreadsheet with Result pattern error handling
   */
  async sheetsAppend(
    spreadsheetId: string,
    range: string,
    values: string[][]
  ): Promise<Result<SheetsAppendResult, GoogleWorkspaceError>> {
    const requestId = this.generateRequestId('sheetsAppend');

    this.logger.info('Starting spreadsheet append operation', {
      spreadsheetId,
      range,
      rowCount: values.length,
      requestId,
    });

    // Parameter validation
    const validationError = this.validateParameters(
      spreadsheetId,
      range,
      'append',
      values
    );
    if (validationError) {
      this.logger.error('Parameter validation failed for sheetsAppend', {
        error: validationError.toJSON(),
        spreadsheetId,
        range,
        requestId,
      });
      return err(validationError);
    }

    try {
      // Use SheetsService to append data
      const appendResult = await this.sheetsService.appendData(
        spreadsheetId,
        range,
        values
      );
      if (appendResult.isErr()) {
        this.logger.error('Failed to append spreadsheet data', {
          error: appendResult.error.toJSON(),
          spreadsheetId,
          range,
          requestId,
        });
        return err(appendResult.error);
      }

      // Calculate result statistics
      const updatedRows = values.length;
      const updatedCells = values.reduce((total, row) => total + row.length, 0);

      const result: SheetsAppendResult = {
        updates: {
          updatedRows,
          updatedCells,
        },
      };

      this.logger.info('Successfully appended spreadsheet data', {
        spreadsheetId,
        range,
        updatedRows,
        updatedCells,
        requestId,
      });

      return ok(result);
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        spreadsheetId,
        range,
        { operation: 'sheetsAppend', requestId }
      );

      this.logger.error('Unexpected error in sheetsAppend', {
        error: sheetsError.toJSON(),
        spreadsheetId,
        range,
        requestId,
      });

      return err(sheetsError);
    }
  }

  /**
   * Validate parameters for spreadsheet operations
   */
  private validateParameters(
    spreadsheetId: string,
    range: string,
    operation: 'read' | 'write' | 'append',
    values?: string[][]
  ): GoogleSheetsError | null {
    // Validate spreadsheet ID
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty',
        operation,
      });
    }

    // Validate range
    if (!range || range.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Range cannot be empty',
        operation,
      });
    }

    // Validate range format
    if (!this.isValidRangeFormat(range)) {
      return new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Invalid range format',
        operation,
      });
    }

    // Validate values for write/append operations
    if (
      (operation === 'write' || operation === 'append') &&
      values !== undefined
    ) {
      if (!Array.isArray(values)) {
        return new GoogleSheetsError(
          'Values must be an array',
          'GOOGLE_SHEETS_INVALID_VALUES',
          400,
          spreadsheetId,
          range,
          { operation, valuesType: typeof values }
        );
      }

      if (operation === 'append' && values.length === 0) {
        return new GoogleSheetsError(
          'Values cannot be empty for append operation',
          'GOOGLE_SHEETS_EMPTY_VALUES',
          400,
          spreadsheetId,
          range,
          { operation }
        );
      }
    }

    return null;
  }

  /**
   * Basic range format validation
   */
  private isValidRangeFormat(range: string): boolean {
    // Basic range format check
    // Examples: Sheet1!A1:B2, Sheet1!A1, A1:B2, A1
    const rangePattern = /^([^!]+!)?[A-Z]+\d+(:[A-Z]+\d+)?$/;
    return rangePattern.test(range) && !range.endsWith('!');
  }

  /**
   * Generate a unique request ID for tracing
   */
  private generateRequestId(operation: string): string {
    return `sheets-tools-${operation}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get service health status
   */
  async getHealthStatus(): Promise<
    Result<
      {
        auth: boolean;
        sheetsService: boolean;
        timestamp: string;
      },
      GoogleWorkspaceError
    >
  > {
    const requestId = this.generateRequestId('healthCheck');

    try {
      // Check auth service
      const authResult = await this.authService.validateAuth();
      const authHealthy = authResult.isOk() && authResult.value;

      // Check sheets service
      const sheetsHealthResult = await this.sheetsService.healthCheck();
      const sheetsHealthy =
        sheetsHealthResult.isOk() && sheetsHealthResult.value;

      const result = {
        auth: authHealthy,
        sheetsService: sheetsHealthy,
        timestamp: new Date().toISOString(),
      };

      this.logger.info('Health check completed', {
        ...result,
        requestId,
      });

      return ok(result);
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        undefined,
        { operation: 'healthCheck', requestId }
      );

      this.logger.error('Health check failed', {
        error: sheetsError.toJSON(),
        requestId,
      });

      return err(sheetsError);
    }
  }
}
