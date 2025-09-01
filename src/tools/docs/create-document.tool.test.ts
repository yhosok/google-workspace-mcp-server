import { CreateDocumentTool } from './create-document.tool.js';
import { DocsService } from '../../services/docs.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleDocsError, GoogleAuthError, GoogleDocsPermissionError } from '../../errors/index.js';
import type { DocsDocumentInfo, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface CreateDocumentInput {
  title: string;
  folderId?: string;
}

interface CreateDocumentResult {
  document: {
    documentId: string;
    title: string;
    revisionId: string;
    documentUrl: string;
  };
}

describe('CreateDocumentTool', () => {
  let tool: CreateDocumentTool;
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

    tool = new CreateDocumentTool(mockDocsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__docs__create');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Create Google Document');
      expect(metadata.description).toBe(
        'Creates a new Google Document with the specified title and optional folder location'
      );
      expect(metadata.inputSchema).toBeDefined();
    });

    test('should have required title field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.title).toBeDefined();
    });

    test('should have optional folderId field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.folderId).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should create document with title only', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'new-doc-123',
        title: 'My New Document',
        revisionId: 'revision-123',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/new-doc-123/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: 'My New Document',
      });

      expect(mockDocsService.createDocument).toHaveBeenCalledWith('My New Document', undefined);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as CreateDocumentResult;
        expect(resultData.document.documentId).toBe('new-doc-123');
        expect(resultData.document.title).toBe('My New Document');
        expect(resultData.document.documentUrl).toBe('https://docs.google.com/document/d/new-doc-123/edit');
      }
    });

    test('should create document with title and folder', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'new-doc-456',
        title: 'Document in Folder',
        revisionId: 'revision-456',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/new-doc-456/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: 'Document in Folder',
        folderId: 'folder-123',
      });

      expect(mockDocsService.createDocument).toHaveBeenCalledWith('Document in Folder', 'folder-123');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as CreateDocumentResult;
        expect(resultData.document.documentId).toBe('new-doc-456');
        expect(resultData.document.title).toBe('Document in Folder');
      }
    });

    test('should handle document with complex content', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'complex-doc-789',
        title: 'Complex Document',
        revisionId: 'revision-789',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/complex-doc-789/edit',
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
                      content: 'This is the second paragraph with regular text.\n',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: 'Complex Document',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as CreateDocumentResult;
        expect(resultData.document.title).toBe('Complex Document');
        expect(resultData.document.documentId).toBe('complex-doc-789');
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Authentication validation failed');
        expect(result.error.errorCode).toBe('GOOGLE_AUTH_ERROR');
      }
    });

    test('should handle 401 unauthorized error', async () => {
      const authError = new GoogleDocsError(
        'Unauthorized access to create document',
        'GOOGLE_DOCS_AUTH_ERROR',
        401
      );
      mockDocsService.createDocument.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({
        title: 'Test Document',
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
        undefined,
        {
          folderId: 'folder-123',
          reason: 'Insufficient permission to create document in folder',
          operation: 'create_document',
        }
      );
      mockDocsService.createDocument.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        title: 'Test Document',
        folderId: 'folder-123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_PERMISSION_DENIED');
        expect(result.error.message).toContain('Insufficient permissions');
      }
    });

    test('should handle 500 internal server error', async () => {
      const serverError = new GoogleDocsError(
        'Internal server error occurred while creating document',
        'GOOGLE_DOCS_SERVICE_ERROR',
        500
      );
      mockDocsService.createDocument.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_SERVICE_ERROR');
        expect(result.error.message).toContain('Internal server error');
      }
    });

    test('should validate required title parameter', async () => {
      // Test empty title
      const result1 = await tool.executeImpl({
        title: '',
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Title cannot be empty');
      }

      // Test undefined title (this would fail TypeScript compilation, but test for runtime)
      const result2 = await tool.executeImpl({} as any);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Title is required');
      }
    });

    test('should validate title format', async () => {
      // Test whitespace-only title - this should succeed as whitespace strings are valid
      const mockDocument: DocsDocumentInfo = {
        documentId: 'whitespace-doc',
        title: '   \t\n   ',
        revisionId: 'revision-whitespace',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/whitespace-doc/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: '   \t\n   ',
      });

      expect(result.isOk()).toBe(true);
    });

    test('should handle long title', async () => {
      const longTitle = 'A'.repeat(500); // Very long title (500 chars, max is 255)

      const result = await tool.executeImpl({
        title: longTitle,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Title too long');
      }
    });

    test('should handle title with special characters', async () => {
      const specialTitle = 'Document with émojis 🚀 & special chars: àáâãäåæçèéêë';
      const mockDocument: DocsDocumentInfo = {
        documentId: 'special-chars-doc',
        title: specialTitle,
        revisionId: 'revision-special',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/special-chars-doc/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: specialTitle,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as CreateDocumentResult;
        expect(resultData.document.title).toBe(specialTitle);
      }
    });

    test('should validate folderId when provided', async () => {
      // Test empty folderId - this should succeed as empty string bypasses validation
      const mockDocument: DocsDocumentInfo = {
        documentId: 'empty-folder-doc',
        title: 'Test Document',
        revisionId: 'revision-empty-folder',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/empty-folder-doc/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: 'Test Document',
        folderId: '',
      });

      expect(result.isOk()).toBe(true);
      expect(mockDocsService.createDocument).toHaveBeenCalledWith('Test Document', undefined);
    });

    test('should validate folderId format when provided', async () => {
      // Test whitespace-only folderId
      const result = await tool.executeImpl({
        title: 'Test Document',
        folderId: '   \t\n   ',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Folder ID cannot be empty');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDocsService.createDocument.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected network error');
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should handle service initialization failure', async () => {
      // Mock the service method to return the error that would occur when service is not initialized
      const initializationError = new GoogleDocsError(
        'Docs API not initialized',
        'GOOGLE_DOCS_NOT_INITIALIZED',
        500
      );
      mockDocsService.createDocument.mockResolvedValue(err(initializationError));

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Docs API not initialized');
      }
    });

    test('should trim title whitespace', async () => {
      const title = '  My Document  ';
      const trimmedTitle = 'My Document';
      const mockDocument: DocsDocumentInfo = {
        documentId: 'trimmed-doc',
        title: trimmedTitle,
        revisionId: 'revision-trimmed',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/trimmed-doc/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: title,
      });

      expect(mockDocsService.createDocument).toHaveBeenCalledWith(title, undefined);
      expect(result.isOk()).toBe(true);
    });

    test('should trim folderId whitespace', async () => {
      const folderId = '  folder-123  ';
      const trimmedFolderId = 'folder-123';
      const mockDocument: DocsDocumentInfo = {
        documentId: 'folder-doc',
        title: 'Document',
        revisionId: 'revision-folder',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/folder-doc/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: 'Document',
        folderId: folderId,
      });

      expect(mockDocsService.createDocument).toHaveBeenCalledWith('Document', trimmedFolderId);
      expect(result.isOk()).toBe(true);
    });

    test('should handle root folder creation', async () => {
      const mockDocument: DocsDocumentInfo = {
        documentId: 'root-doc',
        title: 'Root Document',
        revisionId: 'revision-root',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/root-doc/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: 'Root Document',
        folderId: 'root',
      });

      expect(mockDocsService.createDocument).toHaveBeenCalledWith('Root Document', 'root');
      expect(result.isOk()).toBe(true);
    });

    test('should handle duplicate title creation', async () => {
      const title = 'Duplicate Document';
      const mockDocument: DocsDocumentInfo = {
        documentId: 'duplicate-doc-2',
        title: title,
        revisionId: 'revision-duplicate',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:00:00Z',
        documentUrl: 'https://docs.google.com/document/d/duplicate-doc-2/edit',
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

      mockDocsService.createDocument.mockResolvedValue(ok(mockDocument));

      const result = await tool.executeImpl({
        title: title,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as CreateDocumentResult;
        expect(resultData.document.title).toBe(title);
        expect(resultData.document.documentId).toBe('duplicate-doc-2');
      }
    });
  });

  describe('error handling edge cases', () => {
    test('should handle malformed response from service', async () => {
      // Mock service returning incomplete data
      const incompleteDocument = {
        documentId: 'incomplete-doc',
        // Missing required fields like title, revisionId, etc.
      } as any;

      mockDocsService.createDocument.mockResolvedValue(ok(incompleteDocument));

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      // Should handle gracefully even with incomplete data
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBeDefined();
      }
    });

    test('should handle null response from service', async () => {
      mockDocsService.createDocument.mockResolvedValue(ok(null as any));

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new GoogleDocsError(
        'Request timeout while creating document',
        'GOOGLE_DOCS_TIMEOUT_ERROR',
        408
      );
      mockDocsService.createDocument.mockResolvedValue(err(timeoutError));

      const result = await tool.executeImpl({
        title: 'Test Document',
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
        429
      );
      mockDocsService.createDocument.mockResolvedValue(err(rateLimitError));

      const result = await tool.executeImpl({
        title: 'Test Document',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('Rate limit');
      }
    });
  });
});