/**
 * Error extraction utilities for Google API responses
 *
 * This module provides specialized utility functions for extracting specific
 * information from errors, particularly focusing on Google API error structures.
 * These utilities work with both GaxiosError objects and generic Error types.
 *
 * @fileoverview Google API Error Extraction Utilities
 */

import {
  NormalizedGoogleApiError,
  GoogleApiErrorDetail,
  GaxiosErrorLike,
  isGoogleApiErrorResponse,
  extractGoogleApiError,
} from './normalized-error.js';

/**
 * Extracts HTTP status code from various error sources
 *
 * Uses a priority-based approach:
 * 1. Google API structured error response
 * 2. HTTP response status
 * 3. Error code property
 * 4. Parsed from error message
 *
 * @param error - The error to extract status from
 * @returns HTTP status code, defaults to 500 if not found
 */
export function extractHttpStatus(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return 500;
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Priority 1: Google API structured error
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    return gaxiosError.response.data.error.code;
  }

  // Priority 2: HTTP response status
  if (gaxiosError.response?.status) {
    return gaxiosError.response.status;
  }

  // Priority 3: Error code
  if (gaxiosError.code) {
    const codeNumber =
      typeof gaxiosError.code === 'number'
        ? gaxiosError.code
        : parseInt(String(gaxiosError.code), 10);

    if (!isNaN(codeNumber) && codeNumber >= 100 && codeNumber < 600) {
      return codeNumber;
    }
  }

  // Priority 4: Status property
  if (gaxiosError.status) {
    return gaxiosError.status;
  }

  // Priority 5: Parse from message
  if (gaxiosError.message) {
    const statusMatch = gaxiosError.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
      const parsedStatus = parseInt(statusMatch[1], 10);
      if (parsedStatus >= 100 && parsedStatus < 600) {
        return parsedStatus;
      }
    }
  }

  return 500;
}

/**
 * Extracts machine-readable error reason from Google API errors
 *
 * @param error - The error to extract reason from
 * @returns Error reason string, or undefined if not found
 */
export function extractReason(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Extract from Google API structured error
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    const apiError = gaxiosError.response.data.error;
    if (apiError.errors && apiError.errors.length > 0) {
      return apiError.errors[0].reason;
    }
  }

  return undefined;
}

/**
 * Extracts error domain from Google API errors
 *
 * @param error - The error to extract domain from
 * @returns Error domain string, or undefined if not found
 */
export function extractDomain(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Extract from Google API structured error
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    const apiError = gaxiosError.response.data.error;
    if (apiError.errors && apiError.errors.length > 0) {
      return apiError.errors[0].domain;
    }
  }

  return undefined;
}

/**
 * Extracts gRPC status code from Google API errors
 *
 * @param error - The error to extract gRPC status from
 * @returns gRPC status string (e.g., "PERMISSION_DENIED"), or undefined if not found
 */
export function extractGrpcStatus(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Extract from Google API structured error
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    return gaxiosError.response.data.error.status;
  }

  return undefined;
}

/**
 * Extracts error location information from Google API errors
 *
 * @param error - The error to extract location from
 * @returns Object with location and locationType, or undefined properties if not found
 */
export function extractLocation(error: unknown): {
  location?: string;
  locationType?: string;
} {
  if (!error || typeof error !== 'object') {
    return {};
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Extract from Google API structured error
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    const apiError = gaxiosError.response.data.error;
    if (apiError.errors && apiError.errors.length > 0) {
      const firstError = apiError.errors[0];
      return {
        location: firstError.location,
        locationType: firstError.locationType,
      };
    }
  }

  return {};
}

/**
 * Extracts all error details from Google API errors
 *
 * @param error - The error to extract details from
 * @returns Array of error details, empty if none found
 */
export function extractErrorDetails(error: unknown): GoogleApiErrorDetail[] {
  if (!error || typeof error !== 'object') {
    return [];
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Extract from Google API structured error
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    const apiError = gaxiosError.response.data.error;
    return apiError.errors || [];
  }

  return [];
}

/**
 * Extracts retry-after value from rate limit errors
 *
 * Looks for retry-after information in various places:
 * 1. HTTP Retry-After header (if available)
 * 2. Error message parsing
 * 3. Google API error details
 *
 * @param error - The error to extract retry-after from
 * @returns Retry-after value in milliseconds, or undefined if not found
 */
