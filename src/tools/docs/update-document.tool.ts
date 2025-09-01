import { z } from 'zod';
import { docs_v1 } from 'googleapis';
import { BaseDocsTools } from './base-docs-tool.js';
import type {
  DocsBatchUpdateResult,
  MCPToolResult,
} from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Schema for update document input parameters
 * Includes document ID and an array of batch update requests
 */
const UpdateDocumentInputSchema = z.object({
  documentId: z
    .string({
      description: 'The unique identifier of the Google Docs document',
      required_error: 'Document ID is required',
      invalid_type_error: 'Document ID must be a string',
    })
    .min(1, 'Document ID cannot be empty')
    .max(100, 'Document ID too long'),
  requests: z
    .array(z.any(), {
      description: 'Array of batch update requests to apply to the document',
      required_error: 'Requests array is required',
      invalid_type_error: 'Requests must be an array',
    })
    .max(500, 'Too many requests in batch (max 500)'),
});

type UpdateDocumentInput = z.infer<typeof UpdateDocumentInputSchema>;

/**
 * Tool for updating Google Documents using batch operations
 *
 * This tool allows users to perform batch updates on Google Documents using
 * the Google Docs API batch update system. It supports various types of
 * document modifications including text insertion, deletion, replacement,
 * and formatting changes.
 *
 * **Key Features:**
 * - Batch update operations for efficient document modification
 * - Support for multiple request types in a single operation
 * - Text insertion, deletion, and replacement operations
 * - Text formatting and style modifications
 * - Comprehensive input validation and error handling
 * - Detailed operation logging and monitoring
 *
 * **Supported Request Types:**
 * - `insertText`: Insert text at specified location
 * - `deleteContentRange`: Delete text within a range
 * - `replaceAllText`: Replace all occurrences of text
 * - `updateTextStyle`: Apply formatting to text ranges
 * - And many other Google Docs API request types
 *
 * **Input Parameters:**
 * - `documentId` (required): The unique identifier of the document
 * - `requests` (required): Array of batch update requests (1-500 requests)
 *
 * **Output:**
 * Returns batch update result with replies for each request, including
 * information about text changes, formatting applications, and operation outcomes.
 *
 * **Usage Examples:**
 * ```typescript
 * // Insert text at beginning of document
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   requests: [{
 *     insertText: {
 *       text: "Hello, World!\n",
 *       location: { index: 1 }
 *     }
 *   }]
 * });
 *
 * // Multiple operations in one batch
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   requests: [
 *     { insertText: { text: "Title\n", location: { index: 1 } } },
 *     { updateTextStyle: {
 *         range: { startIndex: 1, endIndex: 6 },
 *         textStyle: { bold: true },
 *         fields: "bold"
 *       }
 *     }
 *   ]
 * });
 * ```
 *
 * @extends BaseDocsTools<UpdateDocumentInput, UpdateDocumentResult>
 */
export class UpdateDocumentTool extends BaseDocsTools<
  UpdateDocumentInput,
  MCPToolResult
