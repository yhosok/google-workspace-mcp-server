import { ToolRegistry } from '../base/tool-registry.js';
import type { AuthService } from '../../services/auth.service.js';
import type { SheetsService } from '../../services/sheets.service.js';
import { 
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
  GoogleAuthError 
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Base class for Sheets tools providing common functionality
 */
export abstract class BaseSheetsTools<TInput = unknown, TOutput = unknown> 
  extends ToolRegistry<TInput, TOutput> {
  
  constructor(
    protected sheetsService: SheetsService,
    protected authService: AuthService,
    logger?: Logger
  ) {
    super(logger);
  }

  /**
   * Validate authentication for sheets operations
   */
  protected async validateAuthentication(
    requestId: string
  ): Promise<Result<true, GoogleWorkspaceError>> {
    try {
      const authResult = await this.authService.validateAuth();
      if (authResult.isErr()) {
        this.logger.error('Authentication failed', {
          error: authResult.error.toJSON(),
          requestId
        });
        return err(authResult.error);
      }
      
      if (!authResult.value) {
        const authError = new GoogleAuthError(
          'Authentication validation failed',
          'service-account',
          { operation: this.getToolName(), requestId }
        );
        
        this.logger.error('Authentication invalid', {
          error: authError.toJSON(),
          requestId
        });
        
        return err(authError);
      }

      return ok(true);
    } catch (error) {
      const authError = new GoogleAuthError(
        error instanceof Error ? error.message : 'Authentication error',
        'service-account',
        { operation: this.getToolName(), requestId }
      );
      
      return err(authError);
    }
  }

  /**
   * Validate parameters for spreadsheet operations
   */
  protected validateParameters(
    spreadsheetId: string, 
    range: string, 
    operation: 'read' | 'write' | 'append',
    values?: string[][]
  ): GoogleSheetsError | null {
    // Validate spreadsheet ID
    if (!spreadsheetId || spreadsheetId.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty',
        operation
      });
    }
    
    // Validate range
    if (!range || range.trim() === '') {
      return new GoogleSheetsInvalidRangeError('', spreadsheetId, {
        reason: 'Range cannot be empty',
        operation
      });
    }

    // Validate range format
    if (!this.isValidRangeFormat(range)) {
      return new GoogleSheetsInvalidRangeError(range, spreadsheetId, {
        reason: 'Invalid range format',
        operation
      });
    }
    
    // Validate values for write/append operations
    if ((operation === 'write' || operation === 'append') && values !== undefined) {
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
  protected isValidRangeFormat(range: string): boolean {
    // Basic range format check
    // Examples: Sheet1!A1:B2, Sheet1!A1, A1:B2, A1
    const rangePattern = /^([^!]+!)?[A-Z]+\d+(:[A-Z]+\d+)?$/;
    return rangePattern.test(range) && !range.endsWith('!');
  }

  /**
   * Calculate statistics for write/append results
   */
  protected calculateStatistics(values: string[][]): {
    updatedCells: number;
    updatedRows: number;
    updatedColumns: number;
  } {
    const updatedRows = values.length;
    const updatedColumns = values.length > 0 ? Math.max(...values.map(row => row.length)) : 0;
    const updatedCells = values.reduce((total, row) => total + row.length, 0);

    return {
      updatedCells,
      updatedRows,
      updatedColumns
    };
  }
}