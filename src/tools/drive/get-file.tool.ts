import { z } from 'zod';
import { SchemaFactory } from '../base/tool-schema.js';
import { DRIVE_TOOLS } from '../base/tool-definitions.js';
import { BaseDriveTool } from './base-drive-tool.js';
import type { DriveFileInfo, MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDriveError } from '../../errors/index.js';

/**
 * Input parameters for get file tool
 */
type GetFileInput = {
  fileId: string;
  fields?: string[];
  includePermissions?: boolean;
};

/**
 * Result interface for get file operation
 */
interface GetFileResult {
  file: {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    modifiedTime: string;
    webViewLink?: string;
    webContentLink?: string;
    parents?: string[];
    size?: string;
    version?: string;
    description?: string;
    owners?: Array<{
      displayName?: string;
      emailAddress?: string;
      me?: boolean;
    }>;
    permissions?: Array<{
      id?: string;
      type?: string;
      role?: string;
    }>;
  };
}

/**
 * Tool for getting metadata and details for a specific Google Drive file
 *
 * This tool retrieves comprehensive metadata and details for a specific Google Drive file
 * using its unique file ID. It supports custom field selection to control the amount
 * of data returned.
 *
 * **Key Features:**
 * - Get detailed file metadata by file ID
 * - Support for custom field selection
 * - Handles all Google Workspace file types
 * - Includes file permissions and ownership information
 * - Comprehensive file validation and error handling
 *
 * **Supported File Types:**
 * - Google Workspace files (Docs, Sheets, Slides)
 * - Uploaded files (PDFs, images, documents)
 * - All Drive-supported file formats
 *
 * **Usage Examples:**
 * ```typescript
 * // Get basic file metadata
 * const result = await tool.execute({
 *   fileId: 'abc123'
 * });
 *
 * // Get specific fields only
 * const result = await tool.execute({
 *   fileId: 'abc123',
 *   fields: ['id', 'name', 'mimeType', 'permissions']
 * });
 * ```
 */
export class GetFileTool extends BaseDriveTool<GetFileInput, MCPToolResult> {
  public getToolName(): string {
    return DRIVE_TOOLS.GET_FILE;
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata(
      DRIVE_TOOLS.GET_FILE
    );
  }

  public async executeImpl(
    args: GetFileInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleDriveError>> {
    this.logger.info('Executing get file tool', { args });

    try {
      // Validate input parameters
      const inputSchema = SchemaFactory.createToolInputSchema(
        DRIVE_TOOLS.GET_FILE
      );
      const validationResult = this.validateWithSchema(inputSchema, args);
      if (validationResult.isErr()) {
        this.logger.error('Input validation failed', {
          error: validationResult.error.message,
        });
        return err(validationResult.error);
      }

      const validatedArgs = validationResult.value;

      // Additional file ID validation
      const fileIdResult = this.validateFileId(
        validatedArgs.fileId,
        'get_file'
      );
      if (fileIdResult.isErr()) {
        this.logger.error('File ID validation failed', {
          fileId: validatedArgs.fileId,
          error: fileIdResult.error.message,
        });
        return err(fileIdResult.error);
      }

      const fileId = fileIdResult.value;

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

      // Build options for the drive service call
      let driveOptions: any = undefined;

      // Handle fields parameter (convert array to comma-separated string)
      let fieldsArray = validatedArgs.fields ? [...validatedArgs.fields] : [];

      // Handle includePermissions parameter
      if (
        validatedArgs.includePermissions &&
        !fieldsArray.includes('permissions')
      ) {
        fieldsArray.push('permissions');
      }

      if (fieldsArray.length > 0) {
        driveOptions = {
          fields: fieldsArray.join(','),
        };
      }

      // Get file using the drive service
      const result = await this.driveService.getFile(fileId, driveOptions);

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to get file', {
          fileId,
          error: error.message,
          errorCode: error.errorCode,
        });
        return err(error);
      }

      const fileInfo = result.value;

      // Transform the result to match test expectations
      const getResult: GetFileResult = {
        file: fileInfo,
      };

      this.logger.info('Successfully retrieved file', {
        fileId,
        fileName: fileInfo.name,
        mimeType: fileInfo.mimeType,
      });

      // Return the result in MCP format
      return ok({
        content: [
          {
            type: 'text',
            text: JSON.stringify(getResult),
          },
        ],
      });
    } catch (error) {
      const driveError = this.handleServiceError(error);
      this.logger.error('Unexpected error in get file tool', {
        fileId: args.fileId,
        error: driveError.message,
        errorCode: driveError.errorCode,
      });
      return err(driveError);
    }
  }
}
