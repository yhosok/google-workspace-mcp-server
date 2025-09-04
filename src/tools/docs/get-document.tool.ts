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
 * Schema for get document input parameters
 * Includes document ID, optional content inclusion flag, and format selection
 */
const GetDocumentInputSchema = z.object({
  documentId: z
    .string({
      description: 'The unique identifier of the Google Docs document',
      required_error: 'Document ID is required',
      invalid_type_error: 'Document ID must be a string',
    })
    .min(1, 'Document ID cannot be empty')
    .max(100, 'Document ID too long'),
  includeContent: z
    .boolean({
      description:
        'Whether to include the document body content in the response',
      invalid_type_error: 'Include content must be a boolean',
    })
    .optional(),
  format: z
    .string({
      description:
        'Output format: markdown for plain text markdown or json for structured document data',
      invalid_type_error: 'Format must be either "markdown" or "json"',
    })
    .transform(val => val.toLowerCase() as 'markdown' | 'json')
    .refine(val => ['markdown', 'json'].includes(val), {
      message: 'Format must be either "markdown" or "json"',
    })
    .default('markdown')
    .optional(),
});

type GetDocumentInput = z.infer<typeof GetDocumentInputSchema>;

/**
 * Tool for retrieving Google Documents
 *
 * This tool allows users to retrieve Google Documents with their metadata
 * and optional content. It integrates with the DocsService to handle
 * document retrieval and provides comprehensive error handling and validation.
 *
 * **Key Features:**
 * - Retrieve document metadata (title, IDs, URLs, timestamps)
 * - Optional full content retrieval with body structure
 * - Comprehensive input validation
 * - Detailed error handling and logging
 * - Support for both metadata-only and full document retrieval
 *
 * **Input Parameters:**
 * - `documentId` (required): The unique identifier of the document
 * - `includeContent` (optional): Whether to include document body content
 * - `format` (optional): Output format - 'markdown' (default) or 'json'
 *
 * **Output:**
 * - Markdown format: Returns plain text markdown content
 * - JSON format: Returns complete document information including document ID, title, URLs,
 *   revision information, and optionally the complete document body structure
 *   with paragraphs, text runs, and styling information.
 *
 * **Usage Examples:**
 * ```typescript
 * // Get document as markdown (default)
 * const result = await tool.execute({ documentId: "doc-123" });
 *
 * // Get document as JSON with full content
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   includeContent: true,
 *   format: "json"
 * });
 *
 * // Get document as markdown explicitly
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   format: "markdown"
 * });
 * ```
 *
 * @extends BaseDocsTools<GetDocumentInput, GetDocumentResult>
 */
export class GetDocumentTool extends BaseDocsTools<
  GetDocumentInput,
  MCPToolResult
