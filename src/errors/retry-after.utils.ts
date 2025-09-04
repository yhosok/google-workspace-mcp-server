/**
 * Retry-after header extraction utilities for Google Workspace error handling
 *
 * This module provides shared functionality for extracting retry-after header
 * values from Gaxios error responses across all error factory methods.
 */

import { GaxiosErrorLike } from './normalized-error.js';

/**
 * Extract retry-after value from HTTP headers in Gaxios errors via context
 *
 * This function extracts the 'retry-after' header from a Gaxios error response
 * contained within an error context object and converts it from seconds to
 * milliseconds for consistent usage across the error handling system.
 *
 * @param context - Error context that may contain the original Gaxios error
 * @returns Retry-after value in milliseconds, or undefined if not present
 */
export function extractRetryAfterFromContext(
  context?: Record<string, unknown>
): number | undefined {
  if (context?.originalGaxiosError) {
    const gaxiosError = context.originalGaxiosError as GaxiosErrorLike;
    const retryAfterHeader = gaxiosError?.response?.headers?.['retry-after'] as
      | string
      | undefined;
    if (retryAfterHeader) {
      return parseInt(retryAfterHeader, 10) * 1000;
    }
  }
  return undefined;
}
