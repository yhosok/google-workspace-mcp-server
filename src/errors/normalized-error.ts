/**
 * Normalized error handling for Google API responses
 *
 * This module provides interfaces and utilities for extracting and normalizing
 * error information from Google API responses, particularly from GaxiosError objects.
 * Based on Google API error structure research and best practices.
 *
 * @fileoverview Google API Error Normalization and Extraction
 */

/**
 * Represents a single error detail from Google API error response
 * Based on the standard Google API error structure
 */
export interface GoogleApiErrorDetail {
  /** Human-readable error message */
  message: string;
  /** Error domain (e.g., "global", "sheets") */
  domain: string;
  /** Machine-readable error reason (e.g., "forbidden", "notFound") */
  reason: string;
  /** Location of the error in the request (optional) */
  location?: string;
  /** Type of location (e.g., "parameter", "header") */
  locationType?: string;
}

/**
 * Represents the main error object from Google API response
 * Follows the standard Google API error format
 */
export interface GoogleApiMainError {
  /** HTTP status code */
  code: number;
  /** Human-readable error message */
  message: string;
  /** gRPC status code as string (e.g., "PERMISSION_DENIED") */
  status?: string;
  /** Array of detailed error information */
  errors?: GoogleApiErrorDetail[];
}

/**
 * Complete Google API error response structure
 * This represents the full error object returned by Google APIs
 */
export interface GoogleApiErrorResponse {
  /** The main error object */
  error: GoogleApiMainError;
}

/**
 * Normalized representation of a Google API error
 * Provides a consistent interface regardless of the original error structure
 */
export interface NormalizedGoogleApiError {
  /** HTTP status code (extracted from various sources with priority) */
  httpStatus: number;
  /** Primary error message */
  message: string;
  /** gRPC status code if available (e.g., "PERMISSION_DENIED") */
  status?: string;
  /** Machine-readable error reason (e.g., "forbidden", "notFound") */
  reason?: string;
  /** Error domain (e.g., "global", "sheets") */
  domain?: string;
  /** Location where the error occurred */
  location?: string;
  /** Type of location (e.g., "parameter", "header") */
  locationType?: string;
  /** All available error details for comprehensive analysis */
  details: GoogleApiErrorDetail[];
  /** Whether this error is likely retryable based on status/reason */
  isRetryable: boolean;
  /** Original error object for debugging purposes */
  originalError: unknown;
}

/**
 * Represents a GaxiosError-like structure for type safety
 * This interface covers the common structure of HTTP client errors
 */
export interface GaxiosErrorLike {
  /** Error message */
  message: string;
  /** Error code (may be HTTP status or other identifier) */
  code?: string | number;
  /** HTTP status code */
  status?: number;
  /** Response object containing error data */
  response?: {
    /** HTTP status code */
    status: number;
    /** HTTP status text */
    statusText?: string;
    /** Response headers */
    headers?: Record<string, string>;
    /** Response data containing error information */
    data?: GoogleApiErrorResponse | unknown;
  };
}

/**
 * Type guard to check if an error is a GaxiosError-like object
 *
 * @param error - The error to check
 * @returns True if the error has GaxiosError-like properties
 */
export function isGaxiosErrorLike(error: unknown): error is GaxiosErrorLike {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    // Must have at least one of the distinguishing GaxiosError properties
    ('code' in error || 'status' in error || 'response' in error)
  );
}

/**
 * Type guard to check if response data contains a Google API error structure
 *
 * @param data - The response data to check
 * @returns True if data contains Google API error structure
 */
export function isGoogleApiErrorResponse(
  data: unknown
): data is GoogleApiErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as { error: unknown }).error === 'object' &&
    (data as { error: unknown }).error !== null &&
    'code' in (data as { error: Record<string, unknown> }).error &&
    'message' in (data as { error: Record<string, unknown> }).error
  );
}

/**
 * Determines if an error should be retried based on HTTP status and reason
 *
 * @param httpStatus - HTTP status code
 * @param reason - Error reason string
 * @returns True if the error is potentially retryable
 */
function isErrorRetryable(httpStatus: number, reason?: string): boolean {
  // Server errors (5xx) are generally retryable
  if (httpStatus >= 500) {
    return true;
  }

  // Rate limiting errors are retryable
  if (httpStatus === 429) {
    return true;
  }

  // Some specific reasons are retryable regardless of status
  const retryableReasons = [
    'rateLimitExceeded',
    'quotaExceeded',
    'backendError',
    'internalServerError',
  ];

  return reason ? retryableReasons.includes(reason) : false;
}

/**
 * Extracts and normalizes Google API error information from various error sources
 *
 * This function follows a priority-based extraction strategy:
 * 1. Google API structured errors (error.response?.data?.error?.errors?.[0])
 * 2. HTTP status code from response (error.response?.status)
 * 3. Fallback status from error.code or error.status
 * 4. Message parsing as last resort
 *
 * @param error - The error to extract information from
 * @returns Normalized Google API error information
 */
