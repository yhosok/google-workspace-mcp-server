import { z } from 'zod';
import { BaseDocsTools } from './base-docs-tool.js';
import type { DocsInsertTextResult, MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Schema for insert text input parameters
 * Includes document ID, text content, and optional insertion index
 */
const InsertTextInputSchema = z.object({
  documentId: z
    .string({
      description: 'The unique identifier of the Google Docs document',
      required_error: 'Document ID is required',
      invalid_type_error: 'Document ID must be a string',
    })
    .min(1, 'Document ID cannot be empty')
    .max(100, 'Document ID too long'),
  text: z
    .string({
      description: 'Text content to insert into the document',
      required_error: 'Text is required',
      invalid_type_error: 'Text cannot be null',
    })
    .max(1000000, 'Text content too long'), // 1MB limit
  index: z
    .number({
      description: 'Zero-based index position where text should be inserted',
      invalid_type_error: 'Index must be a number',
    })
    .int('Index must be an integer')
    .min(0, 'Index must be non-negative')
    .max(10000000, 'Index too large')
    .optional(),
});

type InsertTextInput = z.infer<typeof InsertTextInputSchema>;

/**
 * Tool for inserting text into Google Documents
 *
 * This tool allows users to insert text at specific positions within
 * Google Documents. It provides a simple interface for text insertion
 * operations with comprehensive validation and error handling.
 *
 * **Key Features:**
 * - Insert text at any position in a document
 * - Default insertion at document beginning if no index specified
 * - Support for any text content including special characters
 * - Comprehensive input validation
 * - Detailed error handling and logging
 * - Automatic index calculation and validation
 *
 * **Text Insertion Behavior:**
 * - Uses 0-based indexing consistent with Google Docs API
 * - If no index is specified, text is inserted at the beginning of body content (index 1)
 * - Index 0 represents the document start position
 * - Index 1 represents the beginning of document body content (typical insertion point)
 * - Text is inserted before the character at the specified index
 * - Supports multiline text with proper newline handling
 * - Preserves existing document formatting and structure
 *
 * **Input Parameters:**
 * - `documentId` (required): The unique identifier of the document
 * - `text` (required): The text content to insert
 * - `index` (optional): The zero-based position where text should be inserted (default: 1)
 *
 * **Output:**
 * Returns detailed information about the text insertion operation including
 * the document ID, inserted text, insertion index, and the new cursor position.
 *
 * **Usage Examples:**
 * ```typescript
 * // Insert text at beginning of document body (default behavior)
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   text: "Hello, World!\n"
 * });
 *
 * // Insert text at document start (index 0)
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   text: "Document prefix ",
 *   index: 0
 * });
 *
 * // Insert text at beginning of body content (index 1)
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   text: "Body content ",
 *   index: 1
 * });
 *
 * // Insert text at specific position
 * const result = await tool.execute({
 *   documentId: "doc-123",
 *   text: "Inserted text ",
 *   index: 10
 * });
 * ```
 *
 * @extends BaseDocsTools<InsertTextInput, InsertTextResult>
 */
export class InsertTextTool extends BaseDocsTools<
  InsertTextInput,
  MCPToolResult
> {
  /**
   * Returns the unique tool name for MCP registration
   * @returns The tool name string
   */
  public getToolName(): string {
    return 'google-workspace__docs__insert-text';
  }

  /**
   * Returns the tool metadata including schema and descriptions
   * @returns ToolMetadata object with input schema and descriptions
   */
  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Insert Text into Document',
      description: 'Inserts text at a specific position in a Google Document',
      inputSchema: InsertTextInputSchema.shape,
    };
  }

  /**
   * Executes the insert text operation
   *
   * This method handles the complete text insertion workflow including:
   * 1. Input validation using Zod schema
   * 2. Authentication verification
   * 3. Document ID and text content validation
   * 4. Index validation with optional default handling
   * 5. Service call to insert the text
   * 6. Error handling and response formatting
   * 7. Comprehensive logging for debugging and monitoring
   *
   * **Implementation Details:**
   * - Uses BaseDocsTools validation infrastructure
   * - Integrates with DocsService for actual text insertion
   * - Supports flexible index handling with smart defaults
   * - Provides detailed error context for troubleshooting
   * - Returns structured response following MCP standards
   *
   * **Text Insertion Process:**
   * 1. Validates document access and permissions
   * 2. Normalizes insertion index (defaults to 1 if not specified)
   * 3. Performs atomic text insertion at specified position
   * 4. Returns detailed operation results with new document state
   * 5. Maintains document integrity throughout the process
   *
   * **Error Handling:**
   * - Validation errors for invalid document IDs or text content
   * - Authentication errors for unauthorized requests
   * - Not found errors for non-existent documents
   * - Permission errors for read-only documents
   * - Index out of bounds errors for invalid positions
   * - Service errors from Google Docs API with detailed context
   *
   * @param params - The input parameters for text insertion
   * @param context - Optional execution context for request tracking
   * @returns Promise resolving to MCPToolResult with insertion results or error
   *
   * @example
   * ```typescript
   * const result = await tool.executeImpl({
   *   documentId: "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
   *   text: "Chapter 1: Introduction\n\n",
   *   index: 1
   * });
   *
   * if (result.isOk()) {
   *   const insertResult = JSON.parse(result.value.content[0].text);
   *   console.log('Text inserted at index:', insertResult.result.insertionIndex);
   *   console.log('New cursor position:', insertResult.result.newIndex);
   * } else {
   *   console.error('Insertion failed:', result.error);
   * }
   * ```
   */
  public async executeImpl(
    params: InsertTextInput,
    context?: ToolExecutionContext
  ): Promise<Result<MCPToolResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info(`${this.getToolName()}: Starting text insertion`, {
      requestId,
      params: {
        documentId: params.documentId,
        textLength: params.text?.length || 0,
        hasIndex: params.index !== undefined,
        index: params.index,
      },
    });

    try {
      // Input validation
      const validationResult = this.validateWithSchema(
        InsertTextInputSchema,
        params,
        {
          documentId: params.documentId,
          textContent: params.text,
          index: params.index,
          operation: 'insert_text',
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
      const accessResult = await this.validateAccessControl(validatedParams, requestId);
      if (accessResult.isErr()) {
        return err(accessResult.error);
      }

      // Document ID validation using BaseDocsTools method - trim whitespace
      const trimmedDocumentId = validatedParams.documentId.trim();
      const docIdResult = this.documentIdValidation(trimmedDocumentId);
      if (docIdResult.isErr()) {
        return err(docIdResult.error);
      }

      // Text validation using BaseDocsTools method
      const textResult = this.textValidation(validatedParams.text);
      if (textResult.isErr()) {
        return err(textResult.error);
      }

      // Index validation using BaseDocsTools method with default value
      let insertionIndex: number;
      if (validatedParams.index !== undefined) {
        const indexResult = this.indexValidation(validatedParams.index);
        if (indexResult.isErr()) {
          return err(indexResult.error);
        }
        insertionIndex = indexResult.value;
      } else {
        // Use default index of 1 (beginning of document body) if not specified
        insertionIndex = 1;
      }

      // Insert text using DocsService
      const insertResult = await this.docsService.insertText(
        trimmedDocumentId,
        validatedParams.text,
        insertionIndex
      );

      if (insertResult.isErr()) {
        this.logger.error(`${this.getToolName()}: Text insertion failed`, {
          requestId,
          documentId: trimmedDocumentId,
          textLength: validatedParams.text.length,
          index: insertionIndex,
          error: insertResult.error.toJSON(),
        });
        return err(this.handleServiceError(insertResult.error, 'insert_text'));
      }

      const response: MCPToolResult = {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                result: insertResult.value,
              },
              null,
              2
            ),
          },
        ],
      };

      this.logger.info(
        `${this.getToolName()}: Text insertion completed successfully`,
        {
          requestId,
          documentId: trimmedDocumentId,
          textLength: validatedParams.text.length,
          insertionIndex: insertionIndex,
          repliesCount: insertResult.value.replies?.length || 0,
        }
      );

      return ok(response);
    } catch (error) {
      this.logger.error(
        `${this.getToolName()}: Unexpected error during text insertion`,
        {
          requestId,
          documentId: params.documentId,
          textLength: params.text?.length || 0,
          index: params.index,
          error: error instanceof Error ? error.message : String(error),
        }
      );

      if (error instanceof GoogleDocsError) {
        return err(this.handleServiceError(error, 'insert_text'));
      }

      return err(this.handleServiceError(error, 'insert_text'));
    }
  }
}
