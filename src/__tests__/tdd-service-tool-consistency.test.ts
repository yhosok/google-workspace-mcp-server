import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { ok } from 'neverthrow';

import { AuthService } from '../../src/services/auth.service.js';
import { DriveService } from '../../src/services/drive.service.js';
import { ListFilesTool } from '../../src/tools/drive/list-files.tool.js';
import { createServiceLogger } from '../../src/utils/logger.js';

// Mock the dependencies
jest.mock('../../src/services/auth.service');
jest.mock('../../src/utils/logger');
jest.mock('googleapis');

// Create typed mocks
const mockGoogle = google as jest.Mocked<typeof google>;

/**
 * TDD Red Phase Tests - Service-Tool Layer Consistency
 *
 * These tests capture the inconsistency between DriveService.listFiles() and ListFilesTool
 * regarding the handling of trashed files filtering.
 *
 * Current Issue:
 * - DriveService.listFiles() documentation claims it includes "trashed = false filtering"
 * - But the actual implementation passes queries directly without adding default filtering
 * - ListFilesTool uses DriveQueryBuilder which automatically adds "trashed = false"
 * - This creates inconsistent behavior between service layer and tool layer
 *
 * These tests are designed to FAIL with the current implementation and PASS once fixed.
 */
describe('TDD Red Phase: Service-Tool Layer Consistency', () => {
  let driveService: DriveService;
  let listFilesTool: ListFilesTool;
  let mockAuthService: jest.Mocked<AuthService>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLogger: any;
  let mockOAuth2Client: jest.Mocked<OAuth2Client>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDriveApi: any;

  beforeEach(() => {
    // Setup mocks
    mockAuthService = {
      getAuthClient: jest.fn(),
      validateAuth: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockOAuth2Client = new OAuth2Client() as jest.Mocked<OAuth2Client>;

    // Mock Drive API
    mockDriveApi = {
      files: {
        create: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
        export: jest.fn(),
      },
    };

    // Setup mock returns
    (createServiceLogger as jest.Mock).mockReturnValue(mockLogger);
    mockAuthService.getAuthClient.mockResolvedValue(ok(mockOAuth2Client));
    mockAuthService.validateAuth.mockResolvedValue(ok(true));

    // Create service and tool instances
    driveService = new DriveService(mockAuthService, mockLogger);
    listFilesTool = new ListFilesTool(
      driveService,
      mockAuthService,
      mockLogger
    );

    // Setup Google API mock
    mockGoogle.drive.mockReturnValue(mockDriveApi);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * TEST 1: Service-Tool Query Consistency
   *
   * This test verifies that both DriveService.listFiles() and ListFilesTool
   * produce equivalent queries for the same input parameters.
   *
   * EXPECTED TO FAIL: Currently DriveService doesn't add default trashed filtering
   * while ListFilesTool does via DriveQueryBuilder.
   */
  describe('Service-Tool Query Consistency', () => {
    test('should produce consistent queries for basic search between service and tool', async () => {
      const mockResponse = {
        data: {
          files: [
            {
              id: 'file1',
              name: 'Test Document',
              mimeType: 'application/vnd.google-apps.document',
              createdTime: '2024-01-01T12:00:00.000Z',
              modifiedTime: '2024-01-01T12:00:00.000Z',
              webViewLink: 'https://docs.google.com/document/d/file1',
              parents: ['root'],
            },
          ],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService.listFiles() with basic search
      const searchQuery = "name contains 'Test'";
      await driveService.listFiles({
        query: searchQuery,
      });

      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];
      const serviceQuery = serviceCall.q;

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool with same parameters
      await listFilesTool.executeImpl({
        query: searchQuery,
      });

      const toolCall = mockDriveApi.files.list.mock.calls[0][0];
      const toolQuery = toolCall.q;

      // ASSERTION THAT SHOULD FAIL:
      // Service and tool should produce the same query for equivalent inputs
      expect(serviceQuery).toBe(toolQuery);

      // Additional assertions to show what we expect
      expect(toolQuery).toContain('trashed = false');
      expect(serviceQuery).toContain('trashed = false'); // This will FAIL
    });

    test('should produce consistent queries for folder-specific search between service and tool', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      const searchQuery = "mimeType = 'application/pdf'";
      const folderId = 'folder123';

      // Test DriveService.listFiles()
      await driveService.listFiles({
        query: searchQuery,
      });

      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];
      const serviceQuery = serviceCall.q;

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool with folder filtering
      await listFilesTool.executeImpl({
        query: searchQuery,
        folderId: folderId,
      });

      const toolCall = mockDriveApi.files.list.mock.calls[0][0];
      const toolQuery = toolCall.q;

      // ASSERTION THAT SHOULD FAIL:
      // The queries should have consistent trashed filtering
      const serviceHasTrashedFilter = /trashed\s*=\s*false/.test(
        serviceQuery || ''
      );
      const toolHasTrashedFilter = /trashed\s*=\s*false/.test(toolQuery || '');

      expect(serviceHasTrashedFilter).toBe(toolHasTrashedFilter);
      expect(serviceHasTrashedFilter).toBe(true); // This will FAIL for service
    });
  });

  /**
   * TEST 2: Documentation Accuracy
   *
   * This test verifies that DriveService.listFiles() behavior matches its JSDoc documentation.
   * The documentation claims it includes "trashed = false filtering" but the implementation doesn't.
   *
   * EXPECTED TO FAIL: Documentation is inaccurate about current behavior.
   */
  describe('Documentation Accuracy', () => {
    test('DriveService.listFiles should add trashed=false filtering as documented', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Call with empty query - documentation says it includes trashed = false filtering
      await driveService.listFiles({});

      const apiCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTION THAT SHOULD FAIL:
      // Documentation says "includes trashed = false filtering" but implementation doesn't
      expect(apiCall.q).toContain('trashed = false');
    });

    test('DriveService.listFiles should add trashed=false to custom queries as documented', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Call with custom query - should still add trashed filtering as documented
      const customQuery = "mimeType = 'application/vnd.google-apps.document'";
      await driveService.listFiles({
        query: customQuery,
      });

      const apiCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTION THAT SHOULD PASS (Green Phase):
      // Should include both custom query AND default trashed filtering
      expect(apiCall.q).toContain('trashed = false');
      expect(apiCall.q).toContain(customQuery);
      expect(apiCall.q).toBe(`trashed = false and ${customQuery}`);
    });
  });

  /**
   * TEST 3: Default Behavior Consistency
   *
   * This test verifies that the default behavior for both service and tool
   * excludes trashed files, which is the expected user experience.
   *
   * EXPECTED TO FAIL: Service doesn't have default trashed filtering.
   */
  describe('Default Behavior Consistency', () => {
    test('both service and tool should exclude trashed files by default', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService with no parameters
      await driveService.listFiles();

      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool with no parameters
      await listFilesTool.executeImpl({});

      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTION THAT SHOULD FAIL:
      // Both should exclude trashed files by default
      const serviceExcludesTrashed =
        !serviceCall.q || serviceCall.q.includes('trashed = false');
      const toolExcludesTrashed =
        !toolCall.q || toolCall.q.includes('trashed = false');

      expect(serviceExcludesTrashed).toBe(true); // This will FAIL
      expect(toolExcludesTrashed).toBe(true);
      expect(serviceExcludesTrashed).toBe(toolExcludesTrashed); // This will FAIL
    });

    test('should allow including trashed files when explicitly requested', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test ListFilesTool with includeTrashed=true
      await listFilesTool.executeImpl({
        includeTrashed: true,
      });

      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // Should NOT contain trashed = false when includeTrashed is true
      const hasTrashedFilter = Boolean(
        toolCall.q && toolCall.q.includes('trashed = false')
      );
      expect(hasTrashedFilter).toBe(false);
    });
  });

  /**
   * TEST 4: Query Building Logic Consistency
   *
   * This test verifies that both service and tool handle query building
   * in a consistent manner when combining multiple parameters.
   *
   * EXPECTED TO FAIL: Service doesn't properly combine filters.
   */
  describe('Query Building Logic Consistency', () => {
    test('should handle query parameter combination consistently', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      const testQuery = "name contains 'report'";

      // Test ListFilesTool with structured filters
      await listFilesTool.executeImpl({
        query: testQuery,
        filters: {
          mimeType: 'application/pdf',
          trashed: false,
        },
      });

      const toolCall = mockDriveApi.files.list.mock.calls[0][0];
      const toolQuery = toolCall.q;

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test DriveService with equivalent query
      const equivalentQuery = `${testQuery} and mimeType = 'application/pdf' and trashed = false`;
      await driveService.listFiles({
        query: equivalentQuery,
      });

      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];
      const serviceQuery = serviceCall.q;

      // ASSERTION THAT SHOULD PASS once we fix the issue:
      // Both queries should be functionally equivalent
      expect(toolQuery).toContain(testQuery);
      expect(toolQuery).toContain("mimeType = 'application/pdf'");
      expect(toolQuery).toContain('trashed = false');

      expect(serviceQuery).toBe(equivalentQuery);

      // The queries should be functionally equivalent
      // (order might differ but content should be the same)
      const normalizedToolQuery = toolQuery.split(' and ').sort().join(' and ');
      const normalizedServiceQuery = serviceQuery
        .split(' and ')
        .sort()
        .join(' and ');
      expect(normalizedToolQuery).toBe(normalizedServiceQuery); // This should eventually PASS
    });
  });

  /**
   * TEST 5: Error Handling Consistency
   *
   * This test verifies that both service and tool handle edge cases
   * and invalid queries consistently.
   */
  describe('Error Handling Consistency', () => {
    test('should handle invalid query syntax consistently', async () => {
      const invalidQuery = 'invalid query syntax';

      // Test DriveService with invalid query
      const serviceResult = await driveService.listFiles({
        query: invalidQuery,
      });

      // Test ListFilesTool with invalid query
      const toolResult = await listFilesTool.executeImpl({
        query: invalidQuery,
      });

      // Both should handle invalid queries similarly
      // (Either both succeed with Google API validation, or both fail consistently)
      const serviceFailed = serviceResult.isErr();
      const toolFailed = toolResult.isErr();

      // For now, just verify they behave consistently
      expect(serviceFailed).toBe(toolFailed);
    });
  });
});
