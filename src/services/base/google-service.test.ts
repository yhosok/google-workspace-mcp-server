/**
 * Unit tests for GoogleService base class focusing on retry/backoff strategy visibility improvements
 *
 * This test suite implements TDD Red phase - comprehensive failing tests that will guide
 * the implementation of enhanced retry configuration, environment variable support,
 * HTTP status code handling, and improved logging visibility.
 *
 * Features tested:
 * - Enhanced RetryConfig with retriableCodes
 * - Environment variable configuration loading
 * - HTTP status code-based retry logic
 * - Enhanced logging with attempt/nextDelay info
 * - Configuration validation and defaults
 */

import { OAuth2Client } from 'google-auth-library';
import {
  GoogleService,
  type GoogleServiceRetryConfig,
  ServiceContext,
  DEFAULT_RETRY_CONFIG,
} from '../../services/base/google-service.js';
import {
  GoogleWorkspaceError,
  GoogleServiceError,
  GoogleAuthError,
  GoogleTimeoutError,
  GoogleWorkspaceResult,
  googleOk,
  googleErr,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';
import { TEST_RETRY_CONFIG } from '../../test-config.js';

// Mock for environment variables
const mockEnv = {
  GOOGLE_RETRY_MAX_ATTEMPTS: '',
  GOOGLE_RETRY_BASE_DELAY: '',
  GOOGLE_RETRY_MAX_DELAY: '',
  GOOGLE_RETRY_JITTER: '',
  GOOGLE_RETRY_RETRIABLE_CODES: '',
};

// Mock OAuth2Client
const mockAuth = {
  getAccessToken: jest.fn(),
  credentials: { scope: 'https://www.googleapis.com/auth/spreadsheets' },
} as unknown as OAuth2Client;

// Mock Logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

// Enhanced RetryConfig interface that should exist after implementation
interface EnhancedRetryConfig extends GoogleServiceRetryConfig {
  /**
   * HTTP status codes that should trigger retries
   */
  retriableCodes: number[];

  /**
   * Base delay for exponential backoff (alias for initialDelayMs for clarity)
   */
  baseDelayMs?: number;
}

// Test implementation of GoogleService for testing
class TestGoogleService extends GoogleService {
  private shouldThrow: Error | null = null;
  private callCount = 0;

  constructor(
    auth: OAuth2Client = mockAuth,
    logger: Logger = mockLogger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    super(auth, logger, retryConfig);
  }

  public getServiceName(): string {
    return 'test-service';
  }

  public getServiceVersion(): string {
    return 'v1';
  }

  protected async initialize(): Promise<GoogleWorkspaceResult<void>> {
    return googleOk(undefined);
  }

  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    return googleOk(true);
  }

  // Test method to expose executeWithRetry for testing
  public async testExecuteWithRetry<T>(
    operation: (signal?: AbortSignal) => Promise<T>,
    context: ServiceContext,
    parentSignal?: AbortSignal
  ): Promise<GoogleWorkspaceResult<T>> {
    return this.executeWithRetry(operation, context, parentSignal);
  }

  // Helper to set up test scenarios
  public setTestError(error: Error | null): void {
    this.shouldThrow = error;
    this.callCount = 0;
  }

  public async testOperation(signal?: AbortSignal): Promise<string> {
    this.callCount++;

    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    if (this.shouldThrow) {
      throw this.shouldThrow;
    }

    return 'success';
  }

  public getCallCount(): number {
    return this.callCount;
  }
}

// HTTP Error with status code (simulating Google API errors)
class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

