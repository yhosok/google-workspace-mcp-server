import { GetDocumentTool } from './get-document.tool.js';
import { DocsService } from '../../services/docs.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import {
  GoogleDocsError,
  GoogleDocsNotFoundError,
  GoogleDocsPermissionError,
  GoogleAuthError,
} from '../../errors/index.js';
import type { DocsDocumentInfo, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface GetDocumentInput {
  documentId: string;
  includeContent?: boolean;
}

interface GetDocumentResult {
  document: {
    documentId: string;
    title: string;
    revisionId: string;
    createdTime: string;
    modifiedTime: string;
    documentUrl: string;
    body?: {
      content: Array<{
        paragraph?: {
          elements: Array<{
            textRun?: {
              content: string;
              textStyle?: any;
            };
          }>;
          paragraphStyle?: any;
        };
      }>;
    };
  };
}

describe('GetDocumentTool', () => {
  let tool: GetDocumentTool;
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
      getDocumentAsMarkdown: jest.fn(),
      updateDocument: jest.fn(),
      batchUpdate: jest.fn(),
      insertText: jest.fn(),
      replaceAllText: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    tool = new GetDocumentTool(mockDocsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__docs__get');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Get Google Document');
      expect(metadata.description).toBe(
        'Retrieves a Google Document with its metadata and optional content. Supports markdown (default) and JSON output formats.'
      );
      expect(metadata.inputSchema).toBeDefined();
    });

    test('should have required documentId field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.documentId).toBeDefined();
    });

    test('should have optional includeContent field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.includeContent).toBeDefined();
    });

    test('should have optional format field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.format).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should get document as markdown (default)', async () => {
      const mockMarkdownContent = `# Test Document

Hello World`;

      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(ok(mockMarkdownContent));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      });

      expect(mockDocsService.getDocumentAsMarkdown).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].type).toBe('text');
        expect(mcpResult.content[0].text).toBe(mockMarkdownContent);
        // Should not call getDocument when format is markdown (default)
        expect(mockDocsService.getDocument).not.toHaveBeenCalled();
      }
    });

    test('should get document with content when requested in JSON format', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        title: 'Document with Content',
        revisionId: 'ALm37BVQwJlMJhSF2Iz2JR5VHyJB1Jyyz1b7l0vWj-7O',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl:
          'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'This is the first paragraph.\n',
                      textStyle: {
                        bold: true,
                      },
                    },
                  },
                ],
                paragraphStyle: {
                  namedStyleType: 'HEADING_1',
                },
              },
            },
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content:
                        'This is the second paragraph with regular text.\n',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        includeContent: true,
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        true
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.title).toBe('Document with Content');
        expect(resultData.document.body).toBeDefined();
        expect(resultData.document.body?.content).toHaveLength(2);
      }
    });

    test('should exclude content when explicitly disabled in JSON format', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        title: 'Document without Content',
        revisionId: 'ALm37BVQwJlMJhSF2Iz2JR5VHyJB1Jyyz1b7l0vWj-7O',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl:
          'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
        // No body content returned when includeContent is false
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        includeContent: false,
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        false
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle empty document in JSON format', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'empty-doc-123',
        title: 'Empty Document',
        revisionId: 'empty-revision',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/empty-doc-123/edit',
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: '\n',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: 'empty-doc-123',
        includeContent: true,
        format: 'json',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.title).toBe('Empty Document');
        expect(resultData.document.body?.content).toHaveLength(1);
      }
    });

    test('should handle document with complex formatting in JSON format', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'complex-doc-456',
        title: 'Complex Formatted Document',
        revisionId: 'complex-revision',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl: 'https://docs.google.com/document/d/complex-doc-456/edit',
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'Bold Title\n',
                      textStyle: {
                        bold: true,
                        fontSize: {
                          magnitude: 18,
                          unit: 'PT',
                        },
                      },
                    },
                  },
                ],
                paragraphStyle: {
                  namedStyleType: 'HEADING_1',
                },
              },
            },
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'This text has ',
                    },
                  },
                  {
                    textRun: {
                      content: 'italic formatting',
                      textStyle: {
                        italic: true,
                      },
                    },
                  },
                  {
                    textRun: {
                      content: ' and ',
                    },
                  },
                  {
                    textRun: {
                      content: 'underlined text',
                      textStyle: {
                        underline: true,
                      },
                    },
                  },
                  {
                    textRun: {
                      content: '.\n',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: 'complex-doc-456',
        includeContent: true,
        format: 'json',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.body?.content).toHaveLength(2);
        expect(
          resultData.document.body?.content[0].paragraph?.elements[0].textRun
            ?.textStyle?.bold
        ).toBe(true);
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Authentication validation failed'
        );
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
      mockDocsService.getDocument.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
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
          reason: 'Insufficient permission to access document',
          operation: 'get_document',
        }
      );
      mockDocsService.getDocument.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
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
        operation: 'get_document',
      });
      mockDocsService.getDocument.mockResolvedValue(err(notFoundError));

      const result = await tool.executeImpl({
        documentId: 'invalid-doc-id',
        format: 'json',
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
        'Internal server error occurred while getting document',
        'GOOGLE_DOCS_SERVICE_ERROR',
        500,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.getDocument.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
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
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Document ID cannot be empty');
      }

      // Test undefined documentId (this would fail TypeScript compilation, but test for runtime)
      const result2 = await tool.executeImpl({} as any);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Document ID is required');
      }
    });

    test('should validate documentId format', async () => {
      const result = await tool.executeImpl({
        documentId: '   ', // Only whitespace
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Document ID cannot be empty');
      }
    });

    test('should handle malformed documentId', async () => {
      const malformedIds = [
        'invalid-id',
        '12345',
        'https://docs.google.com/document/d/invalid',
        '!@#$%^&*()',
      ];

      for (const invalidId of malformedIds) {
        const notFoundError = new GoogleDocsNotFoundError(invalidId, {
          reason: 'Document not found',
          operation: 'get_document',
        });
        mockDocsService.getDocument.mockResolvedValue(err(notFoundError));

        const result = await tool.executeImpl({
          documentId: invalidId,
          format: 'json',
        });

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.statusCode).toBe(404);
        }
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDocsService.getDocument.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
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

      const mockDocument: DocsDocumentInfo = {
        documentId: trimmedId,
        title: 'Trimmed Document',
        revisionId: 'revision-trimmed',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: `https://docs.google.com/document/d/${trimmedId}/edit`,
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: documentId,
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith(
        trimmedId,
        false
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle boolean includeContent parameter correctly', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'bool-test-doc',
        title: 'Boolean Test Document',
        revisionId: 'bool-revision',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/bool-test-doc/edit',
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      // Test with explicit true
      const result1 = await tool.executeImpl({
        documentId: 'bool-test-doc',
        includeContent: true,
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith(
        'bool-test-doc',
        true
      );
      expect(result1.isOk()).toBe(true);

      // Test with explicit false
      const result2 = await tool.executeImpl({
        documentId: 'bool-test-doc',
        includeContent: false,
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith(
        'bool-test-doc',
        false
      );
      expect(result2.isOk()).toBe(true);

      // Test with undefined (should default to false)
      const result3 = await tool.executeImpl({
        documentId: 'bool-test-doc',
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith(
        'bool-test-doc',
        false
      );
      expect(result3.isOk()).toBe(true);
    });

    test('should handle document with lists and tables', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'structured-doc-789',
        title: 'Document with Lists and Tables',
        revisionId: 'structured-revision',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl:
          'https://docs.google.com/document/d/structured-doc-789/edit',
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'Bulleted List:\n',
                      textStyle: {
                        bold: true,
                      },
                    },
                  },
                ],
              },
            },
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'First item\n',
                    },
                  },
                ],
              },
            },
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'Second item\n',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: 'structured-doc-789',
        includeContent: true,
        format: 'json',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.body?.content).toHaveLength(3);
        expect(
          resultData.document.body?.content[1].paragraph?.elements[0].textRun
            ?.content
        ).toBe('First item\n');
      }
    });

    test('should handle large documents efficiently', async () => {
      // Create a mock document with many paragraphs
      const largeContent = Array.from({ length: 100 }, (_, i) => ({
        paragraph: {
          elements: [
            {
              textRun: {
                content: `This is paragraph ${i + 1} with some content.\n`,
              },
            },
          ],
        },
      }));

      const mockDocument: DocsDocumentInfo = {
        documentId: 'large-doc-999',
        title: 'Large Document',
        revisionId: 'large-revision',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl: 'https://docs.google.com/document/d/large-doc-999/edit',
        body: {
          content: largeContent,
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: 'large-doc-999',
        includeContent: true,
        format: 'json',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.body?.content).toHaveLength(100);
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
      mockDocsService.getDocument.mockResolvedValue(err(initializationError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Docs API not initialized');
      }
    });

    test('should handle malformed response from service', async () => {
      // Mock service returning incomplete data
      const incompleteDocument = {
        documentId: 'incomplete-doc',
        // Missing required fields like title, revisionId, etc.
      } as any;

      mockDocsService.getDocument.mockResolvedValue(ok(incompleteDocument));

      const result = await tool.executeImpl({
        documentId: 'incomplete-doc',
        format: 'json',
      });

      // Should handle gracefully even with incomplete data
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBeDefined();
      }
    });

    test('should handle null response from service', async () => {
      mockDocsService.getDocument.mockResolvedValue(ok(null as any));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new GoogleDocsError(
        'Request timeout while getting document',
        'GOOGLE_DOCS_TIMEOUT_ERROR',
        408,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.getDocument.mockResolvedValue(err(timeoutError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
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
      mockDocsService.getDocument.mockResolvedValue(err(rateLimitError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        format: 'json',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('Rate limit');
      }
    });
  });

  describe('format parameter support', () => {
    test('should default to markdown format when no format specified', async () => {
      const mockMarkdownContent = `# Test Document

This is a **bold** text and *italic* text.

## Section 2

- Item 1
- Item 2
- Item 3`;

      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(ok(mockMarkdownContent));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      });

      expect(mockDocsService.getDocumentAsMarkdown).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].type).toBe('text');
        expect(mcpResult.content[0].text).toBe(mockMarkdownContent);
        // Should not call getDocument when format is markdown (default)
        expect(mockDocsService.getDocument).not.toHaveBeenCalled();
      }
    });

    test('should return markdown format when explicitly requested', async () => {
      const mockMarkdownContent = `# Complex Document

## Introduction

This document contains various **formatting** elements including:

### Lists
- **Bold items**
- *Italic items*
- ~~Strikethrough items~~

### Code
\`\`\`javascript
console.log('Hello World');
\`\`\`

### Tables

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |

### Quotes
> This is an important quote

### Links
[Google Docs](https://docs.google.com)`;

      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(ok(mockMarkdownContent));

      const result = await tool.executeImpl({
        documentId: 'complex-doc-123',
        format: 'markdown',
      });

      expect(mockDocsService.getDocumentAsMarkdown).toHaveBeenCalledWith('complex-doc-123');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].type).toBe('text');
        expect(mcpResult.content[0].text).toBe(mockMarkdownContent);
        // Should not call getDocument when format is markdown
        expect(mockDocsService.getDocument).not.toHaveBeenCalled();
      }
    });

    test('should return JSON format when explicitly requested', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'doc123',
        title: 'JSON Format Test',
        revisionId: 'revision-123',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl: 'https://docs.google.com/document/d/doc123/edit',
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'Hello World\n',
                      textStyle: {
                        bold: true,
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: 'doc123',
        format: 'json',
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith('doc123', false);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.documentId).toBe('doc123');
        expect(resultData.document.title).toBe('JSON Format Test');
        // Should not call getDocumentAsMarkdown when format is json
        expect(mockDocsService.getDocumentAsMarkdown).not.toHaveBeenCalled();
      }
    });

    test('should handle JSON format with includeContent', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'content-doc',
        title: 'Document with Content',
        revisionId: 'content-revision',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        documentUrl: 'https://docs.google.com/document/d/content-doc/edit',
        body: {
          content: [
            {
              paragraph: {
                elements: [
                  {
                    textRun: {
                      content: 'This is paragraph content.\n',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.getDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        documentId: 'content-doc',
        format: 'json',
        includeContent: true,
      });

      expect(mockDocsService.getDocument).toHaveBeenCalledWith('content-doc', true);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetDocumentResult;
        expect(resultData.document.body).toBeDefined();
        expect(resultData.document.body?.content).toHaveLength(1);
      }
    });

    test('should handle invalid format parameter', async () => {
      const result = await tool.executeImpl({
        documentId: 'doc123',
        format: 'invalid-format' as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Format must be either "markdown" or "json"');
      }
    });

    test('should handle markdown service errors gracefully', async () => {
      const markdownError = new GoogleDocsError(
        'Failed to export document as markdown',
        'GOOGLE_DOCS_MARKDOWN_EXPORT_ERROR',
        500,
        'doc123'
      );
      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(err(markdownError));

      const result = await tool.executeImpl({
        documentId: 'doc123',
        format: 'markdown',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.message).toContain('Failed to export document as markdown');
      }
    });

    test('should handle markdown export not supported', async () => {
      const exportError = new GoogleDocsError(
        'Markdown export not supported for this document type',
        'GOOGLE_DOCS_UNSUPPORTED_EXPORT',
        400,
        'doc123'
      );
      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(err(exportError));

      const result = await tool.executeImpl({
        documentId: 'doc123',
        format: 'markdown',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toContain('Markdown export not supported');
      }
    });

    test('should handle empty markdown content', async () => {
      const emptyMarkdown = '\n';
      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(ok(emptyMarkdown));

      const result = await tool.executeImpl({
        documentId: 'empty-doc',
        format: 'markdown',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBe(emptyMarkdown);
      }
    });

    test('should handle complex markdown with special characters', async () => {
      const complexMarkdown = `# Document with Special Characters

## Test Cases

### Escaping and Special Syntax
- Backslashes: \\\\\\\\ 
- Asterisks: \\*not bold\\*
- Underscores: \\_not italic\\_
- Backticks: \\\` code blocks \\\`

### Unicode and Emoji
- Unicode: 测试文档 🚀
- Mathematical symbols: α + β = γ
- Currency: $100, €85, ¥500

### HTML-like content
<div>This should be treated as text</div>

### Complex Links
[Link with (parentheses)](https://example.com/path?param=value&other=test)

### Code with backticks
\`\`\`bash
echo "Hello World"
# This is a comment
\`\`\``;

      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(ok(complexMarkdown));

      const result = await tool.executeImpl({
        documentId: 'complex-chars-doc',
        format: 'markdown',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBe(complexMarkdown);
        // Verify specific elements are preserved
        expect(mcpResult.content[0].text).toContain('\\\\\\\\');
        expect(mcpResult.content[0].text).toContain('测试文档 🚀');
        expect(mcpResult.content[0].text).toContain('<div>This should be treated as text</div>');
        expect(mcpResult.content[0].text).toContain('α + β = γ');
      }
    });

    test('should validate format parameter with documentId', async () => {
      // Test empty documentId with format
      const result1 = await tool.executeImpl({
        documentId: '',
        format: 'markdown',
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Document ID cannot be empty');
      }

      // Test whitespace documentId with format
      const result2 = await tool.executeImpl({
        documentId: '   ',
        format: 'json',
      });

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Document ID cannot be empty');
      }
    });

    test('should handle format parameter case insensitivity', async () => {
      const mockMarkdownContent = '# Test Document\n\nContent here.';
      mockDocsService.getDocumentAsMarkdown.mockResolvedValue(ok(mockMarkdownContent));

      // Test uppercase
      const result1 = await tool.executeImpl({
        documentId: 'doc123',
        format: 'MARKDOWN' as any,
      });

      expect(result1.isOk()).toBe(true);

      // Test mixed case
      const result2 = await tool.executeImpl({
        documentId: 'doc123',
        format: 'Markdown' as any,
      });

      expect(result2.isOk()).toBe(true);

      // Should handle case-insensitive comparison
      expect(mockDocsService.getDocumentAsMarkdown).toHaveBeenCalledTimes(2);
    });
  });
});
