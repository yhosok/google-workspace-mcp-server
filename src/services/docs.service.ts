import { OAuth2Client } from 'google-auth-library';
import { docs_v1, google } from 'googleapis';

import { AuthService } from './auth.service.js';
import { DriveService, DriveDocumentInfo } from './drive.service.js';
import {
  GoogleService,
  GoogleServiceRetryConfig,
} from './base/google-service.js';
import {
  GoogleDocsError,
  GoogleDocsResult,
  GoogleWorkspaceResult,
  GoogleErrorFactory,
  docsErr,
  docsOk,
  googleErr,
  googleOk,
} from '../errors/index.js';
import { createServiceLogger, Logger } from '../utils/logger.js';

/**
 * DocsCreateDocumentResult represents the result of creating a document
 */
export interface DocsCreateDocumentResult {
  documentId: string;
  title: string;
  documentUrl?: string;
  folderId?: string;
  body?: docs_v1.Schema$Body;
}

/**
 * DocsUpdateResult represents the result of a batch update operation
 */
export interface DocsUpdateResult {
  documentId: string;
  replies?: docs_v1.Schema$Response[];
  writeControl?: docs_v1.Schema$WriteControl;
}

/**
 * Google Docs Service
 *
 * Provides core Docs API functionality with focus on document creation,
 * reading, and text manipulation. Follows the established service architecture
 * patterns used by DriveService, SheetsService and CalendarService.
 *
 * Key Features:
 * - Create Google Docs documents with optional folder placement
 * - Read document content and metadata
 * - Perform batch updates on documents
 * - Insert and replace text within documents
 * - Concurrent initialization protection
 * - Comprehensive error handling and retry logic
 * - Full type safety with TypeScript
 */
export class DocsService extends GoogleService {
  private authService: AuthService;
  private driveService?: DriveService;
  private docsApi?: docs_v1.Docs;

  /** Internal flag indicating whether the service has been successfully initialized */
  private isInitialized: boolean = false;

  /**
   * Promise tracking ongoing initialization to prevent concurrent initialization attempts.
   * This ensures that multiple simultaneous calls to initialize() or ensureInitialized()
   * will only result in a single actual initialization process.
   */
  private initializingPromise: Promise<GoogleWorkspaceResult<void>> | null =
    null;

  /**
   * Creates a new DocsService instance.
   *
   * @param authService - The authentication service for Google API credentials
   * @param driveService - Optional drive service for folder-based document creation
   * @param logger - Optional custom logger instance. If not provided, creates a service-specific logger
   * @param retryConfig - Optional retry configuration. If not provided, uses default retry settings
   *
   * @example
   * ```typescript
   * // Basic usage
   * const service = new DocsService(authService);
   *
   * // With Drive integration and custom logger
   * const service = new DocsService(authService, driveService, customLogger, {
   *   maxAttempts: 3,
   *   baseDelay: 1000,
   *   maxDelay: 30000
   * });
   * ```
   */
  constructor(
    authService: AuthService,
    driveService?: DriveService,
    logger?: Logger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    const serviceLogger = logger || createServiceLogger('docs-service');
    super(new OAuth2Client(), serviceLogger, retryConfig); // Temporary client, will be replaced
    this.authService = authService;
    this.driveService = driveService;
  }

  public getServiceName(): string {
    return 'DocsService';
  }

  public getServiceVersion(): string {
    return 'v1';
  }

