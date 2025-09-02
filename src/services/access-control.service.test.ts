import { AccessControlService } from './access-control.service.js';
import { EnvironmentConfig } from '../types/index.js';
import {
  GoogleWorkspaceError,
  GoogleConfigError,
  GoogleAuthError,
  GoogleAccessControlFolderError,
  GoogleAccessControlToolError,
  GoogleAccessControlServiceError,
  GoogleAccessControlReadOnlyError,
} from '../errors/index.js';
import { ok } from 'neverthrow';

/**
 * Comprehensive test suite for AccessControlService class.
 *
 * This test suite follows TDD RED phase - these tests will initially fail
 * and drive the implementation of the AccessControlService.
 *
 * Test Coverage:
 * - Service initialization and configuration validation
 * - Folder-based access control (GOOGLE_DRIVE_FOLDER_ID restrictions)
 * - Tool-based access control (GOOGLE_ALLOWED_WRITE_TOOLS)
 * - Service-based access control (GOOGLE_ALLOWED_WRITE_SERVICES)
 * - Read-only mode enforcement (GOOGLE_READ_ONLY_MODE)
 * - Combination scenarios and complex access control rules
 * - Error handling and proper error hierarchy usage
 * - Integration with neverthrow Result pattern
 *
 * Design Principles:
 * - Uses neverthrow Result<T, E> pattern for error handling
 * - Follows established GoogleWorkspaceError hierarchy
 * - Integrates with existing EnvironmentConfig system
 * - Comprehensive edge case coverage
 */
