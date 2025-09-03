import { z } from 'zod';
import { BaseDriveTool } from './base-drive-tool.js';
import type { DriveFileListResult, MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDriveError } from '../../errors/index.js';

/**
 * Schema for list files input parameters
 * Includes all the parameters needed for Drive file listing operations
 */
const ListFilesInputSchema = z.object({
  query: z
    .string({
      description: 'Drive API query string for searching files',
    })
    .max(2048, 'Query string too long')
    .optional(),
  maxResults: z
    .number({
      description: 'Maximum number of results to return (1-1000)',
    })
    .min(1, 'maxResults must be at least 1')
    .max(1000, 'maxResults cannot exceed 1000')
    .optional(),
  pageToken: z
    .string({
      description: 'Token to specify which page of results to return',
    })
    .optional(),
  orderBy: z
    .string({
      description: 'How to order the files in the result set',
    })
    .optional(),
  folderId: z
    .string({
      description: 'List files within a specific folder',
    })
    .optional(),
});

type ListFilesInput = z.infer<typeof ListFilesInputSchema>;

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
 *   query: 'name contains "Report"'
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
    return 'google-workspace__drive__list-files';
  }

  public getToolMetadata(): ToolMetadata {
    return {
      title: 'List Drive Files',
      description:
        'Lists files in Google Drive with optional filtering and search',
      inputSchema: {},
    };
  }

  public async executeImpl(
    args: ListFilesInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleDriveError>> {
    this.logger.info('Executing list files tool', { args });

    try {
      // Validate input parameters
      const validationResult = this.validateWithSchema(
        ListFilesInputSchema,
        args
      );
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
      const driveOptions: any = {};

      // Handle maxResults parameter (convert to pageSize)
      if (validatedArgs.maxResults !== undefined) {
        driveOptions.pageSize = validatedArgs.maxResults;
      }

      // Handle pageToken parameter
      if (validatedArgs.pageToken !== undefined) {
        driveOptions.pageToken = validatedArgs.pageToken;
      }

      // Handle orderBy parameter
      if (validatedArgs.orderBy !== undefined) {
        driveOptions.orderBy = validatedArgs.orderBy;
      }

      // Build query string
      let queryString = validatedArgs.query || '';

      // Handle folderId parameter by adding to query
      if (validatedArgs.folderId !== undefined) {
        const folderQuery = `'${validatedArgs.folderId}' in parents`;
        if (queryString) {
          queryString = `${folderQuery} and (${queryString})`;
        } else {
          queryString = folderQuery;
        }
      }

      if (queryString) {
        driveOptions.query = queryString;
      }

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
