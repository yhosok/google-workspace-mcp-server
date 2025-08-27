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
import { GoogleService, type GoogleServiceRetryConfig, ServiceContext, DEFAULT_RETRY_CONFIG } from '../../../../src/services/base/google-service.js';
import { 
  GoogleWorkspaceError, 
  GoogleServiceError, 
  GoogleAuthError,
  GoogleWorkspaceResult,
  googleOk,
  googleErr 
} from '../../../../src/errors/index.js';
import { Logger } from '../../../../src/utils/logger.js';
import { TEST_RETRY_CONFIG } from '../../../test-config.js';

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
    operation: () => Promise<T>,
    context: ServiceContext
  ): Promise<GoogleWorkspaceResult<T>> {
    return this.executeWithRetry(operation, context);
  }
  
  // Helper to set up test scenarios
  public setTestError(error: Error | null): void {
    this.shouldThrow = error;
    this.callCount = 0;
  }
  
  public async testOperation(): Promise<string> {
    this.callCount++;
    
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
  constructor(message: string, public statusCode: number) {
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
      expect((service as any).retryConfig.retriableCodes).toEqual([500, 502, 503, 504, 429]);
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
      }).toThrow('Invalid retry configuration');
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
});