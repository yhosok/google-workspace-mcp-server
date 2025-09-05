import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { err, ok } from 'neverthrow';

import { AuthService } from './auth.service.js';
import { DriveService } from './drive.service.js';
import {
  GoogleAuthError,
  GoogleDriveError,
  GoogleWorkspaceResult,
} from '../errors/index.js';
import { DriveFileContentOptions } from '../types/index.js';
import { createServiceLogger } from '../utils/logger.js';
import { GoogleServiceRetryConfig } from './base/google-service.js';

// Mock the dependencies
jest.mock('./auth.service');
jest.mock('../utils/logger');
jest.mock('googleapis');

// Create typed mocks
const mockGoogle = google as jest.Mocked<typeof google>;

describe('DriveService', () => {
  let driveService: DriveService;
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
    } as unknown as jest.Mocked<AuthService>;
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    mockOAuth2Client = new OAuth2Client() as jest.Mocked<OAuth2Client>;

    // Mock Drive API with flexible types
    mockDriveApi = {
      files: {
        create: jest.fn(),
        update: jest.fn(),
        list: jest.fn(),
        get: jest.fn(),
        export: jest.fn(),
      },
    };

    // Setup mock returns
    (createServiceLogger as jest.Mock).mockReturnValue(mockLogger);
    mockAuthService.getAuthClient.mockResolvedValue(ok(mockOAuth2Client));

    // Create service instance
    driveService = new DriveService(mockAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Service Structure', () => {
    test('should extend GoogleService properly', () => {
      expect(driveService).toBeDefined();
      expect(driveService).toHaveProperty('getServiceName');
      expect(driveService).toHaveProperty('getServiceVersion');
      expect(driveService).toHaveProperty('initialize');
      expect(driveService).toHaveProperty('healthCheck');
    });

    test('should return correct service name', () => {
      expect(driveService.getServiceName()).toBe('DriveService');
    });

    test('should return correct service version', () => {
      expect(driveService.getServiceVersion()).toBe('v3');
    });

    test('should accept custom logger and retry config in constructor', () => {
      const customLogger = createServiceLogger('custom-drive');
      const customRetryConfig: GoogleServiceRetryConfig = {
        maxAttempts: 5,
        baseDelay: 2000,
        initialDelayMs: 2000,
        maxDelay: 60000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitter: 0.1,
        jitterFactor: 0.1,
        retriableCodes: [429, 500, 502, 503, 504],
      };

      const customService = new DriveService(
        mockAuthService,
        customLogger,
        customRetryConfig
      );

      expect(customService.getServiceName()).toBe('DriveService');
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid auth', async () => {
      // Mock google.drive to return our mock API
      mockGoogle.drive.mockReturnValue(mockDriveApi);

      const result = await driveService.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(1);
      expect(mockGoogle.drive).toHaveBeenCalledWith({
        version: 'v3',
        auth: mockOAuth2Client,
      });
    });

    test('should handle auth service failure during initialization', async () => {
      const authError = new GoogleAuthError('Auth failed', 'service-account');
      mockAuthService.getAuthClient.mockResolvedValue(err(authError));

      const result = await driveService.initialize();

      expect(result.isErr()).toBe(true);
    });

    test('should prevent concurrent initialization attempts', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);

      // Start multiple initialization calls simultaneously
      const promises = [
        driveService.initialize(),
        driveService.initialize(),
        driveService.initialize(),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach((result: GoogleWorkspaceResult<void>) => {
        expect(result.isOk()).toBe(true);
      });

      // But auth service should only be called once
      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(1);
    });

    test('should allow re-initialization after failure', async () => {
      const authError = new GoogleAuthError('Auth failed', 'service-account');
      // First attempt fails
      mockAuthService.getAuthClient
        .mockResolvedValueOnce(err(authError))
        // Second attempt succeeds
        .mockResolvedValueOnce(ok(mockOAuth2Client));

      mockGoogle.drive.mockReturnValue(mockDriveApi);

      // First initialization should fail
      const result1 = await driveService.initialize();
      expect(result1.isErr()).toBe(true);

      // Second initialization should succeed
      const result2 = await driveService.initialize();
      expect(result2.isOk()).toBe(true);

      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('Health Check', () => {
    test('should pass health check when service is operational', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);

      // Initialize first
      await driveService.initialize();

      // Mock successful files.list call
      mockDriveApi.files.list.mockResolvedValue({
        data: { files: [] },
      });

      const result = await driveService.healthCheck();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
      expect(mockDriveApi.files.list).toHaveBeenCalledWith({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        pageSize: 1,
      });
    });

    test('should fail health check when API is not available', async () => {
      // Don't initialize the service
      const result = await driveService.healthCheck();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DRIVE_NOT_INITIALIZED');
      }
    });

    test('should fail health check when API call fails', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);

      // Initialize first
      await driveService.initialize();

      // Mock failed files.list call
      mockDriveApi.files.list.mockRejectedValue(new Error('API call failed'));

      const result = await driveService.healthCheck();

      expect(result.isErr()).toBe(true);
    });
  });

  describe('createSpreadsheet', () => {
    beforeEach(async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      await driveService.initialize();
    });

    test('should create spreadsheet in root folder when no parent provided', async () => {
      const mockResponse = {
        data: {
          id: 'new-spreadsheet-id',
          name: 'Test Spreadsheet',
          webViewLink:
            'https://docs.google.com/spreadsheets/d/new-spreadsheet-id',
          parents: ['root'],
          createdTime: '2024-01-01T12:00:00.000Z',
        },
      };

      mockDriveApi.files.create.mockResolvedValue(mockResponse);

      const result = await driveService.createSpreadsheet('Test Spreadsheet');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: 'new-spreadsheet-id',
          name: 'Test Spreadsheet',
          webViewLink:
            'https://docs.google.com/spreadsheets/d/new-spreadsheet-id',
          parents: ['root'],
          createdTime: '2024-01-01T12:00:00.000Z',
        });
      }

      expect(mockDriveApi.files.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'Test Spreadsheet',
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
        fields: 'id, name, webViewLink, parents, createdTime',
      });
    });

    test('should create spreadsheet in specific folder when parent provided', async () => {
      const mockResponse = {
        data: {
          id: 'new-spreadsheet-id',
          name: 'Test Spreadsheet',
          webViewLink:
            'https://docs.google.com/spreadsheets/d/new-spreadsheet-id',
          parents: ['target-folder-id'],
          createdTime: '2024-01-01T12:00:00.000Z',
        },
      };

      mockDriveApi.files.create.mockResolvedValue(mockResponse);

      const result = await driveService.createSpreadsheet(
        'Test Spreadsheet',
        'target-folder-id'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.parents).toEqual(['target-folder-id']);
      }

      expect(mockDriveApi.files.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'Test Spreadsheet',
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: ['target-folder-id'],
        },
        fields: 'id, name, webViewLink, parents, createdTime',
      });
    });

    test('should validate input parameters', async () => {
      // Empty title
      const result1 = await driveService.createSpreadsheet('');
      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('title cannot be empty');
      }

      // Null title
      const result2 = await driveService.createSpreadsheet(
        null as unknown as string
      );
      expect(result2.isErr()).toBe(true);

      // Undefined title
      const result3 = await driveService.createSpreadsheet(
        undefined as unknown as string
      );
      expect(result3.isErr()).toBe(true);

      // Whitespace-only title
      const result4 = await driveService.createSpreadsheet('   ');
      expect(result4.isErr()).toBe(true);
    });

    test('should handle API errors appropriately', async () => {
      mockDriveApi.files.create.mockRejectedValue(
        new Error('API Error: Insufficient permissions')
      );

      const result = await driveService.createSpreadsheet('Test Spreadsheet');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDriveError);
      }
    });

    test('should handle invalid folder ID', async () => {
      const error = new Error('File not found: invalid-folder-id') as Error & {
        status: number;
      };
      error.status = 404;
      mockDriveApi.files.create.mockRejectedValue(error);

      const result = await driveService.createSpreadsheet(
        'Test Spreadsheet',
        'invalid-folder-id'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(404);
      }
    });

    test('should require service initialization before use', async () => {
      const uninitializedService = new DriveService(mockAuthService);

      const result = await uninitializedService.createSpreadsheet('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DRIVE_NOT_INITIALIZED');
      }
    });
  });

  describe('createDocument', () => {
    beforeEach(async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      await driveService.initialize();
    });

    test('should create document in root folder when no parent provided', async () => {
      // This test will initially fail because createDocument method does not exist yet
      const mockResponse = {
        data: {
          id: 'new-document-id',
          name: 'Test Document',
          webViewLink: 'https://docs.google.com/document/d/new-document-id',
          parents: ['root'],
          createdTime: '2024-01-01T12:00:00.000Z',
        },
      };

      mockDriveApi.files.create.mockResolvedValue(mockResponse);

      const result = await driveService.createDocument('Test Document');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: 'new-document-id',
          name: 'Test Document',
          webViewLink: 'https://docs.google.com/document/d/new-document-id',
          parents: ['root'],
          createdTime: '2024-01-01T12:00:00.000Z',
        });
      }

      expect(mockDriveApi.files.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'Test Document',
          mimeType: 'application/vnd.google-apps.document',
        },
        fields: 'id, name, webViewLink, parents, createdTime',
      });
    });

    test('should create document in specific folder when parent provided', async () => {
      const mockResponse = {
        data: {
          id: 'new-document-id',
          name: 'Test Document',
          webViewLink: 'https://docs.google.com/document/d/new-document-id',
          parents: ['target-folder-id'],
          createdTime: '2024-01-01T12:00:00.000Z',
        },
      };

      mockDriveApi.files.create.mockResolvedValue(mockResponse);

      const result = await driveService.createDocument(
        'Test Document',
        'target-folder-id'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.parents).toEqual(['target-folder-id']);
      }

      expect(mockDriveApi.files.create).toHaveBeenCalledWith({
        requestBody: {
          name: 'Test Document',
          mimeType: 'application/vnd.google-apps.document',
          parents: ['target-folder-id'],
        },
        fields: 'id, name, webViewLink, parents, createdTime',
      });
    });

    test('should validate input parameters', async () => {
      // Empty title
      const result1 = await driveService.createDocument('');
      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('title cannot be empty');
      }

      // Null title
      const result2 = await driveService.createDocument(
        null as unknown as string
      );
      expect(result2.isErr()).toBe(true);

      // Undefined title
      const result3 = await driveService.createDocument(
        undefined as unknown as string
      );
      expect(result3.isErr()).toBe(true);

      // Whitespace-only title
      const result4 = await driveService.createDocument('   ');
      expect(result4.isErr()).toBe(true);
    });

    test('should require service initialization before use', async () => {
      const uninitializedService = new DriveService(mockAuthService);

      const result = await uninitializedService.createDocument('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DRIVE_NOT_INITIALIZED');
      }
    });
  });

  describe('Error Handling', () => {
    test('should convert generic errors to GoogleDriveError', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      await driveService.initialize();

      mockDriveApi.files.create.mockRejectedValue(new Error('Generic error'));

      const result = await driveService.createSpreadsheet('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDriveError);
        expect(result.error.message).toContain('Generic error');
      }
    });

    test('should preserve error context information', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      await driveService.initialize();

      const error = new Error('Rate limit exceeded') as Error & {
        status: number;
      };
      error.status = 429;
      mockDriveApi.files.create.mockRejectedValue(error);

      const result = await driveService.createSpreadsheet('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
      }
    });
  });

  describe('Service Statistics', () => {
    test('should return service statistics', async () => {
      const result = await driveService.getServiceStats();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveProperty('initialized');
        expect(result.value).toHaveProperty('apiVersions');
        expect(result.value.apiVersions.drive).toBe('v3');
      }
    });
  });

  describe('Integration Patterns', () => {
    test('should follow SheetsService concurrent initialization pattern', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);

      // Test fast path - already initialized
      await driveService.initialize();

      const startTime = Date.now();
      const result = await driveService.initialize();
      const duration = Date.now() - startTime;

      expect(result.isOk()).toBe(true);
      expect(duration).toBeLessThan(5); // Should be very fast (< 5ms)
    });

    test('should implement proper Drive API client creation', async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);

      await driveService.initialize();

      expect(mockGoogle.drive).toHaveBeenCalledWith({
        version: 'v3',
        auth: mockOAuth2Client,
      });
    });

    test('should follow authentication validation patterns', async () => {
      const authError = new GoogleAuthError(
        'Auth validation failed',
        'service-account'
      );
      mockAuthService.getAuthClient.mockResolvedValue(err(authError));

      const result = await driveService.initialize();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(401);
      }
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      await driveService.initialize();
    });

    test('should list files successfully with default parameters', async () => {
      const mockResponse = {
        data: {
          files: [
            {
              id: 'file1',
              name: 'Document 1',
              mimeType: 'application/vnd.google-apps.document',
              createdTime: '2024-01-01T12:00:00.000Z',
              modifiedTime: '2024-01-01T12:00:00.000Z',
              webViewLink: 'https://docs.google.com/document/d/file1',
              parents: ['root'],
              size: '1024',
            },
            {
              id: 'file2',
              name: 'Spreadsheet 1',
              mimeType: 'application/vnd.google-apps.spreadsheet',
              createdTime: '2024-01-02T12:00:00.000Z',
              modifiedTime: '2024-01-02T12:00:00.000Z',
              webViewLink: 'https://docs.google.com/spreadsheets/d/file2',
              parents: ['folder1'],
              size: '2048',
            },
          ],
          nextPageToken: 'next-page-token',
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);

      const result = await driveService.listFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.files).toHaveLength(2);
        expect(result.value.files[0].id).toBe('file1');
        expect(result.value.files[0].name).toBe('Document 1');
        expect(result.value.nextPageToken).toBe('next-page-token');
        expect(result.value.incompleteSearch).toBe(false);
      }

      expect(mockDriveApi.files.list).toHaveBeenCalledWith({
        pageSize: 100,
        fields:
          'files(id, name, mimeType, createdTime, modifiedTime, webViewLink, parents, size), nextPageToken, incompleteSearch',
        orderBy: 'modifiedTime desc',
      });
    });

    test('should list files with search query', async () => {
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
              size: '1024',
            },
          ],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);

      const result = await driveService.listFiles({
        query: "name contains 'Test'",
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.files).toHaveLength(1);
        expect(result.value.files[0].name).toBe('Test Document');
      }

      expect(mockDriveApi.files.list).toHaveBeenCalledWith({
        q: "name contains 'Test'",
        pageSize: 100,
        fields:
          'files(id, name, mimeType, createdTime, modifiedTime, webViewLink, parents, size), nextPageToken, incompleteSearch',
        orderBy: 'modifiedTime desc',
      });
    });

    test('should list files with custom page size and pagination', async () => {
      const mockResponse = {
        data: {
          files: [
            {
              id: 'file1',
              name: 'Document 1',
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

      const result = await driveService.listFiles({
        pageSize: 10,
        pageToken: 'existing-page-token',
      });

      expect(result.isOk()).toBe(true);
      expect(mockDriveApi.files.list).toHaveBeenCalledWith({
        pageSize: 10,
        pageToken: 'existing-page-token',
        fields:
          'files(id, name, mimeType, createdTime, modifiedTime, webViewLink, parents, size), nextPageToken, incompleteSearch',
        orderBy: 'modifiedTime desc',
      });
    });

    test('should handle empty results', async () => {
      const mockResponse = {
        data: {
          files: [],
          nextPageToken: undefined,
          incompleteSearch: false,
        },
      };

      mockDriveApi.files.list.mockResolvedValue(mockResponse);

      const result = await driveService.listFiles();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.files).toHaveLength(0);
        expect(result.value.nextPageToken).toBeUndefined();
      }
    });

    test('should handle 401 Unauthorized error', async () => {
      const error = new Error('Unauthorized') as Error & { status: number };
      error.status = 401;
      mockDriveApi.files.list.mockRejectedValue(error);

      const result = await driveService.listFiles();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDriveError);
        expect(result.error.statusCode).toBe(401);
        expect(result.error.message).toContain('Unauthorized');
      }
    });

    test('should handle 403 Forbidden error', async () => {
      const error = new Error('Insufficient permissions') as Error & {
        status: number;
      };
      error.status = 403;
      mockDriveApi.files.list.mockRejectedValue(error);

      const result = await driveService.listFiles();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
      }
    });

    test('should handle 429 Rate Limit error', async () => {
      const error = new Error('Rate limit exceeded') as Error & {
        status: number;
      };
      error.status = 429;
      mockDriveApi.files.list.mockRejectedValue(error);

      const result = await driveService.listFiles();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
      }
    });

    test('should handle 500 Internal Server Error', async () => {
      const error = new Error('Internal server error') as Error & {
        status: number;
      };
      error.status = 500;
      mockDriveApi.files.list.mockRejectedValue(error);

      const result = await driveService.listFiles();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
      }
    });

    test('should validate page size parameter', async () => {
      const result = await driveService.listFiles({ pageSize: 0 });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'pageSize must be between 1 and 1000'
        );
      }
    });

    test('should validate large page size parameter', async () => {
      const result = await driveService.listFiles({ pageSize: 1001 });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'pageSize must be between 1 and 1000'
        );
      }
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DriveService(mockAuthService);

      const result = await uninitializedService.listFiles();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DRIVE_NOT_INITIALIZED');
      }
    });
  });

  describe('getFile', () => {
    beforeEach(async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      mockDriveApi.files.get = jest.fn();
      await driveService.initialize();
    });

    test('should get file metadata successfully', async () => {
      const mockResponse = {
        data: {
          id: 'file123',
          name: 'Test Document',
          mimeType: 'application/vnd.google-apps.document',
          createdTime: '2024-01-01T12:00:00.000Z',
          modifiedTime: '2024-01-01T13:00:00.000Z',
          webViewLink: 'https://docs.google.com/document/d/file123',
          webContentLink:
            'https://docs.google.com/document/d/file123/export?format=pdf',
          parents: ['parent-folder-id'],
          size: '2048',
          version: '1',
          description: 'A test document',
          owners: [
            {
              displayName: 'John Doe',
              emailAddress: 'john.doe@example.com',
              me: true,
            },
          ],
          permissions: [
            {
              id: 'permission1',
              type: 'user',
              role: 'owner',
            },
          ],
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockResponse);

      const result = await driveService.getFile('file123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('file123');
        expect(result.value.name).toBe('Test Document');
        expect(result.value.mimeType).toBe(
          'application/vnd.google-apps.document'
        );
        expect(result.value.size).toBe('2048');
        expect(result.value.owners).toHaveLength(1);
        expect(result.value.owners![0].displayName).toBe('John Doe');
      }

      expect(mockDriveApi.files.get).toHaveBeenCalledWith({
        fileId: 'file123',
        fields:
          'id, name, mimeType, createdTime, modifiedTime, webViewLink, webContentLink, parents, size, version, description, owners, permissions',
      });
    });

    test('should get file with custom fields', async () => {
      const mockResponse = {
        data: {
          id: 'file123',
          name: 'Test Document',
          mimeType: 'application/vnd.google-apps.document',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockResponse);

      const result = await driveService.getFile('file123', {
        fields: 'id, name, mimeType',
      });

      expect(result.isOk()).toBe(true);
      expect(mockDriveApi.files.get).toHaveBeenCalledWith({
        fileId: 'file123',
        fields: 'id, name, mimeType',
      });
    });

    test('should handle 404 Not Found error', async () => {
      const error = new Error('File not found') as Error & { status: number };
      error.status = 404;
      mockDriveApi.files.get.mockRejectedValue(error);

      const result = await driveService.getFile('non-existent-file');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDriveError);
        expect(result.error.statusCode).toBe(404);
        expect(result.error.message).toContain('File not found');
      }
    });

    test('should handle 401 Unauthorized error', async () => {
      const error = new Error('Unauthorized') as Error & { status: number };
      error.status = 401;
      mockDriveApi.files.get.mockRejectedValue(error);

      const result = await driveService.getFile('file123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(401);
      }
    });

    test('should handle 403 Forbidden error', async () => {
      const error = new Error('Access denied') as Error & { status: number };
      error.status = 403;
      mockDriveApi.files.get.mockRejectedValue(error);

      const result = await driveService.getFile('file123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
      }
    });

    test('should validate fileId parameter', async () => {
      const result1 = await driveService.getFile('');

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('fileId cannot be empty');
      }

      const result2 = await driveService.getFile(null as unknown as string);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('fileId cannot be empty');
      }
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DriveService(mockAuthService);

      const result = await uninitializedService.getFile('file123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DRIVE_NOT_INITIALIZED');
      }
    });
  });

  describe('getFileContent', () => {
    beforeEach(async () => {
      mockGoogle.drive.mockReturnValue(mockDriveApi);
      mockDriveApi.files.get = jest.fn();
      mockDriveApi.files.export = jest.fn();
      await driveService.initialize();
    });

    test('should get file content for regular file', async () => {
      const mockFileResponse = {
        data: {
          id: 'file123',
          mimeType: 'text/plain',
          size: '1024',
        },
      };

      const mockContentResponse = {
        data: 'This is the file content',
        headers: {
          'content-type': 'text/plain',
          'content-length': '24',
        },
      };

      mockDriveApi.files.get
        .mockResolvedValueOnce(mockFileResponse) // First call for metadata
        .mockResolvedValueOnce(mockContentResponse); // Second call for content

      const result = await driveService.getFileContent('file123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe('This is the file content');
        expect(result.value.mimeType).toBe('text/plain');
        expect(result.value.size).toBe(24);
        expect(result.value.isExported).toBe(false);
      }

      expect(mockDriveApi.files.get).toHaveBeenNthCalledWith(1, {
        fileId: 'file123',
        fields: 'id, mimeType, size, name',
      });
      expect(mockDriveApi.files.get).toHaveBeenNthCalledWith(2, {
        fileId: 'file123',
        alt: 'media',
      });
    });

    test('should export Google Docs file to PDF', async () => {
      const mockFileResponse = {
        data: {
          id: 'doc123',
          mimeType: 'application/vnd.google-apps.document',
          size: undefined, // Google Apps files don't have size
        },
      };

      const mockExportResponse = {
        data: 'PDF content here...',
        headers: {
          'content-type': 'application/pdf',
          'content-length': '2048',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);
      mockDriveApi.files.export.mockResolvedValue(mockExportResponse);

      const result = await driveService.getFileContent('doc123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe('PDF content here...');
        expect(result.value.mimeType).toBe('application/pdf');
        expect(result.value.size).toBe(2048);
        expect(result.value.isExported).toBe(true);
        expect(result.value.exportFormat).toBe('pdf');
      }

      expect(mockDriveApi.files.get).toHaveBeenCalledWith({
        fileId: 'doc123',
        fields: 'id, mimeType, size, name',
      });
      expect(mockDriveApi.files.export).toHaveBeenCalledWith({
        fileId: 'doc123',
        mimeType: 'application/pdf',
      });
    });

    test('should export Google Sheets file to Excel', async () => {
      const mockFileResponse = {
        data: {
          id: 'sheet123',
          mimeType: 'application/vnd.google-apps.spreadsheet',
        },
      };

      const mockExportResponse = {
        data: 'Excel binary content...',
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-length': '4096',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);
      mockDriveApi.files.export.mockResolvedValue(mockExportResponse);

      const result = await driveService.getFileContent('sheet123', {
        exportFormat: 'xlsx',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.mimeType).toBe(
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(result.value.isExported).toBe(true);
        expect(result.value.exportFormat).toBe('xlsx');
      }

      expect(mockDriveApi.files.export).toHaveBeenCalledWith({
        fileId: 'sheet123',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    });

    test('should export Google Slides file to PowerPoint', async () => {
      const mockFileResponse = {
        data: {
          id: 'slides123',
          mimeType: 'application/vnd.google-apps.presentation',
        },
      };

      const mockExportResponse = {
        data: 'PowerPoint binary content...',
        headers: {
          'content-type':
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);
      mockDriveApi.files.export.mockResolvedValue(mockExportResponse);

      const result = await driveService.getFileContent('slides123', {
        exportFormat: 'pptx',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.isExported).toBe(true);
        expect(result.value.exportFormat).toBe('pptx');
      }
    });

    test('should handle large file with size validation', async () => {
      const mockFileResponse = {
        data: {
          id: 'largefile123',
          mimeType: 'application/pdf',
          size: '104857601', // > 100MB
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);

      const result = await driveService.getFileContent('largefile123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('File size too large');
        expect(result.error.message).toContain('100MB');
      }
    });

    test('should handle 404 Not Found error when export also fails', async () => {
      const error = new Error('File not found') as Error & { status: number };
      error.status = 404;
      const exportError = new Error('Export failed') as Error & {
        status: number;
      };
      exportError.status = 404;

      // First call (metadata) fails, second call (export) also fails
      mockDriveApi.files.get.mockRejectedValue(error);
      mockDriveApi.files.export.mockRejectedValue(exportError);

      const result = await driveService.getFileContent('non-existent-file');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(404);
      }
    });

    test('should handle 403 Access denied error', async () => {
      const error = new Error('Access denied') as Error & { status: number };
      error.status = 403;
      mockDriveApi.files.get.mockRejectedValue(error);

      const result = await driveService.getFileContent('private-file');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
      }
    });

    test('should handle unsupported export format', async () => {
      const mockFileResponse = {
        data: {
          id: 'doc123',
          mimeType: 'application/vnd.google-apps.document',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);

      const result = await driveService.getFileContent('doc123', {
        exportFormat: 'unsupported' as DriveFileContentOptions['exportFormat'],
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unsupported export format');
      }
    });

    test('should validate fileId parameter', async () => {
      const result1 = await driveService.getFileContent('');

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('fileId cannot be empty');
      }

      const result2 = await driveService.getFileContent(
        null as unknown as string
      );

      expect(result2.isErr()).toBe(true);
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DriveService(mockAuthService);

      const result = await uninitializedService.getFileContent('file123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DRIVE_NOT_INITIALIZED');
      }
    });

    test('should handle export API failure', async () => {
      const mockFileResponse = {
        data: {
          id: 'doc123',
          mimeType: 'application/vnd.google-apps.document',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);

      const exportError = new Error('Export failed') as Error & {
        status: number;
      };
      exportError.status = 500;
      mockDriveApi.files.export.mockRejectedValue(exportError);

      const result = await driveService.getFileContent('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.message).toContain('Export failed');
      }
    });

    test('should export Google Docs file to Markdown', async () => {
      const mockFileResponse = {
        data: {
          id: 'doc123',
          mimeType: 'application/vnd.google-apps.document',
          size: undefined, // Google Apps files don't have size
        },
      };

      const mockExportResponse = {
        data: '# Hello World\n\nThis is a **bold** text and *italic* text.\n\n- Item 1\n- Item 2\n',
        headers: {
          'content-type': 'text/markdown',
          'content-length': '78',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);
      mockDriveApi.files.export.mockResolvedValue(mockExportResponse);

      const result = await driveService.getFileContent('doc123', {
        exportFormat: 'markdown',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe(
          '# Hello World\n\nThis is a **bold** text and *italic* text.\n\n- Item 1\n- Item 2\n'
        );
        expect(result.value.mimeType).toBe('text/markdown');
        expect(result.value.size).toBe(78);
        expect(result.value.isExported).toBe(true);
        expect(result.value.exportFormat).toBe('markdown');
      }

      expect(mockDriveApi.files.get).toHaveBeenCalledWith({
        fileId: 'doc123',
        fields: 'id, mimeType, size, name',
      });
      expect(mockDriveApi.files.export).toHaveBeenCalledWith({
        fileId: 'doc123',
        mimeType: 'text/markdown',
      });
    });

    test('should handle markdown export with complex formatting', async () => {
      const mockFileResponse = {
        data: {
          id: 'complex-doc',
          mimeType: 'application/vnd.google-apps.document',
        },
      };

      const complexMarkdown = `# Main Title

## Subtitle

This is a paragraph with **bold text**, *italic text*, and ~~strikethrough text~~.

### Lists

#### Bulleted List
- First item
- Second item with **bold**
- Third item with *italic*

#### Numbered List
1. First numbered item
2. Second numbered item
3. Third numbered item

### Code and Links

Here's some \`inline code\` and a [link to Google](https://google.com).

\`\`\`javascript
console.log('Hello World');
\`\`\`

> This is a blockquote

---

**Table Example:**

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`;

      const mockExportResponse = {
        data: complexMarkdown,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'content-length': complexMarkdown.length.toString(),
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);
      mockDriveApi.files.export.mockResolvedValue(mockExportResponse);

      const result = await driveService.getFileContent('complex-doc', {
        exportFormat: 'markdown',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe(complexMarkdown);
        expect(result.value.mimeType).toBe('text/markdown; charset=utf-8');
        expect(result.value.isExported).toBe(true);
        expect(result.value.exportFormat).toBe('markdown');
        // Verify specific markdown elements are present
        expect(result.value.content).toContain('# Main Title');
        expect(result.value.content).toContain('**bold text**');
        expect(result.value.content).toContain('*italic text*');
        expect(result.value.content).toContain('- First item');
        expect(result.value.content).toContain('1. First numbered item');
        expect(result.value.content).toContain('```javascript');
        expect(result.value.content).toContain('> This is a blockquote');
        expect(result.value.content).toContain(
          '| Column 1 | Column 2 | Column 3 |'
        );
      }
    });

    test('should handle markdown export error gracefully', async () => {
      const mockFileResponse = {
        data: {
          id: 'doc123',
          mimeType: 'application/vnd.google-apps.document',
        },
      };

      mockDriveApi.files.get.mockResolvedValue(mockFileResponse);

      const exportError = new Error(
        'Markdown export not available'
      ) as Error & {
        status: number;
      };
      exportError.status = 400;
      mockDriveApi.files.export.mockRejectedValue(exportError);

      const result = await driveService.getFileContent('doc123', {
        exportFormat: 'markdown',
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toContain('Markdown export not available');
      }
    });

    test('should handle external Google Docs with inaccessible metadata but allow export', async () => {
      // Simulate metadata access failure (404) for external shared doc
      const metadataError = new Error('File not found') as Error & {
        status: number;
      };
      metadataError.status = 404;

      // Mock export success
      const mockExportResponse = {
        data: '# External Doc\n\nThis is content from an externally shared Google Doc.',
        headers: {
          'content-type': 'text/markdown',
          'content-length': '76',
        },
      };

      // First call (metadata) fails, second call (export) succeeds
      mockDriveApi.files.get.mockRejectedValueOnce(metadataError);
      mockDriveApi.files.export.mockResolvedValue(mockExportResponse);

      const result = await driveService.getFileContent('external-doc-123', {
        exportFormat: 'markdown',
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.content).toBe(
          '# External Doc\n\nThis is content from an externally shared Google Doc.'
        );
        expect(result.value.mimeType).toBe('text/markdown');
        expect(result.value.size).toBe(76);
        expect(result.value.isExported).toBe(true);
        expect(result.value.exportFormat).toBe('markdown');
      }

      // Verify metadata was attempted but fallback used
      expect(mockDriveApi.files.get).toHaveBeenCalledWith({
        fileId: 'external-doc-123',
        fields: 'id, mimeType, size, name',
      });

      // Verify export was called with fallback MIME type
      expect(mockDriveApi.files.export).toHaveBeenCalledWith({
        fileId: 'external-doc-123',
        mimeType: 'text/markdown',
      });

      // Verify warning was logged about fallback
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'File metadata not accessible, attempting fallback for Google Docs export',
        expect.objectContaining({
          fileId: 'external-doc-123',
          error: expect.stringContaining('File not found'),
        })
      );
    });

    test('should not use fallback for non-404 metadata errors', async () => {
      // Simulate a different error (403 permission denied)
      const metadataError = new Error('Access denied') as Error & {
        status: number;
      };
      metadataError.status = 403;

      mockDriveApi.files.get.mockRejectedValue(metadataError);

      const result = await driveService.getFileContent('restricted-doc-123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
      }

      // Verify no export was attempted
      expect(mockDriveApi.files.export).not.toHaveBeenCalled();
    });
  });
});