export function extractRetryAfter(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const gaxiosError = error as GaxiosErrorLike;

  // Check for retry-after in response headers (if available)
  if (gaxiosError.response && 'headers' in gaxiosError.response) {
    const headers = (
      gaxiosError.response as GaxiosErrorLike['response'] & {
        headers: Record<string, string>;
      }
    ).headers;
    if (headers && (headers['retry-after'] || headers['Retry-After'])) {
      const retryAfter = headers['retry-after'] || headers['Retry-After'];
      const retryAfterMs = parseInt(String(retryAfter), 10) * 1000; // Convert seconds to milliseconds
      if (!isNaN(retryAfterMs)) {
        return retryAfterMs;
      }
    }
  }

  // Parse from error message
  if (gaxiosError.message) {
    const retryAfterMatch = gaxiosError.message.match(/retry after (\d+)/i);
    if (retryAfterMatch) {
      return parseInt(retryAfterMatch[1], 10) * 1000; // Assume seconds, convert to ms
    }

    // Look for other retry-related patterns
    const retryInMatch = gaxiosError.message.match(/retry in (\d+)/i);
    if (retryInMatch) {
      return parseInt(retryInMatch[1], 10) * 1000; // Assume seconds, convert to ms
    }
  }

  return undefined;
}

/**
 * Determines if an error is authentication-related
 *
 * @param error - The error to check
 * @returns True if the error appears to be authentication-related
 */
export function isAuthenticationError(error: unknown): boolean {
  const httpStatus = extractHttpStatus(error);
  const reason = extractReason(error);
  const grpcStatus = extractGrpcStatus(error);

  // Check HTTP status codes
  if (httpStatus === 401 || httpStatus === 403) {
    return true;
  }

  // Check gRPC status codes
  if (grpcStatus === 'PERMISSION_DENIED' || grpcStatus === 'UNAUTHENTICATED') {
    return true;
  }

  // Check error reason
  if (
    reason &&
    (reason.includes('auth') ||
      reason === 'forbidden' ||
      reason === 'unauthorized')
  ) {
    return true;
  }

  // Check error message for authentication-related keywords
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.toLowerCase();
    const authKeywords = [
      'authentication',
      'authorization',
      'credential',
      'token',
      'permission',
      'forbidden',
      'unauthorized',
      'access denied',
    ];

    return authKeywords.some(keyword => message.includes(keyword));
  }

  return false;
}

/**
 * Determines if an error is rate limiting related
 *
 * @param error - The error to check
 * @returns True if the error appears to be rate limiting related
 */
export function isRateLimitError(error: unknown): boolean {
  const httpStatus = extractHttpStatus(error);
  const reason = extractReason(error);
  const grpcStatus = extractGrpcStatus(error);

  // Check HTTP status code
  if (httpStatus === 429) {
    return true;
  }

  // Check gRPC status code
  if (grpcStatus === 'RESOURCE_EXHAUSTED') {
    return true;
  }

  // Check error reason
  const rateLimitReasons = [
    'rateLimitExceeded',
    'quotaExceeded',
    'dailyLimitExceeded',
  ];
  if (reason && rateLimitReasons.includes(reason)) {
    return true;
  }

  // Check error message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.toLowerCase();
    const rateLimitKeywords = [
      'rate limit',
      'quota exceeded',
      'too many requests',
      'daily limit',
      'api limit',
    ];

    return rateLimitKeywords.some(keyword => message.includes(keyword));
  }

  return false;
}

/**
 * Determines if an error indicates a resource was not found
 *
 * @param error - The error to check
 * @returns True if the error appears to be a not found error
 */
export function isNotFoundError(error: unknown): boolean {
  const httpStatus = extractHttpStatus(error);
  const reason = extractReason(error);
  const grpcStatus = extractGrpcStatus(error);

  // Check HTTP status code
  if (httpStatus === 404) {
    return true;
  }

  // Check gRPC status code
  if (grpcStatus === 'NOT_FOUND') {
    return true;
  }

  // Check error reason
  if (reason === 'notFound') {
    return true;
  }

  // Check error message
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    const message = (error as { message: string }).message.toLowerCase();
    return message.includes('not found');
  }

  return false;
}

/**
 * Comprehensive error analysis function that combines all extraction utilities
 *
 * @param error - The error to analyze
 * @returns Complete analysis of the error including all extracted information
 */
export function analyzeError(error: unknown): {
  normalized: NormalizedGoogleApiError;
  httpStatus: number;
  reason?: string;
  domain?: string;
  grpcStatus?: string;
  location?: { location?: string; locationType?: string };
  details: GoogleApiErrorDetail[];
  retryAfterMs?: number;
  isAuthentication: boolean;
  isRateLimit: boolean;
  isNotFound: boolean;
} {
  const normalized = extractGoogleApiError(error);

  return {
    normalized,
    httpStatus: extractHttpStatus(error),
    reason: extractReason(error),
    domain: extractDomain(error),
    grpcStatus: extractGrpcStatus(error),
    location: extractLocation(error),
    details: extractErrorDetails(error),
    retryAfterMs: extractRetryAfter(error),
    isAuthentication: isAuthenticationError(error),
    isRateLimit: isRateLimitError(error),
    isNotFound: isNotFoundError(error),
  };
}
