import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { ok } from 'neverthrow';

import { AuthService } from '../services/auth.service.js';
import { DriveService } from '../services/drive.service.js';
import { ListFilesTool } from '../tools/drive/list-files.tool.js';
import { createServiceLogger } from '../utils/logger.js';

// Mock the dependencies
jest.mock('../services/auth.service');
jest.mock('../utils/logger');
jest.mock('googleapis');

// Create typed mocks
const mockGoogle = google as jest.Mocked<typeof google>;

/**
 * TDD Red Phase Tests - Integration Layer Consistency
 *
 * These tests validate that the integration between different layers
 * (Service, Tool, QueryBuilder) produces consistent behavior.
 *
 * Focus Areas:
 * 1. Query consistency between service and tool layers
 * 2. Parameter mapping consistency
 * 3. Default behavior alignment
 * 4. Error handling consistency
 *
 * These tests are designed to FAIL with the current implementation and PASS once fixed.
 */
describe('TDD Red Phase: Integration Layer Consistency', () => {
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
   * TEST 1: End-to-End Query Consistency
   *
   * Validates that equivalent operations through different entry points
   * produce the same Google Drive API calls.
   */
  describe('End-to-End Query Consistency', () => {
    test('empty parameters should produce equivalent API calls', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test 1: DriveService.listFiles() with no parameters
      await driveService.listFiles();
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test 2: ListFilesTool with no parameters
      await listFilesTool.executeImpl({});
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // CRITICAL ASSERTION THAT WILL FAIL:
      // Both should produce equivalent queries for trashed files
      if (serviceCall.q || toolCall.q) {
        expect(serviceCall.q || '').toBe(toolCall.q || '');
      }

      // More specific assertions
      const serviceExcludesTrashed =
        !serviceCall.q || serviceCall.q.includes('trashed = false');
      const toolExcludesTrashed =
        !toolCall.q || toolCall.q.includes('trashed = false');
      expect(serviceExcludesTrashed).toBe(toolExcludesTrashed);
    });

    test('basic search parameters should produce equivalent API calls', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      const searchTerm = "name contains 'report'";

      // Test 1: DriveService.listFiles() with query
      await driveService.listFiles({
        query: searchTerm,
        pageSize: 50,
        orderBy: 'name',
      });
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test 2: ListFilesTool with equivalent parameters
      await listFilesTool.executeImpl({
        query: searchTerm,
        maxResults: 50,
        orderBy: 'name',
      });
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTIONS THAT SHOULD PASS FOR CONSISTENCY:
      expect(serviceCall.pageSize).toBe(toolCall.pageSize);
      expect(serviceCall.orderBy).toBe(toolCall.orderBy);

      // CRITICAL ASSERTION THAT WILL FAIL:
      // Query handling should be consistent
      expect(serviceCall.q).toBe(toolCall.q);
    });

    test('complex search scenarios should produce equivalent API calls', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Complex scenario: custom query + folder + pagination
      const customQuery = "mimeType = 'application/pdf'";
      const folderId = 'folder123';

      // Test 1: DriveService - would need to manually construct full query
      const fullQuery = `${customQuery} and '${folderId}' in parents`;
      await driveService.listFiles({
        query: fullQuery,
        pageSize: 25,
        pageToken: 'token123',
      });
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test 2: ListFilesTool - uses structured parameters
      await listFilesTool.executeImpl({
        query: customQuery,
        folderId: folderId,
        maxResults: 25,
        pageToken: 'token123',
      });
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTIONS FOR CONSISTENCY:
      expect(serviceCall.pageSize).toBe(toolCall.pageSize);
      expect(serviceCall.pageToken).toBe(toolCall.pageToken);

      // CRITICAL ASSERTION THAT WILL FAIL:
      // Tool should add trashed=false but service won't
      const serviceQuery = serviceCall.q || '';
      const toolQuery = toolCall.q || '';

      // Both should contain the same core query logic
      expect(serviceQuery).toContain(customQuery);
      expect(toolQuery).toContain(customQuery);
      expect(serviceQuery).toContain(`'${folderId}' in parents`);
      expect(toolQuery).toContain(`'${folderId}' in parents`);

      // Both should handle trashed files consistently
      const serviceHasTrashed = serviceQuery.includes('trashed = false');
      const toolHasTrashed = toolQuery.includes('trashed = false');
      expect(serviceHasTrashed).toBe(toolHasTrashed); // THIS WILL FAIL
    });
  });

  /**
   * TEST 2: Parameter Mapping Consistency
   *
   * Validates that parameter naming and transformation is consistent.
   */
  describe('Parameter Mapping Consistency', () => {
    test('pagination parameters should be mapped consistently', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService direct parameters
      await driveService.listFiles({
        pageSize: 75,
        pageToken: 'test-token',
        orderBy: 'modifiedTime desc',
      });
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool mapped parameters
      await listFilesTool.executeImpl({
        maxResults: 75, // Should map to pageSize
        pageToken: 'test-token',
        orderBy: 'modifiedTime desc',
      });
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTIONS THAT SHOULD PASS:
      expect(serviceCall.pageSize).toBe(toolCall.pageSize);
      expect(serviceCall.pageToken).toBe(toolCall.pageToken);
      expect(serviceCall.orderBy).toBe(toolCall.orderBy);
    });

    test('field selection should be consistent', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService default fields
      await driveService.listFiles();
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool default fields
      await listFilesTool.executeImpl({});
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTION THAT SHOULD PASS:
      // Both should request the same fields from the API
      expect(serviceCall.fields).toBe(toolCall.fields);
    });
  });

  /**
   * TEST 3: Default Behavior Alignment
   *
   * Validates that default behaviors are aligned across layers.
   */
  describe('Default Behavior Alignment', () => {
    test('shared drive support should be consistent', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService shared drive support
      await driveService.listFiles();
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool shared drive support
      await listFilesTool.executeImpl({});
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTIONS THAT SHOULD PASS:
      expect(serviceCall.supportsAllDrives).toBe(toolCall.supportsAllDrives);
      expect(serviceCall.includeItemsFromAllDrives).toBe(
        toolCall.includeItemsFromAllDrives
      );
    });

    test('default page size should be consistent', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService default page size
      await driveService.listFiles();
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool default page size
      await listFilesTool.executeImpl({});
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTION THAT SHOULD PASS:
      expect(serviceCall.pageSize).toBe(toolCall.pageSize);
    });

    test('default sort order should be consistent', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService default order
      await driveService.listFiles();
      const serviceCall = mockDriveApi.files.list.mock.calls[0][0];

      // Reset mocks
      mockDriveApi.files.list.mockClear();

      // Test ListFilesTool default order
      await listFilesTool.executeImpl({});
      const toolCall = mockDriveApi.files.list.mock.calls[0][0];

      // ASSERTION THAT SHOULD PASS:
      expect(serviceCall.orderBy).toBe(toolCall.orderBy);
    });
  });

  /**
   * TEST 4: Error Handling Consistency
   *
   * Validates that error handling is consistent across layers.
   */
  describe('Error Handling Consistency', () => {
    test('invalid parameters should be handled consistently', async () => {
      await driveService.initialize();

      // Test DriveService with invalid pageSize
      const serviceResult = await driveService.listFiles({
        pageSize: -1, // Invalid
      });

      // Test ListFilesTool with invalid maxResults
      const toolResult = await listFilesTool.executeImpl({
        maxResults: -1, // Invalid
      });

      // ASSERTION THAT SHOULD PASS:
      // Both should handle invalid parameters consistently
      const serviceFailed = serviceResult.isErr();
      const toolFailed = toolResult.isErr();
      expect(serviceFailed).toBe(toolFailed);

      if (serviceFailed && toolFailed) {
        // Error types should be similar
        expect(serviceResult.error.errorCode).toBe(toolResult.error.errorCode);
      }
    });

    test('service unavailable scenarios should be handled consistently', async () => {
      // Don't initialize the service

      // Test DriveService without initialization
      const serviceResult = await driveService.listFiles();

      // Test ListFilesTool with uninitialized service
      const toolResult = await listFilesTool.executeImpl({});

      // ASSERTION THAT SHOULD PASS:
      // Both should fail consistently when service is not initialized
      expect(serviceResult.isErr()).toBe(true);
      expect(toolResult.isErr()).toBe(true);
    });
  });

  /**
   * TEST 5: Response Format Consistency
   *
   * Validates that response handling and transformation is consistent.
   */
  describe('Response Format Consistency', () => {
    test('response transformation should preserve data consistency', async () => {
      const mockFiles = [
        {
          id: 'file1',
          name: 'Test Document.docx',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2024-01-01T10:00:00Z',
          modifiedTime: '2024-01-01T10:30:00Z',
          webViewLink: 'https://docs.google.com/document/d/file1',
          parents: ['folder123'],
          size: '12345',
        },
        {
          id: 'file2',
          name: 'Test Spreadsheet.xlsx',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          createdTime: '2024-01-02T10:00:00Z',
          modifiedTime: '2024-01-02T10:30:00Z',
          webViewLink: 'https://docs.google.com/spreadsheets/d/file2',
          parents: ['folder123'],
          size: '67890',
        },
      ];

      const mockResponse = {
        data: {
          files: mockFiles,
          nextPageToken: 'next-token',
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);
      await driveService.initialize();

      // Test DriveService response
      const serviceResult = await driveService.listFiles();

      // Reset mocks
      mockDriveApi.files.list.mockClear();
      mockDriveApi.files.list.mockResolvedValue(mockResponse);

      // Test ListFilesTool response
      const toolResult = await listFilesTool.executeImpl({});

      // ASSERTIONS THAT SHOULD PASS:
      expect(serviceResult.isOk()).toBe(true);
      expect(toolResult.isOk()).toBe(true);

      if (serviceResult.isOk() && toolResult.isOk()) {
        const serviceData = serviceResult.value;
        const toolData = JSON.parse(toolResult.value.content[0].text || '{}');

        // File count should match
        expect(serviceData.files.length).toBe(toolData.files.length);

        // File data should be equivalent
        for (let i = 0; i < serviceData.files.length; i++) {
          const serviceFile = serviceData.files[i];
          const toolFile = toolData.files[i];

          expect(serviceFile.id).toBe(toolFile.id);
          expect(serviceFile.name).toBe(toolFile.name);
          expect(serviceFile.mimeType).toBe(toolFile.mimeType);
        }

        // Pagination info should match
        expect(serviceData.nextPageToken).toBe(toolData.nextPageToken);
      }
    });
  });
});
