import { Result, ok, err } from 'neverthrow';
import type { Logger } from '../../utils/logger.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { GoogleErrorFactory } from '../../errors/index.js';
import type {
  SheetsCreateSpreadsheetResult,
  MCPToolResult,
} from '../../types/index.js';
import type { GoogleWorkspaceError } from '../../errors/index.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { AccessControlService } from '../../services/access-control.service.js';

export interface SheetsCreateSpreadsheetParams {
  title: string;
  sheetTitles?: string[];
}

export class SheetsCreateSpreadsheetTool extends BaseSheetsTools<
  SheetsCreateSpreadsheetParams,
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
    return 'sheets-create';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('sheets-create');
  }

  public async executeImpl(
    params: SheetsCreateSpreadsheetParams,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info('Starting create spreadsheet operation', {
      title: params.title,
      sheetTitles: params.sheetTitles,
      requestId,
    });

    // Validate authentication
    const authResult = await this.validateAuthentication(requestId);
    if (authResult.isErr()) {
      return err(authResult.error);
    }

    // Validate access control for write operations
    const accessResult = await this.validateAccessControl(params, requestId);
    if (accessResult.isErr()) {
      return err(accessResult.error);
    }

    // Parameter validation using unified schema approach
    const validationResult = this.validateWithSchema(
      SchemaFactory.createToolInputSchema('sheets-create'),
      params,
      { operation: 'sheets-create', requestId }
    );

    if (validationResult.isErr()) {
      return err(validationResult.error);
    }

    const validatedParams = validationResult.value;

    try {
      // Use SheetsService to create spreadsheet
      const createResult = await this.sheetsService.createSpreadsheet(
        validatedParams.title,
        validatedParams.sheetTitles
      );

      if (createResult.isErr()) {
        this.logger.error('Failed to create spreadsheet', {
          error: createResult.error.toJSON(),
          title: params.title,
          sheetTitles: params.sheetTitles,
          requestId,
        });
        return err(createResult.error);
      }

      const result = createResult.value;

      this.logger.info('Successfully created spreadsheet', {
        spreadsheetId: result.spreadsheetId,
        title: result.title,
        sheetsCount: result.sheets.length,
        requestId,
      });

      return ok({
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                spreadsheetId: result.spreadsheetId,
                spreadsheetUrl: result.spreadsheetUrl,
                title: result.title,
                sheets: result.sheets,
              },
              null,
              2
            ),
          },
        ],
      });
    } catch (error) {
      const sheetsError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        undefined,
        undefined,
        { operation: 'sheets-create', requestId }
      );

      this.logger.error('Unexpected error in create spreadsheet operation', {
        error: sheetsError.toJSON(),
        title: params.title,
        sheetTitles: params.sheetTitles,
        requestId,
      });

      return err(sheetsError);
    }
  }
}
