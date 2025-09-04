/**
 * Unit tests for generic error detection utilities
 *
 * This test suite ensures that the new configurable error detection pattern
 * works correctly and maintains 100% backward compatibility with the existing
 * classification functions.
 *
 * @fileoverview Tests for Generic Error Detection Utilities
 */

import {
  detectErrorType,
  authenticationErrorConfig,
  rateLimitErrorConfig,
  notFoundErrorConfig,
  detectAuthenticationError,
  detectRateLimitError,
  detectNotFoundError,
  ErrorDetectionConfig,
} from './error-detection.utils.js';
import { GaxiosErrorLike } from './normalized-error.js';

describe('Generic Error Detection Utilities', () => {
  describe('detectErrorType()', () => {
    const testConfig: ErrorDetectionConfig = {
      httpStatusCodes: [400, 422],
      grpcStatusCodes: ['INVALID_ARGUMENT', 'FAILED_PRECONDITION'],
      reasons: ['invalidValue', 'badRequest'],
      messageKeywords: ['validation', 'invalid input'],
      reasonPatterns: (reason: string) => reason.startsWith('custom_'),
    };

    it('should detect errors by HTTP status codes', () => {
      const mockError400: GaxiosErrorLike = {
        message: 'Bad request',
        response: { status: 400, data: null },
      };

      const mockError422: GaxiosErrorLike = {
        message: 'Validation failed',
        response: { status: 422, data: null },
      };

      expect(detectErrorType(mockError400, testConfig)).toBe(true);
      expect(detectErrorType(mockError422, testConfig)).toBe(true);
    });

    it('should detect errors by gRPC status codes', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Invalid argument',
        response: {
          status: 400,
          data: {
            error: {
              code: 400,
              message: 'Invalid argument',
              status: 'INVALID_ARGUMENT',
            },
          },
        },
      };

      expect(detectErrorType(mockError, testConfig)).toBe(true);
    });

    it('should detect errors by reason codes', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Bad request',
        response: {
          status: 200,
          data: {
            error: {
              code: 200,
              message: 'Error',
              errors: [
                {
                  message: 'Invalid value',
                  domain: 'global',
                  reason: 'invalidValue',
                },
              ],
            },
          },
        },
      };

      expect(detectErrorType(mockError, testConfig)).toBe(true);
    });

    it('should detect errors by message keywords', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Validation error occurred',
      };

      expect(detectErrorType(mockError, testConfig)).toBe(true);
    });

    it('should detect errors by reason patterns', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Custom error',
        response: {
          status: 200,
          data: {
            error: {
              code: 200,
              message: 'Error',
              errors: [
                {
                  message: 'Custom error',
                  domain: 'global',
                  reason: 'custom_validation_error',
                },
              ],
            },
          },
        },
      };

      expect(detectErrorType(mockError, testConfig)).toBe(true);
    });

    it('should return false when no criteria match', () => {
      const mockError: GaxiosErrorLike = {
        message: 'Some other error',
        response: { status: 500, data: null },
      };

      expect(detectErrorType(mockError, testConfig)).toBe(false);
    });

    it('should handle non-object errors gracefully', () => {
      expect(detectErrorType(null, testConfig)).toBe(false);
      expect(detectErrorType(undefined, testConfig)).toBe(false);
      expect(detectErrorType('string error', testConfig)).toBe(false);
      expect(detectErrorType(123, testConfig)).toBe(false);
    });

    it('should handle errors without message property', () => {
      const mockError = { someOtherProperty: 'value' };
      expect(detectErrorType(mockError, testConfig)).toBe(false);
    });

    it('should handle case-insensitive message keyword matching', () => {
      const mockErrorUpperCase: GaxiosErrorLike = {
        message: 'VALIDATION ERROR OCCURRED',
      };

      const mockErrorMixedCase: GaxiosErrorLike = {
        message: 'Invalid Input Provided',
      };

      expect(detectErrorType(mockErrorUpperCase, testConfig)).toBe(true);
      expect(detectErrorType(mockErrorMixedCase, testConfig)).toBe(true);
    });
  });

  describe('Authentication Error Configuration', () => {
    it('should have correct HTTP status codes for authentication', () => {
      expect(authenticationErrorConfig.httpStatusCodes).toEqual([401, 403]);
    });

    it('should have correct gRPC status codes for authentication', () => {
      expect(authenticationErrorConfig.grpcStatusCodes).toEqual([
        'PERMISSION_DENIED',
        'UNAUTHENTICATED',
      ]);
    });

    it('should have correct reasons for authentication', () => {
      expect(authenticationErrorConfig.reasons).toEqual([
        'forbidden',
        'unauthorized',
      ]);
    });

    it('should have correct message keywords for authentication', () => {
      expect(authenticationErrorConfig.messageKeywords).toEqual([
        'authentication',
        'authorization',
        'credential',
        'token',
        'permission',
        'forbidden',
        'unauthorized',
        'access denied',
      ]);
    });

    it('should have reason pattern that matches auth-containing reasons', () => {
      const { reasonPatterns } = authenticationErrorConfig;
      expect(reasonPatterns).toBeDefined();
      expect(reasonPatterns!('authError')).toBe(true);
      expect(reasonPatterns!('authentication')).toBe(true);
      expect(reasonPatterns!('noauth')).toBe(true);
      expect(reasonPatterns!('other')).toBe(false);
    });
  });

  describe('Rate Limit Error Configuration', () => {
    it('should have correct HTTP status codes for rate limiting', () => {
      expect(rateLimitErrorConfig.httpStatusCodes).toEqual([429]);
    });

    it('should have correct gRPC status codes for rate limiting', () => {
      expect(rateLimitErrorConfig.grpcStatusCodes).toEqual([
        'RESOURCE_EXHAUSTED',
      ]);
    });

    it('should have correct reasons for rate limiting', () => {
      expect(rateLimitErrorConfig.reasons).toEqual([
        'rateLimitExceeded',
        'quotaExceeded',
        'dailyLimitExceeded',
      ]);
    });

    it('should have correct message keywords for rate limiting', () => {
      expect(rateLimitErrorConfig.messageKeywords).toEqual([
        'rate limit',
        'quota exceeded',
        'too many requests',
        'daily limit',
        'api limit',
      ]);
    });

    it('should not have reason patterns for rate limiting', () => {
      expect(rateLimitErrorConfig.reasonPatterns).toBeUndefined();
    });
  });

  describe('Not Found Error Configuration', () => {
    it('should have correct HTTP status codes for not found', () => {
      expect(notFoundErrorConfig.httpStatusCodes).toEqual([404]);
    });

    it('should have correct gRPC status codes for not found', () => {
      expect(notFoundErrorConfig.grpcStatusCodes).toEqual(['NOT_FOUND']);
    });

    it('should have correct reasons for not found', () => {
      expect(notFoundErrorConfig.reasons).toEqual(['notFound']);
    });

    it('should have correct message keywords for not found', () => {
      expect(notFoundErrorConfig.messageKeywords).toEqual(['not found']);
    });

    it('should not have reason patterns for not found', () => {
      expect(notFoundErrorConfig.reasonPatterns).toBeUndefined();
    });
  });

  describe('Convenience Functions', () => {
    describe('detectAuthenticationError()', () => {
      it('should detect HTTP 401 as authentication error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Unauthorized',
          response: { status: 401, data: null },
        };

        expect(detectAuthenticationError(mockError)).toBe(true);
      });

      it('should detect HTTP 403 as authentication error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Forbidden',
          response: { status: 403, data: null },
        };

        expect(detectAuthenticationError(mockError)).toBe(true);
      });

      it('should detect PERMISSION_DENIED gRPC status', () => {
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

        expect(detectAuthenticationError(mockError)).toBe(true);
      });

      it('should detect auth-related reasons', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Auth error',
          response: {
            status: 200,
            data: {
              error: {
                code: 200,
                message: 'Error',
                errors: [
                  {
                    message: 'Error',
                    domain: 'global',
                    reason: 'authError',
                  },
                ],
              },
            },
          },
        };

        expect(detectAuthenticationError(mockError)).toBe(true);
      });

      it('should detect authentication keywords in message', () => {
        const authMessages = [
          'Authentication failed',
          'Authorization required',
          'Invalid credentials',
          'Token expired',
          'Access denied',
        ];

        authMessages.forEach(message => {
          const mockError: GaxiosErrorLike = { message };
          expect(detectAuthenticationError(mockError)).toBe(true);
        });
      });
    });

    describe('detectRateLimitError()', () => {
      it('should detect HTTP 429 as rate limit error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Too many requests',
          response: { status: 429, data: null },
        };

        expect(detectRateLimitError(mockError)).toBe(true);
      });

      it('should detect RESOURCE_EXHAUSTED gRPC status', () => {
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

        expect(detectRateLimitError(mockError)).toBe(true);
      });

      it('should detect rate limit reasons', () => {
        const rateLimitReasons = [
          'rateLimitExceeded',
          'quotaExceeded',
          'dailyLimitExceeded',
        ];

        rateLimitReasons.forEach(reason => {
          const mockError: GaxiosErrorLike = {
            message: 'Rate limit',
            response: {
              status: 200,
              data: {
                error: {
                  code: 200,
                  message: 'Error',
                  errors: [
                    {
                      message: 'Error',
                      domain: 'global',
                      reason,
                    },
                  ],
                },
              },
            },
          };

          expect(detectRateLimitError(mockError)).toBe(true);
        });
      });

      it('should detect rate limit keywords in message', () => {
        const rateLimitMessages = [
          'Rate limit exceeded',
          'Quota exceeded',
          'Too many requests',
          'Daily limit reached',
          'API limit exceeded',
        ];

        rateLimitMessages.forEach(message => {
          const mockError: GaxiosErrorLike = { message };
          expect(detectRateLimitError(mockError)).toBe(true);
        });
      });
    });

    describe('detectNotFoundError()', () => {
      it('should detect HTTP 404 as not found error', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Not found',
          response: { status: 404, data: null },
        };

        expect(detectNotFoundError(mockError)).toBe(true);
      });

      it('should detect NOT_FOUND gRPC status', () => {
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

        expect(detectNotFoundError(mockError)).toBe(true);
      });

      it('should detect notFound reason', () => {
        const mockError: GaxiosErrorLike = {
          message: 'Not found',
          response: {
            status: 200,
            data: {
              error: {
                code: 200,
                message: 'Error',
                errors: [
                  {
                    message: 'Error',
                    domain: 'global',
                    reason: 'notFound',
                  },
                ],
              },
            },
          },
        };

        expect(detectNotFoundError(mockError)).toBe(true);
      });

      it('should detect "not found" in error message', () => {
        const notFoundMessages = [
          'Resource not found',
          'File not found',
          'The item was not found',
        ];

        notFoundMessages.forEach(message => {
          const mockError: GaxiosErrorLike = { message };
          expect(detectNotFoundError(mockError)).toBe(true);
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle configuration with empty arrays', () => {
      const emptyConfig: ErrorDetectionConfig = {
        httpStatusCodes: [],
        grpcStatusCodes: [],
        reasons: [],
        messageKeywords: [],
      };

      const mockError: GaxiosErrorLike = {
        message: 'Some error',
        response: { status: 500, data: null },
      };

      expect(detectErrorType(mockError, emptyConfig)).toBe(false);
    });

    it('should handle malformed errors gracefully', () => {
      const malformedError = {
        message: 123, // Wrong type
        response: 'not an object',
      };

      expect(detectAuthenticationError(malformedError)).toBe(false);
      expect(detectRateLimitError(malformedError)).toBe(false);
      expect(detectNotFoundError(malformedError)).toBe(false);
    });

    it('should handle config with undefined reasonPatterns', () => {
      const configWithoutPatterns: ErrorDetectionConfig = {
        httpStatusCodes: [400],
        grpcStatusCodes: [],
        reasons: [],
        messageKeywords: [],
        reasonPatterns: undefined,
      };

      const mockError: GaxiosErrorLike = {
        message: 'Test error',
        response: {
          status: 200,
          data: {
            error: {
              code: 200,
              message: 'Error',
              errors: [
                {
                  message: 'Error',
                  domain: 'global',
                  reason: 'someReason',
                },
              ],
            },
          },
        },
      };

      expect(detectErrorType(mockError, configWithoutPatterns)).toBe(false);
    });
  });
});
