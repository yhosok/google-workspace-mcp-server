import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ok, err, Result } from 'neverthrow';
import { googleOk, googleErr } from '../../errors/index.js';
import { z } from 'zod';
import { BaseDriveTool } from './base-drive-tool.js';
import { DriveService } from '../../services/drive.service.js';
import { AuthService } from '../../services/auth.service.js';
import { AccessControlService } from '../../services/access-control.service.js';
import { Logger } from '../../utils/logger.js';
import {
  GoogleWorkspaceError,
  GoogleServiceError,
  GoogleAuthError,
  GoogleDriveError,
  GoogleDriveNotFoundError,
  GoogleDrivePermissionError,
  GoogleAccessControlError,
  GoogleAccessControlReadOnlyError,
  GoogleAccessControlToolError,
  GoogleAccessControlServiceError,
  GoogleAccessControlFolderError,
} from '../../errors/index.js';
import { validateToolInput } from '../../utils/validation.utils.js';
import type { ToolMetadata } from '../base/tool-registry.js';

// Mock dependencies
jest.mock('../../services/drive.service');
jest.mock('../../services/auth.service');
jest.mock('../../services/access-control.service');
jest.mock('../../utils/validation.utils');

// Concrete implementation for testing
class TestDriveTools extends BaseDriveTool<
  { test: string },
  { result: string }
> {
  constructor(
    driveService: DriveService,
    authService: AuthService,
    logger?: Logger,
    accessControlService?: AccessControlService
  ) {
    super(driveService, authService, logger, accessControlService);
  }

  getToolName(): string {
    return 'test-drive-tool';
  }

  getToolMetadata(): ToolMetadata {
    return {
      title: 'Test Drive Tool',
      description: 'A test tool for BaseDriveTool',
      inputSchema: {
        test: z.string(),
      },
    };
  }

  async executeImpl(input: {
    test: string;
  }): Promise<Result<{ result: string }, GoogleWorkspaceError>> {
    return ok({ result: input.test });
  }
}

