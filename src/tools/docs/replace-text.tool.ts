import { z } from 'zod';
import { BaseDocsTools } from './base-docs-tool.js';
import { DOCS_TOOLS } from '../base/tool-definitions.js';
import type { MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleWorkspaceError } from '../../errors/index.js';
import { SchemaFactory } from '../base/tool-schema.js';

// Define the type from the tool schema
const ReplaceTextInputSchema = SchemaFactory.createToolInputSchema(
  DOCS_TOOLS.REPLACE_TEXT
);
type ReplaceTextInput = z.infer<typeof ReplaceTextInputSchema>;

/**
 * Tool for replacing text in Google Documents
 *
 * This tool allows users to find and replace all occurrences of specified
 * text within Google Documents. It provides flexible search and replace
 * functionality with optional case sensitivity control.
 *
 * **Key Features:**
 * - Replace all occurrences of search text in a document
 * - Case-sensitive and case-insensitive search options
 * - Support for any text content including special characters and patterns
 * - Empty replacement text support for deletion operations
 * - Comprehensive input validation and error handling
 * - Detailed operation results with occurrence counts
 *
 * **Text Replacement Behavior:**
 * - Searches through the entire document content
 * - Replaces all matching occurrences in a single operation
 * - Preserves document formatting and structure where possible
 * - Returns count of replacements made for verification
 * - Supports multiline text search and replacement
 * - Handles special characters and Unicode text properly
 *
 * **Input Parameters:**
 * - `documentId` (required): The unique identifier of the document
 * - `searchText` (required): The text to search for (can be empty for specific use cases)
 * - `replaceText` (required): The replacement text (can be empty for deletion)
 * - `matchCase` (optional): Whether search should be case-sensitive (default: false)
 *
 * **Output:**
 * Returns detailed information about the text replacement operation including
 * the document ID, search parameters, replacement text, number of occurrences
 * changed, and the case sensitivity setting used.
 *
 * **Usage Examples:**
 * ```typescript
 * // Replace text with case-insensitive search
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   searchText: "old text",
 *   replaceText: "new text"
 * });
 *
 * // Case-sensitive replacement
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   searchText: "Old Text",
 *   replaceText: "New Text",
 *   matchCase: true
 * });
 *
 * // Delete text by replacing with empty string
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   searchText: "text to remove",
 *   replaceText: ""
 * });
 * ```
 *
 * @extends BaseDocsTools<ReplaceTextInput, ReplaceTextResult>
 */
export class ReplaceTextTool extends BaseDocsTools<
  ReplaceTextInput,
  MCPToolResult
