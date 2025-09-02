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
import type { SheetsAddSheetResult, MCPToolResult } from '../../types/index.js';
import {
  GoogleWorkspaceError,
  GoogleSheetsInvalidRangeError,
  GoogleErrorFactory,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';

interface SheetsAddSheetParams {
  spreadsheetId: string;
  title: string;
  index?: number;
}

/**
 * Individual tool for adding new sheets to existing spreadsheets
 */
export class SheetsAddSheetTool extends BaseSheetsTools<
  SheetsAddSheetParams,
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
    return 'sheets-add-sheet';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('sheets-add-sheet');
  }

  public async executeImpl(
    params: SheetsAddSheetParams,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info('Starting add sheet operation', {
      spreadsheetId: params.spreadsheetId,
      title: params.title,
      index: params.index,
      requestId,
    });

    // Validate parameters using schema validation
    const validationResult = this.validateWithSchema(
      SchemaFactory.createToolInputSchema('sheets-add-sheet'),
      params,
      { operation: 'add-sheet' }
    );

    if (validationResult.isErr()) {
      this.logger.error('Parameter validation failed for sheetsAddSheet', {
        error: validationResult.error.toJSON(),
        spreadsheetId: params.spreadsheetId,
        title: params.title,
        index: params.index,
        requestId,
      });
      return err(validationResult.error);
    }

    // Use validated parameters
    const validatedParams = validationResult.value;

    this.logger.debug('Parameters validated successfully', {
      spreadsheetId: validatedParams.spreadsheetId,
      title: validatedParams.title,
      index: validatedParams.index,
      requestId,
    });

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
      // Use SheetsService to add sheet
      const addSheetResult = await this.sheetsService.addSheet(
        validatedParams.spreadsheetId,
        validatedParams.title,
        validatedParams.index
      );

      if (addSheetResult.isErr()) {
        this.logger.error('Failed to add sheet', {
          error: addSheetResult.error.toJSON(),
          spreadsheetId: validatedParams.spreadsheetId,
          title: validatedParams.title,
          requestId,
        });
        return err(addSheetResult.error);
      }

      const responseData = addSheetResult.value;

      this.logger.info('Sheet added successfully', {
        spreadsheetId: validatedParams.spreadsheetId,
        sheetId: responseData.sheetId,
        title: responseData.title,
        index: responseData.index,
        requestId,
      });

      return ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                sheetId: responseData.sheetId,
                title: responseData.title,
                index: responseData.index,
                spreadsheetId: validatedParams.spreadsheetId,
              },
              null,
              2
            ),
          },
        ],
      });
    } catch (error) {
      const wrappedError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        validatedParams.spreadsheetId,
        '',
        {
          operation: 'sheets-add-sheet',
          requestId,
        }
      );

      this.logger.error('Unexpected error in add sheet operation', {
        error: wrappedError.toJSON(),
        spreadsheetId: validatedParams.spreadsheetId,
        title: validatedParams.title,
        requestId,
      });

      return err(wrappedError);
    }
  }
}
