import { Result, ok, err } from 'neverthrow';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type { ToolMetadata, ToolExecutionContext } from '../base/tool-registry.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { SheetsAppendResult, MCPToolResult } from '../../types/index.js';
import { 
  GoogleWorkspaceError,
  GoogleErrorFactory 
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';

interface SheetsAppendParams {
  spreadsheetId: string;
  range: string;
  values: string[][];
}

/**
 * Individual tool for appending data to spreadsheets
 */
export class SheetsAppendTool extends BaseSheetsTools<SheetsAppendParams, MCPToolResult> {
  constructor(
    sheetsService: SheetsService,
    authService: AuthService,
    logger?: Logger
  ) {
    super(sheetsService, authService, logger);
  }

  public getToolName(): string {
    return 'sheets-append';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('sheets-append');
  }

  public async executeImpl(
    params: SheetsAppendParams,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();
    
    this.logger.info('Starting spreadsheet append operation', { 
      spreadsheetId: params.spreadsheetId, 
      range: params.range, 
      rowCount: params.values.length,
      requestId 
    });
    
    // Parameter validation
    const validationResult = this.validateWithSchema(
      SchemaFactory.createToolInputSchema('sheets-append'), 
      params,
      { operation: 'append-sheets', requestId, useSpecificMessages: true }
    );
    if (validationResult.isErr()) {
      this.logger.error('Parameter validation failed for sheetsAppend', {
        error: validationResult.error.toJSON(),
        spreadsheetId: params.spreadsheetId,
        range: params.range,
        requestId
      });
      return err(validationResult.error);
    }
    
    const validatedParams = validationResult.value;

    // Validate authentication
    const authResult = await this.validateAuthentication(requestId);
    if (authResult.isErr()) {
      return err(authResult.error);
    }

    try {
      // Use SheetsService to append data
      const appendResult = await this.sheetsService.appendData(
        validatedParams.spreadsheetId, 
        validatedParams.range, 
        validatedParams.values
      );
      if (appendResult.isErr()) {
        this.logger.error('Failed to append spreadsheet data', {
          error: appendResult.error.toJSON(),
          spreadsheetId: validatedParams.spreadsheetId,
          range: validatedParams.range,
          requestId
        });
        return err(appendResult.error);
      }
      
      // Calculate result statistics
      const updatedRows = validatedParams.values.length;
      const updatedCells = validatedParams.values.reduce((total: number, row: string[]) => total + row.length, 0);

      const result: SheetsAppendResult = {
        updates: {
          updatedRows,
          updatedCells
        }
      };

      this.logger.info('Successfully appended spreadsheet data', {
        spreadsheetId: validatedParams.spreadsheetId,
        range: validatedParams.range,
        updatedRows,
        updatedCells,
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
        validatedParams.spreadsheetId,
        validatedParams.range,
        { operation: 'sheets-append', requestId }
      );
      
      this.logger.error('Unexpected error in sheetsAppend', {
        error: sheetsError.toJSON(),
        spreadsheetId: validatedParams.spreadsheetId,
        range: validatedParams.range,
        requestId
      });
      
      return err(sheetsError);
    }
  }
}