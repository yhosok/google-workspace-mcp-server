import { Result, ok, err } from 'neverthrow';
import { BaseSheetsTools } from './base-sheets-tool.js';
import type {
  ToolMetadata,
  ToolExecutionContext,
} from '../base/tool-registry.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { AccessControlService } from '../../services/access-control.service.js';
import type { SheetsListResult, MCPToolResult } from '../../types/index.js';
import {
  GoogleWorkspaceError,
  GoogleAuthError,
  GoogleErrorFactory,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';

/**
 * Individual tool for listing spreadsheets in the configured Drive folder
 */
export class SheetsListTool extends BaseSheetsTools<{}, MCPToolResult> {
  constructor(
    sheetsService: SheetsService,
    authService: AuthService,
    logger?: Logger,
    accessControlService?: AccessControlService
  ) {
    super(sheetsService, authService, logger, accessControlService);
  }

  public getToolName(): string {
    return 'google-workspace__sheets__list-spreadsheets';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata(
      'google-workspace__sheets__list-spreadsheets'
    );
  }

  public async executeImpl(
    params: {},
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info('Starting spreadsheets list operation', { requestId });

    // Validate authentication
    const authResult = await this.validateAuthentication(requestId);
    if (authResult.isErr()) {
      return err(authResult.error);
    }

    try {
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
        undefined,
        undefined,
        { operation: 'sheets-list-spreadsheets', requestId }
      );

      this.logger.error('Unexpected error in sheetsList', {
        error: sheetsError.toJSON(),
        requestId,
      });

      return err(sheetsError);
    }
  }
}