> {
  /**
   * Returns the unique tool name for MCP registration
   * @returns The tool name string
   */
  public getToolName(): string {
    return 'google-workspace__docs__update';
  }

  /**
   * Returns the tool metadata including schema and descriptions
   * @returns ToolMetadata object with input schema and descriptions
   */
  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Update Google Document',
      description:
        'Performs batch updates on a Google Document using the batchUpdate API',
      inputSchema: UpdateDocumentInputSchema.shape,
    };
  }

  /**
   * Executes the update document operation
   *
   * This method handles the complete document update workflow including:
   * 1. Input validation using Zod schema
   * 2. Authentication verification
   * 3. Document ID validation using BaseDocsTools methods
   * 4. Request array validation and processing
   * 5. Service call to perform batch update
   * 6. Error handling and response formatting
   * 7. Comprehensive logging for debugging and monitoring
   *
   * **Implementation Details:**
   * - Uses BaseDocsTools validation infrastructure
   * - Integrates with DocsService for actual batch update operations
   * - Supports all Google Docs API request types through flexible schema
   * - Provides detailed error context for troubleshooting
   * - Returns structured response following MCP standards
   *
   * **Batch Update Process:**
   * 1. Validates all requests in the batch before execution
   * 2. Executes all requests atomically (all succeed or all fail)
   * 3. Returns detailed replies for each request with operation results
   * 4. Maintains document consistency throughout the operation
   *
   * **Error Handling:**
   * - Validation errors for invalid document IDs or request arrays
   * - Authentication errors for unauthorized requests
   * - Not found errors for non-existent documents
   * - Permission errors for read-only documents
   * - Service errors from Google Docs API with detailed context
   * - Request-specific errors with operation context
   *
   * @param params - The input parameters for document update
   * @param context - Optional execution context for request tracking
   * @returns Promise resolving to MCPToolResult with update results or error
   *
   * @example
   * ```typescript
   * const result = await tool.executeImpl({
   *   documentId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
   *   requests: [
   *     {
   *       insertText: {
   *         text: "New paragraph\n",
   *         location: { index: 1 }
   *       }
   *     },
   *     {
   *       updateTextStyle: {
   *         range: { startIndex: 1, endIndex: 13 },
   *         textStyle: { bold: true },
   *         fields: "bold"
   *       }
   *     }
   *   ]
   * });
   *
   * if (result.isOk()) {
   *   const updateResult = JSON.parse(result.value.content[0].text);
   *   console.log('Update replies:', updateResult.result.replies);
   * } else {
   *   console.error('Update failed:', result.error);
   * }
   * ```
   */
  public async executeImpl(
    params: UpdateDocumentInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info(`${this.getToolName()}: Starting document update`, {
      requestId,
      params: {
        documentId: params.documentId,
        requestCount: params.requests?.length || 0,
      },
    });

    try {
      // Input validation
      const validationResult = this.validateWithSchema(
        UpdateDocumentInputSchema,
        params,
        {
          documentId: params.documentId,
          operation: 'update_document',
        }
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

      // Document ID validation using BaseDocsTools method - trim whitespace
      const trimmedDocumentId = validatedParams.documentId.trim();
      const docIdResult = this.documentIdValidation(trimmedDocumentId);
      if (docIdResult.isErr()) {
        return err(docIdResult.error);
      }

      // Basic validation for requests array (allow empty arrays)
      if (!Array.isArray(validatedParams.requests)) {
        return err(
          new GoogleDocsError(
            'Requests must be an array',
            'GOOGLE_DOCS_VALIDATION_ERROR',
            400,
            trimmedDocumentId,
            { parameter: 'requests', received: typeof validatedParams.requests }
          )
        );
      }

      // Perform batch update using DocsService
      let updateResult;
      try {
        updateResult = await this.docsService.batchUpdate(
          trimmedDocumentId,
          validatedParams.requests as docs_v1.Schema$Request[]
        );
      } catch (serviceError) {
        this.logger.error(
          `${this.getToolName()}: Service call threw exception`,
          {
            requestId,
            documentId: trimmedDocumentId,
            error:
              serviceError instanceof Error
                ? serviceError.message
                : String(serviceError),
          }
        );
        return err(this.handleServiceError(serviceError, 'update_document'));
      }

      if (!updateResult) {
        this.logger.error(
          `${this.getToolName()}: Service returned undefined result`,
          {
            requestId,
            documentId: trimmedDocumentId,
          }
        );
        return err(
          this.handleServiceError(
            new Error('Service returned undefined result'),
            'update_document'
          )
        );
      }

      if (updateResult.isErr()) {
        this.logger.error(`${this.getToolName()}: Document update failed`, {
          requestId,
          documentId: trimmedDocumentId,
          requestCount: validatedParams.requests.length,
          error: updateResult.error.toJSON(),
        });
        return err(
          this.handleServiceError(updateResult.error, 'update_document')
        );
      }

      // Handle null or undefined response from service
      if (!updateResult.value) {
        this.logger.error(
          `${this.getToolName()}: Service returned null or undefined response`,
          {
            requestId,
            documentId: trimmedDocumentId,
            requestCount: validatedParams.requests.length,
          }
        );
        return err(
          this.handleServiceError(
            new Error('Service returned null response'),
            'update_document'
          )
        );
      }

      const response: MCPToolResult = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                result: updateResult.value,
              },
              null,
              2
            ),
          },
        ],
      };

      this.logger.info(
        `${this.getToolName()}: Document update completed successfully`,
        {
          requestId,
          documentId: trimmedDocumentId,
          requestCount: validatedParams.requests.length,
          replyCount: updateResult.value.replies?.length || 0,
        }
      );

      return ok(response);
    } catch (error) {
      this.logger.error(
        `${this.getToolName()}: Unexpected error during update`,
        {
          requestId,
          documentId: params.documentId,
          requestCount: params.requests?.length || 0,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (error instanceof GoogleDocsError) {
        return err(this.handleServiceError(error, 'update_document'));
      }

      return err(this.handleServiceError(error, 'update_document'));
    }
  }
}
