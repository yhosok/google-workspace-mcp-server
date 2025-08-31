import { GetFileTool } from './get-file.tool.js';
import { DriveService } from '../../services/drive.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleDriveError, GoogleDriveNotFoundError, GoogleDrivePermissionError } from '../../errors/index.js';
import type { DriveFileInfo, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface GetFileInput {
  fileId: string;
  fields?: string[];
}

interface GetFileResult {
  file: {
    id: string;
    name: string;
    mimeType: string;
    createdTime: string;
    modifiedTime: string;
    webViewLink?: string;
    webContentLink?: string;
    parents?: string[];
    size?: string;
    version?: string;
    description?: string;
    owners?: Array<{
      displayName?: string;
      emailAddress?: string;
      me?: boolean;
    }>;
    permissions?: Array<{
      id?: string;
      type?: string;
      role?: string;
    }>;
  };
}

// Actual implementation is now imported from './get-file.tool.js'

describe('GetFileTool', () => {
  let tool: GetFileTool;
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

    tool = new GetFileTool(mockDriveService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__drive-get');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Get Drive File');
      expect(metadata.description).toBe(
        'Gets metadata and details for a specific Google Drive file'
      );
      expect(metadata.inputSchema).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should get file metadata with default fields', async () => {
      const mockFile: DriveFileInfo = {
        id: 'file123',
        name: 'Test Document.docx',
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        webViewLink: 'https://docs.google.com/document/d/file123',
        parents: ['root'],
        size: '1024',
        version: '1',
        description: 'A test document',
        owners: [
          {
            displayName: 'Test User',
            emailAddress: 'test@example.com',
            me: true,
          },
        ],
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(mockDriveService.getFile).toHaveBeenCalledWith('file123', undefined);
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as GetFileResult;
        expect(resultData.file.id).toBe('file123');
        expect(resultData.file.name).toBe('Test Document.docx');
        expect(resultData.file.mimeType).toBe('application/vnd.google-apps.document');
        expect(resultData.file.owners).toHaveLength(1);
      }
    });

    test('should get file metadata with custom fields', async () => {
      const mockFile: DriveFileInfo = {
        id: 'file123',
        name: 'Test Document.docx',
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'file123',
        fields: ['id', 'name', 'mimeType', 'createdTime', 'modifiedTime'],
      });

      expect(mockDriveService.getFile).toHaveBeenCalledWith('file123', {
        fields: 'id,name,mimeType,createdTime,modifiedTime',
      });
      expect(result.isOk()).toBe(true);
    });

    test('should handle Google Sheets file', async () => {
      const mockFile: DriveFileInfo = {
        id: 'sheet123',
        name: 'Test Spreadsheet',
        mimeType: 'application/vnd.google-apps.spreadsheet',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T11:00:00Z',
        webViewLink: 'https://docs.google.com/spreadsheets/d/sheet123',
        parents: ['folder456'],
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'sheet123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileResult;
        expect(resultData.file.mimeType).toBe('application/vnd.google-apps.spreadsheet');
        expect(resultData.file.name).toBe('Test Spreadsheet');
      }
    });

    test('should handle Google Presentation file', async () => {
      const mockFile: DriveFileInfo = {
        id: 'presentation123',
        name: 'Test Presentation',
        mimeType: 'application/vnd.google-apps.presentation',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T12:00:00Z',
        webViewLink: 'https://docs.google.com/presentation/d/presentation123',
        parents: ['root'],
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'presentation123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileResult;
        expect(resultData.file.mimeType).toBe('application/vnd.google-apps.presentation');
        expect(resultData.file.name).toBe('Test Presentation');
      }
    });

    test('should handle binary file (PDF)', async () => {
      const mockFile: DriveFileInfo = {
        id: 'pdf123',
        name: 'Document.pdf',
        mimeType: 'application/pdf',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        webViewLink: 'https://drive.google.com/file/d/pdf123/view',
        webContentLink: 'https://drive.google.com/file/d/pdf123/download',
        parents: ['root'],
        size: '2048576', // 2MB
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'pdf123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileResult;
        expect(resultData.file.mimeType).toBe('application/pdf');
        expect(resultData.file.size).toBe('2048576');
        expect(resultData.file.webContentLink).toBeDefined();
      }
    });

    test('should handle file with permissions', async () => {
      const mockFile: DriveFileInfo = {
        id: 'shared123',
        name: 'Shared Document.docx',
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
        webViewLink: 'https://docs.google.com/document/d/shared123',
        parents: ['root'],
        permissions: [
          {
            id: 'owner',
            type: 'user',
            role: 'owner',
          },
          {
            id: 'viewer',
            type: 'user',
            role: 'reader',
          },
        ],
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'shared123',
        fields: ['id', 'name', 'permissions'],
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileResult;
        expect(resultData.file.permissions).toHaveLength(2);
        expect(resultData.file.permissions![0].role).toBe('owner');
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Authentication validation failed');
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_AUTH_ERROR');
      }
    });

    test('should handle 401 unauthorized error', async () => {
      const authError = new GoogleDriveError(
        'Unauthorized access to file',
        'GOOGLE_DRIVE_AUTH_ERROR',
        401,
        'file123'
      );
      mockDriveService.getFile.mockResolvedValue(err(authError));

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(401);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_AUTH_ERROR');
        expect(result.error.message).toContain('Unauthorized access');
      }
    });

    test('should handle 403 forbidden error', async () => {
      const permissionError = new GoogleDrivePermissionError(
        'file123',
        undefined,
        {
          reason: 'Insufficient permission to access file',
          operation: 'get_file',
        }
      );
      mockDriveService.getFile.mockResolvedValue(err(permissionError));

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_PERMISSION_DENIED');
        expect(result.error.message).toContain('Permission');
      }
    });

    test('should handle 404 file not found error', async () => {
      const notFoundError = new GoogleDriveNotFoundError('invalid-file-id', {
        reason: 'File not found',
        operation: 'get_file',
      });
      mockDriveService.getFile.mockResolvedValue(err(notFoundError));

      const result = await tool.executeImpl({
        fileId: 'invalid-file-id',
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
        'Internal server error occurred while getting file',
        'GOOGLE_DRIVE_SERVICE_ERROR',
        500,
        'file123'
      );
      mockDriveService.getFile.mockResolvedValue(err(serverError));

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_SERVICE_ERROR');
        expect(result.error.message).toContain('Internal server error');
      }
    });

    test('should validate required fileId parameter', async () => {
      // Test empty fileId
      const result1 = await tool.executeImpl({
        fileId: '',
      });

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('File ID cannot be empty');
      }

      // Test undefined fileId (this would fail TypeScript compilation, but test for runtime)
      const result2 = await tool.executeImpl({} as any);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('Required');
      }
    });

    test('should validate fileId format', async () => {
      const result = await tool.executeImpl({
        fileId: '   ', // Only whitespace
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('File not found');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDriveService.getFile.mockRejectedValue(
        new Error('Unexpected network error')
      );

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected network error');
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_UNKNOWN_ERROR');
      }
    });

    test('should handle fields array conversion to string', async () => {
      const mockFile: DriveFileInfo = {
        id: 'file123',
        name: 'Test Document.docx',
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'file123',
        fields: ['id', 'name', 'size', 'parents', 'permissions'],
      });

      expect(mockDriveService.getFile).toHaveBeenCalledWith('file123', {
        fields: 'id,name,size,parents,permissions',
      });
      expect(result.isOk()).toBe(true);
    });

    test('should handle empty fields array', async () => {
      const mockFile: DriveFileInfo = {
        id: 'file123',
        name: 'Test Document.docx',
        mimeType: 'application/vnd.google-apps.document',
        createdTime: '2023-01-01T10:00:00Z',
        modifiedTime: '2023-01-01T10:30:00Z',
      };

      mockDriveService.getFile.mockResolvedValue(ok(mockFile));

      const result = await tool.executeImpl({
        fileId: 'file123',
        fields: [],
      });

      expect(mockDriveService.getFile).toHaveBeenCalledWith('file123', undefined);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle service initialization failure', async () => {
      mockDriveService.initialize.mockRejectedValue(
        new Error('Service initialization failed')
      );

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('initialization failed');
      }
    });
  });
});