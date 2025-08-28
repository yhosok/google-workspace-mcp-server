/**
 * Unit tests for normalized error handling functionality (TDD Red Phase)
 *
 * This test suite implements comprehensive failing tests for the extractGoogleApiError() function
 * and related error normalization functionality. Tests cover various Google API error scenarios
 * that should be handled more robustly than current brittle string matching.
 *
 * Features tested:
 * - Structured Google API error extraction with errors[0].reason
 * - HTTP error status code extraction from multiple sources
 * - Generic error handling with fallback parsing
 * - Edge cases: null errors, malformed responses, empty structures
 * - Auth API errors with different format structures
 * - Rate limiting errors with retry-after values
 * - Type guards and validation functions
 * - Priority-based extraction strategy
 */

import {
  extractGoogleApiError,
  isGaxiosErrorLike,
  isGoogleApiErrorResponse,
  GoogleApiErrorResponse,
  GaxiosErrorLike,
} from './normalized-error.js';

describe('Google API Error Normalization (TDD Red Phase)', () => {
  describe('extractGoogleApiError() - Structured Google API Errors', () => {
    it('should extract structured Google Sheets API error with reason', () => {
      // Real-world Google Sheets API error structure
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 400',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Invalid range specified',
              status: 'INVALID_ARGUMENT',
              errors: [
                {
                  message: 'Range A1:Z is invalid',
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

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(400);
      expect(normalized.message).toBe('Invalid range specified');
      expect(normalized.status).toBe('INVALID_ARGUMENT');
      expect(normalized.reason).toBe('invalidRange');
      expect(normalized.domain).toBe('sheets');
      expect(normalized.location).toBe('range');
      expect(normalized.locationType).toBe('parameter');
      expect(normalized.details).toHaveLength(1);
      expect(normalized.details[0].reason).toBe('invalidRange');
      expect(normalized.isRetryable).toBe(false);
      expect(normalized.originalError).toBe(mockGaxiosError);
    });

    it('should extract Google Drive API permission error', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'The user does not have sufficient permissions',
              status: 'PERMISSION_DENIED',
              errors: [
                {
                  message: 'Insufficient permissions for this operation',
                  domain: 'global',
                  reason: 'forbidden',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(403);
      expect(normalized.message).toBe(
        'The user does not have sufficient permissions'
      );
      expect(normalized.status).toBe('PERMISSION_DENIED');
      expect(normalized.reason).toBe('forbidden');
      expect(normalized.domain).toBe('global');
      expect(normalized.isRetryable).toBe(false);
    });

    it('should extract rate limiting error with multiple error details', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 429',
        response: {
          status: 429,
          data: {
            error: {
              code: 429,
              message: 'Rate limit exceeded',
              status: 'RESOURCE_EXHAUSTED',
              errors: [
                {
                  message: 'Quota exceeded for requests per minute',
                  domain: 'global',
                  reason: 'rateLimitExceeded',
                },
                {
                  message: 'Daily quota also near limit',
                  domain: 'global',
                  reason: 'quotaExceeded',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(429);
      expect(normalized.message).toBe('Rate limit exceeded');
      expect(normalized.status).toBe('RESOURCE_EXHAUSTED');
      expect(normalized.reason).toBe('rateLimitExceeded'); // Uses first error's reason
      expect(normalized.domain).toBe('global');
      expect(normalized.details).toHaveLength(2);
      expect(normalized.isRetryable).toBe(true); // 429 is retryable
    });

    it('should handle server errors (5xx) as retryable', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 503',
        response: {
          status: 503,
          data: {
            error: {
              code: 503,
              message: 'Service temporarily unavailable',
              errors: [
                {
                  message: 'Backend service is down',
                  domain: 'global',
                  reason: 'backendError',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(503);
      expect(normalized.reason).toBe('backendError');
      expect(normalized.isRetryable).toBe(true); // 5xx should be retryable
    });
  });

  describe('extractGoogleApiError() - HTTP Errors Without Structured Response', () => {
    it('should extract HTTP status from response when no structured error', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 404',
        response: {
          status: 404,
          statusText: 'Not Found',
          data: 'Spreadsheet not found', // Simple string, not structured error
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(404);
      expect(normalized.message).toBe('Request failed with status code 404');
      expect(normalized.reason).toBeUndefined();
      expect(normalized.status).toBeUndefined();
      expect(normalized.details).toHaveLength(0);
      expect(normalized.isRetryable).toBe(false); // 404 is not retryable
    });

    it('should extract status from error.code when response unavailable', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Network error occurred',
        code: 500,
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(500);
      expect(normalized.message).toBe('Network error occurred');
      expect(normalized.isRetryable).toBe(true); // 500 is retryable
    });

    it('should extract status from error.status property', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Connection timeout',
        status: 408,
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(408);
      expect(normalized.message).toBe('Connection timeout');
      expect(normalized.isRetryable).toBe(false); // 408 is not in default retryable list
    });

    it('should handle string error codes by parsing them', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request timeout',
        code: '408', // String instead of number
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(408);
      expect(normalized.message).toBe('Request timeout');
    });
  });

  describe('extractGoogleApiError() - Message Parsing Fallback', () => {
    it('should parse status code from error message as last resort', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 422 - Unprocessable Entity',
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(422);
      expect(normalized.message).toBe(
        'Request failed with status code 422 - Unprocessable Entity'
      );
      expect(normalized.isRetryable).toBe(false); // 422 is not retryable
    });

    it('should ignore invalid status codes from message parsing', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Error with code 999 occurred', // Invalid HTTP code
        code: undefined, // Make it GaxiosError-like
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(500); // Fallback to default
      expect(normalized.message).toBe('Error with code 999 occurred');
      expect(normalized.isRetryable).toBe(true); // Default 500 is retryable
    });

    it('should handle multiple numbers in message by taking first valid HTTP code', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request 123 failed with status 404 after 2000ms timeout',
        code: undefined, // Make it GaxiosError-like
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(404); // Takes 404, ignores 123 and 2000
      expect(normalized.isRetryable).toBe(false);
    });
  });

  describe('extractGoogleApiError() - Edge Cases', () => {
    it('should handle null error gracefully', () => {
      const normalized = extractGoogleApiError(null);

      expect(normalized.httpStatus).toBe(500);
      expect(normalized.message).toBe('Unknown error occurred');
      expect(normalized.reason).toBeUndefined();
      expect(normalized.details).toHaveLength(0);
      expect(normalized.isRetryable).toBe(true);
      expect(normalized.originalError).toBe(null);
    });

    it('should handle undefined error gracefully', () => {
      const normalized = extractGoogleApiError(undefined);

      expect(normalized.httpStatus).toBe(500);
      expect(normalized.message).toBe('Unknown error occurred');
      expect(normalized.isRetryable).toBe(true);
      expect(normalized.originalError).toBe(undefined);
    });

    it('should handle string error by converting to message', () => {
      const normalized = extractGoogleApiError('Something went wrong');

      expect(normalized.httpStatus).toBe(500);
      expect(normalized.message).toBe('Something went wrong');
      expect(normalized.isRetryable).toBe(false); // String errors are not retryable
    });

    it('should handle number error by converting to message', () => {
      const normalized = extractGoogleApiError(404);

      expect(normalized.httpStatus).toBe(500);
      expect(normalized.message).toBe('404');
      expect(normalized.isRetryable).toBe(false);
    });

    it('should handle basic Error objects without GaxiosError structure', () => {
      const basicError = new Error('Basic error message');
      const normalized = extractGoogleApiError(basicError);

      expect(normalized.httpStatus).toBe(500);
      expect(normalized.message).toBe('Basic error message');
      expect(normalized.isRetryable).toBe(false); // Basic errors are not retryable
    });

    it('should handle malformed Google API response structure', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Bad request',
              // Missing errors array
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(400);
      expect(normalized.message).toBe('Bad request');
      expect(normalized.reason).toBeUndefined();
      expect(normalized.details).toHaveLength(0);
    });

    it('should handle empty errors array', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Bad request',
              errors: [], // Empty array
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(400);
      expect(normalized.message).toBe('Bad request');
      expect(normalized.reason).toBeUndefined();
      expect(normalized.details).toHaveLength(0);
    });
  });

  describe('extractGoogleApiError() - Auth API Error Variations', () => {
    it('should handle OAuth2 token expired error structure', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 401',
        response: {
          status: 401,
          data: {
            error: {
              code: 401,
              message: 'Access token expired',
              status: 'UNAUTHENTICATED',
              errors: [
                {
                  message:
                    'The access token provided is expired, revoked, malformed, or invalid',
                  domain: 'global',
                  reason: 'authError',
                  location: 'Authorization',
                  locationType: 'header',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(401);
      expect(normalized.status).toBe('UNAUTHENTICATED');
      expect(normalized.reason).toBe('authError');
      expect(normalized.location).toBe('Authorization');
      expect(normalized.locationType).toBe('header');
      expect(normalized.isRetryable).toBe(false); // Auth errors are not retryable by default
    });

    it('should handle service account authentication error', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'Service account does not have access',
              errors: [
                {
                  message:
                    'The service account does not have the required permissions',
                  domain: 'global',
                  reason: 'forbidden',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(403);
      expect(normalized.reason).toBe('forbidden');
      expect(normalized.domain).toBe('global');
      expect(normalized.isRetryable).toBe(false);
    });
  });

  describe('extractGoogleApiError() - Rate Limiting with Retry-After', () => {
    it('should handle rate limiting error with retry-after header simulation', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 429',
        response: {
          status: 429,
          statusText: 'Too Many Requests',
          data: {
            error: {
              code: 429,
              message: 'Quota exceeded for requests per minute per user',
              errors: [
                {
                  message: 'Rate limit exceeded',
                  domain: 'usageLimits',
                  reason: 'rateLimitExceeded',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(429);
      expect(normalized.reason).toBe('rateLimitExceeded');
      expect(normalized.domain).toBe('usageLimits');
      expect(normalized.isRetryable).toBe(true);
    });

    it('should identify quota exceeded as retryable', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Quota exceeded',
        response: {
          status: 429,
          data: {
            error: {
              code: 429,
              message: 'Daily quota exceeded',
              errors: [
                {
                  message: 'Daily quota for requests exceeded',
                  domain: 'global',
                  reason: 'quotaExceeded',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.reason).toBe('quotaExceeded');
      expect(normalized.isRetryable).toBe(true); // quotaExceeded is retryable
    });
  });

  describe('extractGoogleApiError() - Priority-Based Extraction', () => {
    it('should prioritize structured API error over HTTP status', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed with status code 500', // Generic message
        code: 400, // Different code
        status: 422, // Different status
        response: {
          status: 503, // Different response status
          data: {
            error: {
              code: 409, // The actual API error code - should take priority
              message: 'Resource conflict detected',
              errors: [
                {
                  message: 'Duplicate resource found',
                  domain: 'global',
                  reason: 'duplicate',
                },
              ],
            },
          },
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      // Should use the structured API error, not the response status or error codes
      expect(normalized.httpStatus).toBe(409);
      expect(normalized.message).toBe('Resource conflict detected');
      expect(normalized.reason).toBe('duplicate');
    });

    it('should fall back to response status when no structured error', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Request failed',
        code: 400,
        response: {
          status: 502, // Should use this
          data: 'Bad Gateway', // No structured error
        },
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(502); // From response.status
      expect(normalized.message).toBe('Request failed');
    });

    it('should fall back to error.code when no response', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Network error',
        code: 504, // Should use this
        status: 400, // Less priority than code
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(504);
    });

    it('should use error.status when no code or response', () => {
      const mockGaxiosError: GaxiosErrorLike = {
        message: 'Timeout error',
        status: 408, // Should use this as last resort
      };

      const normalized = extractGoogleApiError(mockGaxiosError);

      expect(normalized.httpStatus).toBe(408);
    });
  });

  describe('Type Guards and Validation', () => {
    describe('isGaxiosErrorLike()', () => {
      it('should identify valid GaxiosError-like objects', () => {
        const validError = {
          message: 'Error message',
          response: { status: 400 },
        };

        expect(isGaxiosErrorLike(validError)).toBe(true);
      });

      it('should reject objects without message property', () => {
        const invalidError = {
          code: 400,
          response: { status: 400 },
        };

        expect(isGaxiosErrorLike(invalidError)).toBe(false);
      });

      it('should reject non-string message property', () => {
        const invalidError = {
          message: 123,
          response: { status: 400 },
        };

        expect(isGaxiosErrorLike(invalidError)).toBe(false);
      });

      it('should reject null and undefined', () => {
        expect(isGaxiosErrorLike(null)).toBe(false);
        expect(isGaxiosErrorLike(undefined)).toBe(false);
      });

      it('should reject primitive types', () => {
        expect(isGaxiosErrorLike('string')).toBe(false);
        expect(isGaxiosErrorLike(123)).toBe(false);
        expect(isGaxiosErrorLike(true)).toBe(false);
      });
    });

    describe('isGoogleApiErrorResponse()', () => {
      it('should identify valid Google API error response', () => {
        const validResponse: GoogleApiErrorResponse = {
          error: {
            code: 400,
            message: 'Bad request',
          },
        };

        expect(isGoogleApiErrorResponse(validResponse)).toBe(true);
      });

      it('should identify response with errors array', () => {
        const validResponse: GoogleApiErrorResponse = {
          error: {
            code: 400,
            message: 'Bad request',
            errors: [
              {
                message: 'Field is required',
                domain: 'global',
                reason: 'required',
              },
            ],
          },
        };

        expect(isGoogleApiErrorResponse(validResponse)).toBe(true);
      });

      it('should reject response without error property', () => {
        const invalidResponse = {
          data: 'Some error data',
        };

        expect(isGoogleApiErrorResponse(invalidResponse)).toBe(false);
      });

      it('should reject response with null error', () => {
        const invalidResponse = {
          error: null,
        };

        expect(isGoogleApiErrorResponse(invalidResponse)).toBe(false);
      });

      it('should reject response without code property', () => {
        const invalidResponse = {
          error: {
            message: 'Error message',
          },
        };

        expect(isGoogleApiErrorResponse(invalidResponse)).toBe(false);
      });

      it('should reject response without message property', () => {
        const invalidResponse = {
          error: {
            code: 400,
          },
        };

        expect(isGoogleApiErrorResponse(invalidResponse)).toBe(false);
      });
    });
  });

  describe('Retryability Logic', () => {
    it('should mark 5xx errors as retryable', () => {
      const errors = [500, 501, 502, 503, 504, 505, 599];

      errors.forEach(statusCode => {
        const mockError: GaxiosErrorLike = {
          message: `Server error ${statusCode}`,
          response: { status: statusCode, data: null },
        };

        const normalized = extractGoogleApiError(mockError);
        expect(normalized.isRetryable).toBe(true);
        expect(normalized.httpStatus).toBe(statusCode);
      });
    });

    it('should mark 429 (rate limit) as retryable', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Too many requests',
        response: { status: 429, data: null },
      };

      const normalized = extractGoogleApiError(mockError);
      expect(normalized.isRetryable).toBe(true);
    });

    it('should mark specific reasons as retryable regardless of status', () => {
      const retryableReasons = [
        'rateLimitExceeded',
        'quotaExceeded',
        'backendError',
        'internalServerError',
      ];

      retryableReasons.forEach(reason => {
        const mockError: GaxiosErrorLike = {
          message: 'Error',
          response: {
            status: 400, // Non-retryable status
            data: {
              error: {
                code: 400,
                message: 'Error',
                errors: [{ message: 'Error', domain: 'global', reason }],
              },
            },
          },
        };

        const normalized = extractGoogleApiError(mockError);
        expect(normalized.isRetryable).toBe(true);
        expect(normalized.reason).toBe(reason);
      });
    });

    it('should mark 4xx client errors (except 429) as non-retryable', () => {
      const nonRetryableErrors = [400, 401, 403, 404, 409, 422];

      nonRetryableErrors.forEach(statusCode => {
        const mockError: GaxiosErrorLike = {
          message: `Client error ${statusCode}`,
          response: { status: statusCode, data: null },
        };

        const normalized = extractGoogleApiError(mockError);
        expect(normalized.isRetryable).toBe(false);
        expect(normalized.httpStatus).toBe(statusCode);
      });
    });

    it('should handle unknown errors as retryable with 500 status', () => {
      const unknownError = { someProperty: 'unknown structure' };

      const normalized = extractGoogleApiError(unknownError);
      expect(normalized.isRetryable).toBe(true);
      expect(normalized.httpStatus).toBe(500);
    });
  });
});