  /**
   * Initializes the Docs service with Google API clients.
   *
   * This method handles concurrent initialization attempts safely. Multiple simultaneous
   * calls will result in only one actual initialization process, with all callers
   * receiving the same result.
   *
   * **Concurrency Safety**: Uses initializingPromise to prevent race conditions during
   * initialization. If already initialized, returns immediately with success.
   *
   * **Performance**: Fast path execution for already initialized instances (< 1ms).
   *
   * @returns Promise resolving to success or error result
   *
   * @example
   * ```typescript
   * // Safe to call multiple times
   * const results = await Promise.all([
   *   service.initialize(),
   *   service.initialize(),
   *   service.initialize()
   * ]);
   * // Only one actual initialization occurs
   * ```
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.docsApi) {
      return googleOk(undefined);
    }

    // Wait for existing initialization if in progress
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    // Start new initialization process
    const context = this.createContext('initialize');

    this.initializingPromise = this.executeWithRetry(async () => {
      try {
        // Get authenticated client from AuthService
        const authResult = await this.authService.getAuthClient();
        if (authResult.isErr()) {
          throw authResult.error;
        }

        const authClient = authResult.value;
        if (!authClient) {
          throw new Error('AuthService returned null/undefined auth client');
        }

        // Replace the temporary auth client in base class
        // @ts-expect-error - readonly property needs to be updated after initialization
        this.auth = authClient;

        // Create Google API instances with error handling
        try {
          this.docsApi = google.docs({ version: 'v1', auth: authClient });
        } catch (apiError) {
          throw new Error(
            `Failed to create Google Docs API client: ${apiError instanceof Error ? apiError.message : String(apiError)}`
          );
        }

        // Validate API client was created successfully
        if (!this.docsApi) {
          throw new Error(
            'Failed to initialize Google Docs API client - client is null'
          );
        }

        this.isInitialized = true;

        this.logger.info('Docs service initialized successfully', {
          service: this.getServiceName(),
          version: this.getServiceVersion(),
        });
      } catch (error) {
        // Reset initialization state on any error
        this.isInitialized = false;
        this.docsApi = undefined;
        throw error;
      }
    }, context);

    try {
      return await this.initializingPromise;
    } catch (error) {
      // Clear the promise on error to allow retry
      this.initializingPromise = null;
      throw error;
    } finally {
      // Clear the promise on success
      this.initializingPromise = null;
    }
  }

  /**
   * Performs a health check to verify the Docs service is operational.
   *
   * This method tests basic API connectivity by attempting to create a test document.
   * It ensures the service is properly initialized and can communicate with Google APIs.
   *
   * @returns Promise resolving to true if healthy, or an error result
   *
   * @example
   * ```typescript
   * const healthResult = await service.healthCheck();
   * if (healthResult.isOk()) {
   *   console.log('Service is healthy');
   * } else {
   *   console.error('Service health check failed:', healthResult.error);
   * }
   * ```
   */
  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    const context = this.createContext('healthCheck');

