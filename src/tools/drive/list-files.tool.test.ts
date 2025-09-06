import { ListFilesTool } from './list-files.tool.js';
import { DriveService } from '../../services/drive.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import {
  GoogleDriveError,
  GoogleDriveNotFoundError,
  GoogleDrivePermissionError,
} from '../../errors/index.js';
import type { DriveFileListResult, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface ListFilesInput {
  query?: string;
  maxResults?: number;
  pageToken?: string;
  orderBy?: string;
  folderId?: string;
}

interface ListFilesResult {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    modifiedTime: string;
    webViewLink?: string;
    parents?: string[];
    size?: string;
  }>;
  nextPageToken?: string;
  hasMore: boolean;
  totalFiles: number;
}

// Actual implementation is now imported from './list-files.tool.js'

describe('ListFilesTool', () => {
  let tool: ListFilesTool;
  let mockDriveService: jest.Mocked<DriveService>;
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

    mockDriveService = {
      initialize: jest.fn(),
      listFiles: jest.fn(),
      getFile: jest.fn(),
      getFileContent: jest.fn(),
      createFile: jest.fn(),
      moveFile: jest.fn(),
      createSpreadsheet: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    tool = new ListFilesTool(mockDriveService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__drive__list-files');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('List Drive Files');
      expect(metadata.description).toBe(
        'List files in Google Drive with optional filtering and search'
      );
      expect(metadata.inputSchema).toBeDefined();
    });

    test('should have optional query field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema).toHaveProperty('query');
    });

    test('should have optional maxResults field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema).toHaveProperty('maxResults');
    });

    test('should have optional pageToken field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema).toHaveProperty('pageToken');
    });

    test('should have optional orderBy field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema).toHaveProperty('orderBy');
    });

    test('should have optional folderId field in schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.inputSchema).toHaveProperty('folderId');
    });

    test('should have all fields as optional', () => {
      const metadata = tool.getToolMetadata();
      // All fields are optional, so no required array needed
      expect(metadata.inputSchema).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should list all files with default parameters', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Document 1.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['root'],
        },
        {
          id: 'file2',
          name: 'Spreadsheet 1.xlsx',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          createdTime: '2023-01-01T11:00:00Z',
          modifiedTime: '2023-01-01T11:15:00Z',
          webViewLink: 'https://docs.google.com/spreadsheets/d/file2',
          parents: ['folder1'],
          size: '1024',
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({});

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as ListFilesResult;
        expect(resultData.files).toHaveLength(2);
        expect(resultData.files[0].name).toBe('Document 1.docx');
        expect(resultData.files[1].name).toBe('Spreadsheet 1.xlsx');
        expect(resultData.totalFiles).toBe(2);
        expect(resultData.hasMore).toBe(false);
      }
    });

    test('should handle search query parameter', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['root'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        query: "name contains 'Test'",
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        query: "trashed = false and (name contains 'Test')",
      });
      expect(result.isOk()).toBe(true);
    });

    test('should handle maxResults parameter', async () => {
      const mockFiles = Array.from({ length: 5 }, (_, i) => ({
        id: `file${i + 1}`,
        name: `Document ${i + 1}.docx`,
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        webViewLink: `https://docs.google.com/document/d/file${i + 1}`,
        parents: ['root'],
      }));

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: 'next-token',
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        maxResults: 5,
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        pageSize: 5,
        query: 'trashed = false',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ListFilesResult;
        expect(resultData.hasMore).toBe(true);
        expect(resultData.nextPageToken).toBe('next-token');
      }
    });

    test('should handle folderId parameter for folder-specific listing', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Folder Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['folder123'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        folderId: 'folder123',
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        query: "trashed = false and 'folder123' in parents",
      });
      expect(result.isOk()).toBe(true);
    });

    test('should handle orderBy parameter', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'A Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['root'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        orderBy: 'name',
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        orderBy: 'name',
        query: 'trashed = false',
      });
      expect(result.isOk()).toBe(true);
    });

    test('should handle pagination with pageToken', async () => {
      const mockFiles = [
        {
          id: 'file6',
          name: 'Document 6.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file6',
          parents: ['root'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        pageToken: 'page-token-123',
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        pageToken: 'page-token-123',
        query: 'trashed = false',
      });
      expect(result.isOk()).toBe(true);
    });

    test('should return empty list when no files found', async () => {
      const expectedResult: DriveFileListResult = {
        files: [],
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({});

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as ListFilesResult;
        expect(resultData.files).toEqual([]);
        expect(resultData.totalFiles).toBe(0);
        expect(resultData.hasMore).toBe(false);
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Authentication validation failed'
        );
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_AUTH_ERROR');
      }
    });

    test('should handle 401 unauthorized error', async () => {
      const authError = new GoogleDriveError(
        'Unauthorized access to Drive files',
        'GOOGLE_DRIVE_AUTH_ERROR',
        401
      );
      mockDriveService.listFiles.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(401);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_AUTH_ERROR');
        expect(result.error.message).toContain('Unauthorized access');
      }
    });

    test('should handle 403 forbidden error', async () => {
      const permissionError = new GoogleDrivePermissionError(
        undefined,
        'folder123',
        {
          reason: 'Insufficient permission to access folder',
          operation: 'list_files',
        }
      );
      mockDriveService.listFiles.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        folderId: 'folder123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_PERMISSION_DENIED');
        expect(result.error.message).toContain('Permission');
      }
    });

    test('should handle 404 folder not found error', async () => {
      const notFoundError = new GoogleDriveNotFoundError('invalid-folder-id', {
        reason: 'Folder not found',
        operation: 'list_files',
      });
      mockDriveService.listFiles.mockResolvedValue(err(notFoundError));

      const result = await tool.executeImpl({
        folderId: 'invalid-folder-id',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(404);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_FILE_NOT_FOUND');
        expect(result.error.message).toContain('not found');
      }
    });

    test('should handle 500 internal server error', async () => {
      const serverError = new GoogleDriveError(
        'Internal server error occurred',
        'GOOGLE_DRIVE_SERVICE_ERROR',
        500
      );
      mockDriveService.listFiles.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_SERVICE_ERROR');
        expect(result.error.message).toContain('Internal server error');
      }
    });

    test('should validate maxResults parameter bounds', async () => {
      // Test invalid maxResults (too small)
      const result1 = await tool.executeImpl({
        maxResults: 0,
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('must be at least 1');
      }

      // Test invalid maxResults (too large)
      const result2 = await tool.executeImpl({
        maxResults: 1001,
      });

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('cannot exceed 1000');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDriveService.listFiles.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected network error');
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_UNKNOWN_ERROR');
      }
    });

    test('should combine query and folderId parameters correctly', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['folder123'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        query: "name contains 'Test'",
        folderId: 'folder123',
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        query:
          "trashed = false and 'folder123' in parents and (name contains 'Test')",
      });
      expect(result.isOk()).toBe(true);
    });

    test('should automatically exclude trashed files from all queries', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Active Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['root'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({});

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        query: 'trashed = false',
      });
      expect(result.isOk()).toBe(true);
    });

    test('should combine trashed filter with custom query', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['root'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        query: "name contains 'Test'",
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        query: "trashed = false and (name contains 'Test')",
      });
      expect(result.isOk()).toBe(true);
    });

    test('should combine trashed filter with folder and custom query', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2023-01-01T10:00:00Z',
          modifiedTime: '2023-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['folder123'],
        },
      ];

      const expectedResult: DriveFileListResult = {
        files: mockFiles,
        nextPageToken: undefined,
        incompleteSearch: false,
      };

      mockDriveService.listFiles.mockResolvedValue(ok(expectedResult));

      const result = await tool.executeImpl({
        query: "name contains 'Test'",
        folderId: 'folder123',
      });

      expect(mockDriveService.listFiles).toHaveBeenCalledWith({
        query:
          "trashed = false and 'folder123' in parents and (name contains 'Test')",
      });
      expect(result.isOk()).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle service initialization failure', async () => {
      mockDriveService.initialize.mockRejectedValue(
        new Error('Service initialization failed')
      );

      const result = await tool.executeImpl({});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('initialization failed');
      }
    });
  });
});
