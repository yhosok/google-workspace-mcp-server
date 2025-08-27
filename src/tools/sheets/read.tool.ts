import { Result, ok, err } from 'neverthrow';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type {
  ToolMetadata,
  ToolExecutionContext,
} from '../base/tool-registry.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { SheetsReadResult, MCPToolResult } from '../../types/index.js';
import {
  GoogleWorkspaceError,
  GoogleErrorFactory,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';

interface SheetsReadParams {
  spreadsheetId: string;
  range: string;
}

/**
 * Individual tool for reading data from spreadsheet ranges
 */
export class SheetsReadTool extends BaseSheetsTools<
  SheetsReadParams,
  MCPToolResult
> {
  constructor(
    sheetsService: SheetsService,
    authService: AuthService,
    logger?: Logger
  ) {
    super(sheetsService, authService, logger);
  }

  public getToolName(): string {
    return 'sheets-read';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('sheets-read');
  }

  public async executeImpl(
    params: SheetsReadParams,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info('Starting spreadsheet read operation', {
      spreadsheetId: params.spreadsheetId,
      range: params.range,
      requestId,
    });

    // Parameter validation
    const validationResult = this.validateWithSchema(
      SchemaFactory.createToolInputSchema('sheets-read'),
      params,
      { operation: 'read-sheets', requestId }
    );
    if (validationResult.isErr()) {
      this.logger.error('Parameter validation failed for sheetsRead', {
        error: validationResult.error.toJSON(),
        spreadsheetId: params.spreadsheetId,
        range: params.range,
        requestId,
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
      // Use SheetsService to read data
      const sheetDataResult = await this.sheetsService.readRange(
        validatedParams.spreadsheetId,
        validatedParams.range
      );
      if (sheetDataResult.isErr()) {
        this.logger.error('Failed to read spreadsheet data', {
          error: sheetDataResult.error.toJSON(),
          spreadsheetId: validatedParams.spreadsheetId,
          range: validatedParams.range,
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
        spreadsheetId: validatedParams.spreadsheetId,
        range: validatedParams.range,
        rowCount: result.values.length,
        requestId,
      });

      return ok({
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      });
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        validatedParams.spreadsheetId,
        validatedParams.range,
        { operation: 'sheets-read', requestId }
      );

      this.logger.error('Unexpected error in sheetsRead', {
        error: sheetsError.toJSON(),
        spreadsheetId: validatedParams.spreadsheetId,
        range: validatedParams.range,
        requestId,
      });

      return err(sheetsError);
    }
  }
}
