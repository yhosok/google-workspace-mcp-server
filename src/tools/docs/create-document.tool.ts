import { z } from 'zod';
import { BaseDocsTools } from './base-docs-tool.js';
import type { DocsDocumentInfo, MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleWorkspaceError } from '../../errors/index.js';
import { docs_v1 } from 'googleapis';

/**
 * Schema for create document input parameters
 * Includes the title and optional folder placement parameters
 */
const CreateDocumentInputSchema = z.object({
  title: z
    .string({
      description: 'The title of the new document',
      required_error: 'Title is required',
      invalid_type_error: 'Title must be a string',
    })
    .min(1, 'Title cannot be empty')
    .max(255, 'Title too long'),
  folderId: z
    .string({
      description: 'Optional folder ID where the document should be created',
      invalid_type_error: 'Folder ID must be a string',
    })
    .optional(),
});

type CreateDocumentInput = z.infer<typeof CreateDocumentInputSchema>;

/**
 * Tool for creating new Google Documents
 *
 * This tool allows users to create new Google Documents with a specified title
 * and optional folder placement. It integrates with the DocsService to handle
 * document creation and provides comprehensive error handling and validation.
 *
 * **Key Features:**
 * - Create documents with custom titles
 * - Optional folder placement using Drive integration
 * - Comprehensive input validation
 * - Detailed error handling and logging
 * - Returns complete document metadata including URLs
 *
 * **Input Parameters:**
 * - `title` (required): The title for the new document
 * - `folderId` (optional): Drive folder ID where document should be created
 *
 * **Output:**
 * Returns complete document information including document ID, title, URLs,
 * revision information, and document body structure.
 *
 * **Usage Examples:**
 * ```typescript
 * // Create document in root
 * const result = await tool.execute({ title: "My Document" });
 *
 * // Create document in specific folder
 * const result = await tool.execute({
 *   title: "My Document",
 *   folderId: "folder-123"
 * });
 * ```
 *
 * @extends BaseDocsTools<CreateDocumentInput, CreateDocumentResult>
 */
export class CreateDocumentTool extends BaseDocsTools<
  CreateDocumentInput,
  MCPToolResult