export function extractGoogleApiError(
  error: unknown
): NormalizedGoogleApiError {
  const defaultError: NormalizedGoogleApiError = {
    httpStatus: 500,
    message: 'Unknown error occurred',
    details: [],
    isRetryable: true,
    originalError: error,
  };

  // Handle null/undefined errors
  if (error == null) {
    return defaultError;
  }

  // Convert to string if error is not an object
  if (typeof error !== 'object') {
    return {
      ...defaultError,
      message: String(error),
      isRetryable: false,
    };
  }

  // Check if this is a basic Error object (but not GaxiosError-like)
  if (error instanceof Error) {
    // If it's not a GaxiosError-like object, check if it has status code information
    if (!isGaxiosErrorLike(error)) {
      const errorObj = error as Record<string, unknown>;
      let statusCode = 500;
      let hasStatusCode = false;

      // Try to extract status code from various possible properties
      if (typeof errorObj.statusCode === 'number') {
        statusCode = errorObj.statusCode;
        hasStatusCode = true;
      } else if (typeof errorObj.status === 'number') {
        statusCode = errorObj.status;
        hasStatusCode = true;
      } else if (typeof errorObj.code === 'number') {
        statusCode = errorObj.code;
        hasStatusCode = true;
      }

      return {
        ...defaultError,
        httpStatus: statusCode,
        message: (error as Error).message,
        // Only apply retry logic if we found an actual status code,
        // otherwise basic errors are not retryable
        isRetryable: hasStatusCode ? isErrorRetryable(statusCode) : false,
      };
    }
    // If it is GaxiosError-like, continue with the main processing below
  }

  // At this point, we know error is an object, cast to our expected structure for type safety
  const gaxiosError = error as GaxiosErrorLike;
  let httpStatus = 500;
  let message = 'Unknown error occurred';

  // Extract message with fallback
  if (typeof gaxiosError.message === 'string') {
    message = gaxiosError.message;
  } else if (
    'message' in gaxiosError &&
    typeof (gaxiosError as { message: unknown }).message === 'string'
  ) {
    message = (gaxiosError as { message: string }).message;
  }
  let status: string | undefined;
  let reason: string | undefined;
  let domain: string | undefined;
  let location: string | undefined;
  let locationType: string | undefined;
  let details: GoogleApiErrorDetail[] = [];

  // Priority 1: Extract from Google API structured error response
  if (
    gaxiosError.response?.data &&
    isGoogleApiErrorResponse(gaxiosError.response.data)
  ) {
    const apiError = gaxiosError.response.data.error;

    httpStatus = apiError.code;
    message = apiError.message;
    status = apiError.status;

    if (apiError.errors && apiError.errors.length > 0) {
      details = apiError.errors;

      // Use the first error detail for primary error information
      const primaryError = apiError.errors[0];
      reason = primaryError.reason;
      domain = primaryError.domain;
      location = primaryError.location;
      locationType = primaryError.locationType;
    }
  }
  // Priority 2: Extract HTTP status from response
  else if (gaxiosError.response?.status) {
    httpStatus = gaxiosError.response.status;
  }
  // Priority 3: Extract from error code or status
  else if (gaxiosError.code) {
    const codeNumber =
      typeof gaxiosError.code === 'number'
        ? gaxiosError.code
        : parseInt(String(gaxiosError.code), 10);

    if (!isNaN(codeNumber) && codeNumber >= 100 && codeNumber < 600) {
      httpStatus = codeNumber;
    }
  } else if (gaxiosError.status) {
    httpStatus = gaxiosError.status;
  }

  // Priority 4: Last resort - parse status from message
  if (httpStatus === 500 && message) {
    // Try to find HTTP status code in context first (e.g., "status 404", "code 500")
    const contextualMatch = message.match(/(?:status|code)\s+(\d{3})\b/i);
    if (contextualMatch) {
      const parsedStatus = parseInt(contextualMatch[1], 10);
      if (parsedStatus >= 100 && parsedStatus < 600) {
        httpStatus = parsedStatus;
      }
    } else {
      // Fall back to first 3-digit number that looks like HTTP status
      const statusMatch = message.match(/\b(\d{3})\b/);
      if (statusMatch) {
        const parsedStatus = parseInt(statusMatch[1], 10);
        // Be more selective - common HTTP status codes
        if (
          parsedStatus >= 100 &&
          parsedStatus < 600 &&
          (parsedStatus < 200 || parsedStatus >= 300)
        ) {
          // Exclude 2xx success codes from error parsing
          httpStatus = parsedStatus;
        }
      }
    }
  }

  return {
    httpStatus,
    message,
    status,
    reason,
    domain,
    location,
    locationType,
    details,
    isRetryable: isErrorRetryable(httpStatus, reason),
    originalError: error,
  };
}
