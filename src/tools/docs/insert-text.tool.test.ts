import { InsertTextTool } from './insert-text.tool.js';
import { DocsService } from '../../services/docs.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleDocsNotFoundError, GoogleDocsPermissionError, GoogleAuthError } from '../../errors/index.js';
import type { DocsInsertTextResult, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface InsertTextInput {
  documentId: string;
  text: string;
  index?: number;
}

interface InsertTextResult {
  result: {
    documentId: string;
    insertedText: string;
    insertionIndex: number;
    newIndex: number;
  };
}

describe('InsertTextTool', () => {
  let tool: InsertTextTool;
  let mockDocsService: jest.Mocked<DocsService>;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    mockAuthService = {
      initialize: jest.fn(),
      getAuthClient: jest.fn(),
      validateAuth: jest.fn().mockResolvedValue(ok(true)),
      getGoogleAuth: jest.fn(),
      refreshToken: jest.fn(),
      getAuthInfo: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    mockDocsService = {
      initialize: jest.fn(),
      createDocument: jest.fn(),
      getDocument: jest.fn(),
      updateDocument: jest.fn(),
      batchUpdate: jest.fn(),
      insertText: jest.fn(),
      replaceAllText: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    tool = new InsertTextTool(mockDocsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__docs__insert-text');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Insert Text into Document');
      expect(metadata.description).toBe(
        'Inserts text at a specific position in a Google Document'
      );
      expect(metadata.inputSchema).toBeDefined();
    });

    test('should have required documentId field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.documentId).toBeDefined();
    });

    test('should have required text field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.text).toBeDefined();
    });

    test('should have optional index field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.index).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should insert text at default position (index 1)', async () => {
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: 'Hello World',
        insertionIndex: 1,
        newIndex: 12,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'Hello World',
        1
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.documentId).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
        expect(resultData.result.insertedText).toBe('Hello World');
        expect(resultData.result.insertionIndex).toBe(1);
        expect(resultData.result.newIndex).toBe(12);
      }
    });

    test('should insert text at specified position', async () => {
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: 'Inserted at position 10',
        insertionIndex: 10,
        newIndex: 30,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Inserted at position 10',
        index: 10,
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'Inserted at position 10',
        10
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.insertionIndex).toBe(10);
        expect(resultData.result.newIndex).toBe(30);
      }
    });

    test('should insert empty text', async () => {
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: '',
        insertionIndex: 1,
        newIndex: 1,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: '',
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        '',
        1
      );
      expect(result.isOk()).toBe(true);
    });

    test('should insert multiline text', async () => {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: multilineText,
        insertionIndex: 5,
        newIndex: 23,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: multilineText,
        index: 5,
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        multilineText,
        5
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.insertedText).toBe(multilineText);
      }
    });

    test('should insert text with special characters', async () => {
      const specialText = 'Text with émojis 🚀 & special chars: àáâãäåæçèéêë';
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: specialText,
        insertionIndex: 1,
        newIndex: 48,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: specialText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.insertedText).toBe(specialText);
      }
    });

    test('should insert large text content', async () => {
      const largeText = 'A'.repeat(10000); // 10KB of text
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: largeText,
        insertionIndex: 1,
        newIndex: 10001,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: largeText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.insertedText.length).toBe(10000);
      }
    });

    test('should handle insertion at large index', async () => {
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: 'Text at large index',
        insertionIndex: 999999,
        newIndex: 1000018,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Text at large index',
        index: 999999,
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'Text at large index',
        999999
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle HTML/XML characters in text', async () => {
      const htmlText = '<p>This is a paragraph with &lt;tags&gt; and &amp; symbols.</p>';
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: htmlText,
        insertionIndex: 1,
        newIndex: 67,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: htmlText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.insertedText).toBe(htmlText);
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Authentication validation failed');
        expect(result.error.errorCode).toBe('GOOGLE_AUTH_ERROR');
      }
    });

    test('should handle 401 unauthorized error', async () => {
      const authError = new GoogleDocsError(
        'Unauthorized access to document',
        'GOOGLE_DOCS_AUTH_ERROR',
        401,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(401);
        expect(result.error.errorCode).toBe('GOOGLE_AUTH_ERROR');
        expect(result.error.message).toContain('Unauthorized access');
      }
    });

    test('should handle 403 forbidden error', async () => {
      const permissionError = new GoogleDocsPermissionError(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        {
          reason: 'Insufficient permission to edit document',
          operation: 'insert_text',
        }
      );
      mockDocsService.insertText.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_PERMISSION_DENIED');
        expect(result.error.message).toContain('Insufficient permissions');
      }
    });

    test('should handle 404 document not found error', async () => {
      const notFoundError = new GoogleDocsNotFoundError('invalid-doc-id', {
        reason: 'Document not found',
        operation: 'insert_text',
      });
      mockDocsService.insertText.mockResolvedValue(err(notFoundError));

      const result = await tool.executeImpl({
        documentId: 'invalid-doc-id',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(404);
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_DOCUMENT_NOT_FOUND');
        expect(result.error.message).toContain('not found');
      }
    });

    test('should handle 500 internal server error', async () => {
      const serverError = new GoogleDocsError(
        'Internal server error occurred while inserting text',
        'GOOGLE_DOCS_SERVICE_ERROR',
        500,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_SERVICE_ERROR');
        expect(result.error.message).toContain('Internal server error');
      }
    });

    test('should validate required documentId parameter', async () => {
      // Test empty documentId
      const result1 = await tool.executeImpl({
        documentId: '',
        text: 'Hello World',
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Document ID cannot be empty');
      }

      // Test undefined documentId (this would fail TypeScript compilation, but test for runtime)
      const result2 = await tool.executeImpl({
        text: 'Hello World',
      } as any);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Document ID is required');
      }
    });

    test('should validate required text parameter', async () => {
      // Test undefined text (this would fail TypeScript compilation, but test for runtime)
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      } as any);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Text is required');
      }
    });

    test('should handle null text parameter', async () => {
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: null as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Text cannot be null');
      }
    });

    test('should validate index parameter when provided', async () => {
      // Test zero index
      const result1 = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
        index: 0,
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Index must be at least 1');
      }

      // Test negative index
      const result2 = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
        index: -1,
      });

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Index must be non-negative');
      }
    });

    test('should validate non-integer index', async () => {
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
        index: 1.5,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Index must be an integer');
      }
    });

    test('should handle invalid index in document', async () => {
      const indexError = new GoogleDocsError(
        'Invalid index in document',
        'GOOGLE_DOCS_INVALID_INDEX_ERROR',
        400,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(indexError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
        index: 999999, // Invalid index
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toContain('Invalid index');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDocsService.insertText.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected network error');
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should trim documentId whitespace', async () => {
      const documentId = '  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms  ';
      const trimmedId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      
      const mockResult: DocsInsertTextResult = {
        documentId: trimmedId,
        insertedText: 'Hello World',
        insertionIndex: 1,
        newIndex: 12,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: documentId,
        text: 'Hello World',
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        trimmedId,
        'Hello World',
        1
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle default index when not provided', async () => {
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: 'Default position text',
        insertionIndex: 1,
        newIndex: 21,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Default position text',
        // index not provided, should default to 1
      });

      expect(mockDocsService.insertText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'Default position text',
        1
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle tab characters in text', async () => {
      const tabText = 'Column1\tColumn2\tColumn3';
      const mockResult: DocsInsertTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        insertedText: tabText,
        insertionIndex: 1,
        newIndex: 24,
      };

      mockDocsService.insertText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: tabText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as InsertTextResult;
        expect(resultData.result.insertedText).toBe(tabText);
      }
    });
  });

  describe('error handling edge cases', () => {
    test('should handle service initialization failure', async () => {
      // Mock the service method to return the error that would occur when service is not initialized
      const initializationError = new GoogleDocsError(
        'Docs API not initialized',
        'GOOGLE_DOCS_NOT_INITIALIZED',
        500
      );
      mockDocsService.insertText.mockResolvedValue(err(initializationError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Docs API not initialized');
      }
    });

    test('should handle malformed response from service', async () => {
      // Mock service returning incomplete data
      const incompleteResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        // Missing insertedText and other fields
      } as any;

      mockDocsService.insertText.mockResolvedValue(ok(incompleteResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      // Should handle gracefully even with incomplete data
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBeDefined();
      }
    });

    test('should handle null response from service', async () => {
      mockDocsService.insertText.mockResolvedValue(ok(null as any));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new GoogleDocsError(
        'Request timeout while inserting text',
        'GOOGLE_DOCS_TIMEOUT_ERROR',
        408,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(timeoutError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(408);
        expect(result.error.message).toContain('timeout');
      }
    });

    test('should handle rate limit errors', async () => {
      const rateLimitError = new GoogleDocsError(
        'Rate limit exceeded',
        'GOOGLE_DOCS_RATE_LIMIT_ERROR',
        429,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(rateLimitError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('Rate limit');
      }
    });

    test('should handle document locked errors', async () => {
      const lockedError = new GoogleDocsError(
        'Document is locked for editing',
        'GOOGLE_DOCS_LOCKED_ERROR',
        423,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(lockedError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(423);
        expect(result.error.message).toContain('locked');
      }
    });

    test('should handle quota exceeded errors', async () => {
      const quotaError = new GoogleDocsError(
        'Quota exceeded for document operations',
        'GOOGLE_DOCS_QUOTA_EXCEEDED_ERROR',
        429,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.insertText.mockResolvedValue(err(quotaError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        text: 'Hello World',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('Quota exceeded');
      }
    });
  });
});