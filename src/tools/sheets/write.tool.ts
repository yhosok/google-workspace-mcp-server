import { Result, ok, err } from 'neverthrow';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type {
  ToolMetadata,
  ToolExecutionContext,
} from '../base/tool-registry.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { AccessControlService } from '../../services/access-control.service.js';
import type { SheetsWriteResult, MCPToolResult } from '../../types/index.js';
import {
  GoogleWorkspaceError,
  GoogleErrorFactory,
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
export class SheetsWriteTool extends BaseSheetsTools<
  SheetsWriteParams,
  MCPToolResult
> {
  constructor(
    sheetsService: SheetsService,
    authService: AuthService,
    logger?: Logger,
    accessControlService?: AccessControlService
  ) {
    super(sheetsService, authService, logger, accessControlService);
  }

  public getToolName(): string {
    return 'google-workspace__sheets__write-range';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('google-workspace__sheets__write-range');
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
      requestId,
    });

    // Parameter validation
    const validationResult = this.validateWithSchema(
      SchemaFactory.createToolInputSchema('google-workspace__sheets__write-range'),
      params,
      { operation: 'write-sheets', requestId }
    );
    if (validationResult.isErr()) {
      this.logger.error('Parameter validation failed for sheetsWrite', {
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

    // Validate access control for write operations
    const accessResult = await this.validateAccessControl(validatedParams, requestId);
    if (accessResult.isErr()) {
      return err(accessResult.error);
    }

    try {
      // Use SheetsService to write data
      const writeResult = await this.sheetsService.writeRange(
        validatedParams.spreadsheetId,
        validatedParams.range,
        validatedParams.values
      );
      if (writeResult.isErr()) {
        this.logger.error('Failed to write spreadsheet data', {
          error: writeResult.error.toJSON(),
          spreadsheetId: validatedParams.spreadsheetId,
          range: validatedParams.range,
          requestId,
        });
        return err(writeResult.error);
      }

      // Calculate result statistics
      const stats = this.calculateStatistics(validatedParams.values);

      const result: SheetsWriteResult = {
        updatedCells: stats.updatedCells,
        updatedRows: stats.updatedRows,
        updatedColumns: stats.updatedColumns,
      };

      this.logger.info('Successfully wrote spreadsheet data', {
        spreadsheetId: validatedParams.spreadsheetId,
        range: validatedParams.range,
        ...result,
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
        { operation: 'sheets-write-range', requestId }
      );

      this.logger.error('Unexpected error in sheetsWrite', {
        error: sheetsError.toJSON(),
        spreadsheetId: validatedParams.spreadsheetId,
        range: validatedParams.range,
        requestId,
      });

      return err(sheetsError);
    }
  }
}
