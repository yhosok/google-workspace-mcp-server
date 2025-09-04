/**
 * Generic error detection utilities for Google API responses
 *
 * This module provides a configurable, generic pattern for detecting specific
 * error types from Google API responses. It eliminates code duplication by
 * providing a unified error detection mechanism that can be configured for
 * different error types while maintaining 100% backward compatibility.
 *
 * @fileoverview Generic Error Detection Utilities
 */

import {
  extractHttpStatus,
  extractReason,
  extractGrpcStatus,
} from './error-extractor.js';

/**
 * Configuration interface for error detection patterns
 */
export interface ErrorDetectionConfig {
  /** HTTP status codes that indicate this error type */
  httpStatusCodes: number[];
  /** gRPC status codes that indicate this error type */
  grpcStatusCodes: string[];
  /** Specific reason codes that indicate this error type */
  reasons: string[];
  /** Keywords to search for in error messages (case-insensitive) */
  messageKeywords: string[];
  /** Additional reason pattern matching function (optional) */
  reasonPatterns?: (reason: string) => boolean;
}

/**
 * Generic error detection function that uses configuration to identify error types
 *
 * This function implements the common pattern used by isAuthenticationError,
 * isRateLimitError, and isNotFoundError functions, but in a configurable way.
 *
 * @param error - The error to check
 * @param config - Configuration defining the error detection criteria
 * @returns True if the error matches the configured criteria
 */
export function detectErrorType(
  error: unknown,
  config: ErrorDetectionConfig
): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const httpStatus = extractHttpStatus(error);
  const reason = extractReason(error);
  const grpcStatus = extractGrpcStatus(error);

  // Check HTTP status codes
  if (config.httpStatusCodes.includes(httpStatus)) {
    return true;
  }

  // Check gRPC status codes
  if (grpcStatus && config.grpcStatusCodes.includes(grpcStatus)) {
    return true;
  }

  // Check error reason - exact matches
  if (reason && config.reasons.includes(reason)) {
    return true;
  }

  // Check error reason - pattern matching (if provided)
  if (reason && config.reasonPatterns && config.reasonPatterns(reason)) {
    return true;
  }

  // Check error message for keywords
  if (
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.toLowerCase();

    if (config.messageKeywords.some(keyword => message.includes(keyword))) {
      return true;
    }
  }

  return false;
}

/**
 * Configuration for authentication error detection
 */
export const authenticationErrorConfig: ErrorDetectionConfig = {
  httpStatusCodes: [401, 403],
  grpcStatusCodes: ['PERMISSION_DENIED', 'UNAUTHENTICATED'],
  reasons: ['forbidden', 'unauthorized'],
  messageKeywords: [
    'authentication',
    'authorization',
    'credential',
    'token',
    'permission',
    'forbidden',
    'unauthorized',
    'access denied',
  ],
  reasonPatterns: (reason: string) => reason.includes('auth'),
};

/**
 * Configuration for rate limit error detection
 */
export const rateLimitErrorConfig: ErrorDetectionConfig = {
  httpStatusCodes: [429],
  grpcStatusCodes: ['RESOURCE_EXHAUSTED'],
  reasons: ['rateLimitExceeded', 'quotaExceeded', 'dailyLimitExceeded'],
  messageKeywords: [
    'rate limit',
    'quota exceeded',
    'too many requests',
    'daily limit',
    'api limit',
  ],
};

/**
 * Configuration for not found error detection
 */
export const notFoundErrorConfig: ErrorDetectionConfig = {
  httpStatusCodes: [404],
  grpcStatusCodes: ['NOT_FOUND'],
  reasons: ['notFound'],
  messageKeywords: ['not found'],
};

/**
 * Convenience function for detecting authentication errors using the generic pattern
 *
 * @param error - The error to check
 * @returns True if the error appears to be authentication-related
 */
export function detectAuthenticationError(error: unknown): boolean {
  return detectErrorType(error, authenticationErrorConfig);
}

/**
 * Convenience function for detecting rate limit errors using the generic pattern
 *
 * @param error - The error to check
 * @returns True if the error appears to be rate limiting related
 */
export function detectRateLimitError(error: unknown): boolean {
  return detectErrorType(error, rateLimitErrorConfig);
}

/**
 * Convenience function for detecting not found errors using the generic pattern
 *
 * @param error - The error to check
 * @returns True if the error indicates a resource was not found
 */
export function detectNotFoundError(error: unknown): boolean {
  return detectErrorType(error, notFoundErrorConfig);
}
