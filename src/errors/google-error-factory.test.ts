/**
 * Unit tests for GoogleErrorFactory integration with normalized errors (TDD Red Phase)
 *
 * This test suite implements failing tests that verify GoogleErrorFactory should use
 * the new normalized error extraction instead of brittle string matching. These tests
 * will fail initially because GoogleErrorFactory hasn't been updated to use the new
 * normalization logic.
 *
 * Features tested:
 * - GoogleErrorFactory should use extractGoogleApiError() for robust error parsing
 * - Factory methods should handle structured Google API errors correctly
 * - String matching brittleness should be eliminated
 * - Error classification should be more accurate
 * - Complex error scenarios should be handled gracefully
 * - Integration with existing error hierarchy should be maintained
 */

import {
  GoogleErrorFactory,
  GoogleAuthError,
  GoogleAuthTokenExpiredError,
  GoogleAuthInvalidCredentialsError,
  GoogleAuthMissingCredentialsError,
  GoogleSheetsError,
  GoogleSheetsNotFoundError,
  GoogleSheetsPermissionError,
  GoogleSheetsRateLimitError,
  GoogleSheetsQuotaExceededError,
  GoogleSheetsInvalidRangeError,
} from './index.js';
import {
  GaxiosErrorLike,
  NormalizedGoogleApiError,
} from './normalized-error.js';