> {
  /**
   * Returns the unique tool name for MCP registration
   * @returns The tool name string
   */
  public getToolName(): string {
    return 'google-workspace__docs__get';
  }

  /**
   * Returns the tool metadata including schema and descriptions
   * @returns ToolMetadata object with input schema and descriptions
   */
  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Get Google Document',
      description:
        'Retrieves a Google Document with its metadata and optional content. Supports markdown (default) and JSON output formats.',
      inputSchema: GetDocumentInputSchema.shape,
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
   * Executes the get document operation
   *
   * This method handles the complete document retrieval workflow including:
   * 1. Input validation using Zod schema
   * 2. Authentication verification
   * 3. Document ID validation using BaseDocsTools methods
   * 4. Service call to retrieve the document
   * 5. Error handling and response formatting
   * 6. Comprehensive logging for debugging and monitoring
   *
   * **Implementation Details:**
   * - Uses BaseDocsTools validation infrastructure
   * - Integrates with DocsService for actual document retrieval
   * - Supports both metadata-only and full content retrieval modes
   * - Provides detailed error context for troubleshooting
   * - Returns structured response following MCP standards
   *
   * **Error Handling:**
   * - Validation errors for invalid document IDs
   * - Authentication errors for unauthorized requests
   * - Not found errors for non-existent documents
   * - Permission errors for inaccessible documents
   * - Service errors from Google Docs API
   * - Network and timeout errors with retry context
   *
   * @param params - The input parameters for document retrieval
   * @param context - Optional execution context for request tracking
   * @returns Promise resolving to MCPToolResult with document information or error
   *
   * @example
   * ```typescript
   * const result = await tool.executeImpl({
   *   documentId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
   *   includeContent: true
   * });
   *
   * if (result.isOk()) {
   *   const document = JSON.parse(result.value.content[0].text);
   *   console.log('Document title:', document.document.title);
   * } else {
   *   console.error('Retrieval failed:', result.error);
   * }
   * ```
   */
  public async executeImpl(
    params: GetDocumentInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info(`${this.getToolName()}: Starting document retrieval`, {
      requestId,
      params: {
        documentId: params.documentId,
        includeContent: !!params.includeContent,
        format: params.format || 'markdown',
      },
    });

    try {
      // Input validation
      const validationResult = this.validateWithSchema(
        GetDocumentInputSchema,
        params,
        {
          documentId: params.documentId,
          operation: 'get_document',
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

      // Handle different formats
      const format = validatedParams.format || 'markdown';
      let response: MCPToolResult;

      if (format === 'markdown') {
        // Use getDocumentAsMarkdown for markdown format
        const markdownResult =
          await this.docsService.getDocumentAsMarkdown(trimmedDocumentId);

        if (markdownResult.isErr()) {
          this.logger.error(`${this.getToolName()}: Markdown export failed`, {
            requestId,
            documentId: trimmedDocumentId,
            error: markdownResult.error.toJSON(),
          });
          return err(
            this.handleServiceError(markdownResult.error, 'get_document')
          );
        }

        response = {
          content: [
            {
              type: 'text' as const,
              text: markdownResult.value,
            },
          ],
        };

        this.logger.info(
          `${this.getToolName()}: Document retrieval as markdown completed successfully`,
          {
            requestId,
            documentId: trimmedDocumentId,
            format: 'markdown',
            contentLength: markdownResult.value.length,
          }
        );
      } else {
        // Use getDocument for JSON format (existing behavior)
        const getResult = await this.docsService.getDocument(
          trimmedDocumentId,
          validatedParams.includeContent ?? false
        );

        if (getResult.isErr()) {
          this.logger.error(
            `${this.getToolName()}: Document retrieval failed`,
            {
              requestId,
              documentId: trimmedDocumentId,
              error: getResult.error.toJSON(),
            }
          );
          return err(this.handleServiceError(getResult.error, 'get_document'));
        }

        // The DocsService.getDocument returns Schema$Document, convert to DocsDocumentInfo
        const doc = getResult.value;
        const documentInfo: DocsDocumentInfo = {
          documentId: doc.documentId || trimmedDocumentId,
          title: doc.title || 'Untitled Document',
          revisionId: doc.revisionId || 'unknown',
          createdTime: new Date().toISOString(), // Schema$Document doesn't have createdTime
          modifiedTime: new Date().toISOString(), // Schema$Document doesn't have modifiedTime
          documentUrl: `https://docs.google.com/document/d/${trimmedDocumentId}/edit`,
          // Service now handles includeContent logic, so we convert the body if it exists
          body: doc.body ? this.convertBodyToDocumentInfo(doc.body) : undefined,
        };

        response = {
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
          `${this.getToolName()}: Document retrieval as JSON completed successfully`,
          {
            requestId,
            documentId: trimmedDocumentId,
            title: documentInfo.title,
            hasContent: !!documentInfo.body,
            format: 'json',
          }
        );
      }

      return ok(response);
    } catch (error) {
      this.logger.error(
        `${this.getToolName()}: Unexpected error during retrieval`,
        {
          requestId,
          documentId: params.documentId,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (error instanceof GoogleDocsError) {
        return err(this.handleServiceError(error, 'get_document'));
      }

      return err(this.handleServiceError(error, 'get_document'));
    }
  }
}
