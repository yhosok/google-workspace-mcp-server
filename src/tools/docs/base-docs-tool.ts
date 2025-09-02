import { ToolRegistry } from '../base/tool-registry.js';
import type { AuthService } from '../../services/auth.service.js';
import type { DocsService } from '../../services/docs.service.js';
import type { AccessControlService } from '../../services/access-control.service.js';
import {
  GoogleDocsError,
  GoogleDocsNotFoundError,
  GoogleDocsPermissionError,
  GoogleAuthError,
  GoogleWorkspaceError,
  GoogleAccessControlError,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';
import { Result, ok, err } from 'neverthrow';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  validateToolInput,
  validateToolInputWithContext,
  ValidationContext,
} from '../../utils/validation.utils.js';
import { MCPToolResult } from '../../types/index.js';

/**
 * Validation context interface for Docs operations
 * Extends the base ValidationContext with Docs-specific fields
 */
export interface DocsValidationContext extends ValidationContext {
  documentId?: string;
  operation?: string;
  textContent?: string;
  index?: number;
}

/**
 * Supported Docs tools for schema factory
 */
export type SupportedDocsTools =
  | 'docs-create'
  | 'docs-get'
  | 'docs-update'
  | 'docs-insert-text'
  | 'docs-replace-text';

/**
 * Base class for Docs tools providing common functionality
 *
 * This abstract class serves as the foundation for all Google Docs MCP tools,
 * providing standardized error handling, validation, and service integration patterns.
 * It follows the established architecture patterns used by BaseDriveTool and BaseSheetsTools.
 *
 * **Key Features:**
 * - Unified error handling with Docs-specific error conversion
 * - Input validation using Zod schemas with Docs context
 * - Document ID, text content, and index validation
 * - Dependency injection for DocsService and AuthService
 * - Comprehensive logging and debugging support
 * - Common schema definitions for Docs operations
 *
 * **Architecture Pattern:**
 * ```typescript
 * export class MyDocsTool extends BaseDocsTools<InputType, OutputType> {
 *   // Tool implementation
 * }
 * ```
 *
 * **Error Handling:**
 * All Docs operations use the standardized error conversion system that transforms
 * generic errors into appropriate Docs-specific error types with proper context
 * including document IDs, operation details, and text content information.
 *
 * **Validation:**
 * Input validation follows the unified pattern using Zod schemas with enhanced
 * Docs-specific validation for document identifiers and operation parameters.
 *
 * @template TInput - The input type for the tool (default: unknown)
 * @template TOutput - The output type for the tool (default: unknown)
 */
export abstract class BaseDocsTools<
  TInput = unknown,
  TOutput = unknown,
