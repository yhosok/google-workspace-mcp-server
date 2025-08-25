import { Result, ok, err } from 'neverthrow';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type { ToolMetadata, ToolExecutionContext } from '../base/tool-registry.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { SheetsWriteResult, MCPToolResult } from '../../types/index.js';
import { 
  GoogleWorkspaceError,
  GoogleErrorFactory 
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';

interface SheetsWriteParams {
  spreadsheetId: string;
  range: string;
  values: string[][];
}

/**
 * Individual tool for writing data to spreadsheet ranges
 */
export class SheetsWriteTool extends BaseSheetsTools<SheetsWriteParams, MCPToolResult> {
  constructor(
    sheetsService: SheetsService,
    authService: AuthService,
    logger?: Logger
  ) {
    super(sheetsService, authService, logger);
  }

  public getToolName(): string {
    return 'sheets-write';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('sheets-write');
  }

  public async executeImpl(
    params: SheetsWriteParams,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();
    
    this.logger.info('Starting spreadsheet write operation', { 
      spreadsheetId: params.spreadsheetId, 
      range: params.range, 
      rowCount: params.values.length,
      requestId 
    });
    
    // Parameter validation
    const validationError = this.validateParameters(
      params.spreadsheetId, 
      params.range, 
      'write',
      params.values
    );
    if (validationError) {
      this.logger.error('Parameter validation failed for sheetsWrite', {
        error: validationError.toJSON(),
        spreadsheetId: params.spreadsheetId,
        range: params.range,
        requestId
      });
      return err(validationError);
    }

    // Validate authentication
    const authResult = await this.validateAuthentication(requestId);
    if (authResult.isErr()) {
      return err(authResult.error);
    }

    try {
      // Use SheetsService to write data
      const writeResult = await this.sheetsService.writeRange(
        params.spreadsheetId, 
        params.range, 
        params.values
      );
      if (writeResult.isErr()) {
        this.logger.error('Failed to write spreadsheet data', {
          error: writeResult.error.toJSON(),
          spreadsheetId: params.spreadsheetId,
          range: params.range,
          requestId
        });
        return err(writeResult.error);
      }
      
      // Calculate result statistics
      const stats = this.calculateStatistics(params.values);

      const result: SheetsWriteResult = {
        updatedCells: stats.updatedCells,
        updatedRows: stats.updatedRows,
        updatedColumns: stats.updatedColumns
      };

      this.logger.info('Successfully wrote spreadsheet data', {
        spreadsheetId: params.spreadsheetId,
        range: params.range,
        ...result,
        requestId
      });
      
      return ok({
        content: [{ 
          type: 'text' as const, 
          text: JSON.stringify(result, null, 2) 
        }]
      });
      
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        params.spreadsheetId,
        params.range,
        { operation: 'sheets-write', requestId }
      );
      
      this.logger.error('Unexpected error in sheetsWrite', {
        error: sheetsError.toJSON(),
        spreadsheetId: params.spreadsheetId,
        range: params.range,
        requestId
      });
      
      return err(sheetsError);
    }
  }
}