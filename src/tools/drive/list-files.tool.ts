import { z } from 'zod';
import { SchemaFactory } from '../base/tool-schema.js';
import { DRIVE_TOOLS } from '../base/tool-definitions.js';
import { BaseDriveTool } from './base-drive-tool.js';
import type { DriveFileListResult, DriveFileListOptions, MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDriveError } from '../../errors/index.js';
import { DriveQueryBuilder } from '../../utils/drive-query-builder.js';

/**
 * Input parameters for list files tool
 * Uses maxResults instead of pageSize for tool interface compatibility
 */
type ListFilesInput = Omit<DriveFileListOptions, 'pageSize' | 'fields' | 'corpora' | 'driveId'> & {
  maxResults?: number;
  folderId?: string;
};

/**
 * Result interface for list files operation with additional metadata
 */
interface ListFilesResult {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    modifiedTime: string;
    webViewLink?: string;
    parents?: string[];
    size?: string;
  }>;
  nextPageToken?: string;
  hasMore: boolean;
  totalFiles: number;
}

/**
 * Tool for listing files in Google Drive with optional filtering and search
 *
 * This tool provides comprehensive file listing capabilities for Google Drive,
 * supporting search queries, folder-specific listing, pagination, and custom ordering.
 *
 * **Key Features:**
 * - List all files with optional search filtering
 * - Folder-specific file listing
 * - Pagination support with nextPageToken
 * - Custom ordering of results
 * - Comprehensive parameter validation
 * - Drive-specific error handling
 *
 * **Supported Parameters:**
 * - `query`: Drive API query string for search filtering
 * - `maxResults`: Limit number of results (1-1000)
 * - `pageToken`: For pagination through large result sets
 * - `orderBy`: Sort order for results
 * - `folderId`: List files within specific folder only
 *
 * **Usage Examples:**
 * ```typescript
 * // List all files
 * const result = await tool.execute({});
 *
 * // Search for specific files
 * const result = await tool.execute({
 *   query: 'name contains \'Report\''
 * });
 *
 * // List files in specific folder
 * const result = await tool.execute({
 *   folderId: 'folder123'
 * });
 * ```
 */
export class ListFilesTool extends BaseDriveTool<
  ListFilesInput,
  MCPToolResult
> {
  public getToolName(): string {
    return DRIVE_TOOLS.LIST_FILES;
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata(DRIVE_TOOLS.LIST_FILES);
  }

  public async executeImpl(
    args: ListFilesInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleDriveError>> {
    this.logger.info('Executing list files tool', { args });

    try {
      // Validate input parameters
      const inputSchema = SchemaFactory.createToolInputSchema(
        DRIVE_TOOLS.LIST_FILES
      );
      const validationResult = this.validateWithSchema(inputSchema, args);
      if (validationResult.isErr()) {
        this.logger.error('Input validation failed', {
          error: validationResult.error.message,
        });
        return err(validationResult.error);
      }

      const validatedArgs = validationResult.value;

      // Validate authentication
      const authResult = await this.authService.validateAuth();
      if (authResult.isErr()) {
        const error = new GoogleDriveError(
          'Authentication validation failed',
          'GOOGLE_DRIVE_AUTH_ERROR',
          401
        );
        this.logger.error('Authentication validation failed', {
          error: error.message,
        });
        return err(error);
      }

      if (!authResult.value) {
        const error = new GoogleDriveError(
          'Authentication validation failed',
          'GOOGLE_DRIVE_AUTH_ERROR',
          401
        );
        this.logger.error('Authentication is invalid', {
          error: error.message,
        });
        return err(error);
      }

      // Initialize drive service
      await this.driveService.initialize();

      // Build the query parameters for DriveService
      // Let the service handle query building for consistency
      const driveOptions: import('../../types/index.js').DriveFileListOptions =
        {
          // Basic parameters
          pageSize: validatedArgs.maxResults,
          pageToken: validatedArgs.pageToken,
          orderBy: validatedArgs.orderBy,

          // Query and filtering options
          query: validatedArgs.query,
          includeTrashed: validatedArgs.includeTrashed,
          filters: validatedArgs.filters,
        };

      // Handle folderId parameter by adding to filters
      if (validatedArgs.folderId !== undefined) {
        if (!driveOptions.filters) {
          driveOptions.filters = {};
        }
        driveOptions.filters.parentsIn = [validatedArgs.folderId];
      }

      this.logger.info('Prepared Drive API options', {
        originalQuery: validatedArgs.query,
        includeTrashed: validatedArgs.includeTrashed,
        structuredFilters: driveOptions.filters,
      });

      // List files using the drive service
      const result = await this.driveService.listFiles(driveOptions);

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to list files', {
          error: error.message,
          errorCode: error.errorCode,
        });
        return err(error);
      }

      const driveResult = result.value;

      // Transform the result to match test expectations
      const listResult: ListFilesResult = {
        files: driveResult.files,
        nextPageToken: driveResult.nextPageToken,
        hasMore: Boolean(driveResult.nextPageToken),
        totalFiles: driveResult.files.length,
      };

      this.logger.info('Successfully listed files', {
        count: listResult.totalFiles,
        hasMore: listResult.hasMore,
      });

      // Return the result in MCP format
      return ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify(listResult),
          },
        ],
      });
    } catch (error) {
      const driveError = this.handleServiceError(error);
      this.logger.error('Unexpected error in list files tool', {
        error: driveError.message,
        errorCode: driveError.errorCode,
      });
      return err(driveError);
    }
  }
}