> {
  /**
   * Returns the unique tool name for MCP registration
   * @returns The tool name string
   */
  public getToolName(): string {
    return DOCS_TOOLS.REPLACE_TEXT;
  }

  /**
   * Returns the tool metadata including schema and descriptions
   * @returns ToolMetadata object with input schema and descriptions
   */
  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata(
      DOCS_TOOLS.REPLACE_TEXT
    );
  }

  /**
   * Executes the replace text operation
   *
   * This method handles the complete text replacement workflow including:
   * 1. Input validation using Zod schema
   * 2. Authentication verification
   * 3. Document ID and text content validation
   * 4. Search and replacement text validation
   * 5. Service call to perform the replacement
   * 6. Error handling and response formatting
   * 7. Comprehensive logging for debugging and monitoring
   *
   * **Implementation Details:**
   * - Uses BaseDocsTools validation infrastructure
   * - Integrates with DocsService for actual text replacement
   * - Supports flexible case sensitivity options
   * - Provides detailed error context for troubleshooting
   * - Returns structured response following MCP standards
   *
   * **Text Replacement Process:**
   * 1. Validates document access and permissions
   * 2. Performs comprehensive search parameter validation
   * 3. Executes atomic replace-all operation
   * 4. Returns detailed operation results with statistics
   * 5. Maintains document integrity throughout the process
   *
   * **Error Handling:**
   * - Validation errors for invalid document IDs or text parameters
   * - Authentication errors for unauthorized requests
   * - Not found errors for non-existent documents
   * - Permission errors for read-only documents
   * - Service errors from Google Docs API with detailed context
   * - Text processing errors with search pattern context
   *
   * @param params - The input parameters for text replacement
   * @param context - Optional execution context for request tracking
   * @returns Promise resolving to MCPToolResult with replacement results or error
   *
   * @example
   * ```typescript
   * const result = await tool.executeImpl({
   *   documentId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
   *   searchText: "TODO",
   *   replaceText: "COMPLETED",
   *   matchCase: false
   * });
   *
   * if (result.isOk()) {
   *   const replaceResult = JSON.parse(result.value.content[0].text);
   *   console.log('Replacements made:', replaceResult.result.occurrencesChanged);
   * } else {
   *   console.error('Replacement failed:', result.error);
   * }
   * ```
   */
  public async executeImpl(
    params: ReplaceTextInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info(`${this.getToolName()}: Starting text replacement`, {
      requestId,
      params: {
        documentId: params.documentId,
        searchTextLength: params.searchText?.length || 0,
        replaceTextLength: params.replaceText?.length || 0,
        matchCase: !!params.matchCase,
      },
    });

    try {
      // Input validation
      const validationResult = this.validateWithSchema(
        ReplaceTextInputSchema,
        params,
        {
          documentId: params.documentId,
          textContent: params.searchText,
          operation: 'replace_text',
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

      // Validate access control for write operations
      const accessResult = await this.validateAccessControl(
        validatedParams,
        requestId
      );
      if (accessResult.isErr()) {
        return err(accessResult.error);
      }

      // Document ID validation using BaseDocsTools method - trim whitespace
      const trimmedDocumentId = validatedParams.documentId.trim();
      const docIdResult = this.documentIdValidation(trimmedDocumentId);
      if (docIdResult.isErr()) {
        return err(docIdResult.error);
      }

      // Search text validation using BaseDocsTools method
      const searchTextResult = this.textValidation(validatedParams.searchText);
      if (searchTextResult.isErr()) {
        return err(searchTextResult.error);
      }

      // Replace text validation using BaseDocsTools method (can be empty)
      const replaceTextResult = this.textValidation(
        validatedParams.replaceText
      );
      if (replaceTextResult.isErr()) {
        return err(replaceTextResult.error);
      }

      // Note: Empty searchText is allowed for valid use cases like finding empty strings

      // Set default value for matchCase if not provided
      const matchCase = validatedParams.matchCase ?? true;

      // Replace text using DocsService
      const replaceResult = await this.docsService.replaceText(
        trimmedDocumentId,
        validatedParams.searchText,
        validatedParams.replaceText,
        matchCase
      );

      if (replaceResult.isErr()) {
        this.logger.error(`${this.getToolName()}: Text replacement failed`, {
          requestId,
          documentId: trimmedDocumentId,
          searchTextLength: validatedParams.searchText.length,
          replaceTextLength: validatedParams.replaceText.length,
          matchCase: matchCase,
          error: replaceResult.error.toJSON(),
        });
        return err(
          this.handleServiceError(replaceResult.error, 'replace_text')
        );
      }

      const response: MCPToolResult = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                result: replaceResult.value,
              },
              null,
              2
            ),
          },
        ],
      };

      this.logger.info(
        `${this.getToolName()}: Text replacement completed successfully`,
        {
          requestId,
          documentId: trimmedDocumentId,
          searchTextLength: validatedParams.searchText.length,
          replaceTextLength: validatedParams.replaceText.length,
          matchCase: matchCase,
          repliesCount: replaceResult.value.replies?.length || 0,
        }
      );

      return ok(response);
    } catch (error) {
      this.logger.error(
        `${this.getToolName()}: Unexpected error during text replacement`,
        {
          requestId,
          documentId: params.documentId,
          searchTextLength: params.searchText?.length || 0,
          replaceTextLength: params.replaceText?.length || 0,
          matchCase: params.matchCase,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (error instanceof GoogleDocsError) {
        return err(this.handleServiceError(error, 'replace_text'));
      }

      return err(this.handleServiceError(error, 'replace_text'));
    }
  }
}
