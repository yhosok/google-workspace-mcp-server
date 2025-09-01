import { UpdateDocumentTool } from './update-document.tool.js';
import { DocsService } from '../../services/docs.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import {
  GoogleDocsError,
  GoogleDocsNotFoundError,
  GoogleDocsPermissionError,
  GoogleAuthError,
} from '../../errors/index.js';
import type {
  DocsBatchUpdateResult,
  MCPToolResult,
} from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface UpdateDocumentInput {
  documentId: string;
  requests: Array<{
    insertText?: {
      text: string;
      location: {
        index: number;
      };
    };
    deleteContentRange?: {
      range: {
        startIndex: number;
        endIndex: number;
      };
    };
    replaceAllText?: {
      containsText: {
        text: string;
        matchCase?: boolean;
      };
      replaceText: string;
    };
    updateTextStyle?: {
      range: {
        startIndex: number;
        endIndex: number;
      };
      textStyle: {
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        fontSize?: {
          magnitude: number;
          unit: string;
        };
      };
      fields: string;
    };
  }>;
}

interface UpdateDocumentResult {
  result: {
    documentId: string;
    replies: Array<{
      insertText?: {
        insertedText?: string;
      };
      deleteContentRange?: {
        deletedText?: string;
      };
      replaceAllText?: {
        occurrencesChanged?: number;
      };
      updateTextStyle?: {
        updatedText?: string;
      };
    }>;
  };
}