    try {
      // Check if service is initialized first
      if (!this.isInitialized || !this.docsApi) {
        return googleErr(
          new GoogleDocsError(
            'Docs API not initialized',
            'GOOGLE_DOCS_NOT_INITIALIZED',
            500
          )
        );
      }

      // Ensure service is initialized
      await this.ensureInitialized();

      // Test connectivity with a minimal API call
      // Create a test document for health check
      const testDoc = await this.docsApi.documents.create({
        requestBody: {
          title: `Health Check ${Date.now()}`,
        },
      });

      this.logger.info('Docs health check passed', {
        service: this.getServiceName(),
        requestId: context.requestId,
        testDocumentId: testDoc.data.documentId,
      });

      return googleOk(true);
    } catch (error) {
      const docsError = this.convertToDocsError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Docs health check failed', {
        error: docsError.toJSON(),
        requestId: context.requestId,
      });

      return googleErr(docsError);
    }
  }

  /**
   * Ensures the service is initialized before API operations.
   *
   * This is a critical performance optimization method that:
   * 1. **Fast Path**: Returns immediately if already initialized (< 1ms execution)
   * 2. **Concurrency Protection**: Reuses existing initialization promise if in progress
   * 3. **Lazy Initialization**: Starts new initialization only when needed
   *
   * **Thread Safety**: Multiple concurrent calls are safe and efficient.
   * Only one initialization will occur regardless of the number of concurrent calls.
   *
   * **Error Handling**: Throws the underlying error if initialization fails,
   * allowing callers to handle the error appropriately.
   *
   * @throws {GoogleDocsError} When initialization fails
   *
   * @example
   * ```typescript
   * // Called internally by all public methods
   * // Multiple concurrent calls are safe:
   * await Promise.all([
   *   service.createDocument('Doc1'),  // triggers ensureInitialized
   *   service.createDocument('Doc2'),  // reuses same initialization
   * ]);
   * ```
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.docsApi) {
      return;
    }

    // Wait for existing initialization if in progress
    if (this.initializingPromise) {
      const result = await this.initializingPromise;
      if (result.isErr()) {
        const error = result.error;
        this.logger.error('Initialization failed in ensureInitialized', {
          error: error.message,
          code: error.code,
        });
        throw result.error;
      }
      return;
    }

    // Start new initialization
    this.initializingPromise = this.initialize();
    try {
      const result = await this.initializingPromise;
      if (result.isErr()) {
        const error = result.error;
        this.logger.error('Direct initialization failed in ensureInitialized', {
          error: error.message,
          code: error.code,
        });
        throw result.error;
      }
    } catch (error) {
      // Clear initialization promise on any error
      this.initializingPromise = null;
      throw error;
    } finally {
      // Clear initialization promise on success
      this.initializingPromise = null;
    }
  }

  /**
   * Creates a new Google Docs document.
   *
   * This method creates documents with optional folder placement using Drive service integration.
   * When GOOGLE_DRIVE_FOLDER_ID environment variable is set and DriveService is available,
   * the document will be created in the specified folder.
   *
   * **Folder Management**: When folderId is provided or environment variable is set,
   * the document is created in that folder using Drive API. Otherwise, it's created
   * in the user's root folder using Docs API.
   *
   * **Auto-initialization**: Automatically initializes the service if needed.
   *
   * @param title - The title for the new document (cannot be empty)
   * @param folderId - Optional folder ID. If omitted, uses GOOGLE_DRIVE_FOLDER_ID env var or creates in root
   * @returns Promise resolving to document information or error
   *
   * @example
   * ```typescript
   * // Create in root folder
   * const result1 = await service.createDocument('My Document');
   *
   * // Create in specific folder
   * const result2 = await service.createDocument('My Document', 'folder-id');
   *
   * if (result.isOk()) {
   *   console.log(`Created: ${result.value.documentId}`);
   * }
   * ```
   */
  public async createDocument(
    title: string,
    folderId?: string
  ): Promise<GoogleDocsResult<DocsCreateDocumentResult>> {
    // Input validation
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return docsErr(
        new GoogleDocsError(
          'Document title cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          undefined,
          { reason: 'Title is required and cannot be empty' }
        )
      );
    }

    const context = this.createContext('createDocument', {
      title,
      folderId,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.docsApi) {
        throw new GoogleDocsError(
          'Docs API not initialized',
          'GOOGLE_DOCS_NOT_INITIALIZED',
          500
        );
      }

      await this.ensureInitialized();

      // Check for folder placement via environment variable or parameter
      const targetFolderId = folderId || process.env.GOOGLE_DRIVE_FOLDER_ID;

      // If folder placement is requested and DriveService is available, use Drive API
      if (targetFolderId && this.driveService) {
        try {
          // Use DriveService to create the document in the specified folder
          const driveResult = await this.driveService.createDocument(
            title.trim(),
            targetFolderId
          );

          if (driveResult.isErr()) {
            throw driveResult.error;
          }

          const driveInfo: DriveDocumentInfo = driveResult.value;

          // Get the actual document content from Docs API
          const docResponse = await this.docsApi.documents.get({
            documentId: driveInfo.id,
          });

          const result: DocsCreateDocumentResult = {
            documentId: driveInfo.id,
            title: driveInfo.name,
            documentUrl: driveInfo.webViewLink,
            folderId: targetFolderId,
            body: docResponse.data.body,
          };

          this.logger.info('Successfully created document via Drive API', {
            documentId: result.documentId,
            title: result.title,
            folderId: targetFolderId,
            requestId: context.requestId,
          });

          return result;
        } catch (error) {
          // If Drive creation fails, fall back to regular Docs API
          this.logger.warn(
            'Drive API creation failed, falling back to Docs API',
            {
              error: error instanceof Error ? error.message : String(error),
              requestId: context.requestId,
            }
          );
        }
      }

      // Create document using Docs API (default behavior)
      const response = await this.docsApi.documents.create({
        requestBody: {
          title: title.trim(),
        },
      });

      // Validate response
      if (!response.data.documentId) {
        throw new GoogleDocsError(
          'Failed to create document - no document ID returned',
          'GOOGLE_DOCS_CREATE_FAILED',
          500
        );
      }

      const result: DocsCreateDocumentResult = {
        documentId: response.data.documentId,
        title: response.data.title || title.trim(),
        documentUrl: `https://docs.google.com/document/d/${response.data.documentId}`,
        body: response.data.body,
      };

      this.logger.info('Successfully created document', {
        documentId: result.documentId,
        title: result.title,
        requestId: context.requestId,
      });

      return result;
    }, context).andThen(result => docsOk(result));
  }

  /**
   * Retrieves a Google Docs document by ID.
   *
   * Gets comprehensive information about a document including:
   * - Document metadata (ID, title, creation info)
   * - Document content and structure (when includeContent is true)
   * - Document styling information
   *
   * **Use Cases**:
   * - Document content inspection
   * - Content extraction and processing
   * - Document structure analysis
   * - Pre-operation validation
   *
   * @param documentId The ID of the document to retrieve
   * @param includeContent Whether to include the document body content (defaults to true for backward compatibility)
   * @returns Promise resolving to document data or error
   *
   * @example
   * ```typescript
   * // Get full document with content
   * const result = await service.getDocument('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', true);
   *
   * // Get metadata only
   * const metadataResult = await service.getDocument('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms', false);
   *
   * if (result.isOk()) {
   *   console.log(`Title: ${result.value.title}`);
   *   console.log(`Content: ${JSON.stringify(result.value.body)}`);
   * }
   * ```
   */
  public async getDocument(
    documentId: string,
    includeContent: boolean = true
  ): Promise<GoogleDocsResult<docs_v1.Schema$Document>> {
    // Input validation
    if (
      !documentId ||
      typeof documentId !== 'string' ||
      documentId.trim() === ''
    ) {
      return docsErr(
        new GoogleDocsError(
          'documentId cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          undefined,
          { reason: 'Document ID parameter is required' }
        )
      );
    }

    const context = this.createContext('getDocument', {
      documentId,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.docsApi) {
        throw new GoogleDocsError(
          'Docs API not initialized',
          'GOOGLE_DOCS_NOT_INITIALIZED',
          500,
          documentId
        );
      }

      await this.ensureInitialized();

      // Call Docs API - include suggestions mode if content is not needed for better performance
      const response = await this.docsApi.documents.get({
        documentId: documentId.trim(),
        // When includeContent is false, we can use suggestionsViewMode to reduce payload size
        ...(includeContent
          ? {}
          : { suggestionsViewMode: 'PREVIEW_WITHOUT_SUGGESTIONS' }),
      });

      // Validate response
      if (!response.data) {
        throw new GoogleDocsError(
          'Failed to get document - no data returned',
          'GOOGLE_DOCS_API_ERROR',
          500,
          documentId
        );
      }

      const document = response.data;

      // If includeContent is false, remove the body to match the expected behavior
      if (!includeContent && document.body) {
        delete document.body;
      }

      this.logger.info('Successfully retrieved document', {
        documentId: document.documentId,
        title: document.title,
        includeContent,
        hasBody: !!document.body,
        requestId: context.requestId,
      });

      return document;
    }, context).andThen(result => docsOk(result));
  }

  /**
   * Performs a batch update operation on a document.
   *
   * Executes multiple document modifications in a single atomic operation.
   * This is the most flexible way to modify document content, structure, and formatting.
   *
   * **Supported Operations**:
   * - Text insertion and deletion
   * - Formatting changes (bold, italic, fonts, etc.)
   * - Paragraph and list manipulations
   * - Table operations
   * - Image insertions
   *
   * @param documentId The ID of the document to update
   * @param requests Array of update requests to execute
   * @returns Promise resolving to update results or error
   *
   * @example
   * ```typescript
   * const requests = [
   *   {
   *     insertText: {
   *       location: { index: 1 },
   *       text: 'Hello World'
   *     }
   *   }
   * ];
   *
   * const result = await service.batchUpdate('doc-id', requests);
   * if (result.isOk()) {
   *   console.log('Update completed:', result.value.replies);
   * }
   * ```
   */
  public async batchUpdate(
    documentId: string,
    requests: docs_v1.Schema$Request[]
  ): Promise<GoogleDocsResult<DocsUpdateResult>> {
    // Input validation
    if (
      !documentId ||
      typeof documentId !== 'string' ||
      documentId.trim() === ''
    ) {
      return docsErr(
        new GoogleDocsError(
          'documentId cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'Document ID parameter is required' }
        )
      );
    }

    if (!requests || !Array.isArray(requests) || requests.length === 0) {
      return docsErr(
        new GoogleDocsError(
          'requests cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'At least one request is required' }
        )
      );
    }

    const context = this.createContext('batchUpdate', {
      documentId,
      requestCount: requests.length,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.docsApi) {
        throw new GoogleDocsError(
          'Docs API not initialized',
          'GOOGLE_DOCS_NOT_INITIALIZED',
          500,
          documentId
        );
      }

      await this.ensureInitialized();

      // Call Docs API
      const response = await this.docsApi.documents.batchUpdate({
        documentId: documentId.trim(),
        requestBody: {
          requests: requests,
        },
      });

      // Validate response
      if (!response.data) {
        throw new GoogleDocsError(
          'Failed to perform batch update - no data returned',
          'GOOGLE_DOCS_API_ERROR',
          500,
          documentId
        );
      }

      const result: DocsUpdateResult = {
        documentId: response.data.documentId || documentId.trim(),
        replies: response.data.replies,
        writeControl: response.data.writeControl,
      };

      this.logger.info('Successfully performed batch update', {
        documentId: result.documentId,
        requestCount: requests.length,
        replyCount: result.replies?.length || 0,
        requestId: context.requestId,
      });

      return result;
    }, context).andThen(result => docsOk(result));
  }

  /**
   * Inserts text at a specified location in the document.
   *
   * This is a convenience method that wraps batchUpdate for simple text insertion.
   * Text is inserted at the specified index, with subsequent content shifted right.
   *
   * **Index Guidelines**:
   * - Index 1 is the beginning of the document content
   * - Index 0 is reserved and cannot be used
   * - Use getDocument() to inspect current structure and determine insertion points
   *
   * @param documentId The ID of the document to modify
   * @param text The text to insert
   * @param index The character index where to insert text (defaults to 1)
   * @returns Promise resolving to update results or error
   *
   * @example
   * ```typescript
   * // Insert at beginning of document
   * const result1 = await service.insertText('doc-id', 'Hello World');
   *
   * // Insert at specific position
   * const result2 = await service.insertText('doc-id', ' there!', 11);
   *
   * if (result.isOk()) {
   *   console.log('Text inserted successfully');
   * }
   * ```
   */
  public async insertText(
    documentId: string,
    text: string,
    index: number = 1
  ): Promise<GoogleDocsResult<DocsUpdateResult>> {
    // Input validation
    if (
      !documentId ||
      typeof documentId !== 'string' ||
      documentId.trim() === ''
    ) {
      return docsErr(
        new GoogleDocsError(
          'documentId cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'Document ID parameter is required' }
        )
      );
    }

    if (!text || typeof text !== 'string' || text === '') {
      return docsErr(
        new GoogleDocsError(
          'text cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'Text parameter is required' }
        )
      );
    }

    if (typeof index !== 'number' || index < 0) {
      return docsErr(
        new GoogleDocsError(
          'index cannot be negative',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'Index must be a non-negative number' }
        )
      );
    }

    const requests: docs_v1.Schema$Request[] = [
      {
        insertText: {
          location: { index },
          text: text,
        },
      },
    ];

    return this.batchUpdate(documentId, requests);
  }

  /**
   * Replaces all occurrences of specified text with new text.
   *
   * This is a convenience method that wraps batchUpdate for text replacement operations.
   * Uses the replaceAllText request to find and replace text throughout the document.
   *
   * **Search Options**:
   * - Case sensitivity can be controlled via matchCase parameter
   * - Empty replacement text effectively deletes the found text
   * - Returns the number of occurrences that were replaced
   *
   * @param documentId The ID of the document to modify
   * @param searchText The text to search for and replace
   * @param replaceText The text to replace with (can be empty for deletion)
   * @param matchCase Whether search should be case-sensitive (defaults to true)
   * @returns Promise resolving to update results or error
   *
   * @example
   * ```typescript
   * // Replace with case sensitivity (default)
   * const result1 = await service.replaceText('doc-id', 'old text', 'new text');
   *
   * // Case-insensitive replacement
   * const result2 = await service.replaceText('doc-id', 'OLD TEXT', 'new text', false);
   *
   * // Delete text (empty replacement)
   * const result3 = await service.replaceText('doc-id', 'unwanted text', '');
   *
   * if (result.isOk()) {
   *   const occurrences = result.value.replies?.[0]?.replaceAllText?.occurrencesChanged || 0;
   *   console.log(`Replaced ${occurrences} occurrences`);
   * }
   * ```
   */
  public async replaceText(
    documentId: string,
    searchText: string,
    replaceText: string,
    matchCase: boolean = true
  ): Promise<GoogleDocsResult<DocsUpdateResult>> {
    // Input validation
    if (
      !documentId ||
      typeof documentId !== 'string' ||
      documentId.trim() === ''
    ) {
      return docsErr(
        new GoogleDocsError(
          'documentId cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'Document ID parameter is required' }
        )
      );
    }

    if (!searchText || typeof searchText !== 'string' || searchText === '') {
      return docsErr(
        new GoogleDocsError(
          'searchText cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          documentId,
          { reason: 'Search text parameter is required' }
        )
      );
    }

    // Note: replaceText can be empty (for deletion), so we don't validate it

    const requests: docs_v1.Schema$Request[] = [
      {
        replaceAllText: {
          containsText: {
            text: searchText,
            matchCase: matchCase,
          },
          replaceText: replaceText,
        },
      },
    ];

    return this.batchUpdate(documentId, requests);
  }

  /**
   * Retrieves a Google Docs document as Markdown content.
   *
   * This method exports a Google Docs document directly to Markdown format using
   * the DriveService integration. It leverages Google Drive's native export
   * functionality to convert the document content to Markdown while preserving
   * formatting elements like headings, lists, links, and text styling.
   *
   * **DriveService Integration**: Uses DriveService.getFileContent() with
   * exportFormat: 'markdown' to export the document. DriveService is required
   * for this operation and must be provided during DocsService construction.
   *
   * **Supported Markdown Elements**:
   * - Headers (# ## ###)
   * - Bold and italic text (** **)
   * - Lists (bulleted and numbered)
   * - Links [text](url)
   * - Code blocks and inline code
   * - Blockquotes (>)
   * - Tables (if present in document)
   *
   * @param documentId The ID of the Google Docs document to export as Markdown
   * @returns Promise resolving to Markdown content string or error
   *
   * @example
   * ```typescript
   * // Export document as Markdown
   * const result = await service.getDocumentAsMarkdown('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
   *
   * if (result.isOk()) {
   *   console.log('Markdown content:', result.value);
   *   // Contains formatted markdown: # Title\n\n**Bold text**\n\n- List item
   * }
   * ```
   */
  public async getDocumentAsMarkdown(
    documentId: string
  ): Promise<GoogleDocsResult<string>> {
    // Input validation
    if (
      !documentId ||
      typeof documentId !== 'string' ||
      documentId.trim() === ''
    ) {
      return docsErr(
        new GoogleDocsError(
          'documentId cannot be empty',
          'GOOGLE_DOCS_INVALID_REQUEST',
          400,
          undefined,
          { reason: 'Document ID parameter is required' }
        )
      );
    }

    // Check DriveService availability
    if (!this.driveService) {
      return docsErr(
        new GoogleDocsError(
          'DriveService is required for markdown export',
          'GOOGLE_DOCS_DRIVE_SERVICE_NOT_AVAILABLE',
          500,
          documentId,
          {
            reason: 'DriveService must be provided during service construction',
          }
        )
      );
    }

    const context = this.createContext('getDocumentAsMarkdown', {
      documentId,
    });

    return this.executeAsyncWithRetry(async () => {
      // Check initialization status first
      if (!this.isInitialized || !this.docsApi) {
        throw new GoogleDocsError(
          'Docs API not initialized',
          'GOOGLE_DOCS_NOT_INITIALIZED',
          500,
          documentId
        );
      }

      await this.ensureInitialized();

      // Use DriveService to export document as Markdown
      const driveResult = await this.driveService!.getFileContent(
        documentId.trim(),
        {
          exportFormat: 'markdown',
        }
      );

      if (driveResult.isErr()) {
        // If the DriveService already returned a GoogleDocsError, preserve it as-is
        // Otherwise, convert DriveService error to DocsError for consistency
        if (driveResult.error instanceof GoogleDocsError) {
          throw driveResult.error;
        } else {
          throw this.convertToDocsError(driveResult.error, documentId);
        }
      }

      const fileContent = driveResult.value;

      // Validate that we received content
      if (typeof fileContent.content !== 'string') {
        throw new GoogleDocsError(
          'Failed to export document as markdown - invalid content format',
          'GOOGLE_DOCS_MARKDOWN_EXPORT_ERROR',
          500,
          documentId,
          { reason: 'Expected string content from markdown export' }
        );
      }

      this.logger.info('Successfully exported document as markdown', {
        documentId,
        contentSize: fileContent.size,
        mimeType: fileContent.mimeType,
        exportFormat: fileContent.exportFormat,
        requestId: context.requestId,
      });

      return fileContent.content;
    }, context).andThen(result => docsOk(result));
  }

  /**
   * Retrieves current service statistics and status information.
   *
   * Provides diagnostic information about the service state including:
   * - Initialization status
   * - API version information
   * - Authentication status
   *
   * **Use Case**: Primarily for monitoring, debugging, and health checks.
   *
   * @returns Promise resolving to service statistics or error
   *
   * @example
   * ```typescript
   * const result = await service.getServiceStats();
   * if (result.isOk()) {
   *   console.log(`Initialized: ${result.value.initialized}`);
   *   console.log(`Auth OK: ${result.value.authStatus}`);
   * }
   * ```
   */
  public async getServiceStats(): Promise<
    GoogleDocsResult<{
      initialized: boolean;
      apiVersions: {
        docs: string;
      };
      authStatus: boolean;
    }>
  > {
    const context = this.createContext('getServiceStats');

    try {
      const authStatus = await this.validateAuthentication();

      return docsOk({
        initialized: this.isInitialized,
        apiVersions: {
          docs: this.getServiceVersion(),
        },
        authStatus: authStatus.isOk(),
      });
    } catch (error) {
      const docsError = this.convertToDocsError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Failed to get service stats', {
        error: docsError.toJSON(),
        requestId: context.requestId,
      });

      return docsErr(docsError);
    }
  }

  /**
   * Converts generic errors to Google Docs-specific error types.
   *
   * This method is called by the base class retry mechanism to transform
   * generic errors into domain-specific error types with appropriate
   * error codes and context information.
   *
   * @param error - The generic error to convert
   * @param context - Additional context including document ID
   * @returns Converted GoogleDocsError or null if not convertible
   *
   * @internal
   */
  protected convertServiceSpecificError(
    error: Error,
    context: { data?: { documentId?: string } }
  ): GoogleDocsError | null {
    // If it's already a GoogleDocsError, preserve it as-is
    if (error instanceof GoogleDocsError) {
      return error;
    }
    return this.convertToDocsError(error, context.data?.documentId);
  }

  /**
   * Converts a generic error to a GoogleDocsError with context.
   *
   * This helper method uses the GoogleErrorFactory to create appropriate
   * error types based on the error characteristics and provided context.
   *
   * @param error - The error to convert
   * @param documentId - Optional document ID for context
   * @returns GoogleDocsError with appropriate type and context
   *
   * @internal
   */
  private convertToDocsError(
    error: Error,
    documentId?: string
  ): GoogleDocsError {
    return GoogleErrorFactory.createDocsError(error, documentId);
  }
}