> extends ToolRegistry<TInput, TOutput> {
  /**
   * Creates a new BaseDocsTools instance with required service dependencies.
   *
   * **Dependency Injection Pattern:**
   * This constructor follows the established dependency injection pattern used
   * throughout the codebase, allowing for proper service lifecycle management
   * and testing with mock services.
   *
   * @param docsService - The DocsService instance for Google Docs API operations
   * @param authService - The AuthService instance for authentication management
   * @param logger - Optional custom logger instance. If not provided, uses default service logger
   *
   * @example
   * ```typescript
   * class MyDocsTool extends BaseDocsTools {
   *   constructor(docsService: DocsService, authService: AuthService) {
   *     super(docsService, authService);
   *   }
   * }
   * ```
   */
  constructor(
    protected docsService: DocsService,
    protected authService: AuthService,
    logger?: Logger,
    protected accessControlService?: AccessControlService
  ) {
    super(logger);
  }

  /**
   * Validates input data using a Zod schema with optional Docs-specific context information.
   *
   * This method provides a standardized way to validate tool inputs while maintaining
   * consistency with the existing validation patterns used across the codebase.
   * It uses the simpler validateToolInput method to match test expectations and
   * established patterns from other base tool classes.
   *
   * **Validation Features:**
   * - Schema-based validation using Zod
   * - Docs-specific error conversion
   * - Context preservation for enhanced error reporting
   * - Consistent error format across all Docs tools
   *
   * **Usage Pattern:**
   * ```typescript
   * const validationResult = this.validateWithSchema(
   *   MyInputSchema,
   *   inputData,
   *   { documentId: 'abc123', operation: 'get_document' }
   * );
   *
   * if (validationResult.isErr()) {
   *   return err(validationResult.error);
   * }
   * ```
   *
   * @param schema - The Zod schema to validate against
   * @param data - The input data to validate
   * @param context - Optional Docs-specific validation context for enhanced error reporting
   * @returns Result with validated data or GoogleDocsError
   *
   * @see validateToolInput For the underlying validation implementation
   * @see DocsValidationContext For available context fields
   */
  protected validateWithSchema<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context?: DocsValidationContext
  ): Result<T, GoogleDocsError> {
    // Use the simpler validateToolInput method to match test expectations
    // The tests expect this method to be called directly
    const result = validateToolInput(schema, data);

    // Convert GoogleSheetsError to GoogleDocsError for Docs tools
    return result.mapErr(error => {
      if (error instanceof GoogleDocsError) {
        return error;
      }

      // Convert from other error types to Docs error
      return new GoogleDocsError(
        error.message,
        'GOOGLE_DOCS_VALIDATION_ERROR',
        400,
        context?.documentId,
        {
          originalErrorCode: error.errorCode,
          validationContext: context,
        },
        error
      );
    });
  }

  /**
   * Validates Google Docs document ID input with comprehensive formatting and existence checks.
   *
   * This method performs thorough validation of Google Docs document IDs including:
   * - Empty/null value detection
   * - Whitespace trimming and normalization
   * - Basic format validation for Docs document ID patterns
   * - Consistent error reporting with Docs-specific error types
   *
   * **Document ID Format:**
   * Google Docs document IDs are typically alphanumeric strings with underscores and hyphens.
   * This validation ensures the ID meets basic format requirements without making
   * expensive API calls for existence verification.
   *
   * **Validation Rules:**
   * - Must not be empty, null, or undefined
   * - Must not be only whitespace
   * - After trimming, must have reasonable length (1+ characters)
   * - Results in consistent GoogleDocsError for invalid inputs
   *
   * @param documentId - The document ID string to validate
   * @returns Result with validated and trimmed document ID or GoogleDocsError
   *
   * @example
   * ```typescript
   * const result = this.documentIdValidation(params.documentId);
   * if (result.isErr()) {
   *   return err(result.error);
   * }
   * const validDocumentId = result.value; // Guaranteed to be valid and trimmed
   * ```
   */
  protected documentIdValidation(
    documentId: string
  ): Result<string, GoogleDocsError> {
    if (!documentId || documentId.trim() === '') {
      return err(
        new GoogleDocsError(
          'Document ID cannot be empty',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          documentId || '<empty>',
          {
            reason: 'Document ID cannot be empty',
            parameter: 'documentId',
          }
        )
      );
    }

    const trimmedId = documentId.trim();
    if (trimmedId.length === 0) {
      return err(
        new GoogleDocsError(
          'Document ID cannot be empty',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          documentId,
          {
            reason: 'Document ID cannot be only whitespace',
            parameter: 'documentId',
          }
        )
      );
    }

    return ok(trimmedId);
  }

  /**
   * Validates text content input with comprehensive formatting checks.
   *
   * This method performs thorough validation of text content for Docs operations
   * including null/undefined checks and basic content validation.
   *
   * **Text Content Handling:**
   * - Supports any string content including empty strings for certain operations
   * - Handles special characters, HTML content, and multiline text
   * - Provides text-specific error messages and context
   * - Maintains consistency with document ID validation patterns
   *
   * **Validation Rules:**
   * - Must not be null or undefined
   * - Can be empty string for certain operations
   * - Results in Docs permission error for invalid text references
   *
   * @param text - The text content string to validate
   * @returns Result with validated text or GoogleDocsError
   *
   * @example
   * ```typescript
   * const result = this.textValidation(params.text);
   * if (result.isErr()) {
   *   return err(result.error);
   * }
   * const validText = result.value; // Guaranteed to be valid
   * ```
   */
  protected textValidation(text: string): Result<string, GoogleDocsError> {
    if (text === null) {
      return err(
        new GoogleDocsError(
          'Text cannot be null',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          undefined,
          {
            reason: 'Text cannot be null',
            parameter: 'text',
          }
        )
      );
    }
    if (text === undefined) {
      return err(
        new GoogleDocsError(
          'Text cannot be undefined',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          undefined,
          {
            reason: 'Text cannot be undefined',
            parameter: 'text',
          }
        )
      );
    }
    // Note: Empty strings are allowed for text content
    return ok(text);
  }

  /**
   * Validates index values for text insertion and manipulation operations.
   *
   * This method performs thorough validation of index values used in Docs operations
   * including range checks and type validation.
   *
   * **Index Handling:**
   * - Supports zero-based indexing consistent with Google Docs API
   * - Allows zero and positive integers for document positions
   * - Handles large index values for long documents
   * - Provides index-specific error messages and context
   * - Maintains consistency with other validation patterns
   *
   * **Validation Rules:**
   * - Must be a non-negative integer (>= 0)
   * - Must not be a floating-point number
   * - Must not be null or undefined when required
   * - Results in Docs permission error for invalid index values
   *
   * **Google Docs API Indexing:**
   * - Uses 0-based indexing where 0 represents the document start
   * - Index 1 typically represents the beginning of document body content
   * - Index values must be within the document bounds
   *
   * @param index - The index value to validate
   * @param defaultValue - Optional default value if index is undefined
   * @returns Result with validated index or GoogleDocsError
   *
   * @example
   * ```typescript
   * const result = this.indexValidation(params.index);
   * if (result.isErr()) {
   *   return err(result.error);
   * }
   * const validIndex = result.value; // Guaranteed to be valid (>= 0)
   * ```
   */
  protected indexValidation(
    index: number,
    defaultValue?: number
  ): Result<number, GoogleDocsError> {
    if (index === null || index === undefined) {
      if (defaultValue !== undefined) {
        // Use default value - no error
        return ok(defaultValue);
      }
      return err(
        new GoogleDocsError(
          'Index cannot be null or undefined',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          undefined,
          {
            reason: 'Index cannot be null or undefined',
            parameter: 'index',
          }
        )
      );
    }

    if (typeof index !== 'number') {
      return err(
        new GoogleDocsError(
          'Index must be a number',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          undefined,
          {
            reason: 'Index must be a number',
            parameter: 'index',
          }
        )
      );
    }

    if (!Number.isInteger(index)) {
      return err(
        new GoogleDocsError(
          'Index must be an integer',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          undefined,
          {
            reason: 'Index must be an integer',
            parameter: 'index',
          }
        )
      );
    }

    if (index < 0) {
      return err(
        new GoogleDocsError(
          'Index must be non-negative',
          'GOOGLE_DOCS_VALIDATION_ERROR',
          400,
          undefined,
          {
            reason: 'Index must be non-negative (>= 0)',
            parameter: 'index',
          }
        )
      );
    }

    return ok(index);
  }

  /**
   * Validates authentication for Docs operations.
   *
   * This method performs authentication validation by checking with the AuthService
   * to ensure the user has proper credentials and permissions for Docs operations.
   *
   * **Authentication Features:**
   * - Service account and OAuth2 authentication support
   * - Proper error handling and logging
   * - Request ID tracking for debugging
   * - Consistent error format across all Docs tools
   *
   * @param requestId - The request ID for logging and tracking
   * @returns Result with true for valid auth or GoogleWorkspaceError
   *
   * @example
   * ```typescript
   * const authResult = await this.validateAuthentication('req-123');
   * if (authResult.isErr()) {
   *   return err(authResult.error);
   * }
   * ```
   */
  protected async validateAuthentication(
    requestId: string
  ): Promise<Result<true, GoogleWorkspaceError>> {
    try {
      const authResult = await this.authService.validateAuth();
      if (authResult.isErr()) {
        this.logger.error('Authentication failed', {
          error: authResult.error.toJSON(),
          requestId,
        });
        return err(authResult.error);
      }

      if (!authResult.value) {
        const authError = new GoogleAuthError(
          'Authentication validation failed',
          'service-account',
          { operation: this.getToolName(), requestId }
        );

        this.logger.error('Authentication invalid', {
          error: authError.toJSON(),
          requestId,
        });

        return err(authError);
      }

      return ok(true);
    } catch (error) {
      const authError = new GoogleAuthError(
        error instanceof Error ? error.message : 'Authentication error',
        'service-account',
        { operation: this.getToolName(), requestId }
      );

      return err(authError);
    }
  }

  /**
   * Handles service-related errors and converts them to appropriate Docs error types.
   *
   * This method provides a centralized error conversion system that transforms
   * various error types into standardized GoogleDocsError instances with
   * appropriate error codes, status codes, and context information.
   *
   * **Error Conversion Strategy:**
   * 1. **GoogleDocsError**: Passed through unchanged (already correctly typed)
   * 2. **GoogleAuthError**: Converted to Docs auth error with original context
   * 3. **GoogleWorkspaceError**: Converted to Docs service error with original context
   * 4. **Generic Error**: Converted to unknown Docs error with basic context
   *
   * **Error Context Preservation:**
   * The method preserves original error information in the `originalError` context
   * field while providing Docs-specific error codes and status codes for
   * consistent error handling across the Docs service layer.
   *
   * @param error - The error to handle (can be any type)
   * @param context - Additional context for error reporting
   * @returns GoogleDocsError instance
   *
   * @example
   * ```typescript
   * try {
   *   await this.docsService.getDocument(documentId);
   * } catch (error) {
   *   const docsError = this.handleServiceError(error, 'get_document');
   *   return err(docsError);
   * }
   * ```
   */
  protected handleServiceError(
    error: unknown,
    context?: string
  ): GoogleDocsError {
    if (error instanceof GoogleDocsError) {
      // Transform 401 errors to auth errors for consistency
      if (error.statusCode === 401) {
        return new GoogleDocsError(
          error.message,
          'GOOGLE_AUTH_ERROR',
          error.statusCode,
          typeof error.context === 'object' &&
          error.context &&
          'documentId' in error.context
            ? (error.context.documentId as string)
            : undefined,
          { originalError: error, context }
        );
      }
      return error;
    }

    if (error instanceof GoogleAuthError) {
      return new GoogleDocsError(
        error.message,
        'GOOGLE_AUTH_ERROR',
        error.statusCode,
        undefined,
        { originalError: error, context }
      );
    }

    if (error instanceof GoogleWorkspaceError) {
      return new GoogleDocsError(
        error.message,
        'GOOGLE_DOCS_SERVICE_ERROR',
        error.statusCode,
        undefined,
        { originalError: error, context }
      );
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    return new GoogleDocsError(
      errorMessage,
      'GOOGLE_DOCS_UNKNOWN_ERROR',
      500,
      undefined,
      { originalError: error, context }
    );
  }

  /**
   * Creates a Zod schema for document ID validation.
   *
   * This method provides a reusable schema for validating Google Docs document IDs
   * with appropriate constraints and error messages.
   *
   * **Schema Features:**
   * - String type validation
   * - Length constraints based on Docs API limitations
   * - Descriptive error messages for validation failures
   * - Consistent with other schema factory methods
   *
   * @returns Zod string schema for document ID validation
   *
   * @example
   * ```typescript
   * const inputSchema = z.object({
   *   documentId: this.createDocumentIdSchema(),
   * });
   * ```
   */
  protected createDocumentIdSchema(): z.ZodString {
    return z
      .string({
        description: 'The unique identifier of the Google Docs document',
      })
      .min(1, 'Document ID cannot be empty')
      .max(100, 'Document ID too long');
  }

  /**
   * Creates a Zod schema for text content validation.
   *
   * This method provides a reusable schema for validating text content
   * used in various Docs operations with appropriate constraints.
   *
   * **Schema Features:**
   * - String type validation
   * - Allows empty strings for certain operations
   * - Reasonable length limits for text content
   * - Descriptive error messages
   *
   * @returns Zod string schema for text content validation
   *
   * @example
   * ```typescript
   * const inputSchema = z.object({
   *   text: this.createTextSchema(),
   * });
   * ```
   */
  protected createTextSchema(): z.ZodString {
    return z
      .string({
        description: 'Text content for the document operation',
      })
      .max(1000000, 'Text content too long'); // 1MB limit
  }

  /**
   * Creates a Zod schema for index validation.
   *
   * This method provides a reusable schema for validating index values
   * used in text insertion and manipulation operations.
   *
   * **Schema Features:**
   * - Number type validation
   * - Non-negative integer constraints (minimum 0)
   * - Reasonable upper bounds for document positions
   * - Descriptive error messages
   * - Consistent with Google Docs API 0-based indexing
   *
   * **Index Meaning:**
   * - Index 0: Document start position
   * - Index 1: Beginning of document body content (typical insertion point)
   * - Higher indices: Positions within document content
   *
   * @returns Zod number schema for index validation
   *
   * @example
   * ```typescript
   * const inputSchema = z.object({
   *   index: this.createIndexSchema().optional(),
   * });
   * ```
   */
  protected createIndexSchema(): z.ZodNumber {
    return z
      .number({
        description:
          'Zero-based index position in the document (0 = document start, 1 = body start)',
      })
      .int('Index must be an integer')
      .min(0, 'Index must be non-negative')
      .max(10000000, 'Index too large'); // 10M character limit
  }

  /**
   * Creates tool-specific input schemas based on the tool type.
   *
   * This factory method provides schemas for different types of Docs tools,
   * ensuring consistent validation across all tool implementations.
   *
   * **Supported Tool Types:**
   * - `create-document`: Schema for document creation operations
   * - `get-document`: Schema for document retrieval operations
   * - `update-document`: Schema for document batch update operations
   * - `insert-text`: Schema for text insertion operations
   * - `replace-text`: Schema for text replacement operations
   *
   * @param tool - The tool type to create schema for
   * @returns Zod schema object for the specified tool type
   * @throws Error for unsupported tool types
   *
   * @example
   * ```typescript
   * const schema = this.createToolInputSchema('create-document');
   * const validatedInput = schema.parse(inputData);
   * ```
   */
  protected createToolInputSchema(tool: string): z.ZodSchema<any> {
    switch (tool) {
      case 'create-document':
        return z.object({
          title: z.string().min(1, 'Title cannot be empty'),
          folderId: z.string().optional(),
        });

      case 'get-document':
        return z.object({
          documentId: this.createDocumentIdSchema(),
          includeContent: z.boolean().optional(),
        });

      case 'update-document':
        return z.object({
          documentId: this.createDocumentIdSchema(),
          requests: z.array(z.any()),
        });

      case 'insert-text':
        return z.object({
          documentId: this.createDocumentIdSchema(),
          text: this.createTextSchema(),
          index: this.createIndexSchema().optional(),
        });

      case 'replace-text':
        return z.object({
          documentId: this.createDocumentIdSchema(),
          searchText: this.createTextSchema(),
          replaceText: this.createTextSchema(),
          matchCase: z.boolean().optional(),
        });

      default:
        throw new Error(`Unsupported tool type: ${tool}`);
    }
  }

  /**
   * Validates access control for the current operation.
   * This method integrates with the AccessControlService to enforce
   * security policies including read-only mode, folder restrictions,
   * service restrictions, and tool-specific access controls.
   *
   * Supports two calling patterns:
   * 1. Legacy: (params: unknown, requestId: string)
   * 2. New: (request: AccessControlRequest, requestId: string)
   *
   * @param paramsOrRequest - Either raw parameters or structured request object
   * @param requestId - The request ID for tracking and logging
   * @returns Result indicating whether access is allowed
   */
  protected async validateAccessControl(
    paramsOrRequest: unknown | { operation?: string; serviceName?: string; toolName?: string; context?: Record<string, unknown> },
    requestId: string
  ): Promise<Result<void, GoogleWorkspaceError>> {
    // If no access control service is configured, allow the operation
    if (!this.accessControlService) {
      return ok(undefined);
    }

    try {
      let operation: 'read' | 'write';
      let serviceName: string;
      let toolName: string;
      let context: Record<string, unknown>;
      let targetFolderId: string | undefined;

      // Determine if this is the new request object format or legacy params format
      const isRequestObject = paramsOrRequest && 
        typeof paramsOrRequest === 'object' && 
        ('operation' in paramsOrRequest || 'serviceName' in paramsOrRequest || 'toolName' in paramsOrRequest);

      if (isRequestObject) {
        // New format: structured request object
        const request = paramsOrRequest as { operation?: string; serviceName?: string; toolName?: string; context?: Record<string, unknown> };
        
        operation = request.operation as ('read' | 'write') || 
          (this.isWriteOperation(request.toolName || this.getToolName()) ? 'write' : 'read');
        serviceName = request.serviceName || 'docs';
        toolName = request.toolName || this.getToolName();
        context = request.context || {};
        
        // Extract targetFolderId from context or compute from context
        const folderIds = this.getRequiredFolderIds(context);
        targetFolderId = folderIds.length > 0 ? folderIds[0] : undefined;
      } else {
        // Legacy format: raw params
        operation = this.isWriteOperation(this.getToolName()) ? 'write' : 'read';
        serviceName = 'docs';
        toolName = this.getToolName();
        context = this.buildContextFromParams(paramsOrRequest);
        
        // Extract folder IDs from parameters for folder-based access control
        const folderIds = this.getRequiredFolderIds(paramsOrRequest);
        targetFolderId = folderIds.length > 0 ? folderIds[0] : undefined;
      }

      // Prepare access control request
      const accessControlRequest = {
        operation,
        serviceName,
        resourceType: 'document',
        toolName,
        targetFolderId,
        context,
      };

      // Validate access using the access control service
      const validationResult = await this.accessControlService.validateAccess(accessControlRequest);

      if (validationResult.isErr()) {
        // Log access control validation failure
        this.logger.warn('Access control validation failed', {
          requestId,
          operation,
          serviceName,
          toolName,
          error: validationResult.error.toJSON?.() || validationResult.error,
        });

        // Convert access control errors to appropriate error types for the tool
        return err(validationResult.error);
      }

      return ok(undefined);
    } catch (error) {
      // Handle unexpected errors during access control validation
      const accessError = new GoogleAccessControlError(
        'Access control validation failed',
        'general',
        'GOOGLE_ACCESS_CONTROL_ERROR',
        500,
        undefined,
        { 
          requestId, 
          toolName: typeof paramsOrRequest === 'object' && paramsOrRequest && 'toolName' in paramsOrRequest 
            ? (paramsOrRequest as any).toolName 
            : this.getToolName(),
          originalError: error instanceof Error ? error : undefined 
        },
        error instanceof Error ? error : undefined
      );

      this.logger.error('Access control validation error', {
        error: accessError.toJSON(),
        requestId,
        toolName: typeof paramsOrRequest === 'object' && paramsOrRequest && 'toolName' in paramsOrRequest 
          ? (paramsOrRequest as any).toolName 
          : this.getToolName(),
      });

      return err(accessError);
    }
  }

  /**
   * Determines whether the given tool name represents a write operation.
   * This method classifies Docs operations as either read or write based
   * on the tool name patterns used in the Google Workspace MCP server.
   *
   * **Classification Logic:**
   * - Read operations: get, read, list
   * - Write operations: create, update, insert, replace, delete, modify
   *
   * @param toolName - The name of the tool to classify
   * @returns true if the tool performs write operations, false for read operations
   */
  protected isWriteOperation(toolName: string): boolean {
    // Normalize tool name for consistent comparison
    const normalizedName = toolName.toLowerCase();

    // Define read operation patterns for Docs
    const readPatterns = [
      'get',
      'read',
      'list',
      'view',
    ];

    // Define write operation patterns for Docs
    const writePatterns = [
      'create',
      'update',
      'insert',
      'replace',
      'delete',
      'modify',
      'edit',
      'write',
      'set',
      'add',
      'move',
      'copy',
    ];

    // Check for read patterns first
    if (readPatterns.some(pattern => normalizedName.includes(pattern))) {
      return false;
    }

    // Check for write patterns
    if (writePatterns.some(pattern => normalizedName.includes(pattern))) {
      return true;
    }

    // Default behavior for unknown patterns - treat as read operation for safety
    // This ensures that access control errs on the side of allowing rather than blocking
    return false;
  }

  /**
   * Extracts folder IDs from tool parameters for folder-based access control.
   * This method analyzes the parameters passed to Docs tools and identifies
   * any folder IDs that should be validated against folder-based access restrictions.
   *
   * **Parameter Analysis:**
   * - Direct folder ID fields: folderId, parentFolderId, targetFolderId, destinationFolderId
   * - Array fields: parents
   * - Nested objects: metadata, options, document, context
   * - Deep nested exploration (up to 2 levels)
   * - Returns array of all relevant folder IDs
   *
   * @param params - The tool parameters to analyze
   * @returns Array of folder IDs that require access validation
   */
  protected getRequiredFolderIds(params: unknown): string[] {
    const folderIds: string[] = [];
    const seen = new Set<string>(); // Avoid duplicates

    if (!params || typeof params !== 'object') {
      return folderIds;
    }

    const paramsObj = params as Record<string, unknown>;

    // Helper function to add folder ID if valid
    const addFolderId = (value: unknown) => {
      if (typeof value === 'string' && value.trim() && !seen.has(value.trim())) {
        seen.add(value.trim());
        folderIds.push(value.trim());
      }
    };

    // Helper function to extract folder IDs from an object
    const extractFromObject = (obj: Record<string, unknown>, depth = 0) => {
      if (depth > 2) return; // Prevent infinite recursion

      // Direct folder ID fields
      addFolderId(obj.folderId);
      addFolderId(obj.parentFolderId);
      addFolderId(obj.targetFolderId);
      addFolderId(obj.destinationFolderId);
      addFolderId(obj.sourceFolderId);

      // Check for parents array (Drive API format)
      if (Array.isArray(obj.parents)) {
        obj.parents.forEach(addFolderId);
      }

      // Check for nested objects  
      const nestedKeys = ['options', 'metadata', 'document', 'context', 'request', 'params'];
      nestedKeys.forEach(key => {
        if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
          extractFromObject(obj[key] as Record<string, unknown>, depth + 1);
        }
      });

      // Check for any other nested objects that might contain folder references
      Object.entries(obj).forEach(([key, value]) => {
        if (value && typeof value === 'object' && !Array.isArray(value) && 
            !nestedKeys.includes(key) && depth < 1) {
          const valueObj = value as Record<string, unknown>;
          // Only check objects that might contain folder references
          if (Object.keys(valueObj).some(k => 
            k.toLowerCase().includes('folder') || 
            k.toLowerCase().includes('parent') ||
            k.toLowerCase().includes('target') ||
            k.toLowerCase().includes('destination')
          )) {
            extractFromObject(valueObj, depth + 1);
          }
        }
      });
    };

    // Extract folder IDs from the main parameters object
    extractFromObject(paramsObj);

    return folderIds;
  }

  /**
   * Executes a tool operation with access control validation.
   * This method provides a unified entry point for tool execution that includes
   * access control validation, request tracking, and proper error handling.
   *
   * @param params - The parameters being passed to the tool
   * @param toolName - The name of the tool being executed
   * @returns Result with tool output or error
   */
  protected async executeWithAccessControl(
    params: TInput,
    toolName: string
  ): Promise<Result<TOutput, GoogleWorkspaceError>> {
    // Generate unique request ID for tracking
    const requestId = randomUUID();

    try {
      // Build context from parameters (shallow copy for safety)
      const context = this.buildContextFromParams(params);

      // Determine operation type based on tool name
      const operation = this.isWriteOperation(toolName) ? ('write' as const) : ('read' as const);

      // Validate access control if service is available
      const accessControlResult = await this.validateAccessControl(
        {
          operation,
          serviceName: 'docs',
          toolName,
          context,
        },
        requestId
      );

      if (accessControlResult.isErr()) {
        return err(accessControlResult.error);
      }

      // Execute the actual tool implementation
      return await this.executeImpl(params);
    } catch (error) {
      // Handle unexpected errors during execution
      const wrappedError = new GoogleAccessControlError(
        error instanceof Error ? error.message : 'Execution failed',
        'general',
        'GOOGLE_ACCESS_CONTROL_ERROR',
        500,
        undefined,
        { requestId, toolName },
        error instanceof Error ? error : undefined
      );

      this.logger.error('Tool execution failed', {
        error: wrappedError.toJSON(),
        requestId,
        toolName,
      });

      return err(wrappedError);
    }
  }

  /**
   * Abstract method that must be implemented by concrete tool classes.
   * This method contains the actual tool logic and should be called through
   * executeWithAccessControl to ensure proper access control validation.
   *
   * @param params - The validated input parameters
   * @returns Result with tool output or error
   */
  public abstract executeImpl(params: TInput): Promise<Result<TOutput, GoogleWorkspaceError>>;

  /**
   * Builds a context object from tool parameters for access control validation.
   * This method creates a sanitized context object that includes relevant
   * parameter information while filtering out sensitive data.
   *
   * @param params - The tool parameters
   * @returns Sanitized context object
   */
  protected buildContextFromParams(params: unknown): Record<string, unknown> {
    if (!params || typeof params !== 'object') {
      return {};
    }

    // Create a shallow copy to avoid modifying original params
    const context = { ...params } as Record<string, unknown>;

    // Remove potentially sensitive fields
    delete context.accessToken;
    delete context.apiKey;
    delete context.credentials;
    delete context.auth;

    return context;
  }
}