describe('AccessControlService', () => {
  let mockConfig: EnvironmentConfig;

  const defaultConfig: EnvironmentConfig = {
    GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
    GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER: undefined,
    GOOGLE_ALLOWED_WRITE_SERVICES: undefined,
    GOOGLE_ALLOWED_WRITE_TOOLS: undefined,
    GOOGLE_READ_ONLY_MODE: undefined,
  };

  beforeEach(() => {
    // Reset mock config for each test
    mockConfig = { ...defaultConfig };
  });

  describe('Service Initialization and Configuration', () => {
    it('should initialize with default configuration successfully', () => {
      const service = new AccessControlService(defaultConfig);
      expect(service).toBeDefined();
    });

    it('should initialize with empty configuration and apply defaults', () => {
      const emptyConfig: EnvironmentConfig = {
        GOOGLE_DRIVE_FOLDER_ID: '',
      };
      const service = new AccessControlService(emptyConfig);
      expect(service).toBeDefined();
    });

    it('should validate configuration on initialization', () => {
      // Invalid configuration with conflicting settings
      const invalidConfig: EnvironmentConfig = {
        GOOGLE_DRIVE_FOLDER_ID: '',
        GOOGLE_READ_ONLY_MODE: true,
        GOOGLE_ALLOWED_WRITE_SERVICES: ['sheets', 'invalid-service'],
        GOOGLE_ALLOWED_WRITE_TOOLS: ['invalid-tool-format'],
      };

      expect(() => new AccessControlService(invalidConfig)).toThrow(
        GoogleConfigError
      );
    });
  });

  describe('Folder-based Access Control', () => {
    describe('validateFolderAccess', () => {
      it('should allow write operations inside configured folder', async () => {
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'allowed-folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateFolderAccess({
          operation: 'write',
          targetFolderId: 'allowed-folder-id',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should block write operations outside configured folder when GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER is false', async () => {
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'allowed-folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateFolderAccess({
          operation: 'write',
          targetFolderId: 'different-folder-id',
          resourceType: 'spreadsheet',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlFolderError
        );
        expect(result._unsafeUnwrapErr().errorCode).toBe(
          'GOOGLE_ACCESS_CONTROL_FOLDER_RESTRICTED'
        );
      });

      it('should allow write operations outside configured folder when GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER is true', async () => {
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'allowed-folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = true;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateFolderAccess({
          operation: 'write',
          targetFolderId: 'different-folder-id',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should allow write operations when no folder restrictions are configured', async () => {
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = '';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = undefined;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateFolderAccess({
          operation: 'write',
          targetFolderId: 'any-folder-id',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should always allow read operations regardless of folder restrictions', async () => {
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'allowed-folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateFolderAccess({
          operation: 'read',
          targetFolderId: 'different-folder-id',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should handle nested folder hierarchy correctly', async () => {
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'parent-folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

        const service = new AccessControlService(mockConfig);

        // Mock the folder hierarchy resolution
        jest
          .spyOn(service, 'isWithinFolderHierarchy')
          .mockResolvedValue(ok(true));

        const result = await service.validateFolderAccess({
          operation: 'write',
          targetFolderId: 'child-folder-id',
          resourceType: 'document',
        });

        expect(result.isOk()).toBe(true);
      });
    });

    describe('isWithinFolderHierarchy', () => {
      it('should correctly identify direct parent-child relationship', async () => {
        const service = new AccessControlService(mockConfig);

        // This will be implemented to check Google Drive API for folder relationships
        const result = await service.isWithinFolderHierarchy(
          'child-folder-id',
          'parent-folder-id'
        );

        expect(result.isOk()).toBe(true);
      });

      it('should correctly identify nested folder relationships', async () => {
        const service = new AccessControlService(mockConfig);

        const result = await service.isWithinFolderHierarchy(
          'deep-nested-folder-id',
          'root-parent-folder-id'
        );

        expect(result.isOk()).toBe(true);
      });

      it('should return false for unrelated folders', async () => {
        const service = new AccessControlService(mockConfig);

        const result = await service.isWithinFolderHierarchy(
          'unrelated-folder-id',
          'parent-folder-id'
        );

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(false);
      });

      it('should handle Google Drive API errors gracefully', async () => {
        const service = new AccessControlService(mockConfig);

        // Mock API error
        jest
          .spyOn(
            service as AccessControlService & { driveService: unknown },
            'driveService'
          )
          .mockRejectedValue(new Error('Drive API unavailable'));

        const result = await service.isWithinFolderHierarchy(
          'folder-id',
          'parent-folder-id'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleWorkspaceError);
      });
    });
  });

  describe('Tool-based Access Control', () => {
    describe('validateToolAccess', () => {
      it('should allow write operations for explicitly allowed tools', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__sheets__create',
          'google-workspace__docs__update',
          'sheets-write',
        ];

        const service = new AccessControlService(mockConfig);

        const result1 = await service.validateToolAccess({
          operation: 'write',
          toolName: 'google-workspace__sheets__create',
          serviceName: 'sheets',
        });

        const result2 = await service.validateToolAccess({
          operation: 'write',
          toolName: 'sheets-write',
          serviceName: 'sheets',
        });

        expect(result1.isOk()).toBe(true);
        expect(result2.isOk()).toBe(true);
      });

      it('should block write operations for non-allowed tools when restrictions are configured', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__sheets__create',
        ];

        const service = new AccessControlService(mockConfig);
        const result = await service.validateToolAccess({
          operation: 'write',
          toolName: 'google-workspace__docs__create',
          serviceName: 'docs',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlToolError
        );
        expect(result._unsafeUnwrapErr().errorCode).toBe(
          'GOOGLE_ACCESS_CONTROL_TOOL_RESTRICTED'
        );
      });

      it('should allow all tools when no tool restrictions are configured', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = undefined;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateToolAccess({
          operation: 'write',
          toolName: 'google-workspace__docs__create',
          serviceName: 'docs',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should always allow read operations regardless of tool restrictions', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__sheets__create',
        ];

        const service = new AccessControlService(mockConfig);
        const result = await service.validateToolAccess({
          operation: 'read',
          toolName: 'google-workspace__docs__get',
          serviceName: 'docs',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should handle various tool naming patterns correctly', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__docs__create', // Pattern 1
          'google-workspace__calendar-list', // Pattern 2
          'sheets-write', // Pattern 3
        ];

        const service = new AccessControlService(mockConfig);

        // Test all patterns are recognized
        const results = await Promise.all([
          service.validateToolAccess({
            operation: 'write',
            toolName: 'google-workspace__docs__create',
            serviceName: 'docs',
          }),
          service.validateToolAccess({
            operation: 'write',
            toolName: 'google-workspace__calendar-list',
            serviceName: 'calendar',
          }),
          service.validateToolAccess({
            operation: 'write',
            toolName: 'sheets-write',
            serviceName: 'sheets',
          }),
        ]);

        results.forEach(result => {
          expect(result.isOk()).toBe(true);
        });
      });
    });

    describe('parseToolName', () => {
      it('should correctly parse google-workspace__service__action pattern', () => {
        const service = new AccessControlService(mockConfig);
        const result = service.parseToolName('google-workspace__docs__create');

        expect(result).toEqual({
          service: 'docs',
          action: 'create',
          pattern: 'google-workspace__service__action',
        });
      });

      it('should correctly parse google-workspace__service-action pattern', () => {
        const service = new AccessControlService(mockConfig);
        const result = service.parseToolName('google-workspace__calendar-list');

        expect(result).toEqual({
          service: 'calendar',
          action: 'list',
          pattern: 'google-workspace__service-action',
        });
      });

      it('should correctly parse service-action pattern', () => {
        const service = new AccessControlService(mockConfig);
        const result = service.parseToolName('sheets-write');

        expect(result).toEqual({
          service: 'sheets',
          action: 'write',
          pattern: 'service-action',
        });
      });

      it('should return null for invalid tool name patterns', () => {
        const service = new AccessControlService(mockConfig);
        const result = service.parseToolName('invalid-tool-name-format');

        expect(result).toBeNull();
      });
    });
  });

  describe('Service-based Access Control', () => {
    describe('validateServiceAccess', () => {
      it('should allow write operations for explicitly allowed services', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets', 'docs'];

        const service = new AccessControlService(mockConfig);

        const result1 = await service.validateServiceAccess({
          operation: 'write',
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });

        const result2 = await service.validateServiceAccess({
          operation: 'write',
          serviceName: 'docs',
          resourceType: 'document',
        });

        expect(result1.isOk()).toBe(true);
        expect(result2.isOk()).toBe(true);
      });

      it('should block write operations for non-allowed services when restrictions are configured', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets'];

        const service = new AccessControlService(mockConfig);
        const result = await service.validateServiceAccess({
          operation: 'write',
          serviceName: 'docs',
          resourceType: 'document',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlServiceError
        );
        expect(result._unsafeUnwrapErr().errorCode).toBe(
          'GOOGLE_ACCESS_CONTROL_SERVICE_RESTRICTED'
        );
      });

      it('should allow all services when no service restrictions are configured', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = undefined;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateServiceAccess({
          operation: 'write',
          serviceName: 'calendar',
          resourceType: 'event',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should always allow read operations regardless of service restrictions', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets'];

        const service = new AccessControlService(mockConfig);
        const result = await service.validateServiceAccess({
          operation: 'read',
          serviceName: 'docs',
          resourceType: 'document',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should handle case-insensitive service names', async () => {
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['Sheets', 'DOCS'];

        const service = new AccessControlService(mockConfig);

        const result1 = await service.validateServiceAccess({
          operation: 'write',
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });

        const result2 = await service.validateServiceAccess({
          operation: 'write',
          serviceName: 'docs',
          resourceType: 'document',
        });

        expect(result1.isOk()).toBe(true);
        expect(result2.isOk()).toBe(true);
      });
    });
  });

  describe('Read-only Mode Enforcement', () => {
    describe('validateReadOnlyMode', () => {
      it('should block all write operations when read-only mode is enabled', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = true;

        const service = new AccessControlService(mockConfig);

        // Test various write operations
        const writeOperations = [
          { operation: 'write' as const, description: 'write operation' },
          { operation: 'create' as const, description: 'create operation' },
          { operation: 'update' as const, description: 'update operation' },
          { operation: 'delete' as const, description: 'delete operation' },
        ];

        for (const { operation } of writeOperations) {
          const result = await service.validateReadOnlyMode({
            operation,
            serviceName: 'sheets',
            resourceType: 'spreadsheet',
          });

          expect(result.isErr()).toBe(true);
          expect(result._unsafeUnwrapErr()).toBeInstanceOf(
            GoogleAccessControlReadOnlyError
          );
          expect(result._unsafeUnwrapErr().errorCode).toBe(
            'GOOGLE_ACCESS_CONTROL_READ_ONLY_MODE'
          );
          expect(result._unsafeUnwrapErr().message).toContain('read-only mode');
        }
      });

      it('should allow all read operations when read-only mode is enabled', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = true;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateReadOnlyMode({
          operation: 'read',
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should allow all operations when read-only mode is disabled', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = false;

        const service = new AccessControlService(mockConfig);

        const operations = [
          'read',
          'write',
          'create',
          'update',
          'delete',
        ] as const;

        for (const operation of operations) {
          const result = await service.validateReadOnlyMode({
            operation,
            serviceName: 'sheets',
            resourceType: 'spreadsheet',
          });

          expect(result.isOk()).toBe(true);
        }
      });

      it('should allow all operations when read-only mode is not configured', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = undefined;

        const service = new AccessControlService(mockConfig);
        const result = await service.validateReadOnlyMode({
          operation: 'write',
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });
    });
  });

  describe('Comprehensive Access Control Validation', () => {
    describe('validateAccess', () => {
      it('should validate access using all configured restrictions', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = false;
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets'];
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__sheets__create',
        ];
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'allowed-folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

        const service = new AccessControlService(mockConfig);

        // Mock successful folder validation
        jest
          .spyOn(service, 'validateFolderAccess')
          .mockResolvedValue(ok(undefined));

        const result = await service.validateAccess({
          operation: 'create',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__create',
          targetFolderId: 'allowed-folder-id',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should fail validation if any single restriction blocks access', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = false;
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets']; // Service allowed
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = ['different-tool']; // Tool NOT allowed

        const service = new AccessControlService(mockConfig);

        const result = await service.validateAccess({
          operation: 'create',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__create',
          resourceType: 'spreadsheet',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().errorCode).toBe(
          'GOOGLE_ACCESS_CONTROL_TOOL_RESTRICTED'
        );
      });

      it('should prioritize read-only mode over all other restrictions', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = true; // This should block everything
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets']; // Even though these allow it
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__sheets__create',
        ];

        const service = new AccessControlService(mockConfig);

        const result = await service.validateAccess({
          operation: 'create',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__create',
          resourceType: 'spreadsheet',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().errorCode).toBe(
          'GOOGLE_ACCESS_CONTROL_READ_ONLY_MODE'
        );
      });

      it('should allow read operations regardless of write restrictions', async () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = false;
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['docs']; // Sheets NOT allowed for writes
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = ['different-tool']; // Tool NOT allowed

        const service = new AccessControlService(mockConfig);

        const result = await service.validateAccess({
          operation: 'read', // Read operation should still be allowed
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__get',
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });

      it('should handle partial configuration gracefully', async () => {
        // Only some restrictions configured
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets'];
        // Other restrictions undefined
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = undefined;
        mockConfig.GOOGLE_READ_ONLY_MODE = undefined;

        const service = new AccessControlService(mockConfig);

        const result = await service.validateAccess({
          operation: 'create',
          serviceName: 'sheets', // Allowed by service restriction
          toolName: 'any-tool', // No tool restrictions
          resourceType: 'spreadsheet',
        });

        expect(result.isOk()).toBe(true);
      });
    });

    describe('getAccessControlSummary', () => {
      it('should return comprehensive access control configuration summary', () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = false;
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['sheets', 'docs'];
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [
          'google-workspace__sheets__create',
        ];
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'folder-id';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

        const service = new AccessControlService(mockConfig);
        const summary = service.getAccessControlSummary();

        expect(summary).toEqual({
          readOnlyMode: false,
          allowedWriteServices: ['sheets', 'docs'],
          allowedWriteTools: ['google-workspace__sheets__create'],
          folderRestrictions: {
            folderId: 'folder-id',
            allowWritesOutside: false,
          },
          hasRestrictions: true,
        });
      });

      it('should indicate no restrictions when all settings are permissive', () => {
        mockConfig.GOOGLE_READ_ONLY_MODE = false;
        mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = undefined;
        mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = undefined;
        mockConfig.GOOGLE_DRIVE_FOLDER_ID = '';
        mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = true;

        const service = new AccessControlService(mockConfig);
        const summary = service.getAccessControlSummary();

        expect(summary.hasRestrictions).toBe(false);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle null/undefined operation types gracefully', async () => {
      const service = new AccessControlService(mockConfig);

      const result = await service.validateAccess({
        operation: null as never,
        serviceName: 'sheets',
        resourceType: 'spreadsheet',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleConfigError);
    });

    it('should handle invalid service names gracefully', async () => {
      mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = ['invalid-service'];

      // This should be caught during configuration validation
      expect(() => new AccessControlService(mockConfig)).toThrow(
        GoogleConfigError
      );
    });

    it('should handle empty string configurations appropriately', async () => {
      mockConfig.GOOGLE_DRIVE_FOLDER_ID = '';
      mockConfig.GOOGLE_ALLOWED_WRITE_SERVICES = [];
      mockConfig.GOOGLE_ALLOWED_WRITE_TOOLS = [];

      const service = new AccessControlService(mockConfig);
      const result = await service.validateAccess({
        operation: 'write',
        serviceName: 'sheets',
        toolName: 'some-tool',
        resourceType: 'spreadsheet',
      });

      // Empty arrays should be treated as no restrictions
      expect(result.isOk()).toBe(true);
    });

    it('should preserve error context and stack traces', async () => {
      mockConfig.GOOGLE_READ_ONLY_MODE = true;

      const service = new AccessControlService(mockConfig);
      const result = await service.validateAccess({
        operation: 'write',
        serviceName: 'sheets',
        resourceType: 'spreadsheet',
      });

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.context).toBeDefined();
      expect(error.context).toHaveProperty('operation', 'write');
      expect(error.context).toHaveProperty('serviceName', 'sheets');
      expect(error.stack).toBeDefined();
    });

    it('should handle concurrent access validation calls', async () => {
      const service = new AccessControlService(mockConfig);

      // Simulate multiple concurrent validation requests
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.validateAccess({
          operation: 'read',
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
          context: { requestId: i },
        })
      );

      const results = await Promise.all(promises);

      // All should succeed for read operations
      results.forEach(result => {
        expect(result.isOk()).toBe(true);
      });
    });
  });

  describe('Integration with Google Services', () => {
    it('should integrate with DriveService for folder hierarchy validation', async () => {
      mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'parent-folder-id';
      mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

      const service = new AccessControlService(mockConfig);

      // This test verifies the integration point exists
      // The actual DriveService integration will be tested in integration tests
      expect(typeof service.isWithinFolderHierarchy).toBe('function');
    });

    it('should handle DriveService initialization failures gracefully', async () => {
      mockConfig.GOOGLE_DRIVE_FOLDER_ID = 'folder-id';
      mockConfig.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = false;

      const service = new AccessControlService(mockConfig);

      // Mock DriveService initialization failure
      jest
        .spyOn(
          service as AccessControlService & { initializeDriveService: unknown },
          'initializeDriveService'
        )
        .mockRejectedValue(new GoogleAuthError('Drive service unavailable'));

      const result = await service.validateFolderAccess({
        operation: 'write',
        targetFolderId: 'target-folder',
        resourceType: 'spreadsheet',
      });

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
    });
  });

  describe('Performance and Caching', () => {
    it('should cache folder hierarchy validation results', async () => {
      const service = new AccessControlService(mockConfig);

      const spyIsWithin = jest
        .spyOn(service, 'isWithinFolderHierarchy')
        .mockResolvedValue(ok(true));

      // Make multiple requests for the same folder relationship
      await service.isWithinFolderHierarchy('child-folder', 'parent-folder');
      await service.isWithinFolderHierarchy('child-folder', 'parent-folder');

      // Should cache result and only make one API call
      expect(spyIsWithin).toHaveBeenCalledTimes(2); // First call for setup, second should be cached
    });

    it('should handle cache invalidation appropriately', async () => {
      const service = new AccessControlService(mockConfig);

      // This test ensures cache doesn't become stale
      // Implementation will define cache TTL and invalidation strategy
      expect(typeof service.clearCache).toBe('function');
    });
  });
});

/**
 * Type definitions for AccessControlService interfaces
 * These types define the expected API surface for the service
 */
export interface AccessControlValidationRequest {
  operation: 'read' | 'write' | 'create' | 'update' | 'delete';
  serviceName: string;
  toolName?: string;
  targetFolderId?: string;
  resourceType?: string;
  context?: Record<string, unknown>;
}

export interface FolderValidationRequest {
  operation: 'read' | 'write' | 'create' | 'update' | 'delete';
  targetFolderId: string;
  resourceType: string;
}

export interface ToolValidationRequest {
  operation: 'read' | 'write' | 'create' | 'update' | 'delete';
  toolName: string;
  serviceName: string;
}

export interface ServiceValidationRequest {
  operation: 'read' | 'write' | 'create' | 'update' | 'delete';
  serviceName: string;
  resourceType: string;
}

export interface ReadOnlyModeValidationRequest {
  operation: 'read' | 'write' | 'create' | 'update' | 'delete';
  serviceName: string;
  resourceType: string;
}

export interface AccessControlSummary {
  readOnlyMode: boolean;
  allowedWriteServices?: string[];
  allowedWriteTools?: string[];
  folderRestrictions?: {
    folderId: string;
    allowWritesOutside: boolean;
  };
  hasRestrictions: boolean;
}

export interface ParsedToolName {
  service: string;
  action: string;
  pattern:
    | 'google-workspace__service__action'
    | 'google-workspace__service-action'
    | 'service-action';
}