describe('GoogleErrorFactory with Normalized Error Integration (TDD Red Phase)', () => {
  describe('createAuthError() with Normalized Extraction', () => {
    it('should fail: should use normalized error extraction instead of string matching', () => {
      // Real Google Auth API error structure
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 401',
        response: {
          status: 401,
          data: {
            error: {
              code: 401,
              message:
                'The access token provided is expired, revoked, malformed, or invalid',
              status: 'UNAUTHENTICATED',
              errors: [
                {
                  message: 'Token has expired',
                  domain: 'global',
                  reason: 'authError',
                },
              ],
            },
          },
        },
      };

      // This will fail because GoogleErrorFactory still uses string matching
      // instead of extractGoogleApiError()
      const authError = GoogleErrorFactory.createAuthError(
        new Error(mockGaxiosError.message!),
        'service-account',
        { originalGaxiosError: mockGaxiosError }
      );

      // Should create GoogleAuthTokenExpiredError based on structured reason, not string matching
      expect(authError).toBeInstanceOf(GoogleAuthTokenExpiredError);
      expect(authError.message).toBe(
        'The access token provided is expired, revoked, malformed, or invalid'
      );

      // Should include normalized error information in context
      expect(authError.context?.normalizedError).toBeDefined();
      expect(
        (authError.context?.normalizedError as NormalizedGoogleApiError).reason
      ).toBe('authError');
      expect(
        (authError.context?.normalizedError as NormalizedGoogleApiError).status
      ).toBe('UNAUTHENTICATED');
    });

    it('should fail: should handle malformed auth errors more robustly', () => {
      // Malformed error that breaks current string matching
      const malformedError = new Error(
        'Auth failure: {"complex": "structure", "nested": {"error": "data"}}'
      );

      // This will fail because current implementation can't handle complex error messages
      const authError = GoogleErrorFactory.createAuthError(
        malformedError,
        'oauth2'
      );

      // Should fall back gracefully instead of using brittle string matching
      expect(authError).toBeInstanceOf(GoogleAuthError);
      expect(authError.message).toContain('Auth failure');
    });

    it('should fail: should distinguish between different auth error types using structured data', () => {
      const invalidCredentialsError: GaxiosErrorLike = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'The credentials are invalid',
              status: 'PERMISSION_DENIED',
              errors: [
                {
                  message: 'Invalid service account key',
                  domain: 'global',
                  reason: 'forbidden',
                },
              ],
            },
          },
        },
      };

      // Should identify this as invalid credentials based on structured data, not string matching
      const authError = GoogleErrorFactory.createAuthError(
        new Error(invalidCredentialsError.message!),
        'service-account',
        { originalGaxiosError: invalidCredentialsError }
      );

      expect(authError).toBeInstanceOf(GoogleAuthInvalidCredentialsError);
      expect(authError.statusCode).toBe(403);
    });

    it('should fail: should handle missing credentials error with structured data', () => {
      const missingCredsError: GaxiosErrorLike = {
        message: 'No credentials provided',
        response: {
          status: 401,
          data: {
            error: {
              code: 401,
              message: 'Authentication credentials are required',
              errors: [
                {
                  message: 'Missing authentication header',
                  domain: 'global',
                  reason: 'required',
                  location: 'Authorization',
                  locationType: 'header',
                },
              ],
            },
          },
        },
      };

      const authError = GoogleErrorFactory.createAuthError(
        new Error(missingCredsError.message!),
        'api-key',
        { originalGaxiosError: missingCredsError }
      );

      expect(authError).toBeInstanceOf(GoogleAuthMissingCredentialsError);
      expect(authError.context?.normalizedError).toBeDefined();
    });
  });

  describe('createSheetsError() with Normalized Extraction', () => {
    it('should fail: should use structured error data instead of string matching for not found errors', () => {
      const notFoundError: GaxiosErrorLike = {
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          data: {
            error: {
              code: 404,
              message: 'Requested entity was not found',
              errors: [
                {
                  message: 'Spreadsheet not found',
                  domain: 'sheets',
                  reason: 'notFound',
                },
              ],
            },
          },
        },
      };

      // Should use structured reason 'notFound' instead of string matching on message
      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(notFoundError.message!),
        'spreadsheet-123',
        'A1:B10',
        { originalGaxiosError: notFoundError }
      );

      expect(sheetsError).toBeInstanceOf(GoogleSheetsNotFoundError);
      expect(sheetsError.spreadsheetId).toBe('spreadsheet-123');
      expect(sheetsError.context?.normalizedError).toBeDefined();
    });

    it('should fail: should handle permission errors using structured data', () => {
      const permissionError: GaxiosErrorLike = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message:
                'The user does not have sufficient permissions for this operation',
              status: 'PERMISSION_DENIED',
              errors: [
                {
                  message: 'Insufficient permissions for spreadsheet access',
                  domain: 'sheets',
                  reason: 'forbidden',
                  location: 'spreadsheetId',
                  locationType: 'parameter',
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(permissionError.message!),
        'spreadsheet-456',
        undefined,
        { originalGaxiosError: permissionError }
      );

      expect(sheetsError).toBeInstanceOf(GoogleSheetsPermissionError);
      expect(sheetsError.message).toBe(
        'The user does not have sufficient permissions for this operation'
      );
    });

    it('should fail: should extract retry-after information from rate limit errors', () => {
      const rateLimitError: GaxiosErrorLike = {
        message: 'Request failed with status code 429',
        response: {
          status: 429,
          data: {
            error: {
              code: 429,
              message: 'Rate limit exceeded',
              errors: [
                {
                  message: 'Quota exceeded for requests per minute',
                  domain: 'usageLimits',
                  reason: 'rateLimitExceeded',
                },
              ],
            },
          },
          headers: {
            'retry-after': '120', // 2 minutes
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(rateLimitError.message!),
        'spreadsheet-789',
        'Sheet1!A1:Z100',
        { originalGaxiosError: rateLimitError }
      );

      expect(sheetsError).toBeInstanceOf(GoogleSheetsRateLimitError);
      // Should extract retry-after from headers, not just from message parsing
      expect((sheetsError as GoogleSheetsRateLimitError).retryAfterMs).toBe(
        120000
      );
    });

    it('should fail: should distinguish between rate limit and quota exceeded based on reason', () => {
      const quotaExceededError: GaxiosErrorLike = {
        message: 'Request failed with status code 429',
        response: {
          status: 429,
          data: {
            error: {
              code: 429,
              message: 'Daily quota has been exceeded',
              errors: [
                {
                  message: 'Daily quota exceeded for this project',
                  domain: 'usageLimits',
                  reason: 'quotaExceeded', // Different from rateLimitExceeded
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(quotaExceededError.message!),
        undefined,
        undefined,
        { originalGaxiosError: quotaExceededError }
      );

      // Should create QuotaExceededError based on structured reason, not just 429 status
      expect(sheetsError).toBeInstanceOf(GoogleSheetsQuotaExceededError);
    });

    it('should fail: should handle range errors using structured location information', () => {
      const rangeError: GaxiosErrorLike = {
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Invalid range specified in the request',
              errors: [
                {
                  message: 'Range Sheet1!A1:ZZ is invalid',
                  domain: 'sheets',
                  reason: 'invalidRange',
                  location: 'range',
                  locationType: 'parameter',
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(rangeError.message!),
        'spreadsheet-999',
        'Sheet1!A1:ZZ',
        { originalGaxiosError: rangeError }
      );

      expect(sheetsError).toBeInstanceOf(GoogleSheetsInvalidRangeError);
      expect(sheetsError.range).toBe('Sheet1!A1:ZZ');

      // Should use the structured error message, not parse from generic message
      expect(sheetsError.message).toBe('Range Sheet1!A1:ZZ is invalid');
      expect(sheetsError.context?.normalizedError).toBeDefined();
    });

    it('should fail: should handle complex nested error structures', () => {
      const complexError: GaxiosErrorLike = {
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Multiple validation errors occurred',
              errors: [
                {
                  message: 'Invalid range format',
                  domain: 'sheets',
                  reason: 'invalidRange',
                  location: 'range',
                  locationType: 'parameter',
                },
                {
                  message: 'Sheet does not exist',
                  domain: 'sheets',
                  reason: 'notFound',
                  location: 'sheetId',
                  locationType: 'parameter',
                },
              ],
            },
          },
        },
      };

      // Should prioritize the first error for classification but include all details
      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(complexError.message!),
        'spreadsheet-complex',
        'NonExistentSheet!A1:B2',
        { originalGaxiosError: complexError }
      );

      // Should classify based on first error (invalidRange)
      expect(sheetsError).toBeInstanceOf(GoogleSheetsInvalidRangeError);

      // Should include all error details in context
      const normalizedError = sheetsError.context
        ?.normalizedError as NormalizedGoogleApiError;
      expect(normalizedError?.details).toHaveLength(2);
      expect(normalizedError?.details[0].reason).toBe('invalidRange');
      expect(normalizedError?.details[1].reason).toBe('notFound');
    });

    it('should fail: should handle server errors with proper retryability', () => {
      const serverError: GaxiosErrorLike = {
        message: 'Request failed with status code 503',
        response: {
          status: 503,
          data: {
            error: {
              code: 503,
              message: 'Service temporarily unavailable',
              errors: [
                {
                  message: 'Backend service is experiencing issues',
                  domain: 'global',
                  reason: 'backendError',
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(serverError.message!),
        'spreadsheet-503',
        'Sheet1!A1:B2',
        { originalGaxiosError: serverError }
      );

      // Should create generic GoogleSheetsError for 5xx errors
      expect(sheetsError).toBeInstanceOf(GoogleSheetsError);
      expect(sheetsError).not.toBeInstanceOf(GoogleSheetsNotFoundError);
      expect(sheetsError.statusCode).toBe(503);
      expect(sheetsError.isRetryable()).toBe(true); // 5xx should be retryable

      // Should include structured error information
      const normalizedError = sheetsError.context
        ?.normalizedError as NormalizedGoogleApiError;
      expect(normalizedError?.reason).toBe('backendError');
      expect(normalizedError?.isRetryable).toBe(true);
    });
  });

  describe('Error Factory Improvements with Normalization', () => {
    it('should fail: should include normalized error data in all factory-created errors', () => {
      const structuredError: GaxiosErrorLike = {
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Bad request',
              status: 'INVALID_ARGUMENT',
              errors: [
                {
                  message: 'Parameter is required',
                  domain: 'global',
                  reason: 'required',
                  location: 'userId',
                  locationType: 'parameter',
                },
              ],
            },
          },
        },
      };

      const authError = GoogleErrorFactory.createAuthError(
        new Error(structuredError.message!),
        'service-account',
        { originalGaxiosError: structuredError }
      );

      // Every factory-created error should include normalized error information
      expect(authError.context?.normalizedError).toBeDefined();
      const normalized = authError.context
        ?.normalizedError as NormalizedGoogleApiError;
      expect(normalized.httpStatus).toBe(400);
      expect(normalized.status).toBe('INVALID_ARGUMENT');
      expect(normalized.reason).toBe('required');
      expect(normalized.location).toBe('userId');
      expect(normalized.originalError).toBe(structuredError);
    });

    it('should fail: should preserve backwards compatibility while adding normalization', () => {
      // Test that existing string-based error creation still works
      const basicError = new Error('Simple error message');

      const authError = GoogleErrorFactory.createAuthError(basicError);

      // Should still work with basic errors, but now with normalized extraction
      expect(authError).toBeInstanceOf(GoogleAuthError);
      expect(authError.message).toBe('Simple error message');

      // Should include normalized error even for basic Error objects
      expect(authError.context?.normalizedError).toBeDefined();
      const normalized = authError.context
        ?.normalizedError as NormalizedGoogleApiError;
      expect(normalized.httpStatus).toBe(500); // Default for non-HTTP errors
      expect(normalized.message).toBe('Simple error message');
      expect(normalized.isRetryable).toBe(false); // Basic errors are not retryable
    });

    it('should fail: should handle edge cases gracefully with normalization', () => {
      // Test null error
      const nullError = GoogleErrorFactory.createAuthError(
        null as unknown as Error
      );
      expect(nullError).toBeInstanceOf(GoogleAuthError);
      expect(nullError.context?.normalizedError).toBeDefined();

      // Test undefined error
      const undefinedError = GoogleErrorFactory.createSheetsError(
        undefined as unknown as Error
      );
      expect(undefinedError).toBeInstanceOf(GoogleSheetsError);
      expect(undefinedError.context?.normalizedError).toBeDefined();

      // Test malformed GaxiosError
      const malformedError = {
        message: 'Malformed error',
        response: {
          status: 'not-a-number' as unknown as number,
          data: { invalid: 'structure' },
        },
      } as GaxiosErrorLike;

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(malformedError.message),
        'test-spreadsheet',
        'A1:B1',
        { originalGaxiosError: malformedError }
      );

      expect(sheetsError).toBeInstanceOf(GoogleSheetsError);
      expect(sheetsError.context?.normalizedError).toBeDefined();
    });

    it('should fail: should use normalized isRetryable logic in error classification', () => {
      const retryableServerError: GaxiosErrorLike = {
        message: 'Request failed with status code 500',
        response: {
          status: 500,
          data: {
            error: {
              code: 500,
              message: 'Internal server error',
              errors: [
                {
                  message: 'Database connection failed',
                  domain: 'global',
                  reason: 'internalServerError', // Retryable reason
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(retryableServerError.message!),
        'spreadsheet-500',
        undefined,
        { originalGaxiosError: retryableServerError }
      );

      // Should respect normalized retryability logic
      expect(sheetsError.isRetryable()).toBe(true);

      const normalized = sheetsError.context
        ?.normalizedError as NormalizedGoogleApiError;
      expect(normalized.isRetryable).toBe(true);
      expect(normalized.reason).toBe('internalServerError');
    });
  });

  describe('Priority and Fallback Logic', () => {
    it('should fail: should prioritize structured error data over string parsing', () => {
      // Create an error where string matching would give wrong result
      const misleadingError: GaxiosErrorLike = {
        message:
          'This message contains "not found" but the actual error is different',
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message:
                'This is actually a permission error, not a not-found error',
              errors: [
                {
                  message: 'Access denied',
                  domain: 'global',
                  reason: 'forbidden',
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(misleadingError.message!),
        'spreadsheet-misleading',
        undefined,
        { originalGaxiosError: misleadingError }
      );

      // Should create PermissionError based on structured data, not NotFoundError based on message
      expect(sheetsError).toBeInstanceOf(GoogleSheetsPermissionError);
      expect(sheetsError).not.toBeInstanceOf(GoogleSheetsNotFoundError);
      expect(sheetsError.statusCode).toBe(403);
    });

    it('should fail: should handle mixed error indicators correctly', () => {
      // Error with both rate limit status and auth error message
      const mixedError: GaxiosErrorLike = {
        message: 'Authentication failed due to rate limiting',
        response: {
          status: 429, // Rate limit status
          data: {
            error: {
              code: 429,
              message: 'Too many authentication attempts',
              errors: [
                {
                  message: 'Authentication rate limit exceeded',
                  domain: 'global',
                  reason: 'rateLimitExceeded', // Should take priority
                },
              ],
            },
          },
        },
      };

      const sheetsError = GoogleErrorFactory.createSheetsError(
        new Error(mixedError.message!),
        'spreadsheet-mixed',
        undefined,
        { originalGaxiosError: mixedError }
      );

      // Should prioritize structured reason over conflicting message
      expect(sheetsError).toBeInstanceOf(GoogleSheetsRateLimitError);
      expect(sheetsError.statusCode).toBe(429);
    });
  });
});
