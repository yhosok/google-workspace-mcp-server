import { Result, ok, err } from 'neverthrow';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type { ToolMetadata, ToolExecutionContext } from '../base/tool-registry.js';
import type { SheetsService } from '../../services/sheets.service.js';
import type { AuthService } from '../../services/auth.service.js';
import type { SheetsAddSheetResult, MCPToolResult } from '../../types/index.js';
import { 
  GoogleWorkspaceError,
  GoogleSheetsInvalidRangeError,
  GoogleErrorFactory 
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
export class SheetsAddSheetTool extends BaseSheetsTools<SheetsAddSheetParams, MCPToolResult> {
  constructor(
    sheetsService: SheetsService,
    authService: AuthService,
    logger?: Logger
  ) {
    super(sheetsService, authService, logger);
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
      requestId 
    });
    
    // Validate spreadsheet ID only (no range needed for add sheet)
    let validationError: GoogleSheetsInvalidRangeError | null = null;
    if (!params.spreadsheetId || params.spreadsheetId.trim() === '') {
      validationError = new GoogleSheetsInvalidRangeError('', params.spreadsheetId, {
        reason: 'Spreadsheet ID cannot be empty',
        operation: 'add-sheet'
      });
    }
    if (validationError) {
      this.logger.error('Parameter validation failed for sheetsAddSheet', {
        error: validationError.toJSON(),
        spreadsheetId: params.spreadsheetId,
        title: params.title,
        requestId
      });
      return err(validationError);
    }

    // Validate title is not empty
    if (!params.title || params.title.trim() === '') {
      const error = new GoogleSheetsInvalidRangeError('', params.spreadsheetId, {
        reason: 'Sheet title cannot be empty',
        operation: 'add-sheet'
      });
      this.logger.error('Parameter validation failed for sheetsAddSheet', {
        error: error.toJSON(),
        spreadsheetId: params.spreadsheetId,
        title: params.title,
        requestId
      });
      return err(error);
    }

    // Validate index is not negative
    if (params.index !== undefined && params.index < 0) {
      const error = new GoogleSheetsInvalidRangeError('', params.spreadsheetId, {
        reason: 'Sheet index cannot be negative',
        operation: 'add-sheet'
      });
      this.logger.error('Parameter validation failed for sheetsAddSheet', {
        error: error.toJSON(),
        spreadsheetId: params.spreadsheetId,
        title: params.title,
        index: params.index,
        requestId
      });
      return err(error);
    }

    // Validate authentication
    const authResult = await this.validateAuthentication(requestId);
    if (authResult.isErr()) {
      return err(authResult.error);
    }

    try {
      // Use SheetsService to add sheet
      const addSheetResult = await this.sheetsService.addSheet(
        params.spreadsheetId, 
        params.title.trim(),
        params.index
      );
      
      if (addSheetResult.isErr()) {
        this.logger.error('Failed to add sheet', {
          error: addSheetResult.error.toJSON(),
          spreadsheetId: params.spreadsheetId,
          title: params.title,
          requestId
        });
        return err(addSheetResult.error);
      }

      const responseData = addSheetResult.value;
      
      this.logger.info('Sheet added successfully', { 
        spreadsheetId: params.spreadsheetId,
        sheetId: responseData.sheetId,
        title: responseData.title,
        index: responseData.index,
        requestId 
      });

      return ok({
        content: [{
          type: 'text',
          text: JSON.stringify({
            sheetId: responseData.sheetId,
            title: responseData.title,
            index: responseData.index,
            spreadsheetId: params.spreadsheetId
          }, null, 2)
        }]
      });

    } catch (error) {
      const wrappedError = GoogleErrorFactory.createSheetsError(
        error instanceof Error ? error : new Error(String(error)),
        params.spreadsheetId,
        '',
        {
          operation: 'sheets-add-sheet',
          requestId
        }
      );
      
      this.logger.error('Unexpected error in add sheet operation', {
        error: wrappedError.toJSON(),
        spreadsheetId: params.spreadsheetId,
        title: params.title,
        requestId
      });
      
      return err(wrappedError);
    }
  }
}