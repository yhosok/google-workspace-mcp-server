import { ReplaceTextTool } from './replace-text.tool.js';
import { DocsService } from '../../services/docs.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleDocsNotFoundError, GoogleDocsPermissionError, GoogleAuthError } from '../../errors/index.js';
import type { DocsReplaceTextResult, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface ReplaceTextInput {
  documentId: string;
  searchText: string;
  replaceText: string;
  matchCase?: boolean;
}

interface ReplaceTextResult {
  result: {
    documentId: string;
    searchText: string;
    replaceText: string;
    occurrencesChanged: number;
    matchCase: boolean;
  };
}

describe('ReplaceTextTool', () => {
  let tool: ReplaceTextTool;
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
      replaceText: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    tool = new ReplaceTextTool(mockDocsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__docs__replace-text');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Replace Text in Document');
      expect(metadata.description).toBe(
        'Replaces all occurrences of specified text in a Google Document'
      );
      expect(metadata.inputSchema).toBeDefined();
    });

    test('should have required documentId field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.documentId).toBeDefined();
    });

    test('should have required searchText field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.searchText).toBeDefined();
    });

    test('should have required replaceText field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.replaceText).toBeDefined();
    });

    test('should have optional matchCase field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.matchCase).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should replace text with default case matching (true)', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        occurrencesChanged: 3,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'old text',
        'new text',
        true
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.documentId).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
        expect(resultData.result.searchText).toBe('old text');
        expect(resultData.result.replaceText).toBe('new text');
        expect(resultData.result.occurrencesChanged).toBe(3);
        expect(resultData.result.matchCase).toBe(true);
      }
    });

    test('should replace text with case-insensitive matching', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        occurrencesChanged: 5,
        matchCase: false,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        matchCase: false,
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'old text',
        'new text',
        false
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.occurrencesChanged).toBe(5);
        expect(resultData.result.matchCase).toBe(false);
      }
    });

    test('should replace text with case-sensitive matching', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'Old Text',
        replaceText: 'New Text',
        occurrencesChanged: 2,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'Old Text',
        replaceText: 'New Text',
        matchCase: true,
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'Old Text',
        'New Text',
        true
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.matchCase).toBe(true);
      }
    });

    test('should handle no occurrences found', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'nonexistent text',
        replaceText: 'replacement text',
        occurrencesChanged: 0,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'nonexistent text',
        replaceText: 'replacement text',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.occurrencesChanged).toBe(0);
      }
    });

    test('should replace with empty string (deletion)', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'text to delete',
        replaceText: '',
        occurrencesChanged: 4,
        matchCase: false,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'text to delete',
        replaceText: '',
        matchCase: false,
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'text to delete',
        '',
        false
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.replaceText).toBe('');
        expect(resultData.result.occurrencesChanged).toBe(4);
      }
    });

    test('should handle special characters in search and replace text', async () => {
      const searchText = 'émojis 🚀 & special chars: àáâãäåæç';
      const replaceText = 'replaced special characters';
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        occurrencesChanged: 1,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.searchText).toBe(searchText);
        expect(resultData.result.replaceText).toBe(replaceText);
      }
    });

    test('should handle multiline search and replace text', async () => {
      const searchText = 'Line 1\nLine 2\nLine 3';
      const replaceText = 'Single line replacement';
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        occurrencesChanged: 2,
        matchCase: false,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        matchCase: false,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.searchText).toBe(searchText);
        expect(resultData.result.replaceText).toBe(replaceText);
      }
    });

    test('should handle HTML/XML characters in text', async () => {
      const searchText = '<p>Old paragraph</p>';
      const replaceText = '<p>New paragraph with &amp; symbols</p>';
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        occurrencesChanged: 3,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.searchText).toBe(searchText);
        expect(resultData.result.replaceText).toBe(replaceText);
      }
    });

    test('should handle large text replacements', async () => {
      const searchText = 'SHORT';
      const replaceText = 'A'.repeat(10000); // 10KB replacement text
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        occurrencesChanged: 1,
        matchCase: false,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        matchCase: false,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.replaceText.length).toBe(10000);
      }
    });

    test('should handle tab and whitespace characters', async () => {
      const searchText = 'old\ttext';
      const replaceText = 'new text with spaces';
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
        occurrencesChanged: 2,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: searchText,
        replaceText: replaceText,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.searchText).toBe(searchText);
        expect(resultData.result.replaceText).toBe(replaceText);
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
      mockDocsService.replaceText.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
          operation: 'replace_text',
        }
      );
      mockDocsService.replaceText.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
        operation: 'replace_text',
      });
      mockDocsService.replaceText.mockResolvedValue(err(notFoundError));

      const result = await tool.executeImpl({
        documentId: 'invalid-doc-id',
        searchText: 'old text',
        replaceText: 'new text',
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
        'Internal server error occurred while replacing text',
        'GOOGLE_DOCS_SERVICE_ERROR',
        500,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.replaceText.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
        searchText: 'old text',
        replaceText: 'new text',
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Document ID cannot be empty');
      }

      // Test undefined documentId (this would fail TypeScript compilation, but test for runtime)
      const result2 = await tool.executeImpl({
        searchText: 'old text',
        replaceText: 'new text',
      } as any);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Document ID is required');
      }
    });

    test('should validate required searchText parameter', async () => {
      // Test undefined searchText (this would fail TypeScript compilation, but test for runtime)
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replaceText: 'new text',
      } as any);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Search text is required');
      }
    });

    test('should validate required replaceText parameter', async () => {
      // Test undefined replaceText (this would fail TypeScript compilation, but test for runtime)
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
      } as any);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Replace text is required');
      }
    });

    test('should handle null searchText parameter', async () => {
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: null as any,
        replaceText: 'new text',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Text cannot be null');
      }
    });

    test('should handle null replaceText parameter', async () => {
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: null as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Text cannot be null');
      }
    });

    test('should allow empty searchText and replaceText', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: '',
        replaceText: '',
        occurrencesChanged: 0,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: '',
        replaceText: '',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ReplaceTextResult;
        expect(resultData.result.searchText).toBe('');
        expect(resultData.result.replaceText).toBe('');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDocsService.replaceText.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
      
      const mockResult: DocsReplaceTextResult = {
        documentId: trimmedId,
        searchText: 'old text',
        replaceText: 'new text',
        occurrencesChanged: 1,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: documentId,
        searchText: 'old text',
        replaceText: 'new text',
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        trimmedId,
        'old text',
        'new text',
        true
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle default matchCase when not provided', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        occurrencesChanged: 1,
        matchCase: true,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        // matchCase not provided, should default to true
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'old text',
        'new text',
        true
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle boolean matchCase parameter correctly', async () => {
      const mockResult: DocsReplaceTextResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        occurrencesChanged: 1,
        matchCase: false,
      };

      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      // Test with explicit false
      const result1 = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        matchCase: false,
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'old text',
        'new text',
        false
      );
      expect(result1.isOk()).toBe(true);

      // Test with explicit true
      mockResult.matchCase = true;
      mockDocsService.replaceText.mockResolvedValue(ok(mockResult));

      const result2 = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
        matchCase: true,
      });

      expect(mockDocsService.replaceText).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        'old text',
        'new text',
        true
      );
      expect(result2.isOk()).toBe(true);
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
      mockDocsService.replaceText.mockResolvedValue(err(initializationError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
        // Missing searchText and other fields
      } as any;

      mockDocsService.replaceText.mockResolvedValue(ok(incompleteResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
      });

      // Should handle gracefully even with incomplete data
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBeDefined();
      }
    });

    test('should handle null response from service', async () => {
      mockDocsService.replaceText.mockResolvedValue(ok(null as any));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new GoogleDocsError(
        'Request timeout while replacing text',
        'GOOGLE_DOCS_TIMEOUT_ERROR',
        408,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.replaceText.mockResolvedValue(err(timeoutError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
      mockDocsService.replaceText.mockResolvedValue(err(rateLimitError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
      mockDocsService.replaceText.mockResolvedValue(err(lockedError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
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
      mockDocsService.replaceText.mockResolvedValue(err(quotaError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        searchText: 'old text',
        replaceText: 'new text',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('Quota exceeded');
      }
    });
  });
});