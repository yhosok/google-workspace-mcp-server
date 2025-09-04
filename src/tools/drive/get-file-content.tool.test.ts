import { GetFileContentTool } from './get-file-content.tool.js';
import { DriveService } from '../../services/drive.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import {
  GoogleDriveError,
  GoogleDriveNotFoundError,
  GoogleDrivePermissionError,
} from '../../errors/index.js';
import type { DriveFileContent, MCPToolResult } from '../../types/index.js';
import { z } from 'zod';

// Mock interfaces for testing - these will be replaced by actual implementations
interface GetFileContentInput {
  fileId: string;
  exportFormat?: string;
  maxFileSize?: number;
}

interface GetFileContentResult {
  content: string | Buffer;
  mimeType: string;
  size: number;
  isExported: boolean;
  exportFormat?: string;
  fileName: string;
  encoding?: 'base64' | 'utf8';
}

// Actual implementation is now imported from './get-file-content.tool.js'

describe('GetFileContentTool', () => {
  let tool: GetFileContentTool;
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

    tool = new GetFileContentTool(mockDriveService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe(
        'google-workspace__drive__get-file-content'
      );
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata with input schema', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Get Drive File Content');
      expect(metadata.description).toBe(
        'Downloads and retrieves content from a Google Drive file'
      );
      expect(metadata.inputSchema).toBeDefined();
    });
  });

  describe('executeImpl', () => {
    test('should get text file content directly', async () => {
      const mockContent: DriveFileContent = {
        content: 'This is a test text file content.',
        mimeType: 'text/plain',
        size: 35,
        isExported: false,
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'text123',
      });

      expect(mockDriveService.getFileContent).toHaveBeenCalledWith(
        'text123',
        undefined
      );
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.content).toBe('This is a test text file content.');
        expect(resultData.mimeType).toBe('text/plain');
        expect(resultData.size).toBe(35);
        expect(resultData.isExported).toBe(false);
        expect(resultData.encoding).toBe('utf8');
      }
    });

    test('should get Google Docs content with PDF export', async () => {
      const pdfBuffer = Buffer.from('PDF file content', 'binary');
      const mockContent: DriveFileContent = {
        content: pdfBuffer,
        mimeType: 'application/pdf',
        size: pdfBuffer.length,
        isExported: true,
        exportFormat: 'pdf',
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'doc123',
        exportFormat: 'pdf',
      });

      expect(mockDriveService.getFileContent).toHaveBeenCalledWith('doc123', {
        exportFormat: 'pdf',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.mimeType).toBe('application/pdf');
        expect(resultData.isExported).toBe(true);
        expect(resultData.exportFormat).toBe('pdf');
        expect(resultData.encoding).toBe('base64');
      }
    });

    test('should get Google Sheets content with XLSX export', async () => {
      const xlsxBuffer = Buffer.from('Excel file content', 'binary');
      const mockContent: DriveFileContent = {
        content: xlsxBuffer,
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: xlsxBuffer.length,
        isExported: true,
        exportFormat: 'xlsx',
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'sheet123',
        exportFormat: 'xlsx',
      });

      expect(mockDriveService.getFileContent).toHaveBeenCalledWith('sheet123', {
        exportFormat: 'xlsx',
      });
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.mimeType).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(resultData.isExported).toBe(true);
        expect(resultData.exportFormat).toBe('xlsx');
      }
    });

    test('should get Google Sheets content with CSV export', async () => {
      const csvContent = 'Name,Age,City\nJohn,30,New York\nJane,25,Boston';
      const mockContent: DriveFileContent = {
        content: csvContent,
        mimeType: 'text/csv',
        size: csvContent.length,
        isExported: true,
        exportFormat: 'csv',
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'sheet123',
        exportFormat: 'csv',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.content).toBe(csvContent);
        expect(resultData.mimeType).toBe('text/csv');
        expect(resultData.isExported).toBe(true);
        expect(resultData.exportFormat).toBe('csv');
        expect(resultData.encoding).toBe('utf8');
      }
    });

    test('should handle binary file (image) with base64 encoding', async () => {
      const imageBuffer = Buffer.from('fake image data', 'binary');
      const mockContent: DriveFileContent = {
        content: imageBuffer,
        mimeType: 'image/jpeg',
        size: imageBuffer.length,
        isExported: false,
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'image123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.mimeType).toBe('image/jpeg');
        expect(resultData.encoding).toBe('base64');
        expect(resultData.isExported).toBe(false);
      }
    });

    test('should handle file size limit enforcement', async () => {
      const largeContent = 'x'.repeat(1000);
      const mockContent: DriveFileContent = {
        content: largeContent,
        mimeType: 'text/plain',
        size: 1000,
        isExported: false,
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'large123',
        maxFileSize: 500, // Smaller than actual file
      });

      expect(mockDriveService.getFileContent).toHaveBeenCalledWith('large123', {
        maxFileSize: 500,
      });
      expect(result.isOk()).toBe(true); // Service handles the limit
    });

    test('should handle file size limit validation', async () => {
      const result = await tool.executeImpl({
        fileId: 'file123',
        maxFileSize: -1, // Invalid size
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('must be positive');
      }
    });

    test('should handle unsupported export format', async () => {
      const result = await tool.executeImpl({
        fileId: 'doc123',
        exportFormat: 'invalid-format' as any,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Invalid enum value');
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

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
        'Unauthorized access to file content',
        'GOOGLE_DRIVE_AUTH_ERROR',
        401,
        'file123'
      );
      mockDriveService.getFileContent.mockResolvedValue(err(authError));

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
          reason: 'Insufficient permission to download file',
          operation: 'get_file_content',
        }
      );
      mockDriveService.getFileContent.mockResolvedValue(err(permissionError));

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
        reason: 'File not found or not accessible',
        operation: 'get_file_content',
      });
      mockDriveService.getFileContent.mockResolvedValue(err(notFoundError));

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
        'Internal server error while downloading file',
        'GOOGLE_DRIVE_SERVICE_ERROR',
        500,
        'file123'
      );
      mockDriveService.getFileContent.mockResolvedValue(err(serverError));

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

    test('should handle valid export formats', async () => {
      const validFormats = [
        'pdf',
        'docx',
        'xlsx',
        'csv',
        'txt',
        'html',
        'odt',
        'rtf',
      ];

      for (const format of validFormats) {
        const mockContent: DriveFileContent = {
          content: 'test content',
          mimeType: 'text/plain',
          size: 12,
          isExported: true,
          exportFormat: format,
        };

        mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

        const result = await tool.executeImpl({
          fileId: 'file123',
          exportFormat: format as any,
        });

        expect(mockDriveService.getFileContent).toHaveBeenCalledWith(
          'file123',
          {
            exportFormat: format,
          }
        );
        expect(result.isOk()).toBe(true);
      }
    });

    test('should handle maxFileSize parameter bounds', async () => {
      // Test extremely large maxFileSize
      const result = await tool.executeImpl({
        fileId: 'file123',
        maxFileSize: 2 * 1024 * 1024 * 1024, // 2GB - too large
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('too large');
      }
    });

    test('should handle unexpected service errors', async () => {
      mockDriveService.getFileContent.mockRejectedValue(
        new Error('Unexpected download error')
      );

      const result = await tool.executeImpl({
        fileId: 'file123',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected download error');
        expect(result.error.errorCode).toBe('GOOGLE_DRIVE_UNKNOWN_ERROR');
      }
    });

    test('should handle empty file content', async () => {
      const mockContent: DriveFileContent = {
        content: '',
        mimeType: 'text/plain',
        size: 0,
        isExported: false,
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'empty123',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.content).toBe('');
        expect(resultData.size).toBe(0);
      }
    });

    test('should handle large file with proper encoding', async () => {
      const largeTextContent = 'Lorem ipsum '.repeat(1000); // ~12KB
      const mockContent: DriveFileContent = {
        content: largeTextContent,
        mimeType: 'text/plain',
        size: largeTextContent.length,
        isExported: false,
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockContent));

      const result = await tool.executeImpl({
        fileId: 'large-text123',
        maxFileSize: 50000, // 50KB limit
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        const resultData = JSON.parse(text!) as GetFileContentResult;
        expect(resultData.content).toBe(largeTextContent);
        expect(resultData.encoding).toBe('utf8');
      }
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