describe('BaseDriveTool', () => {
  let testTool: TestDriveTools;
  let mockDriveService: jest.Mocked<DriveService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockAccessControlService: jest.Mocked<AccessControlService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockDriveService = new DriveService(
      {} as any,
      {} as any
    ) as jest.Mocked<DriveService>;
    mockAuthService = new AuthService({} as any) as jest.Mocked<AuthService>;
    mockAccessControlService = new AccessControlService(
      {} as any,
      {} as any
    ) as jest.Mocked<AccessControlService>;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
      addContext: jest.fn(),
      fatal: jest.fn(),
      startTimer: jest.fn(),
      endTimer: jest.fn(),
      measureAsync: jest.fn(),
      measure: jest.fn(),
      logOperation: jest.fn(),
      forOperation: jest.fn().mockReturnThis(),
      generateRequestId: jest.fn().mockReturnValue('test-request-id'),
      isLevelEnabled: jest.fn().mockReturnValue(true),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    testTool = new TestDriveTools(mockDriveService, mockAuthService, mockLogger, mockAccessControlService);

    // Setup access control service mocks with default behavior
    // @ts-ignore - Mocking access control service methods
    mockAccessControlService.validateAccess = jest.fn().mockResolvedValue(googleOk(undefined));
    // @ts-ignore - Mocking access control service methods
    mockAccessControlService.getAccessControlSummary = jest.fn().mockReturnValue({
      readOnlyMode: false,
      hasRestrictions: false,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Constructor and Basic Properties', () => {
    it('should initialize with required services', () => {
      expect(testTool).toBeDefined();
      expect(testTool.getToolName()).toBe('test-drive-tool');
    });

    it('should have access to driveService and authService', () => {
      expect((testTool as any).driveService).toBe(mockDriveService);
      expect((testTool as any).authService).toBe(mockAuthService);
    });
  });

  describe('validateWithSchema', () => {
    const mockSchema = z.object({
      fileId: z.string(),
      fileName: z.string(),
      mimeType: z.string().optional(),
    });

    beforeEach(() => {
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockClear();
    });

    it('should exist and be callable', () => {
      expect(typeof (testTool as any).validateWithSchema).toBe('function');
    });

    it('should use validateToolInput utility for validation', () => {
      const testData = { fileId: 'file123', fileName: 'test.txt' };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(validateToolInput).toHaveBeenCalledWith(mockSchema, testData);
      expect(result.isErr()).toBe(false);
    });

    it('should convert validation errors to GoogleDriveError', () => {
      const testData = { invalid: 'data' };
      const mockError = new GoogleDriveError(
        'Validation failed',
        'GOOGLE_DRIVE_VALIDATION_ERROR',
        400,
        'test-file-id'
      );
      const mockResult = err(mockError);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDriveError);
      expect(error.errorCode).toBe('GOOGLE_DRIVE_VALIDATION_ERROR');
    });
  });

  describe('handleServiceError', () => {
    it('should exist and be callable', () => {
      expect(typeof (testTool as any).handleServiceError).toBe('function');
    });

    it('should pass through GoogleDriveError unchanged', () => {
      const driveError = new GoogleDriveError(
        'Test error',
        'GOOGLE_DRIVE_TEST_ERROR',
        400,
        'file123'
      );

      const result = (testTool as any).handleServiceError(driveError);

      expect(result).toBe(driveError);
    });

    it('should convert GoogleAuthError to GoogleDriveError', () => {
      const authError = new GoogleAuthError('Auth failed', 'oauth2');

      const result = (testTool as any).handleServiceError(authError);

      expect(result).toBeInstanceOf(GoogleDriveError);
      expect(result.message).toContain('Auth failed');
      expect(result.errorCode).toBe('GOOGLE_DRIVE_AUTH_ERROR');
      expect(result.context?.originalError).toBe(authError);
    });

    it('should convert GoogleWorkspaceError to GoogleDriveError', () => {
      const workspaceError = new GoogleServiceError(
        'Workspace error',
        'drive-service',
        'GOOGLE_WORKSPACE_ERROR',
        500
      );

      const result = (testTool as any).handleServiceError(workspaceError);

      expect(result).toBeInstanceOf(GoogleDriveError);
      expect(result.message).toContain('Workspace error');
      expect(result.errorCode).toBe('GOOGLE_DRIVE_SERVICE_ERROR');
      expect(result.context?.originalError).toBe(workspaceError);
    });

    it('should convert generic Error to GoogleDriveError', () => {
      const genericError = new Error('Generic error');

      const result = (testTool as any).handleServiceError(genericError);

      expect(result).toBeInstanceOf(GoogleDriveError);
      expect(result.message).toContain('Generic error');
      expect(result.errorCode).toBe('GOOGLE_DRIVE_UNKNOWN_ERROR');
    });
  });

  describe('validateFileId', () => {
    it('should exist and be callable', () => {
      expect(typeof (testTool as any).validateFileId).toBe('function');
    });

    it('should validate correct file ID', () => {
      const validFileId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

      const result = (testTool as any).validateFileId(validFileId, 'get_file');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validFileId);
    });

    it('should reject empty file ID', () => {
      const result = (testTool as any).validateFileId('', 'get_file');

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDriveNotFoundError);
    });

    it('should trim valid file ID', () => {
      const fileId = '  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms  ';

      const result = (testTool as any).validateFileId(fileId, 'get_file');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(
        '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
      );
    });
  });

  describe('validateFolderId', () => {
    it('should exist and be callable', () => {
      expect(typeof (testTool as any).validateFolderId).toBe('function');
    });

    it('should validate correct folder ID', () => {
      const validFolderId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';

      const result = (testTool as any).validateFolderId(validFolderId, 'create_file');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validFolderId);
    });

    it('should reject empty folder ID', () => {
      const result = (testTool as any).validateFolderId('', 'create_file');

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleDrivePermissionError);
    });

    it('should handle special folder references', () => {
      const rootFolderId = 'root';

      const result = (testTool as any).validateFolderId(rootFolderId, 'create_file');

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('root');
    });
  });

  describe('createCommonSchemas', () => {
    it('should exist and return schemas object', () => {
      const schemas = BaseDriveTool.createCommonSchemas();

      expect(schemas).toBeDefined();
      expect(schemas.fileId).toBeDefined();
      expect(schemas.folderId).toBeDefined();
      expect(schemas.fileName).toBeDefined();
      expect(schemas.mimeType).toBeDefined();
    });

    it('should create valid schemas for drive operations', () => {
      const schemas = BaseDriveTool.createCommonSchemas();

      // Test fileId schema
      const fileIdResult = schemas.fileId.safeParse('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
      expect(fileIdResult.success).toBe(true);

      // Test fileName schema
      const fileNameResult = schemas.fileName.safeParse('test.txt');
      expect(fileNameResult.success).toBe(true);

      // Test mimeType schema
      const mimeTypeResult = schemas.mimeType.safeParse('text/plain');
      expect(mimeTypeResult.success).toBe(true);
    });

    it('should reject invalid data', () => {
      const schemas = BaseDriveTool.createCommonSchemas();

      // Test empty fileId
      const fileIdResult = schemas.fileId.safeParse('');
      expect(fileIdResult.success).toBe(false);

      // Test empty fileName
      const fileNameResult = schemas.fileName.safeParse('');
      expect(fileNameResult.success).toBe(false);
    });
  });

  // ===============================
  // ACCESS CONTROL INTEGRATION TESTS (IMPLEMENTATION COMPLETE)
  // ===============================

  describe('Access Control Integration (Implementation Complete)', () => {
    describe('validateAccessControl method', () => {
      it('should exist and be callable', () => {
        // Implementation is now complete - validateAccessControl method exists and works
        expect(typeof (testTool as any).validateAccessControl).toBe('function');
      });

      it('should validate read operations (always allowed)', async () => {
        const request = {
          operation: 'read' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__get-file',
          context: { fileId: 'test-file-id' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__get-file',
          targetFolderId: undefined,
          resourceType: 'drive_file',
          context: expect.any(Object),
        });
      });

      it('should validate write operations with access control', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id', folderId: 'folder-123' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          targetFolderId: 'folder-123',
          resourceType: 'drive_file',
          context: expect.any(Object),
        });
      });

      it('should validate create operations with folder context', async () => {
        const request = {
          operation: 'create' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__create-file',
          context: { name: 'New File', parentFolderId: 'folder-456' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'create',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__create-file',
          targetFolderId: 'folder-456',
          resourceType: 'drive_file',
          context: expect.any(Object),
        });
      });

      it('should handle access control denial errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        const accessError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'drive',
          resourceType: 'drive_file',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(err(accessError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlReadOnlyError);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Access control validation failed',
          expect.objectContaining({
            requestId: 'test-request-id',
            operation: 'write',
            serviceName: 'drive',
            toolName: 'google-workspace__drive__update-file',
          })
        );
      });

      it('should handle folder-based access control for file operations', async () => {
        const request = {
          operation: 'create' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__create-file',
          context: { name: 'New File', parentFolderId: 'restricted-folder' },
        };

        const folderError = new GoogleAccessControlFolderError(
          'restricted-folder',
          'allowed-folder',
          { operation: 'create', resourceType: 'drive_file' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(err(folderError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlFolderError);
      });

      it('should handle service access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        const serviceError = new GoogleAccessControlServiceError(
          'drive',
          ['sheets', 'docs'],
          { operation: 'write', resourceType: 'drive_file' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(err(serviceError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlServiceError);
      });

      it('should handle tool access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        const toolError = new GoogleAccessControlToolError(
          'google-workspace__drive__update-file',
          ['google-workspace__drive__get-file'],
          { operation: 'write', serviceName: 'drive' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(err(toolError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlToolError);
      });

      it('should handle unexpected access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        mockAccessControlService.validateAccess.mockRejectedValue(new Error('Network error'));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlError);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Access control validation error',
          expect.objectContaining({
            requestId: 'test-request-id',
            error: expect.any(Object),
          })
        );
      });
    });

    describe('isWriteOperation method', () => {
      it('should exist and be callable', () => {
        // Implementation is now complete - isWriteOperation method exists and works
        expect(typeof (testTool as any).isWriteOperation).toBe('function');
      });

      it('should identify read operations correctly', () => {
        const readOperations = [
          'google-workspace__drive__list-files',
          'google-workspace__drive__get-file',
          'google-workspace__drive__get-file-content',
          'drive-list',
          'drive-get',
          'list-files',
        ];

        readOperations.forEach(toolName => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(false);
        });
      });

      it('should identify write operations correctly', () => {
        const writeOperations = [
          'google-workspace__drive__create-file',
          'google-workspace__drive__update-file',
          'google-workspace__drive__delete-file',
          'google-workspace__drive__move-file',
          'google-workspace__drive__copy-file',
          'drive-create',
          'drive-update',
          'drive-delete',
          'drive-move',
          'drive-copy',
        ];

        writeOperations.forEach(toolName => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(true);
        });
      });

      it('should handle edge cases and unknown tool patterns', () => {
        const edgeCases = [
          { toolName: '', expected: false },
          { toolName: 'unknown-tool', expected: false },
          { toolName: 'google-workspace__drive__unknown', expected: false },
          { toolName: 'drive-unknown-operation', expected: false },
        ];

        edgeCases.forEach(({ toolName, expected }) => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(expected);
        });
      });

      it('should handle tool name parsing correctly', () => {
        const testCases = [
          // Standard patterns
          { toolName: 'google-workspace__drive__create-file', expected: true },
          { toolName: 'google-workspace__drive__get-file', expected: false },
          // Legacy patterns
          { toolName: 'drive-create', expected: true },
          { toolName: 'drive-list', expected: false },
          // Mixed case
          { toolName: 'google-workspace__drive__CREATE-file', expected: true },
          { toolName: 'google-workspace__drive__GET-file', expected: false },
        ];

        testCases.forEach(({ toolName, expected }) => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(expected);
        });
      });
    });

    describe('getRequiredFolderIds method', () => {
      it('should exist and be callable', () => {
        // Implementation is now complete - getRequiredFolderIds method exists and works
        expect(typeof (testTool as any).getRequiredFolderIds).toBe('function');
      });

      it('should extract folder ID from drive parameters', () => {
        const testCases = [
          {
            params: { folderId: 'folder-123' },
            expected: ['folder-123'],
          },
          {
            params: { parentFolderId: 'parent-456' },
            expected: ['parent-456'],
          },
          {
            params: { targetFolderId: 'target-789' },
            expected: ['target-789'],
          },
          {
            params: { 
              folderId: 'folder-123',
              parentFolderId: 'parent-456',
            },
            expected: ['folder-123', 'parent-456'],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });

      it('should return empty array when no folder parameters present', () => {
        const testCases = [
          {},
          { fileId: 'file-123' },
          { fileName: 'test.txt' },
          { mimeType: 'text/plain' },
          { fileId: 'file-123', fileName: 'test.txt', mimeType: 'text/plain' },
        ];

        testCases.forEach(params => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual([]);
        });
      });

      it('should handle nested folder parameters', () => {
        const testCases = [
          {
            params: {
              options: {
                folderId: 'nested-folder-123',
              },
            },
            expected: ['nested-folder-123'],
          },
          {
            params: {
              metadata: {
                parentFolderId: 'nested-parent-456',
              },
            },
            expected: ['nested-parent-456'],
          },
          {
            params: {
              options: {
                folderId: 'nested-folder-123',
              },
              metadata: {
                parentFolderId: 'nested-parent-456',
              },
            },
            expected: ['nested-folder-123', 'nested-parent-456'],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });

      it('should filter out empty, null, and undefined folder IDs', () => {
        const testCases = [
          {
            params: {
              folderId: '',
              parentFolderId: 'valid-folder',
              targetFolderId: null,
            },
            expected: ['valid-folder'],
          },
          {
            params: {
              folderId: undefined,
              parentFolderId: 'another-valid-folder',
              targetFolderId: '',
            },
            expected: ['another-valid-folder'],
          },
          {
            params: {
              folderId: null,
              parentFolderId: undefined,
              targetFolderId: '',
            },
            expected: [],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });

      it('should handle drive-specific folder patterns', () => {
        const testCases = [
          {
            params: {
              fileId: 'file-123',
              parentFolderId: 'drive-folder-456',
              query: 'name contains "test"',
            },
            expected: ['drive-folder-456'],
          },
          {
            params: {
              name: 'New File',
              parents: ['parent-789'],
            },
            expected: ['parent-789'],
          },
          {
            params: {
              fileId: 'file-123',
              destinationFolderId: 'destination-folder',
            },
            expected: ['destination-folder'],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });
    });

    describe('Integration with existing tool execution flow', () => {
      it('should integrate access control with executeImpl method', async () => {
        // Mock a tool that would normally call access control validation
        const mockExecuteWithAccessControl = jest.fn().mockResolvedValue(
          // @ts-ignore - Mock return value
          ok({ result: 'success' })
        );
        
        // This test should fail because access control integration doesn't exist yet
        expect(typeof (testTool as any).executeWithAccessControl).toBe('function');
      });

      it('should validate access control before executing write operations', async () => {
        const writeInput = {
          fileId: 'test-file-123',
          name: 'Updated File',
          parentFolderId: 'folder-456',
        };

        // Mock access control to deny the operation
        const accessError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'drive',
          resourceType: 'drive_file',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(err(accessError));

        // This test should fail because write operation access control doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          writeInput,
          'google-workspace__drive__update-file'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlReadOnlyError);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          targetFolderId: 'folder-456',
          resourceType: 'drive_file',
          context: expect.objectContaining({
            fileId: 'test-file-123',
            name: 'Updated File',
          }),
        });
      });

      it('should skip access control validation for read operations', async () => {
        const readInput = {
          fileId: 'test-file-123',
          fields: 'id,name,mimeType',
        };

        // This test should fail because read operation flow doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          readInput,
          'google-workspace__drive__get-file'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__get-file',
          targetFolderId: undefined,
          resourceType: 'drive_file',
          context: expect.objectContaining({
            fileId: 'test-file-123',
            fields: 'id,name,mimeType',
          }),
        });
      });

      it('should preserve original tool execution when access is allowed', async () => {
        const validInput = {
          test: 'valid-data',
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because executeWithAccessControl doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          validInput,
          'google-workspace__drive__get-file'
        );

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual({ result: 'valid-data' });
      });
    });

    describe('Error handling and Result<T, E> pattern consistency', () => {
      it('should maintain Result<T, E> pattern for access control methods', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result).toHaveProperty('isOk');
        expect(result).toHaveProperty('isErr');
        expect(typeof result.isOk).toBe('function');
        expect(typeof result.isErr).toBe('function');
      });

      it('should convert non-GoogleWorkspaceError to proper error types', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        // Simulate unexpected error type
        mockAccessControlService.validateAccess.mockRejectedValue(new TypeError('Unexpected error'));

        // This test should fail because error conversion doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBeInstanceOf(GoogleAccessControlError);
        expect(error.message).toContain('Access control validation failed');
      });

      it('should preserve error context and stack traces', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__update-file',
          context: { fileId: 'test-file-id' },
        };

        const originalError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'drive',
          resourceType: 'drive_file',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(err(originalError));

        // This test should fail because error context preservation doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBe(originalError); // Should preserve the exact same error instance
        expect(error.context).toMatchObject({
          serviceName: 'drive',
          resourceType: 'drive_file',
        });
      });
    });

    describe('Backward compatibility with existing patterns', () => {
      it('should not break existing schema validation', () => {
        const schema = z.object({
          test: z.string(),
        });
        const data = { test: 'valid-data' };

        (validateToolInput as jest.MockedFunction<typeof validateToolInput>)
          .mockReturnValue(ok(data));

        const result = (testTool as any).validateWithSchema(schema, data);

        expect(result.isOk()).toBe(true);
        expect(validateToolInput).toHaveBeenCalledWith(schema, data);
      });

      it('should not break existing file validation methods', () => {
        const validFileId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
        
        const result = (testTool as any).validateFileId(validFileId, 'get_file');

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(validFileId);
      });

      it('should not break existing folder validation methods', () => {
        const validFolderId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
        
        const result = (testTool as any).validateFolderId(validFolderId, 'create_file');

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(validFolderId);
      });

      it('should maintain service and logger injection', () => {
        expect((testTool as any).driveService).toBe(mockDriveService);
        expect((testTool as any).authService).toBe(mockAuthService);
        expect((testTool as any).logger).toBe(mockLogger);
      });

      it('should maintain existing common schemas functionality', () => {
        const schemas = BaseDriveTool.createCommonSchemas();

        expect(schemas).toBeDefined();
        expect(schemas.fileId).toBeDefined();
        expect(schemas.folderId).toBeDefined();
        expect(schemas.fileName).toBeDefined();
      });
    });

    describe('AccessControlService dependency injection (Implementation Complete)', () => {
      it('should accept AccessControlService as constructor parameter', () => {
        // This test should fail because AccessControlService injection doesn't exist yet
        expect(() => {
          new TestDriveTools(
            mockDriveService,
            mockAuthService,
            mockLogger,
            mockAccessControlService
          );
        }).not.toThrow();
      });

      it('should use injected AccessControlService for validations', async () => {
        // This test should fail because AccessControlService injection doesn't exist yet
        const toolWithAccessControl = new TestDriveTools(
          mockDriveService,
          mockAuthService,
          mockLogger,
          mockAccessControlService
        );

        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'test-drive-tool',
          context: {},
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        const result = await (toolWithAccessControl as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledTimes(1);
      });

      it('should handle optional AccessControlService parameter', () => {
        // This test should fail because optional AccessControlService doesn't exist yet
        const toolWithoutAccessControl = new TestDriveTools(
          mockDriveService,
          mockAuthService,
          mockLogger
        );

        expect(toolWithoutAccessControl).toBeDefined();
        expect((toolWithoutAccessControl as any).accessControlService).toBeUndefined();
      });
    });

    describe('Drive-specific access control patterns', () => {
      it('should validate access for file creation with folder placement', async () => {
        const request = {
          operation: 'create' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__create-file',
          context: { 
            name: 'New File.txt',
            parentFolderId: 'drive-folder-123',
            mimeType: 'text/plain',
          },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'create',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__create-file',
          targetFolderId: 'drive-folder-123',
          resourceType: 'drive_file',
          context: expect.objectContaining({
            name: 'New File.txt',
            parentFolderId: 'drive-folder-123',
            mimeType: 'text/plain',
          }),
        });
      });

      it('should validate access for file move operations', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__move-file',
          context: { 
            fileId: 'file-456',
            sourceFolderId: 'source-folder',
            targetFolderId: 'target-folder-789',
          },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__move-file',
          targetFolderId: 'target-folder-789',
          resourceType: 'drive_file',
          context: expect.objectContaining({
            fileId: 'file-456',
            sourceFolderId: 'source-folder',
            targetFolderId: 'target-folder-789',
          }),
        });
      });

      it('should validate access for file list operations with folder filtering', async () => {
        const request = {
          operation: 'read' as const,
          serviceName: 'drive',
          toolName: 'google-workspace__drive__list-files',
          context: { 
            query: "'folder-123' in parents",
            maxResults: 10,
          },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'drive',
          toolName: 'google-workspace__drive__list-files',
          targetFolderId: undefined,
          resourceType: 'drive_file',
          context: expect.objectContaining({
            query: "'folder-123' in parents",
            maxResults: 10,
          }),
        });
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain inheritance structure', () => {
      expect(testTool).toBeInstanceOf(BaseDriveTool);
      expect(testTool.getToolName()).toBe('test-drive-tool');
    });

    it('should maintain existing error handling functionality', () => {
      const driveError = new GoogleDriveError(
        'Test error',
        'GOOGLE_DRIVE_TEST_ERROR',
        400
      );

      const result = (testTool as any).handleServiceError(driveError);

      expect(result).toBe(driveError);
    });
  });
});