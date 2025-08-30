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
});
