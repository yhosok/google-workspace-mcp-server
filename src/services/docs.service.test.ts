import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { err, ok } from 'neverthrow';

import { AuthService } from './auth.service.js';
import { DriveService } from './drive.service.js';
import { DocsService } from './docs.service.js';
import {
  GoogleAuthError,
  GoogleDocsError,
  GoogleWorkspaceResult,
} from '../errors/index.js';
import { createServiceLogger } from '../utils/logger.js';
import { GoogleServiceRetryConfig } from './base/google-service.js';

// Mock the dependencies
jest.mock('./auth.service');
jest.mock('./drive.service');
jest.mock('../utils/logger');
jest.mock('googleapis');

// Create typed mocks
const mockGoogle = google as jest.Mocked<typeof google>;

describe('DocsService', () => {
  let docsService: DocsService;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockDriveService: jest.Mocked<DriveService>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockLogger: any;
  let mockOAuth2Client: jest.Mocked<OAuth2Client>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockDocsApi: any;

  // Environment variable mocking
  const originalEnv = process.env;

  beforeEach(() => {
    // Setup mocks
    mockAuthService = {
      getAuthClient: jest.fn(),
    } as unknown as jest.Mocked<AuthService>;

    mockDriveService = {
      initialize: jest.fn(),
      healthCheck: jest.fn(),
      getServiceStats: jest.fn(),
      createSpreadsheet: jest.fn(),
      createDocument: jest.fn(),
      getFileContent: jest.fn(),
    } as unknown as jest.Mocked<DriveService>;

    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    mockOAuth2Client = new OAuth2Client() as jest.Mocked<OAuth2Client>;

    // Mock Docs API with flexible types
    mockDocsApi = {
      documents: {
        get: jest.fn(),
        create: jest.fn(),
        batchUpdate: jest.fn(),
      },
    };

    // Setup mock returns
    (createServiceLogger as jest.Mock).mockReturnValue(mockLogger);
    mockAuthService.getAuthClient.mockResolvedValue(ok(mockOAuth2Client));

    // Create service instance
    docsService = new DocsService(mockAuthService, mockDriveService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore environment variables
    process.env = { ...originalEnv };
  });

  describe('Basic Service Structure', () => {
    test('should extend GoogleService properly', () => {
      expect(docsService).toBeDefined();
      expect(docsService).toHaveProperty('getServiceName');
      expect(docsService).toHaveProperty('getServiceVersion');
      expect(docsService).toHaveProperty('initialize');
      expect(docsService).toHaveProperty('healthCheck');
    });

    test('should return correct service name', () => {
      expect(docsService.getServiceName()).toBe('DocsService');
    });

    test('should return correct service version', () => {
      expect(docsService.getServiceVersion()).toBe('v1');
    });

    test('should accept custom logger and retry config in constructor', () => {
      const customLogger = createServiceLogger('custom-docs');
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

      const customService = new DocsService(
        mockAuthService,
        mockDriveService,
        customLogger,
        customRetryConfig
      );

      expect(customService.getServiceName()).toBe('DocsService');
    });
  });

  describe('Initialization', () => {
    test('should initialize successfully with valid auth', async () => {
      // Mock google.docs to return our mock API
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      const result = await docsService.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(1);
      expect(mockGoogle.docs).toHaveBeenCalledWith({
        version: 'v1',
        auth: mockOAuth2Client,
      });
    });

    test('should handle auth service failure during initialization', async () => {
      const authError = new GoogleAuthError('Auth failed', 'service-account');
      mockAuthService.getAuthClient.mockResolvedValue(err(authError));

      const result = await docsService.initialize();
      expect(result.isErr()).toBe(true);
    });

    test('should prevent concurrent initialization attempts', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      // Start multiple initialization calls simultaneously
      const promises = [
        docsService.initialize(),
        docsService.initialize(),
        docsService.initialize(),
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

      mockGoogle.docs.mockReturnValue(mockDocsApi);

      // First initialization should fail
      const result1 = await docsService.initialize();
      expect(result1.isErr()).toBe(true);

      // Second initialization should succeed
      const result2 = await docsService.initialize();
      expect(result2.isOk()).toBe(true);

      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(2);
    });
  });

  describe('Health Check', () => {
    test('should pass health check when service is operational', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      // Initialize first
      await docsService.initialize();

      // Mock successful document create call for health check
      mockDocsApi.documents.create.mockResolvedValue({
        data: {
          documentId: 'health-check-doc',
          title: 'Health Check Document',
        },
      });

      const result = await docsService.healthCheck();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    test('should fail health check when API is not available', async () => {
      // Don't initialize the service
      const result = await docsService.healthCheck();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });

    test('should fail health check when API call fails', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      // Initialize first
      await docsService.initialize();

      // Mock failed document create call
      mockDocsApi.documents.create.mockRejectedValue(
        new Error('API call failed')
      );

      const result = await docsService.healthCheck();

      expect(result.isErr()).toBe(true);
    });
  });

  describe('createDocument', () => {
    beforeEach(async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();
    });

    test('should create document with title only', async () => {
      const mockResponse = {
        data: {
          documentId: 'new-doc-id',
          title: 'Test Document',
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: '\n',
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      };

      mockDocsApi.documents.create.mockResolvedValue(mockResponse);

      const result = await docsService.createDocument('Test Document');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.documentId).toBe('new-doc-id');
        expect(result.value.title).toBe('Test Document');
        expect(result.value.documentUrl).toContain('new-doc-id');
        expect(result.value.body).toEqual(mockResponse.data.body);
      }

      expect(mockDocsApi.documents.create).toHaveBeenCalledWith({
        requestBody: {
          title: 'Test Document',
        },
      });
    });

    test('should create document in specific folder when GOOGLE_DRIVE_FOLDER_ID is set', async () => {
      // Set environment variable
      process.env.GOOGLE_DRIVE_FOLDER_ID = 'target-folder-id';

      const mockDriveResponse = {
        id: 'new-doc-id',
        name: 'Test Document',
        webViewLink: 'https://docs.google.com/document/d/new-doc-id',
        parents: ['target-folder-id'],
        createdTime: '2024-01-01T12:00:00.000Z',
      };

      const mockDocsResponse = {
        data: {
          documentId: 'new-doc-id',
          title: 'Test Document',
          body: {
            content: [],
          },
        },
      };

      mockDriveService.createDocument.mockResolvedValue(ok(mockDriveResponse));
      mockDocsApi.documents.get.mockResolvedValue(mockDocsResponse);

      const result = await docsService.createDocument('Test Document');

      expect(result.isOk()).toBe(true);
      expect(mockDriveService.createDocument).toHaveBeenCalledWith(
        'Test Document',
        'target-folder-id'
      );
    });

    test('should validate input parameters', async () => {
      // Empty title
      const result1 = await docsService.createDocument('');
      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('title cannot be empty');
      }

      // Null title
      const result2 = await docsService.createDocument(
        null as unknown as string
      );
      expect(result2.isErr()).toBe(true);

      // Undefined title
      const result3 = await docsService.createDocument(
        undefined as unknown as string
      );
      expect(result3.isErr()).toBe(true);

      // Whitespace-only title
      const result4 = await docsService.createDocument('   ');
      expect(result4.isErr()).toBe(true);
    });

    test('should handle API errors appropriately', async () => {
      mockDocsApi.documents.create.mockRejectedValue(
        new Error('API Error: Insufficient permissions')
      );

      const result = await docsService.createDocument('Test Document');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDocsError);
      }
    });

    test('should require service initialization before use', async () => {
      const uninitializedService = new DocsService(
        mockAuthService,
        mockDriveService
      );

      const result = await uninitializedService.createDocument('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });
  });

  describe('getDocument', () => {
    beforeEach(async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();
    });

    test('should get document successfully', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          title: 'Test Document',
          body: {
            content: [
              {
                paragraph: {
                  elements: [
                    {
                      textRun: {
                        content: 'Hello World\n',
                      },
                    },
                  ],
                },
              },
            ],
          },
          documentStyle: {
            marginTop: { magnitude: 72, unit: 'PT' },
            marginBottom: { magnitude: 72, unit: 'PT' },
          },
        },
      };

      mockDocsApi.documents.get.mockResolvedValue(mockResponse);

      const result = await docsService.getDocument('doc123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.documentId).toBe('doc123');
        expect(result.value.title).toBe('Test Document');
        expect(result.value.body).toBeDefined();
        expect(result.value.documentStyle).toBeDefined();
      }

      expect(mockDocsApi.documents.get).toHaveBeenCalledWith({
        documentId: 'doc123',
      });
    });

    test('should handle 404 Not Found error', async () => {
      const error = new Error('Document not found') as Error & {
        status: number;
      };
      error.status = 404;
      mockDocsApi.documents.get.mockRejectedValue(error);

      const result = await docsService.getDocument('non-existent-doc');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDocsError);
        expect(result.error.statusCode).toBe(404);
        expect(result.error.message).toContain('not found');
      }
    });

    test('should handle 401 Unauthorized error', async () => {
      const error = new Error('Unauthorized') as Error & { status: number };
      error.status = 401;
      mockDocsApi.documents.get.mockRejectedValue(error);

      const result = await docsService.getDocument('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(401);
      }
    });

    test('should validate documentId parameter', async () => {
      const result1 = await docsService.getDocument('');

      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('documentId cannot be empty');
      }

      const result2 = await docsService.getDocument(null as unknown as string);

      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('documentId cannot be empty');
      }
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DocsService(
        mockAuthService,
        mockDriveService
      );

      const result = await uninitializedService.getDocument('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });
  });

  describe('batchUpdate', () => {
    beforeEach(async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();
    });

    test('should perform batch update successfully', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              insertText: {
                insertionIndex: 1,
              },
            },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const requests = [
        {
          insertText: {
            location: { index: 1 },
            text: 'Hello World',
          },
        },
      ];

      const result = await docsService.batchUpdate('doc123', requests);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.documentId).toBe('doc123');
        expect(result.value.replies).toHaveLength(1);
      }

      expect(mockDocsApi.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc123',
        requestBody: {
          requests: requests,
        },
      });
    });

    test('should handle multiple requests in batch update', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            { insertText: { insertionIndex: 1 } },
            { insertText: { insertionIndex: 12 } },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const requests = [
        {
          insertText: {
            location: { index: 1 },
            text: 'Hello ',
          },
        },
        {
          insertText: {
            location: { index: 7 },
            text: 'World',
          },
        },
      ];

      const result = await docsService.batchUpdate('doc123', requests);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.replies).toHaveLength(2);
      }
    });

    test('should validate parameters', async () => {
      // Empty documentId
      const result1 = await docsService.batchUpdate('', []);
      expect(result1.isErr()).toBe(true);

      // Empty requests array
      const result2 = await docsService.batchUpdate('doc123', []);
      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('requests cannot be empty');
      }
    });

    test('should handle API errors', async () => {
      mockDocsApi.documents.batchUpdate.mockRejectedValue(
        new Error('Invalid request')
      );

      const result = await docsService.batchUpdate('doc123', [
        { insertText: { location: { index: 1 }, text: 'test' } },
      ]);

      expect(result.isErr()).toBe(true);
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DocsService(
        mockAuthService,
        mockDriveService
      );

      const result = await uninitializedService.batchUpdate('doc123', [
        { insertText: { location: { index: 1 }, text: 'test' } },
      ]);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });
  });

  describe('insertText', () => {
    beforeEach(async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();
    });

    test('should insert text at specified index', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              insertText: {
                insertionIndex: 5,
              },
            },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const result = await docsService.insertText('doc123', 'Hello World', 5);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.documentId).toBe('doc123');
        expect(result.value.replies).toHaveLength(1);
        // Note: The actual Google Docs API returns different response structure
        // The test mock matches the expected structure from the service
      }

      expect(mockDocsApi.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc123',
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 5 },
                text: 'Hello World',
              },
            },
          ],
        },
      });
    });

    test('should default to index 1 when not specified', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              insertText: {
                insertionIndex: 1,
              },
            },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const result = await docsService.insertText('doc123', 'Hello World');

      expect(result.isOk()).toBe(true);

      expect(mockDocsApi.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc123',
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: 'Hello World',
              },
            },
          ],
        },
      });
    });

    test('should validate parameters', async () => {
      // Empty documentId
      const result1 = await docsService.insertText('', 'text');
      expect(result1.isErr()).toBe(true);

      // Empty text
      const result2 = await docsService.insertText('doc123', '');
      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('text cannot be empty');
      }

      // Negative index
      const result3 = await docsService.insertText('doc123', 'text', -1);
      expect(result3.isErr()).toBe(true);
      if (result3.isErr()) {
        expect(result3.error.message).toContain('index cannot be negative');
      }
    });

    test('should handle API errors', async () => {
      mockDocsApi.documents.batchUpdate.mockRejectedValue(
        new Error('Index out of range')
      );

      const result = await docsService.insertText('doc123', 'text', 999999);

      expect(result.isErr()).toBe(true);
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DocsService(
        mockAuthService,
        mockDriveService
      );

      const result = await uninitializedService.insertText('doc123', 'text');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });
  });

  describe('replaceText', () => {
    beforeEach(async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();
    });

    test('should replace text using replaceAllText request', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              replaceAllText: {
                occurrencesChanged: 2,
              },
            },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const result = await docsService.replaceText(
        'doc123',
        'old text',
        'new text'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.documentId).toBe('doc123');
        expect(
          result.value.replies?.[0].replaceAllText?.occurrencesChanged
        ).toBe(2);
      }

      expect(mockDocsApi.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc123',
        requestBody: {
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
        },
      });
    });

    test('should handle case insensitive replacement', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              replaceAllText: {
                occurrencesChanged: 1,
              },
            },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const result = await docsService.replaceText(
        'doc123',
        'OLD TEXT',
        'new text',
        false
      );

      expect(result.isOk()).toBe(true);

      expect(mockDocsApi.documents.batchUpdate).toHaveBeenCalledWith({
        documentId: 'doc123',
        requestBody: {
          requests: [
            {
              replaceAllText: {
                containsText: {
                  text: 'OLD TEXT',
                  matchCase: false,
                },
                replaceText: 'new text',
              },
            },
          ],
        },
      });
    });

    test('should validate parameters', async () => {
      // Mock successful batchUpdate for valid calls
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              replaceAllText: {
                occurrencesChanged: 0,
              },
            },
          ],
        },
      };
      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      // Empty documentId
      const result1 = await docsService.replaceText('', 'old', 'new');
      expect(result1.isErr()).toBe(true);

      // Empty search text
      const result2 = await docsService.replaceText('doc123', '', 'new');
      expect(result2.isErr()).toBe(true);
      if (result2.isErr()) {
        expect(result2.error.message).toContain('searchText cannot be empty');
      }

      // Empty replacement text (should be allowed for deletion)
      const result3 = await docsService.replaceText('doc123', 'old', '');
      expect(result3.isOk()).toBe(true); // Empty replacement text should be allowed
    });

    test('should handle no matches found', async () => {
      const mockResponse = {
        data: {
          documentId: 'doc123',
          replies: [
            {
              replaceAllText: {
                occurrencesChanged: 0,
              },
            },
          ],
        },
      };

      mockDocsApi.documents.batchUpdate.mockResolvedValue(mockResponse);

      const result = await docsService.replaceText(
        'doc123',
        'nonexistent',
        'new'
      );

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(
          result.value.replies?.[0].replaceAllText?.occurrencesChanged
        ).toBe(0);
      }
    });

    test('should handle API errors', async () => {
      mockDocsApi.documents.batchUpdate.mockRejectedValue(
        new Error('Permission denied')
      );

      const result = await docsService.replaceText('doc123', 'old', 'new');

      expect(result.isErr()).toBe(true);
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DocsService(
        mockAuthService,
        mockDriveService
      );

      const result = await uninitializedService.replaceText(
        'doc123',
        'old',
        'new'
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });
  });

  describe('Error Handling', () => {
    test('should convert generic errors to GoogleDocsError', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();

      mockDocsApi.documents.create.mockRejectedValue(
        new Error('Generic error')
      );

      const result = await docsService.createDocument('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleDocsError);
        expect(result.error.message).toContain('Generic error');
      }
    });

    test('should preserve error context information', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();

      const error = new Error('Rate limit exceeded') as Error & {
        status: number;
      };
      error.status = 429;
      mockDocsApi.documents.create.mockRejectedValue(error);

      const result = await docsService.createDocument('Test');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(429);
      }
    });

    test('should handle convertServiceSpecificError method', async () => {
      // This tests the error conversion logic specific to Docs service
      const error = new Error('API Error');
      const convertedError = docsService['convertServiceSpecificError'](error, {
        data: { documentId: 'doc123' },
      });
      expect(convertedError).toBeInstanceOf(GoogleDocsError);
    });
  });

  describe('Service Statistics', () => {
    test('should return service statistics', async () => {
      const result = await docsService.getServiceStats();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveProperty('initialized');
        expect(result.value).toHaveProperty('apiVersions');
        expect(result.value.apiVersions.docs).toBe('v1');
      }
    });
  });

  describe('Integration Patterns', () => {
    test('should follow concurrent initialization pattern', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      // Test fast path - already initialized
      await docsService.initialize();

      const startTime = Date.now();
      const result = await docsService.initialize();
      const duration = Date.now() - startTime;

      expect(result.isOk()).toBe(true);
      expect(duration).toBeLessThan(5); // Should be very fast (< 5ms)
    });

    test('should implement proper Docs API client creation', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      await docsService.initialize();

      expect(mockGoogle.docs).toHaveBeenCalledWith({
        version: 'v1',
        auth: mockOAuth2Client,
      });
    });

    test('should follow authentication validation patterns', async () => {
      const authError = new GoogleAuthError(
        'Auth validation failed',
        'service-account'
      );
      mockAuthService.getAuthClient.mockResolvedValue(err(authError));

      const result = await docsService.initialize();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
      }
    });

    test('should integrate with DriveService for folder placement', async () => {
      // Set environment variable for Drive integration
      process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';

      // Initialize the service with proper mocks
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();

      const mockDriveResponse = {
        id: 'new-doc-id',
        name: 'Test Document',
        webViewLink: 'https://docs.google.com/document/d/new-doc-id',
        parents: ['test-folder-id'],
        createdTime: '2024-01-01T12:00:00.000Z',
      };

      const mockDocsResponse = {
        data: {
          documentId: 'new-doc-id',
          title: 'Test Document',
          body: {
            content: [],
          },
        },
      };

      mockDriveService.createDocument.mockResolvedValue(ok(mockDriveResponse));
      mockDocsApi.documents.get.mockResolvedValue(mockDocsResponse);

      const result = await docsService.createDocument('Test Document');

      expect(result.isOk()).toBe(true);
      expect(mockDriveService.createDocument).toHaveBeenCalledWith(
        'Test Document',
        'test-folder-id'
      );
    });
  });

  describe('Fast Path Optimization', () => {
    test('should provide sub-millisecond response for initialized service operations', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      // Initialize once
      await docsService.initialize();

      // Measure fast path performance
      const startTime = process.hrtime.bigint();
      await docsService['ensureInitialized'](); // Access private method for testing
      const endTime = process.hrtime.bigint();

      const durationMs = Number(endTime - startTime) / 1_000_000;
      expect(durationMs).toBeLessThan(1); // Should be sub-millisecond
    });

    test('should handle multiple concurrent operations efficiently', async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);

      const mockResponse = {
        data: {
          documentId: 'doc123',
          title: 'Test Document',
          body: { content: [] },
        },
      };

      mockDocsApi.documents.get.mockResolvedValue(mockResponse);

      // Initialize first
      await docsService.initialize();

      // Run multiple concurrent operations
      const operations = Array(10)
        .fill(0)
        .map(() => docsService.getDocument('doc123'));

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const duration = Date.now() - startTime;

      // All operations should succeed
      results.forEach(result => {
        expect(result.isOk()).toBe(true);
      });

      // Should complete quickly due to fast path optimization
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });

  describe('getDocumentAsMarkdown', () => {
    beforeEach(async () => {
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsService.initialize();
    });

    test('should get document as markdown using DriveService integration', async () => {
      const mockMarkdownContent = `# Test Document

This is a **bold** text and *italic* text.

## Section 2

- Item 1
- Item 2
- Item 3

### Code Example

\`\`\`javascript
console.log('Hello World');
\`\`\`

> This is a blockquote

[Link to Google](https://google.com)`;

      const mockDriveResponse = {
        content: mockMarkdownContent,
        mimeType: 'text/markdown',
        size: mockMarkdownContent.length,
        isExported: true,
        exportFormat: 'markdown',
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockDriveResponse));

      const result = await docsService.getDocumentAsMarkdown('doc123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(mockMarkdownContent);
        expect(mockDriveService.getFileContent).toHaveBeenCalledWith('doc123', {
          exportFormat: 'markdown',
        });
      }
    });

    test('should handle markdown export with complex formatting', async () => {
      const complexMarkdown = `# Main Title

## Subtitle with **Bold** and *Italic*

This document contains various formatting elements:

### Text Formatting
- **Bold text**
- *Italic text*  
- ~~Strikethrough text~~
- \`inline code\`

### Lists

#### Bulleted List
- First item
- Second item with **bold**
- Third item with *italic*

#### Numbered List
1. First numbered item
2. Second numbered item
3. Third numbered item

### Code Blocks

\`\`\`typescript
interface Document {
  id: string;
  title: string;
  content: string;
}

const doc: Document = {
  id: 'abc123',
  title: 'Test Document',
  content: 'Hello World'
};
\`\`\`

### Tables

| Column 1 | Column 2 | Column 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

### Quotes and Links

> This is an important quote from the document.

For more information, see [Google Docs](https://docs.google.com).

---

*End of document*`;

      const mockDriveResponse = {
        content: complexMarkdown,
        mimeType: 'text/markdown; charset=utf-8',
        size: complexMarkdown.length,
        isExported: true,
        exportFormat: 'markdown',
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockDriveResponse));

      const result = await docsService.getDocumentAsMarkdown('complex-doc');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(complexMarkdown);
        // Verify specific markdown elements
        expect(result.value).toContain('# Main Title');
        expect(result.value).toContain('**Bold text**');
        expect(result.value).toContain('*Italic text*');
        expect(result.value).toContain('~~Strikethrough text~~');
        expect(result.value).toContain('```typescript');
        expect(result.value).toContain('| Column 1 | Column 2 | Column 3 |');
        expect(result.value).toContain('> This is an important quote');
        expect(result.value).toContain(
          '[Google Docs](https://docs.google.com)'
        );
      }
    });

    test('should handle empty document markdown export', async () => {
      const emptyMarkdown = '\n'; // Empty document returns just a newline

      const mockDriveResponse = {
        content: emptyMarkdown,
        mimeType: 'text/markdown',
        size: 1,
        isExported: true,
        exportFormat: 'markdown',
      };

      mockDriveService.getFileContent.mockResolvedValue(ok(mockDriveResponse));

      const result = await docsService.getDocumentAsMarkdown('empty-doc');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(emptyMarkdown);
      }
    });

    test('should validate documentId parameter', async () => {
      // Empty documentId
      const result1 = await docsService.getDocumentAsMarkdown('');
      expect(result1.isErr()).toBe(true);
      if (result1.isErr()) {
        expect(result1.error.message).toContain('documentId cannot be empty');
      }

      // Null documentId
      const result2 = await docsService.getDocumentAsMarkdown(
        null as unknown as string
      );
      expect(result2.isErr()).toBe(true);

      // Undefined documentId
      const result3 = await docsService.getDocumentAsMarkdown(
        undefined as unknown as string
      );
      expect(result3.isErr()).toBe(true);

      // Whitespace-only documentId
      const result4 = await docsService.getDocumentAsMarkdown('   ');
      expect(result4.isErr()).toBe(true);
    });

    test('should handle DriveService errors', async () => {
      const driveError = new GoogleDocsError(
        'Failed to export document to markdown',
        'GOOGLE_DRIVE_EXPORT_ERROR',
        500,
        'doc123'
      );
      mockDriveService.getFileContent.mockResolvedValue(err(driveError));

      const result = await docsService.getDocumentAsMarkdown('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(500);
        expect(result.error.message).toContain(
          'Failed to export document to markdown'
        );
      }
    });

    test('should handle document not found error', async () => {
      const notFoundError = new GoogleDocsError(
        'Document not found',
        'GOOGLE_DOCS_DOCUMENT_NOT_FOUND',
        404,
        'nonexistent-doc'
      );
      mockDriveService.getFileContent.mockResolvedValue(err(notFoundError));

      const result = await docsService.getDocumentAsMarkdown('nonexistent-doc');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(404);
        expect(result.error.message).toContain('Document not found');
      }
    });

    test('should handle permission denied error', async () => {
      const permissionError = new GoogleDocsError(
        'Permission denied to export document',
        'GOOGLE_DOCS_PERMISSION_DENIED',
        403,
        'private-doc'
      );
      mockDriveService.getFileContent.mockResolvedValue(err(permissionError));

      const result = await docsService.getDocumentAsMarkdown('private-doc');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(403);
        expect(result.error.message).toContain('Permission denied');
      }
    });

    test('should handle markdown export not supported error', async () => {
      const exportError = new GoogleDocsError(
        'Markdown export format not supported for this document',
        'GOOGLE_DRIVE_UNSUPPORTED_EXPORT_FORMAT',
        400,
        'doc123'
      );
      mockDriveService.getFileContent.mockResolvedValue(err(exportError));

      const result = await docsService.getDocumentAsMarkdown('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.statusCode).toBe(400);
        expect(result.error.message).toContain(
          'Markdown export format not supported'
        );
      }
    });

    test('should require service initialization', async () => {
      const uninitializedService = new DocsService(
        mockAuthService,
        mockDriveService
      );

      const result = await uninitializedService.getDocumentAsMarkdown('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe('GOOGLE_DOCS_NOT_INITIALIZED');
      }
    });

    test('should handle DriveService not available', async () => {
      // Create DocsService without DriveService
      const docsServiceWithoutDrive = new DocsService(
        mockAuthService,
        null as any
      );
      mockGoogle.docs.mockReturnValue(mockDocsApi);
      await docsServiceWithoutDrive.initialize();

      const result =
        await docsServiceWithoutDrive.getDocumentAsMarkdown('doc123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'DriveService is required for markdown export'
        );
      }
    });
  });
});
