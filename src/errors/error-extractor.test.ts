/**
 * Unit tests for error extraction utility functions (TDD Red Phase)
 *
 * This test suite implements comprehensive failing tests for all utility functions
 * in the error-extractor module. Tests cover individual extraction functions,
 * classification functions, and the comprehensive analyzeError() function.
 *
 * Features tested:
 * - extractHttpStatus() with different error types and priority handling
 * - extractReason() and extractDomain() for Google API structured errors
 * - extractGrpcStatus() for gRPC status code extraction
 * - extractLocation() for error location information
 * - extractErrorDetails() for complete error detail arrays
 * - extractRetryAfter() for rate limit retry timing
 * - Classification functions (isAuthenticationError, isRateLimitError, isNotFoundError)
 * - analyzeError() comprehensive analysis function
 * - Edge cases and malformed data handling
 */

import {
  extractHttpStatus,
  extractReason,
  extractDomain,
  extractGrpcStatus,
  extractLocation,
  extractErrorDetails,
  extractRetryAfter,
  isAuthenticationError,
  isRateLimitError,
  isNotFoundError,
  analyzeError,
} from './error-extractor.js';
import { GaxiosErrorLike, GoogleApiErrorDetail } from './normalized-error.js';

describe('Error Extraction Utilities (TDD Red Phase)', () => {
  describe('extractHttpStatus()', () => {
    it('should extract status from structured Google API error response (highest priority)', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        code: 500,
        status: 400,
        response: {
          status: 502,
          data: {
            error: {
              code: 403, // This should have highest priority
              message: 'Forbidden',
              errors: [],
            },
          },
        },
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(403); // Should use API error code, not response status
    });

    it('should extract status from HTTP response when no structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        code: 500,
        response: {
          status: 404, // Should use this
          data: 'Not found',
        },
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(404);
    });

    it('should extract status from error.code when no response', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Network error',
        code: 408, // Should use this
        status: 500,
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(408);
    });

    it('should handle string error codes', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Timeout',
        code: '504', // String number
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(504);
    });

    it('should extract status from error.status property', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Service unavailable',
        status: 503, // Should use this as final fallback
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(503);
    });

    it('should parse status from error message as last resort', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed with status code 422 - validation failed',
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(422);
    });

    it('should ignore invalid HTTP codes and return 500 default', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Error with invalid code',
        code: 999, // Invalid HTTP code
      };

      const status = extractHttpStatus(mockError);
      expect(status).toBe(500); // Default fallback
    });

    it('should handle non-object errors', () => {
      expect(extractHttpStatus(null)).toBe(500);
      expect(extractHttpStatus(undefined)).toBe(500);
      expect(extractHttpStatus('string error')).toBe(500);
      expect(extractHttpStatus(123)).toBe(500);
    });

    it('should handle empty objects', () => {
      const status = extractHttpStatus({});
      expect(status).toBe(500);
    });

    it('should validate HTTP code range (100-599)', () => {
      const invalidCodes = [99, 600, -1, 0];

      invalidCodes.forEach(code => {
        const mockError: GaxiosErrorLike = {
          message: 'Error',
          code,
        };

        const status = extractHttpStatus(mockError);
        expect(status).toBe(500); // Should fallback to 500 for invalid codes
      });
    });
  });

  describe('extractReason()', () => {
    it('should extract reason from first error detail', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Bad request',
              errors: [
                {
                  message: 'Invalid field',
                  domain: 'global',
                  reason: 'invalidValue', // Should extract this
                },
                {
                  message: 'Another error',
                  domain: 'sheets',
                  reason: 'otherReason',
                },
              ],
            },
          },
        },
      };

      const reason = extractReason(mockError);
      expect(reason).toBe('invalidValue');
    });

    it('should return undefined when no structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 404,
          data: 'Not found',
        },
      };

      const reason = extractReason(mockError);
      expect(reason).toBeUndefined();
    });

    it('should return undefined when errors array is empty', () => {
      const mockError: GaxiosErrorLike = {
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

      const reason = extractReason(mockError);
      expect(reason).toBeUndefined();
    });

    it('should handle malformed error structure', () => {
      const mockError: GaxiosErrorLike = {
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

      const reason = extractReason(mockError);
      expect(reason).toBeUndefined();
    });

    it('should handle non-object errors', () => {
      expect(extractReason(null)).toBeUndefined();
      expect(extractReason('string')).toBeUndefined();
      expect(extractReason(123)).toBeUndefined();
    });
  });

  describe('extractDomain()', () => {
    it('should extract domain from first error detail', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Bad request',
              errors: [
                {
                  message: 'Sheet not found',
                  domain: 'sheets', // Should extract this
                  reason: 'notFound',
                },
              ],
            },
          },
        },
      };

      const domain = extractDomain(mockError);
      expect(domain).toBe('sheets');
    });

    it('should return undefined when no structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 404,
          data: 'Not found',
        },
      };

      const domain = extractDomain(mockError);
      expect(domain).toBeUndefined();
    });

    it('should handle different domain values', () => {
      const domains = ['global', 'sheets', 'drive', 'usageLimits', 'calendar'];

      domains.forEach(expectedDomain => {
        const mockError: GaxiosErrorLike = {
          message: 'Request failed',
          response: {
            status: 400,
            data: {
              error: {
                code: 400,
                message: 'Error',
                errors: [
                  {
                    message: 'Error message',
                    domain: expectedDomain,
                    reason: 'testReason',
                  },
                ],
              },
            },
          },
        };

        const domain = extractDomain(mockError);
        expect(domain).toBe(expectedDomain);
      });
    });
  });

  describe('extractGrpcStatus()', () => {
    it('should extract gRPC status from structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 403,
          data: {
            error: {
              code: 403,
              message: 'Permission denied',
              status: 'PERMISSION_DENIED', // Should extract this
            },
          },
        },
      };

      const grpcStatus = extractGrpcStatus(mockError);
      expect(grpcStatus).toBe('PERMISSION_DENIED');
    });

    it('should handle different gRPC status codes', () => {
      const grpcStatuses = [
        'UNAUTHENTICATED',
        'PERMISSION_DENIED',
        'NOT_FOUND',
        'RESOURCE_EXHAUSTED',
        'INVALID_ARGUMENT',
        'INTERNAL',
        'UNAVAILABLE',
      ];

      grpcStatuses.forEach(expectedStatus => {
        const mockError: GaxiosErrorLike = {
          message: 'Request failed',
          response: {
            status: 400,
            data: {
              error: {
                code: 400,
                message: 'Error',
                status: expectedStatus,
              },
            },
          },
        };

        const grpcStatus = extractGrpcStatus(mockError);
        expect(grpcStatus).toBe(expectedStatus);
      });
    });

    it('should return undefined when no structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 404,
          data: 'Not found',
        },
      };

      const grpcStatus = extractGrpcStatus(mockError);
      expect(grpcStatus).toBeUndefined();
    });

    it('should return undefined when status field missing', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Error',
              // Missing status field
            },
          },
        },
      };

      const grpcStatus = extractGrpcStatus(mockError);
      expect(grpcStatus).toBeUndefined();
    });
  });

  describe('extractLocation()', () => {
    it('should extract location and locationType from first error detail', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Invalid parameter',
              errors: [
                {
                  message: 'Invalid range specified',
                  domain: 'sheets',
                  reason: 'invalidRange',
                  location: 'range', // Should extract this
                  locationType: 'parameter', // And this
                },
              ],
            },
          },
        },
      };

      const location = extractLocation(mockError);
      expect(location.location).toBe('range');
      expect(location.locationType).toBe('parameter');
    });

    it('should handle missing location fields gracefully', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Error',
              errors: [
                {
                  message: 'Error message',
                  domain: 'global',
                  reason: 'testReason',
                  // Missing location and locationType
                },
              ],
            },
          },
        },
      };

      const location = extractLocation(mockError);
      expect(location.location).toBeUndefined();
      expect(location.locationType).toBeUndefined();
    });

    it('should return empty object when no structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 404,
          data: 'Not found',
        },
      };

      const location = extractLocation(mockError);
      expect(location).toEqual({});
    });

    it('should handle different location types', () => {
      const locationTypes = ['parameter', 'header', 'body', 'query', 'path'];

      locationTypes.forEach(locationType => {
        const mockError: GaxiosErrorLike = {
          message: 'Request failed',
          response: {
            status: 400,
            data: {
              error: {
                code: 400,
                message: 'Error',
                errors: [
                  {
                    message: 'Error',
                    domain: 'global',
                    reason: 'invalid',
                    location: 'testField',
                    locationType,
                  },
                ],
              },
            },
          },
        };

        const location = extractLocation(mockError);
        expect(location.locationType).toBe(locationType);
      });
    });
  });

  describe('extractErrorDetails()', () => {
    it('should extract all error details from structured response', () => {
      const mockErrors: GoogleApiErrorDetail[] = [
        {
          message: 'First error',
          domain: 'sheets',
          reason: 'invalidRange',
        },
        {
          message: 'Second error',
          domain: 'global',
          reason: 'forbidden',
          location: 'userId',
          locationType: 'parameter',
        },
      ];

      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Multiple errors',
              errors: mockErrors,
            },
          },
        },
      };

      const details = extractErrorDetails(mockError);
      expect(details).toHaveLength(2);
      expect(details[0]).toEqual(mockErrors[0]);
      expect(details[1]).toEqual(mockErrors[1]);
    });

    it('should return empty array when no errors field', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Error',
              // Missing errors array
            },
          },
        },
      };

      const details = extractErrorDetails(mockError);
      expect(details).toEqual([]);
    });

    it('should return empty array when errors is empty', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Error',
              errors: [],
            },
          },
        },
      };

      const details = extractErrorDetails(mockError);
      expect(details).toEqual([]);
    });

    it('should return empty array when no structured error', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed',
        response: {
          status: 404,
          data: 'Not found',
        },
      };

      const details = extractErrorDetails(mockError);
      expect(details).toEqual([]);
    });
  });

  describe('extractRetryAfter()', () => {
    it('should extract retry-after from response headers', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Rate limit exceeded',
        response: {
          status: 429,
          data: null,
          headers: {
            'retry-after': '60', // 60 seconds
          },
        } as GaxiosErrorLike['response'] & { headers: Record<string, string> },
      };

      const retryAfter = extractRetryAfter(mockError);
      expect(retryAfter).toBe(60000); // Should convert to milliseconds
    });

    it('should extract retry-after from Retry-After header (capitalized)', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Rate limit exceeded',
        response: {
          status: 429,
          data: null,
          headers: {
            'Retry-After': '30',
          },
        } as GaxiosErrorLike['response'] & { headers: Record<string, string> },
      };

      const retryAfter = extractRetryAfter(mockError);
      expect(retryAfter).toBe(30000);
    });

    it('should parse retry-after from error message', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Rate limit exceeded, please retry after 45 seconds',
      };

      const retryAfter = extractRetryAfter(mockError);
      expect(retryAfter).toBe(45000);
    });

    it('should parse "retry in" pattern from error message', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Too many requests, retry in 120 seconds',
      };

      const retryAfter = extractRetryAfter(mockError);
      expect(retryAfter).toBe(120000);
    });

    it('should return undefined when no retry-after information found', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Some error without retry info',
        response: {
          status: 500,
          data: null,
        },
      };

      const retryAfter = extractRetryAfter(mockError);
      expect(retryAfter).toBeUndefined();
    });

    it('should handle invalid retry-after values', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Error',
        response: {
          status: 429,
          data: null,
          headers: {
            'retry-after': 'invalid-value',
          },
        } as GaxiosErrorLike['response'] & { headers: Record<string, string> },
      };

      const retryAfter = extractRetryAfter(mockError);
      expect(retryAfter).toBeUndefined();
    });

    it('should handle non-object errors', () => {
      expect(extractRetryAfter(null)).toBeUndefined();
      expect(extractRetryAfter('string')).toBeUndefined();
      expect(extractRetryAfter(123)).toBeUndefined();
    });
  });

  describe('Classification Functions', () => {
    describe('isAuthenticationError()', () => {
      it('should identify HTTP 401 as authentication error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Unauthorized',
          response: { status: 401, data: null },
        };

        expect(isAuthenticationError(mockError)).toBe(true);
      });

      it('should identify HTTP 403 as authentication error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Forbidden',
          response: { status: 403, data: null },
        };

        expect(isAuthenticationError(mockError)).toBe(true);
      });

      it('should identify PERMISSION_DENIED gRPC status as auth error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Permission denied',
          response: {
            status: 403,
            data: {
              error: {
                code: 403,
                message: 'Permission denied',
                status: 'PERMISSION_DENIED',
              },
            },
          },
        };

        expect(isAuthenticationError(mockError)).toBe(true);
      });

      it('should identify UNAUTHENTICATED gRPC status as auth error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Unauthenticated',
          response: {
            status: 401,
            data: {
              error: {
                code: 401,
                message: 'Unauthenticated',
                status: 'UNAUTHENTICATED',
              },
            },
          },
        };

        expect(isAuthenticationError(mockError)).toBe(true);
      });

      it('should identify auth-related reasons as authentication errors', () => {
        const authReasons = ['forbidden', 'unauthorized', 'authError'];

        authReasons.forEach(reason => {
          const mockError: GaxiosErrorLike = {
            message: 'Auth error',
            response: {
              status: 400,
              data: {
                error: {
                  code: 400,
                  message: 'Error',
                  errors: [{ message: 'Error', domain: 'global', reason }],
                },
              },
            },
          };

          expect(isAuthenticationError(mockError)).toBe(true);
        });
      });

      it('should identify authentication keywords in error message', () => {
        const authMessages = [
          'Authentication failed',
          'Authorization required',
          'Invalid credentials provided',
          'Token expired',
          'Permission denied',
          'Forbidden access',
          'Unauthorized request',
          'Access denied to resource',
        ];

        authMessages.forEach(message => {
          const mockError: GaxiosErrorLike = { message };
          expect(isAuthenticationError(mockError)).toBe(true);
        });
      });

      it('should not identify non-auth errors as authentication errors', () => {
        const nonAuthError: GaxiosErrorLike = {
          message: 'Resource not found',
          response: { status: 404, data: null },
        };

        expect(isAuthenticationError(nonAuthError)).toBe(false);
      });

      it('should handle malformed errors gracefully', () => {
        expect(isAuthenticationError(null)).toBe(false);
        expect(isAuthenticationError('string')).toBe(false);
        expect(isAuthenticationError({})).toBe(false);
      });
    });

    describe('isRateLimitError()', () => {
      it('should identify HTTP 429 as rate limit error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Too many requests',
          response: { status: 429, data: null },
        };

        expect(isRateLimitError(mockError)).toBe(true);
      });

      it('should identify RESOURCE_EXHAUSTED gRPC status as rate limit error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Resource exhausted',
          response: {
            status: 429,
            data: {
              error: {
                code: 429,
                message: 'Resource exhausted',
                status: 'RESOURCE_EXHAUSTED',
              },
            },
          },
        };

        expect(isRateLimitError(mockError)).toBe(true);
      });

      it('should identify rate limit reasons', () => {
        const rateLimitReasons = [
          'rateLimitExceeded',
          'quotaExceeded',
          'dailyLimitExceeded',
        ];

        rateLimitReasons.forEach(reason => {
          const mockError: GaxiosErrorLike = {
            message: 'Rate limit',
            response: {
              status: 400,
              data: {
                error: {
                  code: 400,
                  message: 'Error',
                  errors: [{ message: 'Error', domain: 'global', reason }],
                },
              },
            },
          };

          expect(isRateLimitError(mockError)).toBe(true);
        });
      });

      it('should identify rate limit keywords in error message', () => {
        const rateLimitMessages = [
          'Rate limit exceeded',
          'Quota exceeded for this operation',
          'Too many requests per minute',
          'Daily limit reached',
          'API limit exceeded',
        ];

        rateLimitMessages.forEach(message => {
          const mockError: GaxiosErrorLike = { message };
          expect(isRateLimitError(mockError)).toBe(true);
        });
      });

      it('should not identify non-rate-limit errors', () => {
        const nonRateLimitError: GaxiosErrorLike = {
          message: 'Resource not found',
          response: { status: 404, data: null },
        };

        expect(isRateLimitError(nonRateLimitError)).toBe(false);
      });
    });

    describe('isNotFoundError()', () => {
      it('should identify HTTP 404 as not found error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Not found',
          response: { status: 404, data: null },
        };

        expect(isNotFoundError(mockError)).toBe(true);
      });

      it('should identify NOT_FOUND gRPC status as not found error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Not found',
          response: {
            status: 404,
            data: {
              error: {
                code: 404,
                message: 'Not found',
                status: 'NOT_FOUND',
              },
            },
          },
        };

        expect(isNotFoundError(mockError)).toBe(true);
      });

      it('should identify notFound reason as not found error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Not found',
          response: {
            status: 400,
            data: {
              error: {
                code: 400,
                message: 'Error',
                errors: [
                  { message: 'Error', domain: 'global', reason: 'notFound' },
                ],
              },
            },
          },
        };

        expect(isNotFoundError(mockError)).toBe(true);
      });

      it('should identify "not found" in error message', () => {
        const notFoundMessages = [
          'Resource not found',
          'File not found',
          'Spreadsheet not found',
          'The requested item was not found',
        ];

        notFoundMessages.forEach(message => {
          const mockError: GaxiosErrorLike = { message };
          expect(isNotFoundError(mockError)).toBe(true);
        });
      });

      it('should not identify non-not-found errors', () => {
        const nonNotFoundError: GaxiosErrorLike = {
          message: 'Permission denied',
          response: { status: 403, data: null },
        };

        expect(isNotFoundError(nonNotFoundError)).toBe(false);
      });
    });
  });

  describe('analyzeError() - Comprehensive Analysis', () => {
    it('should provide complete error analysis for structured Google API error', () => {
      const mockError: GaxiosErrorLike = {
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
                  message: 'Insufficient permissions for spreadsheet',
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

      const analysis = analyzeError(mockError);

      // Verify normalized error
      expect(analysis.normalized.httpStatus).toBe(403);
      expect(analysis.normalized.message).toBe(
        'The user does not have sufficient permissions'
      );
      expect(analysis.normalized.status).toBe('PERMISSION_DENIED');
      expect(analysis.normalized.reason).toBe('forbidden');
      expect(analysis.normalized.isRetryable).toBe(false);

      // Verify individual extractions
      expect(analysis.httpStatus).toBe(403);
      expect(analysis.reason).toBe('forbidden');
      expect(analysis.domain).toBe('sheets');
      expect(analysis.grpcStatus).toBe('PERMISSION_DENIED');
      expect(analysis.location?.location).toBe('spreadsheetId');
      expect(analysis.location?.locationType).toBe('parameter');
      expect(analysis.details).toHaveLength(1);

      // Verify classifications
      expect(analysis.isAuthentication).toBe(true);
      expect(analysis.isRateLimit).toBe(false);
      expect(analysis.isNotFound).toBe(false);

      // Verify retry-after
      expect(analysis.retryAfterMs).toBeUndefined();
    });

    it('should analyze rate limiting error with retry-after', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Too many requests, retry after 60 seconds',
        response: {
          status: 429,
          data: {
            error: {
              code: 429,
              message: 'Rate limit exceeded',
              status: 'RESOURCE_EXHAUSTED',
              errors: [
                {
                  message: 'Quota exceeded',
                  domain: 'usageLimits',
                  reason: 'rateLimitExceeded',
                },
              ],
            },
          },
          headers: {
            'retry-after': '60',
          },
        } as GaxiosErrorLike['response'] & { headers: Record<string, string> },
      };

      const analysis = analyzeError(mockError);

      expect(analysis.normalized.httpStatus).toBe(429);
      expect(analysis.normalized.isRetryable).toBe(true);
      expect(analysis.reason).toBe('rateLimitExceeded');
      expect(analysis.grpcStatus).toBe('RESOURCE_EXHAUSTED');
      expect(analysis.isRateLimit).toBe(true);
      expect(analysis.isAuthentication).toBe(false);
      expect(analysis.isNotFound).toBe(false);
      expect(analysis.retryAfterMs).toBe(60000);
    });

    it('should analyze simple HTTP error without structured response', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Request failed with status code 500',
        response: {
          status: 500,
          data: 'Internal server error',
        },
      };

      const analysis = analyzeError(mockError);

      expect(analysis.normalized.httpStatus).toBe(500);
      expect(analysis.normalized.isRetryable).toBe(true);
      expect(analysis.httpStatus).toBe(500);
      expect(analysis.reason).toBeUndefined();
      expect(analysis.grpcStatus).toBeUndefined();
      expect(analysis.details).toHaveLength(0);
      expect(analysis.isAuthentication).toBe(false);
      expect(analysis.isRateLimit).toBe(false);
      expect(analysis.isNotFound).toBe(false);
    });

    it('should analyze network error without response', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Network connection failed',
        code: 'ECONNREFUSED',
      };

      const analysis = analyzeError(mockError);

      expect(analysis.normalized.httpStatus).toBe(500); // Default
      expect(analysis.normalized.isRetryable).toBe(true); // Network errors are retryable
      expect(analysis.httpStatus).toBe(500);
      expect(analysis.reason).toBeUndefined();
      expect(analysis.details).toHaveLength(0);
    });

    it('should handle null/undefined errors gracefully', () => {
      const nullAnalysis = analyzeError(null);
      const undefinedAnalysis = analyzeError(undefined);

      [nullAnalysis, undefinedAnalysis].forEach(analysis => {
        expect(analysis.normalized.httpStatus).toBe(500);
        expect(analysis.normalized.message).toBe('Unknown error occurred');
        expect(analysis.httpStatus).toBe(500);
        expect(analysis.reason).toBeUndefined();
        expect(analysis.details).toHaveLength(0);
        expect(analysis.isAuthentication).toBe(false);
        expect(analysis.isRateLimit).toBe(false);
        expect(analysis.isNotFound).toBe(false);
      });
    });

    it('should analyze error with mixed classification indicators', () => {
      const mockError: GaxiosErrorLike = {
        message:
          'Authentication failed - rate limit exceeded for invalid resource',
        response: {
          status: 401,
          data: {
            error: {
              code: 401,
              message: 'Auth error with rate limit context',
              errors: [
                {
                  message: 'Authentication failed',
                  domain: 'global',
                  reason: 'unauthorized',
                },
              ],
            },
          },
        },
      };

      const analysis = analyzeError(mockError);

      expect(analysis.isAuthentication).toBe(true); // 401 + reason
      expect(analysis.isRateLimit).toBe(true); // Message contains "rate limit"
      expect(analysis.isNotFound).toBe(false); // No 404 indicators
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle completely malformed error objects', () => {
      const malformedError = {
        someRandomProperty: 'value',
        anotherProperty: { nested: 'data' },
      };

      const status = extractHttpStatus(malformedError);
      const reason = extractReason(malformedError);
      const domain = extractDomain(malformedError);

      expect(status).toBe(500);
      expect(reason).toBeUndefined();
      expect(domain).toBeUndefined();
    });

    it('should handle errors with partial structures', () => {
      const partialError = {
        message: 'Partial error',
        response: {
          // Missing status
          data: {
            error: {
              code: 'not-a-number',
              // Missing message
              errors: 'not-an-array',
            },
          },
        },
      };

      const analysis = analyzeError(partialError);
      expect(analysis.normalized.httpStatus).toBe(500);
      expect(analysis.normalized.message).toBe('Partial error');
      expect(analysis.details).toHaveLength(0);
    });

    it('should handle circular reference errors safely', () => {
      const circularError: Record<string, unknown> = {
        message: 'Circular error',
      };
      circularError.self = circularError;

      // Should not throw and should extract basic information
      const analysis = analyzeError(circularError);
      expect(analysis.normalized.message).toBe('Circular error');
      expect(analysis.normalized.httpStatus).toBe(500);
    });
  });
});
