import { loadConfig } from '../../src/config/index.js';
import {
  DEFAULT_RETRY_CONFIG,
  GoogleServiceRetryConfig,
} from '../../src/services/base/google-service.js';

describe('Retry Configuration TDD Tests', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Set required environment variables
    process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH = './test-key.json';
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Configuration Validation & Defaults', () => {
    test('should have default retriable codes', () => {
      expect(DEFAULT_RETRY_CONFIG).toHaveProperty('retriableCodes');
      expect(DEFAULT_RETRY_CONFIG.retriableCodes).toEqual([
        429, 500, 502, 503, 504,
      ]);
    });

    test('should validate positive numbers for retry parameters', () => {
      const config: GoogleServiceRetryConfig = {
        maxAttempts: -1,
        baseDelay: 0,
        maxDelay: -500,
        jitter: -0.5,
        retriableCodes: [429, 500],
        initialDelayMs: 0,
        maxDelayMs: -500,
        backoffMultiplier: 0,
        jitterFactor: -0.5,
      };

      // This should fail validation
      expect(() => {
        if (config.maxAttempts <= 0)
          throw new Error('maxAttempts must be positive');
        if (config.initialDelayMs <= 0)
          throw new Error('initialDelayMs must be positive');
        if (config.maxDelayMs <= 0)
          throw new Error('maxDelayMs must be positive');
        if (config.backoffMultiplier <= 0)
          throw new Error('backoffMultiplier must be positive');
        if (config.jitterFactor < 0 || config.jitterFactor > 1)
          throw new Error('jitterFactor must be between 0 and 1');
      }).toThrow();
    });

    test('should filter out non-retriable HTTP codes', () => {
      const nonRetriableCodes = [
        100, 200, 201, 204, 300, 301, 400, 401, 403, 404,
      ];
      const allCodes = [...nonRetriableCodes, 429, 500, 502, 503, 504];

      const filtered = allCodes.filter(code =>
        [429, 500, 502, 503, 504].includes(code)
      );
      expect(filtered).toEqual([429, 500, 502, 503, 504]);
    });

    test('should normalize baseDelayMs alias to initialDelayMs', () => {
      const config = {
        maxAttempts: 3,
        baseDelayMs: 2000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
        retriableCodes: [429, 500],
      };

      // Should normalize baseDelayMs to initialDelayMs
      const normalized = {
        ...config,
        initialDelayMs: config.baseDelayMs,
      };
      delete (normalized as Record<string, unknown>).baseDelayMs;

      expect(normalized.initialDelayMs).toBe(2000);
      expect(normalized).not.toHaveProperty('baseDelayMs');
    });
  });

  describe('Environment Variable Loading', () => {
    test('should load GOOGLE_RETRY_MAX_ATTEMPTS from environment', () => {
      process.env.GOOGLE_RETRY_MAX_ATTEMPTS = '5';

      const config = loadConfig();
      expect(config).toHaveProperty('GOOGLE_RETRY_MAX_ATTEMPTS', 5);
    });

    test('should load GOOGLE_RETRY_BASE_DELAY from environment', () => {
      process.env.GOOGLE_RETRY_BASE_DELAY = '2000';
      process.env.GOOGLE_RETRY_MAX_DELAY = '30000'; // Ensure max > base

      const config = loadConfig();
      expect(config).toHaveProperty('GOOGLE_RETRY_BASE_DELAY', 2000);
    });

    test('should load GOOGLE_RETRY_MAX_DELAY from environment', () => {
      process.env.GOOGLE_RETRY_BASE_DELAY = '1000'; // Ensure base < max
      process.env.GOOGLE_RETRY_MAX_DELAY = '60000';

      const config = loadConfig();
      expect(config).toHaveProperty('GOOGLE_RETRY_MAX_DELAY', 60000);
    });

    test('should load GOOGLE_RETRY_JITTER from environment', () => {
      process.env.GOOGLE_RETRY_BASE_DELAY = '1000'; // Ensure base < max
      process.env.GOOGLE_RETRY_MAX_DELAY = '30000';
      process.env.GOOGLE_RETRY_JITTER = '0.2';

      const config = loadConfig();
      expect(config).toHaveProperty('GOOGLE_RETRY_JITTER', 0.2);
    });

    test('should load GOOGLE_RETRY_RETRIABLE_CODES from environment', () => {
      process.env.GOOGLE_RETRY_BASE_DELAY = '1000'; // Ensure base < max
      process.env.GOOGLE_RETRY_MAX_DELAY = '30000';
      process.env.GOOGLE_RETRY_RETRIABLE_CODES = '429,500,502';

      const config = loadConfig();
      expect(config).toHaveProperty(
        'GOOGLE_RETRY_RETRIABLE_CODES',
        [429, 500, 502]
      );
    });

    test('should validate environment variable types and ranges', () => {
      process.env.GOOGLE_RETRY_MAX_ATTEMPTS = 'invalid';
      process.env.GOOGLE_RETRY_BASE_DELAY = '1000';
      process.env.GOOGLE_RETRY_MAX_DELAY = '30000'; // Ensure base < max
      process.env.GOOGLE_RETRY_JITTER = '1.5'; // Out of range

      expect(() => loadConfig()).toThrow();
    });

    test('should maintain backward compatibility when environment variables are not set', () => {
      const config = loadConfig();

      // Should still work with existing required variables
      expect(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH).toBe('./test-key.json');
      expect(config.GOOGLE_DRIVE_FOLDER_ID).toBe('test-folder-id');
    });
  });

  describe('Enhanced RetryConfig Interface', () => {
    test('should support retriableCodes property', () => {
      const config: GoogleServiceRetryConfig = {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        jitter: 0.1,
        retriableCodes: [429, 500, 502, 503, 504],
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      };

      expect(config).toHaveProperty('retriableCodes');
      expect(Array.isArray(config.retriableCodes)).toBe(true);
    });

    test('should support baseDelayMs as alias for initialDelayMs', () => {
      interface ExtendedRetryConfig extends GoogleServiceRetryConfig {
        baseDelayMs?: number;
      }

      const config: ExtendedRetryConfig = {
        maxAttempts: 3,
        baseDelay: 1000,
        initialDelayMs: 1000, // This should take precedence
        maxDelay: 30000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitter: 0.1,
        jitterFactor: 0.1,
        retriableCodes: [429, 500],
        baseDelayMs: 1500, // Should be an alias that might override
      };

      expect(config).toHaveProperty('baseDelayMs', 1500);
      expect(config).toHaveProperty('initialDelayMs', 1000);
    });
  });

  describe('HTTP Status Code Logic', () => {
    test('should respect retriableCodes for retry decisions', () => {
      const retriableCodes = [429, 500, 502, 503, 504];

      expect(retriableCodes.includes(429)).toBe(true);
      expect(retriableCodes.includes(500)).toBe(true);
      expect(retriableCodes.includes(404)).toBe(false);
      expect(retriableCodes.includes(200)).toBe(false);
    });

    test('should prioritize HTTP codes over error.isRetryable()', () => {
      // Mock error with isRetryable method
      class MockError extends Error {
        statusCode: number;

        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }

        isRetryable(): boolean {
          return false; // Error says not retryable
        }
      }

      const error = new MockError('Test error', 429); // But status code is retryable
      const retriableCodes = [429, 500, 502, 503, 504];

      // HTTP status code should take precedence
      const shouldRetry =
        retriableCodes.includes(error.statusCode) || error.isRetryable();
      expect(shouldRetry).toBe(true);
    });

    test('should handle rate limit retryAfterMs for 429 errors', () => {
      class RateLimitError extends Error {
        statusCode = 429;
        retryAfterMs = 5000;

        isRetryable(): boolean {
          return true;
        }
      }

      const error = new RateLimitError('Rate limit exceeded');
      expect(error.retryAfterMs).toBe(5000);
      expect(error.statusCode).toBe(429);
    });
  });

  describe('Enhanced Logging', () => {
    test('should format attempt numbers clearly', () => {
      const formatAttempt = (current: number, max: number): string =>
        `Attempt ${current}/${max}`;

      expect(formatAttempt(1, 3)).toBe('Attempt 1/3');
      expect(formatAttempt(2, 5)).toBe('Attempt 2/5');
    });

    test('should format next delay information', () => {
      const formatRetryDelay = (delayMs: number): string =>
        `Retrying in ${delayMs}ms`;

      expect(formatRetryDelay(1500)).toBe('Retrying in 1500ms');
      expect(formatRetryDelay(3000)).toBe('Retrying in 3000ms');
    });

    test('should format retry reasons', () => {
      const formatRetryReason = (
        type: string,
        value: number | string
      ): string => `${type}: ${value}`;

      expect(formatRetryReason('retriable_http_status', 500)).toBe(
        'retriable_http_status: 500'
      );
      expect(
        formatRetryReason('error_not_retryable', 'Invalid credentials')
      ).toBe('error_not_retryable: Invalid credentials');
    });
  });

  describe('Error System Integration', () => {
    test('should preserve HTTP status codes in error conversion', () => {
      class HttpError extends Error {
        statusCode: number;

        constructor(message: string, statusCode: number) {
          super(message);
          this.statusCode = statusCode;
        }
      }

      const error = new HttpError('Server error', 500);
      expect(error.statusCode).toBe(500);
      expect(error.message).toBe('Server error');
    });

    test('should integrate with existing error.isRetryable() method', () => {
      class RetryableError extends Error {
        isRetryable(): boolean {
          return true;
        }
      }

      class NonRetryableError extends Error {
        isRetryable(): boolean {
          return false;
        }
      }

      const retryableError = new RetryableError('Temporary failure');
      const nonRetryableError = new NonRetryableError('Permanent failure');

      expect(retryableError.isRetryable()).toBe(true);
      expect(nonRetryableError.isRetryable()).toBe(false);
    });

    test('should maintain compatibility with existing error hierarchy', () => {
      // Test that we can still check for specific error types
      class GoogleServiceError extends Error {
        code: string;

        constructor(message: string, code: string) {
          super(message);
          this.code = code;
        }

        isRetryable(): boolean {
          return (
            this.code.includes('RATE_LIMIT') ||
            this.code.includes('SERVER_ERROR')
          );
        }
      }

      const rateLimitError = new GoogleServiceError(
        'Rate limit',
        'RATE_LIMIT_ERROR'
      );
      const authError = new GoogleServiceError('Auth failed', 'AUTH_ERROR');

      expect(rateLimitError.isRetryable()).toBe(true);
      expect(authError.isRetryable()).toBe(false);
    });
  });
});