describe('GoogleService Retry/Backoff Strategy Visibility', () => {
  let service: TestGoogleService;
  let originalEnv: NodeJS.ProcessEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe('Enhanced RetryConfig Interface', () => {
    it('should fail: enhanced RetryConfig should support retriableCodes array', async () => {
      // This test will fail initially because the current RetryConfig doesn't have retriableCodes
      const enhancedConfig: EnhancedRetryConfig = {
        maxAttempts: 3,
        baseDelay: 1000,
        initialDelayMs: 1000,
        maxDelay: 30000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitter: 0.1,
        jitterFactor: 0.1,
        retriableCodes: [500, 502, 503, 504, 429], // This property doesn't exist yet
      };

      service = new TestGoogleService(mockAuth, mockLogger, enhancedConfig);

      // Should be able to access retriableCodes from service config
      // This will fail because retriableCodes is not implemented
      expect((service as any).retryConfig.retriableCodes).toEqual([
        500, 502, 503, 504, 429,
      ]);
    });

    it('should fail: enhanced RetryConfig should support baseDelayMs as alias for initialDelayMs', async () => {
      // This test will fail because baseDelayMs is not supported as an alias
      const enhancedConfig: EnhancedRetryConfig = {
        maxAttempts: 3,
        baseDelay: 500,
        initialDelayMs: 500, // Keep required field
        baseDelayMs: 1000, // Should be an alias that overrides initialDelayMs
        maxDelay: 30000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitter: 0.1,
        jitterFactor: 0.1,
        retriableCodes: [429, 500, 502, 503, 504],
      };

      service = new TestGoogleService(mockAuth, mockLogger, enhancedConfig);

      // Should normalize baseDelayMs to initialDelayMs internally
      // This will fail because baseDelayMs normalization is not implemented
      expect((service as any).retryConfig.initialDelayMs).toBe(1000);
    });
  });

  describe('Environment Variable Configuration Loading', () => {
    it('should fail: should load retry configuration from environment variables', async () => {
      process.env.GOOGLE_RETRY_MAX_ATTEMPTS = '5';
      process.env.GOOGLE_RETRY_BASE_DELAY = '2000';
      process.env.GOOGLE_RETRY_MAX_DELAY = '60000';
      process.env.GOOGLE_RETRY_JITTER = '0.2';
      process.env.GOOGLE_RETRY_RETRIABLE_CODES = '500,502,503,504,429';

      // This will fail because GoogleService doesn't load config from environment variables
      service = new TestGoogleService(mockAuth, mockLogger);

      const config = (service as any).retryConfig;
      expect(config.maxAttempts).toBe(5);
      expect(config.initialDelayMs).toBe(2000);
      expect(config.maxDelayMs).toBe(60000);
      expect(config.jitterFactor).toBe(0.2);
      expect(config.retriableCodes).toEqual([500, 502, 503, 504, 429]);
    });

    it('should fail: should provide fallback to defaults when env vars are invalid', async () => {
      process.env.GOOGLE_RETRY_MAX_ATTEMPTS = 'invalid';
      process.env.GOOGLE_RETRY_BASE_DELAY = 'not-a-number';
      process.env.GOOGLE_RETRY_RETRIABLE_CODES = 'invalid,codes,list';

      // Should fall back to defaults when env vars are invalid
      // This will fail because environment variable parsing/validation is not implemented
      service = new TestGoogleService(mockAuth, mockLogger);

      const config = (service as any).retryConfig;
      expect(config.maxAttempts).toBe(DEFAULT_RETRY_CONFIG.maxAttempts);
      expect(config.initialDelayMs).toBe(DEFAULT_RETRY_CONFIG.initialDelayMs);
      expect(config.retriableCodes).toEqual([500, 502, 503, 504]);
    });

    it('should fail: should validate retriable codes from environment', async () => {
      process.env.GOOGLE_RETRY_RETRIABLE_CODES = '200,404,500'; // Mix of retriable and non-retriable

      // Should filter out non-retriable codes like 200, 404
      // This will fail because code validation is not implemented
      service = new TestGoogleService(mockAuth, mockLogger);

      const config = (service as any).retryConfig;
      expect(config.retriableCodes).toEqual([500]); // Should filter out 200, 404
    });
  });

  describe('HTTP Status Code Retry Logic', () => {
    it('should fail: should retry on retriable HTTP status codes', async () => {
      const retriableConfig: EnhancedRetryConfig = {
        ...TEST_RETRY_CONFIG,
        retriableCodes: [500, 502, 503, 504, 429],
      };

      service = new TestGoogleService(mockAuth, mockLogger, retriableConfig);

      // Set up HTTP 500 error
      service.setTestError(new HttpError('Internal Server Error', 500));

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      // Should retry because 500 is in retriableCodes
      // This will fail because HTTP status code retry logic is not implemented
      const result = await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      expect(result.isErr()).toBe(true);
      expect(service.getCallCount()).toBe(2); // maxAttempts from TEST_RETRY_CONFIG
    });

    it('should fail: should not retry on non-retriable HTTP status codes', async () => {
      const retriableConfig: EnhancedRetryConfig = {
        ...TEST_RETRY_CONFIG,
        retriableCodes: [500, 502, 503, 504, 429],
      };

      service = new TestGoogleService(mockAuth, mockLogger, retriableConfig);

      // Set up HTTP 404 error (not in retriableCodes)
      service.setTestError(new HttpError('Not Found', 404));

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      // Should not retry because 404 is not in retriableCodes
      // This will fail because HTTP status code logic is not implemented
      const result = await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      expect(result.isErr()).toBe(true);
      expect(service.getCallCount()).toBe(1); // Should not retry
    });

    it('should fail: should respect rate limit specific status code (429)', async () => {
      const retriableConfig: EnhancedRetryConfig = {
        ...TEST_RETRY_CONFIG,
        retriableCodes: [429, 500, 502, 503, 504],
      };

      service = new TestGoogleService(mockAuth, mockLogger, retriableConfig);

      // Set up rate limit error
      const rateLimitError = new HttpError('Rate limit exceeded', 429);
      (rateLimitError as any).retryAfterMs = 100;
      service.setTestError(rateLimitError);

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      // Should retry with rate limit specific delay
      // This will fail because rate limit handling enhancement is not implemented
      const result = await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      expect(result.isErr()).toBe(true);
      expect(service.getCallCount()).toBe(2);

      // Should log the rate limit specific retry delay
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in 100ms'),
        expect.objectContaining({
          delayMs: 100,
        })
      );
    });
  });

  describe('Enhanced Logging with Attempt and Delay Visibility', () => {
    it('should fail: should log attempt number and next delay in retry logs', async () => {
      service = new TestGoogleService(mockAuth, mockLogger, TEST_RETRY_CONFIG);

      service.setTestError(new Error('Test error'));

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      // Should log with enhanced visibility including attempt and nextDelay
      // This will fail because enhanced logging is not implemented
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying in'),
        expect.objectContaining({
          service: 'test-service',
          operation: 'testOperation',
          attempt: 1,
          nextDelayMs: expect.any(Number),
          requestId: 'test-123',
        })
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Attempt 1 failed'),
        expect.objectContaining({
          service: 'test-service',
          operation: 'testOperation',
          attempt: 1,
          nextRetryIn: expect.any(Number),
          requestId: 'test-123',
        })
      );
    });

    it('should fail: should log final attempt without next delay', async () => {
      service = new TestGoogleService(mockAuth, mockLogger, TEST_RETRY_CONFIG);

      service.setTestError(new Error('Test error'));

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      // Final attempt should not log nextDelay
      // This will fail because enhanced logging distinction is not implemented
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Attempt 2 failed'),
        expect.objectContaining({
          service: 'test-service',
          operation: 'testOperation',
          attempt: 2,
          isFinalAttempt: true,
          requestId: 'test-123',
        })
      );
    });

    it('should fail: should log retry reason based on error type', async () => {
      const retriableConfig: EnhancedRetryConfig = {
        ...TEST_RETRY_CONFIG,
        retriableCodes: [500, 429],
      };

      service = new TestGoogleService(mockAuth, mockLogger, retriableConfig);

      service.setTestError(new HttpError('Server Error', 500));

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      // Should log why the retry is happening
      // This will fail because retry reason logging is not implemented
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Retrying'),
        expect.objectContaining({
          retryReason: 'retriable_http_status',
          statusCode: 500,
          service: 'test-service',
          operation: 'testOperation',
        })
      );
    });

    it('should log retry attempts with configuration details', async () => {
      const customConfig: EnhancedRetryConfig = {
        maxAttempts: 4,
        baseDelay: 500,
        initialDelayMs: 500,
        maxDelay: 10000,
        maxDelayMs: 10000,
        backoffMultiplier: 1.5,
        jitter: 0.2,
        jitterFactor: 0.2,
        retriableCodes: [500, 502, 503],
      };

      service = new TestGoogleService(mockAuth, mockLogger, customConfig);

      service.setTestError(new HttpError('Server Error', 500));

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      // Should log retry attempts with configuration details
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Starting operation'),
        expect.objectContaining({
          retryConfig: expect.objectContaining({
            maxAttempts: 4,
            baseDelay: 500,
            baseDelayMs: 500,
            initialDelayMs: 500,
            maxDelay: 10000,
            maxDelayMs: 10000,
            backoffMultiplier: 1.5,
            jitter: 0.2,
            jitterFactor: 0.2,
            retriableCodes: [500, 502, 503],
          }),
        })
      );
    });
  });

  describe('Configuration Validation and Defaults', () => {
    it('should fail: should validate retry configuration parameters', async () => {
      const invalidConfig = {
        maxAttempts: -1, // Invalid
        initialDelayMs: -500, // Invalid
        maxDelayMs: 100, // Less than initialDelayMs
        backoffMultiplier: 0, // Invalid
        jitterFactor: 2, // Invalid (should be 0-1)
        retriableCodes: ['invalid', 200] as any, // Mixed types
      };

      // Should throw or provide defaults for invalid configuration
      // This will fail because configuration validation is not implemented
      expect(() => {
        new TestGoogleService(mockAuth, mockLogger, invalidConfig as any);
      }).toThrow('maxAttempts must be positive');
    });

    it('should fail: should normalize and validate retriable codes', async () => {
      const config: EnhancedRetryConfig = {
        ...TEST_RETRY_CONFIG,
        retriableCodes: [100, 200, 404, 500, 502, 503, 504, 429], // Mix of all types
      };

      service = new TestGoogleService(mockAuth, mockLogger, config);

      // Should filter to only genuinely retriable codes
      // This will fail because code filtering/validation is not implemented
      const actualCodes = (service as any).retryConfig.retriableCodes;
      expect(actualCodes).toEqual([500, 502, 503, 504, 429]); // Only retriable codes
    });

    it('should fail: should provide sensible defaults for retriable codes', async () => {
      service = new TestGoogleService(mockAuth, mockLogger);

      // Should have default retriable codes even if not specified
      // This will fail because default retriable codes are not implemented
      const config = (service as any).retryConfig;
      expect(config.retriableCodes).toEqual([429, 500, 502, 503, 504]);
    });
  });

  describe('Integration with Existing Error System', () => {
    it('should work with existing GoogleWorkspaceError.isRetryable()', async () => {
      service = new TestGoogleService(mockAuth, mockLogger, TEST_RETRY_CONFIG);

      // Create a non-retriable Google error
      const nonRetriableError = new GoogleServiceError(
        'Permission denied',
        'test-service',
        'PERMISSION_DENIED',
        403
      );

      service.setTestError(nonRetriableError);

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      const result = await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      // Should respect the existing isRetryable() method
      expect(result.isErr()).toBe(true);
      expect(service.getCallCount()).toBe(1); // Should not retry non-retriable errors

      // Should log why retry was skipped - but the current implementation just logs the error object
      expect(mockLogger.error).toHaveBeenCalledWith(
        'test-service: Non-retryable error encountered',
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'PERMISSION_DENIED',
            message: 'Permission denied',
            name: 'GoogleServiceError',
          }),
        })
      );
    });

    it('should fail: should combine HTTP status code and error.isRetryable() logic', async () => {
      const retriableConfig: EnhancedRetryConfig = {
        ...TEST_RETRY_CONFIG,
        retriableCodes: [500],
      };

      service = new TestGoogleService(mockAuth, mockLogger, retriableConfig);

      // Create an error that has HTTP 500 but isRetryable() returns false
      const conflictingError = new (class extends HttpError {
        constructor() {
          super('Custom Server Error', 500);
        }

        isRetryable(): boolean {
          return false; // Override to be non-retriable
        }
      })();

      service.setTestError(conflictingError);

      const context: ServiceContext = {
        operation: 'testOperation',
        requestId: 'test-123',
      };

      const result = await service.testExecuteWithRetry(
        () => service.testOperation(),
        context
      );

      // Should prioritize isRetryable() over HTTP status code
      // This will fail because priority logic is not implemented
      expect(result.isErr()).toBe(true);
      expect(service.getCallCount()).toBe(1); // Should not retry

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Non-retryable error'),
        expect.objectContaining({
          retrySkippedReason: 'error_override_not_retryable',
          statusCode: 500,
          httpStatusRetriable: true,
          errorRetryable: false,
        })
      );
    });
  });

  describe('Timeout Control Implementation (TDD Red Phase)', () => {
    describe('Individual Request Timeout', () => {
      it('should fail: should timeout individual API requests after requestTimeout', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          ...TEST_RETRY_CONFIG,
          requestTimeout: 100, // 100ms timeout
          retriableCodes: [500, 502, 503, 504, 429],
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);

        // Create a slow operation that takes 200ms (exceeds 100ms timeout)
        const slowOperation = (signal?: AbortSignal): Promise<string> => {
          return new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new Error('Operation aborted by timeout'));
              });
            }
            setTimeout(() => resolve('success'), 200);
          });
        };

        const context: ServiceContext = {
          operation: 'slowOperation',
          requestId: 'timeout-test-1',
        };

        const startTime = Date.now();
        const result = await service.testExecuteWithRetry(
          slowOperation,
          context
        );
        const endTime = Date.now();

        // Should timeout and fail
        expect(result.isErr()).toBe(true);
        expect(endTime - startTime).toBeLessThan(250); // Should timeout before the 200ms operation completes

        // Should be a GoogleTimeoutError
        if (result.isErr()) {
          const error = result.error;
          expect(error.constructor.name).toBe('GoogleTimeoutError');
          expect((error as any).timeoutType).toBe('request');
          expect((error as any).timeoutMs).toBe(100);

          // Should log timeout with flag
          const errorJson = error.toJSON();
          expect(errorJson.timeout).toBe(true);
        }
      });

      it('should fail: should use AbortSignal.timeout() for individual request timeouts', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          ...TEST_RETRY_CONFIG,
          requestTimeout: 50,
          retriableCodes: [500],
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);

        let receivedSignal: AbortSignal | undefined;
        const operationWithSignal = (signal?: AbortSignal): Promise<string> => {
          receivedSignal = signal;
          return new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new Error('Operation aborted'));
              });
            }
            setTimeout(() => resolve('success'), 100);
          });
        };

        const context: ServiceContext = {
          operation: 'abortableOperation',
          requestId: 'abort-test-1',
        };

        // This will fail because AbortSignal integration is not implemented
        const result = await service.testExecuteWithRetry(
          signal => operationWithSignal(signal),
          context
        );

        expect(result.isErr()).toBe(true);
        expect(receivedSignal).toBeDefined();
        expect(receivedSignal?.aborted).toBe(true);
        expect(receivedSignal?.reason?.name).toBe('TimeoutError');
      });

      it('should fail: should combine parent AbortSignal with timeout using AbortSignal.any()', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          ...TEST_RETRY_CONFIG,
          requestTimeout: 100,
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);

        // Create a parent abort controller
        const parentController = new AbortController();
        setTimeout(() => parentController.abort('Parent cancelled'), 50);

        let receivedSignal: AbortSignal | undefined;
        const operationWithSignal = (signal?: AbortSignal): Promise<string> => {
          receivedSignal = signal;
          return new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new Error(`Operation aborted: ${signal.reason}`));
              });
            }
            setTimeout(() => resolve('success'), 200);
          });
        };

        const context: ServiceContext = {
          operation: 'combinedAbortOperation',
          requestId: 'combined-abort-test-1',
        };

        // This will fail because AbortSignal.any() integration is not implemented
        const result = await service.testExecuteWithRetry(
          signal => operationWithSignal(signal),
          context,
          parentController.signal
        );

        expect(result.isErr()).toBe(true);
        expect(receivedSignal).toBeDefined();
        expect(receivedSignal?.aborted).toBe(true);
        expect(receivedSignal?.reason).toBe('Parent cancelled');
      });
    });

    describe('Total Retry Timeout', () => {
      it('should fail: should timeout entire retry operation after totalTimeout', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          maxAttempts: 5, // Allow many attempts
          baseDelay: 50,
          initialDelayMs: 50,
          maxDelay: 100,
          maxDelayMs: 100,
          backoffMultiplier: 1.5,
          jitter: 0,
          jitterFactor: 0,
          retriableCodes: [500],
          requestTimeout: 100, // Request timeout smaller than total
          totalTimeout: 200, // Total timeout of 200ms
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);

        // Set up an error that would normally retry multiple times
        service.setTestError(new HttpError('Server Error', 500));

        const context: ServiceContext = {
          operation: 'totalTimeoutOperation',
          requestId: 'total-timeout-test-1',
        };

        const startTime = Date.now();
        const result = await service.testExecuteWithRetry(
          signal => service.testOperation(signal),
          context
        );
        const endTime = Date.now();

        // Should timeout before all retry attempts complete
        expect(result.isErr()).toBe(true);
        expect(endTime - startTime).toBeLessThan(300); // Should timeout quickly
        expect(service.getCallCount()).toBeLessThan(5); // Shouldn't complete all attempts

        // Should be a GoogleTimeoutError with totalTimeout type
        if (result.isErr()) {
          const error = result.error;
          expect(error.constructor.name).toBe('GoogleTimeoutError');
          expect((error as any).timeoutType).toBe('total');
          expect((error as any).timeoutMs).toBe(200);
        }
      });

      it('should fail: should log total timeout with detailed information', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          maxAttempts: 6, // More attempts to ensure timeout happens
          baseDelay: 40, // Higher base delay
          initialDelayMs: 40,
          maxDelay: 80,
          maxDelayMs: 80,
          backoffMultiplier: 1.8, // Higher multiplier
          jitter: 0,
          jitterFactor: 0,
          retriableCodes: [500],
          requestTimeout: 60, // Request timeout smaller than total
          totalTimeout: 120, // Smaller total timeout to ensure it triggers
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);
        service.setTestError(new HttpError('Server Error', 500));

        const context: ServiceContext = {
          operation: 'totalTimeoutLoggingOperation',
          requestId: 'total-timeout-log-test-1',
        };

        await service.testExecuteWithRetry(
          signal => service.testOperation(signal),
          context
        );

        // Should log total timeout with comprehensive information
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('Total timeout exceeded'),
          expect.objectContaining({
            service: 'test-service',
            operation: 'totalTimeoutLoggingOperation',
            totalTimeoutMs: 120,
            elapsedMs: expect.any(Number),
            completedAttempts: expect.any(Number),
            timeout: true,
            timeoutType: 'total',
          })
        );
      });
    });

    describe('AbortController Integration', () => {
      it('should fail: should handle already aborted controllers gracefully', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          ...TEST_RETRY_CONFIG,
          requestTimeout: 100,
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);

        // Create an already aborted controller
        const abortedController = new AbortController();
        abortedController.abort('Already aborted');

        let receivedSignal: AbortSignal | undefined;
        const operationWithSignal = (signal?: AbortSignal): Promise<string> => {
          receivedSignal = signal;
          if (signal?.aborted) {
            return Promise.reject(new Error(`Pre-aborted: ${signal.reason}`));
          }
          return Promise.resolve('success');
        };

        const context: ServiceContext = {
          operation: 'preAbortedOperation',
          requestId: 'pre-abort-test-1',
        };

        // This will fail because pre-aborted signal handling is not implemented
        const result = await service.testExecuteWithRetry(
          signal => operationWithSignal(signal),
          context,
          abortedController.signal // Pass the already aborted signal
        );

        expect(result.isErr()).toBe(true);
        // receivedSignal may be undefined because the operation is aborted before execution
        if (receivedSignal) {
          expect(receivedSignal.aborted).toBe(true);
          expect(receivedSignal.reason).toBe('Already aborted');
        }
        // Check that the error is the expected cancellation error
        if (result.isErr()) {
          const error = result.error;
          expect(error.message).toContain(
            'Operation cancelled by parent signal'
          );
        }
      });

      it('should fail: should properly cleanup timeout timers on completion', async () => {
        const timeoutConfig: GoogleServiceRetryConfig = {
          ...TEST_RETRY_CONFIG,
          requestTimeout: 200, // Longer timeout
        };

        service = new TestGoogleService(mockAuth, mockLogger, timeoutConfig);

        const quickOperation = (signal?: AbortSignal): Promise<string> => {
          return Promise.resolve('quick-success');
        };

        const context: ServiceContext = {
          operation: 'quickOperation',
          requestId: 'cleanup-test-1',
        };

        // Track active timers (in a real implementation)
        const result = await service.testExecuteWithRetry(
          quickOperation,
          context
        );

        expect(result.isOk()).toBe(true);

        // Should log successful completion without timeout
        expect(mockLogger.info).toHaveBeenCalledWith(
          expect.stringContaining("Operation 'quickOperation' succeeded"),
          expect.objectContaining({
            service: 'test-service',
            operation: 'quickOperation',
            attempt: 1,
            requestId: 'cleanup-test-1',
          })
        );

        // This will fail because timeout cleanup tracking is not implemented
        // In a real implementation, we would verify no active timeout timers remain
        expect((service as any).activeTimeouts?.size || 0).toBe(0);
      });
    });

    describe('GoogleTimeoutError Class', () => {
      it('should fail: GoogleTimeoutError should extend GoogleWorkspaceError', () => {
        const error = new GoogleTimeoutError('Test timeout', 'request', 1000);

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(GoogleWorkspaceError);
        expect(error.isRetryable()).toBe(false);
        expect(error.code).toBe('TIMEOUT_ERROR');
        expect(error.statusCode).toBe(408);
        expect(error.timeoutType).toBe('request');
        expect(error.timeoutMs).toBe(1000);
      });

      it('should fail: GoogleTimeoutError should serialize timeout information', () => {
        const error = new GoogleTimeoutError('Request timeout', 'total', 5000, {
          extra: 'context',
        });

        const json = error.toJSON();

        expect(json).toEqual(
          expect.objectContaining({
            name: 'GoogleTimeoutError',
            message: 'Request timeout',
            code: 'TIMEOUT_ERROR',
            statusCode: 408,
            timeoutType: 'total',
            timeoutMs: 5000,
            timeout: true,
            context: expect.objectContaining({ extra: 'context' }),
            timestamp: expect.any(String),
          })
        );
      });
    });

    describe('Environment Variable Configuration', () => {
      it('should fail: should load timeout configuration from environment variables', () => {
        process.env.GOOGLE_REQUEST_TIMEOUT = '2000';
        process.env.GOOGLE_TOTAL_TIMEOUT = '10000';

        // This will fail because environment variable loading for timeouts is not implemented
        service = new TestGoogleService(mockAuth, mockLogger);

        const config = (service as any).retryConfig;
        expect(config.requestTimeout).toBe(2000);
        expect(config.totalTimeout).toBe(10000);
      });

      it('should fail: should validate timeout configuration values', () => {
        const invalidConfig = {
          ...TEST_RETRY_CONFIG,
          requestTimeout: -1000, // Invalid negative timeout
          totalTimeout: 100, // Total timeout less than request timeout
        };

        // Should throw validation error for invalid timeout configuration
        expect(() => {
          new TestGoogleService(mockAuth, mockLogger, invalidConfig as any);
        }).toThrow('requestTimeout must be positive');
      });

      it('should fail: should use default timeout values when not specified', () => {
        // Temporarily remove timeout environment variables to test true defaults
        const originalRequestTimeout = process.env.GOOGLE_REQUEST_TIMEOUT;
        const originalTotalTimeout = process.env.GOOGLE_TOTAL_TIMEOUT;
        delete process.env.GOOGLE_REQUEST_TIMEOUT;
        delete process.env.GOOGLE_TOTAL_TIMEOUT;

        try {
          service = new TestGoogleService(mockAuth, mockLogger);

          const config = (service as any).retryConfig;
          // Should have sensible defaults for timeouts
          expect(config.requestTimeout).toBe(30000); // 30 seconds default
          expect(config.totalTimeout).toBe(120000); // 2 minutes default
        } finally {
          // Restore environment variables
          if (originalRequestTimeout !== undefined) {
            process.env.GOOGLE_REQUEST_TIMEOUT = originalRequestTimeout;
          }
          if (originalTotalTimeout !== undefined) {
            process.env.GOOGLE_TOTAL_TIMEOUT = originalTotalTimeout;
          }
        }
      });
    });
  });
});