> {
  /**
   * Returns the unique tool name for MCP registration
   * @returns The tool name string
   */
  public getToolName(): string {
    return 'google-workspace__docs__create';
  }

  /**
   * Returns the tool metadata including schema and descriptions
   * @returns ToolMetadata object with input schema and descriptions
   */
  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Create Google Document',
      description:
        'Creates a new Google Document with the specified title and optional folder location',
      inputSchema: CreateDocumentInputSchema.shape,
    };
  }

  /**
   * Converts Google Docs Schema$Body to our custom DocsDocumentInfo body format
   * @param body - The Schema$Body from Google Docs API
   * @returns Converted body in our custom format
   */
  private convertBodyToDocumentInfo(
    body: docs_v1.Schema$Body
  ): DocsDocumentInfo['body'] {
    if (!body.content || body.content.length === 0) {
      return undefined;
    }

    return {
      content: body.content
        .map(element => ({
          paragraph: element.paragraph
            ? {
                elements:
                  element.paragraph.elements
                    ?.map(el => ({
                      textRun: el.textRun
                        ? {
                            content: el.textRun.content || '',
                            textStyle: el.textRun.textStyle || {},
                          }
                        : undefined,
                    }))
                    .filter(el => el.textRun) || [],
                paragraphStyle: element.paragraph.paragraphStyle,
              }
            : undefined,
        }))
        .filter(element => element.paragraph),
    };
  }

  /**
   * Executes the create document operation
   *
   * This method handles the complete document creation workflow including:
   * 1. Input validation using Zod schema
   * 2. Authentication verification
   * 3. Service call to create the document
   * 4. Error handling and response formatting
   * 5. Comprehensive logging for debugging and monitoring
   *
   * **Implementation Details:**
   * - Uses BaseDocsTools validation infrastructure
   * - Integrates with DocsService for actual document creation
   * - Supports both root-level and folder-based document creation
   * - Provides detailed error context for troubleshooting
   * - Returns structured response following MCP standards
   *
   * **Error Handling:**
   * - Validation errors for invalid input parameters
   * - Authentication errors for unauthorized requests
   * - Service errors from Google Docs API
   * - Network and timeout errors with retry context
   *
   * @param params - The input parameters for document creation
   * @param context - Optional execution context for request tracking
   * @returns Promise resolving to MCPToolResult with document information or error
   *
   * @example
   * ```typescript
   * const result = await tool.executeImpl({
   *   title: "Project Proposal",
   *   folderId: "team-folder-123"
   * });
   *
   * if (result.isOk()) {
   *   console.log('Created document:', result.value.content);
   * } else {
   *   console.error('Creation failed:', result.error);
   * }
   * ```
   */
  public async executeImpl(
    params: CreateDocumentInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info(`${this.getToolName()}: Starting document creation`, {
      requestId,
      params: { title: params.title, hasFolderId: !!params.folderId },
    });

    try {
      // Input validation
      const validationResult = this.validateWithSchema(
        CreateDocumentInputSchema,
        params,
        { operation: 'create_document' }
      );

      if (validationResult.isErr()) {
        this.logger.error(`${this.getToolName()}: Input validation failed`, {
          requestId,
          error: validationResult.error.toJSON(),
        });
        return err(validationResult.error);
      }

      const validatedParams = validationResult.value;

      // Authentication validation
      const authResult = await this.validateAuthentication(requestId);
      if (authResult.isErr()) {
        return err(authResult.error);
      }

      // Additional parameter validation using the validation methods
      const textResult = this.textValidation(validatedParams.title);
      if (textResult.isErr()) {
        return err(textResult.error);
      }

      // Validate and trim folderId if provided
      let trimmedFolderId: string | undefined = validatedParams.folderId;
      if (validatedParams.folderId !== undefined) {
        // Handle empty string case - convert to undefined (no folder specified)
        if (validatedParams.folderId === '') {
          trimmedFolderId = undefined;
        } else {
          trimmedFolderId = validatedParams.folderId.trim();
          // Basic folder ID validation - whitespace-only strings are invalid
          if (trimmedFolderId === '') {
            return err(
              new GoogleDocsError(
                'Folder ID cannot be empty',
                'GOOGLE_DOCS_VALIDATION_ERROR',
                400,
                undefined,
                { parameter: 'folderId' }
              )
            );
          }
        }
      }

      // Create document using DocsService
      const createResult = await this.docsService.createDocument(
        validatedParams.title,
        trimmedFolderId
      );

      if (createResult.isErr()) {
        this.logger.error(`${this.getToolName()}: Document creation failed`, {
          requestId,
          error: createResult.error.toJSON(),
        });
        return err(
          this.handleServiceError(createResult.error, 'create_document')
        );
      }

      // Format the response
      const documentInfo: DocsDocumentInfo = {
        documentId: createResult.value.documentId,
        title: createResult.value.title,
        revisionId: 'created',
        createdTime: new Date().toISOString(),
        modifiedTime: new Date().toISOString(),
        documentUrl:
          createResult.value.documentUrl ||
          `https://docs.google.com/document/d/${createResult.value.documentId}/edit`,
        // Convert Schema$Body to our custom format if body exists
        body: createResult.value.body
          ? this.convertBodyToDocumentInfo(createResult.value.body)
          : undefined,
      };

      const response: MCPToolResult = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                document: documentInfo,
              },
              null,
              2
            ),
          },
        ],
      };

      this.logger.info(
        `${this.getToolName()}: Document creation completed successfully`,
        {
          requestId,
          documentId: createResult.value.documentId,
          title: createResult.value.title,
        }
      );

      return ok(response);
    } catch (error) {
      this.logger.error(
        `${this.getToolName()}: Unexpected error during creation`,
        {
          requestId,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (error instanceof GoogleDocsError) {
        return err(this.handleServiceError(error, 'create_document'));
      }

      return err(this.handleServiceError(error, 'create_document'));
    }
  }
}