describe('UpdateDocumentTool', () => {
  let tool: UpdateDocumentTool;
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

    tool = new UpdateDocumentTool(mockDocsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__docs__update');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Update Google Document');
      expect(metadata.description).toBe(
        'Performs batch updates on a Google Document using the batchUpdate API'
      );
      expect(metadata.inputSchema).toBeDefined();
    });

    test('should have required documentId field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.documentId).toBeDefined();
    });

    test('should have required requests field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema.requests).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should perform single text insertion', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [
          {
            insertText: {
              insertedText: 'Hello World',
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello World',
              location: {
                index: 1,
              },
            },
          },
        ],
      });

      expect(mockDocsService.batchUpdate).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        [
          {
            insertText: {
              text: 'Hello World',
              location: {
                index: 1,
              },
            },
          },
        ]
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(resultData.result.documentId).toBe(
          '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
        );
        expect(resultData.result.replies).toHaveLength(1);
        expect(resultData.result.replies[0].insertText?.insertedText).toBe(
          'Hello World'
        );
      }
    });

    test('should perform multiple operations in batch', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [
          {
            insertText: {
              insertedText: 'Title: ',
            },
          },
          {
            updateTextStyle: {
              updatedText: 'Title: ',
            },
          },
          {
            insertText: {
              insertedText: '\nContent goes here.',
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Title: ',
              location: {
                index: 1,
              },
            },
          },
          {
            updateTextStyle: {
              range: {
                startIndex: 1,
                endIndex: 8,
              },
              textStyle: {
                bold: true,
                fontSize: {
                  magnitude: 16,
                  unit: 'PT',
                },
              },
              fields: 'bold,fontSize',
            },
          },
          {
            insertText: {
              text: '\nContent goes here.',
              location: {
                index: 8,
              },
            },
          },
        ],
      });

      expect(mockDocsService.batchUpdate).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        expect.arrayContaining([
          expect.objectContaining({
            insertText: expect.objectContaining({
              text: 'Title: ',
            }),
          }),
          expect.objectContaining({
            updateTextStyle: expect.objectContaining({
              textStyle: expect.objectContaining({
                bold: true,
              }),
            }),
          }),
          expect.objectContaining({
            insertText: expect.objectContaining({
              text: '\nContent goes here.',
            }),
          }),
        ])
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(resultData.result.replies).toHaveLength(3);
      }
    });

    test('should perform text deletion', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [
          {
            deleteContentRange: {
              deletedText: 'unwanted text',
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            deleteContentRange: {
              range: {
                startIndex: 10,
                endIndex: 23,
              },
            },
          },
        ],
      });

      expect(mockDocsService.batchUpdate).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        [
          {
            deleteContentRange: {
              range: {
                startIndex: 10,
                endIndex: 23,
              },
            },
          },
        ]
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(
          resultData.result.replies[0].deleteContentRange?.deletedText
        ).toBe('unwanted text');
      }
    });

    test('should perform replace all text operation', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [
          {
            replaceAllText: {
              occurrencesChanged: 3,
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            replaceAllText: {
              containsText: {
                text: 'old text',
                matchCase: true,
              },
              replaceText: 'new text',
            },
          },
        ],
      });

      expect(mockDocsService.batchUpdate).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        [
          {
            replaceAllText: {
              containsText: {
                text: 'old text',
                matchCase: true,
              },
              replaceText: 'new text',
            },
          },
        ]
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(
          resultData.result.replies[0].replaceAllText?.occurrencesChanged
        ).toBe(3);
      }
    });

    test('should perform text formatting operation', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [
          {
            updateTextStyle: {
              updatedText: 'formatted text',
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            updateTextStyle: {
              range: {
                startIndex: 1,
                endIndex: 15,
              },
              textStyle: {
                bold: true,
                italic: true,
                underline: true,
              },
              fields: 'bold,italic,underline',
            },
          },
        ],
      });

      expect(mockDocsService.batchUpdate).toHaveBeenCalledWith(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        [
          {
            updateTextStyle: {
              range: {
                startIndex: 1,
                endIndex: 15,
              },
              textStyle: {
                bold: true,
                italic: true,
                underline: true,
              },
              fields: 'bold,italic,underline',
            },
          },
        ]
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle empty requests array', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(resultData.result.replies).toHaveLength(0);
      }
    });

    test('should handle complex batch operations', async () => {
      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: [
          {
            replaceAllText: {
              occurrencesChanged: 5,
            },
          },
          {
            insertText: {
              insertedText: 'New heading',
            },
          },
          {
            updateTextStyle: {
              updatedText: 'New heading',
            },
          },
          {
            deleteContentRange: {
              deletedText: 'old content',
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            replaceAllText: {
              containsText: {
                text: 'placeholder',
                matchCase: false,
              },
              replaceText: 'actual content',
            },
          },
          {
            insertText: {
              text: 'New heading',
              location: {
                index: 1,
              },
            },
          },
          {
            updateTextStyle: {
              range: {
                startIndex: 1,
                endIndex: 12,
              },
              textStyle: {
                bold: true,
                fontSize: {
                  magnitude: 18,
                  unit: 'PT',
                },
              },
              fields: 'bold,fontSize',
            },
          },
          {
            deleteContentRange: {
              range: {
                startIndex: 50,
                endIndex: 100,
              },
            },
          },
        ],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(resultData.result.replies).toHaveLength(4);
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
      mockDocsService.batchUpdate.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
          operation: 'batch_update',
        }
      );
      mockDocsService.batchUpdate.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
        operation: 'batch_update',
      });
      mockDocsService.batchUpdate.mockResolvedValue(err(notFoundError));

      const result = await tool.executeImpl({
        documentId: 'invalid-doc-id',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
        'Internal server error occurred while updating document',
        'GOOGLE_DOCS_SERVICE_ERROR',
        500,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.batchUpdate.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('Document ID cannot be empty');
      }

      // Test undefined documentId (this would fail TypeScript compilation, but test for runtime)
      const result2 = await tool.executeImpl({
        requests: [],
      } as any);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Document ID is required');
      }
    });

    test('should validate required requests parameter', async () => {
      // Test undefined requests (this would fail TypeScript compilation, but test for runtime)
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      } as any);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Requests array is required');
      }
    });

    test('should validate requests array structure', async () => {
      // Mock the service to return a validation error for invalid requests
      mockDocsService.batchUpdate.mockResolvedValue(
        err(
          new GoogleDocsError(
            'Request validation failed: invalid structure',
            'GOOGLE_DOCS_VALIDATION_ERROR',
            400,
            '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
          )
        )
      );

      // Test invalid request structure
      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            invalidOperation: {
              text: 'Hello',
            },
          } as any,
        ],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('validation');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDocsService.batchUpdate.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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

      const mockResult: DocsBatchUpdateResult = {
        documentId: trimmedId,
        replies: [
          {
            insertText: {
              insertedText: 'Hello',
            },
          },
        ],
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: documentId,
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
      });

      expect(mockDocsService.batchUpdate).toHaveBeenCalledWith(
        trimmedId,
        expect.any(Array)
      );
      expect(result.isOk()).toBe(true);
    });

    test('should handle large batch operations', async () => {
      const largeRequests = Array.from({ length: 50 }, (_, i) => ({
        insertText: {
          text: `Text ${i + 1}`,
          location: {
            index: i + 1,
          },
        },
      }));

      const mockResult: DocsBatchUpdateResult = {
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        replies: largeRequests.map((_, i) => ({
          insertText: {
            insertedText: `Text ${i + 1}`,
          },
        })),
      };

      mockDocsService.batchUpdate.mockResolvedValue(ok(mockResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: largeRequests,
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as UpdateDocumentResult;
        expect(resultData.result.replies).toHaveLength(50);
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
      mockDocsService.batchUpdate.mockResolvedValue(err(initializationError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
        // Missing replies array
      } as any;

      mockDocsService.batchUpdate.mockResolvedValue(ok(incompleteResult));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
      });

      // Should handle gracefully even with incomplete data
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        expect(mcpResult.content[0].text).toBeDefined();
      }
    });

    test('should handle null response from service', async () => {
      mockDocsService.batchUpdate.mockResolvedValue(ok(null as any));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.errorCode).toBe('GOOGLE_DOCS_UNKNOWN_ERROR');
      }
    });

    test('should handle timeout errors', async () => {
      const timeoutError = new GoogleDocsError(
        'Request timeout while updating document',
        'GOOGLE_DOCS_TIMEOUT_ERROR',
        408,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.batchUpdate.mockResolvedValue(err(timeoutError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
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
      mockDocsService.batchUpdate.mockResolvedValue(err(rateLimitError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 1 },
            },
          },
        ],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
        expect(result.error.message).toContain('Rate limit');
      }
    });

    test('should handle invalid index errors', async () => {
      const indexError = new GoogleDocsError(
        'Invalid index in document',
        'GOOGLE_DOCS_INVALID_INDEX_ERROR',
        400,
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
      mockDocsService.batchUpdate.mockResolvedValue(err(indexError));

      const result = await tool.executeImpl({
        documentId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        requests: [
          {
            insertText: {
              text: 'Hello',
              location: { index: 999999 }, // Invalid index
            },
          },
        ],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toContain('Invalid index');
      }
    });
  });
});
