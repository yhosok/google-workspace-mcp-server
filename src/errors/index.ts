/**
 * Custom error class hierarchy for Google Workspace MCP Server
 *
 * This module implements a comprehensive error handling system based on Context7 research
 * and TypeScript best practices for enterprise-grade error management.
 */

import { Result, Err, Ok } from 'neverthrow';

// Export new normalized error interfaces and utilities
export * from './normalized-error.js';
export * from './error-extractor.js';

// Import the extractGoogleApiError function for use in GoogleErrorFactory
import { extractGoogleApiError, GaxiosErrorLike } from './normalized-error.js';

/**
 * Base error class for all Google Workspace related errors
 * Provides common error handling capabilities and structured error information
 */
export abstract class GoogleWorkspaceError extends Error {
  /**
   * Error code for programmatic identification
   */
  public readonly code: string;

  /**
   * HTTP status code equivalent (for API responses)
   */
  public readonly statusCode: number;

  /**
   * Additional context information
   */
  public readonly context?: Record<string, unknown>;

  /**
   * Timestamp when the error occurred
   */
  public readonly timestamp: Date;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date();

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);

    // Preserve original error's stack trace if available
    if (cause) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }

    // Ensure stack trace points to this error
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Convert error to a structured object for logging/serialization
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
    };
  }

  /**
   * Check if this error should be retried
   */
  public abstract isRetryable(): boolean;
}

/**
 * Authentication and authorization errors
 */
export class GoogleAuthError extends GoogleWorkspaceError {
  public readonly authType: 'service-account' | 'oauth2' | 'api-key';

  constructor(
    message: string,
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, 'GOOGLE_AUTH_ERROR', 401, { authType, ...context }, cause);
    this.authType = authType;
  }

  public isRetryable(): boolean {
    // Auth errors with expired tokens might be retryable after refresh
    return this.code === 'GOOGLE_AUTH_TOKEN_EXPIRED';
  }
}

/**
 * Specific authentication error subtypes
 */
export class GoogleAuthTokenExpiredError extends GoogleAuthError {
  constructor(
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ) {
    super('Authentication token has expired', authType, context);
    // Override the code using Object.defineProperty to avoid readonly issues
    Object.defineProperty(this, 'code', {
      value: 'GOOGLE_AUTH_TOKEN_EXPIRED',
      writable: false,
      configurable: false,
    });
  }

  public isRetryable(): boolean {
    return true;
  }
}

export class GoogleAuthInvalidCredentialsError extends GoogleAuthError {
  constructor(
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ) {
    super('Invalid authentication credentials provided', authType, context);
    // Override the code and statusCode using Object.defineProperty
    Object.defineProperty(this, 'code', {
      value: 'GOOGLE_AUTH_INVALID_CREDENTIALS',
      writable: false,
      configurable: false,
    });
    Object.defineProperty(this, 'statusCode', {
      value: 403,
      writable: false,
      configurable: false,
    });
  }

  public isRetryable(): boolean {
    return false; // Invalid credentials won't fix themselves
  }
}

export class GoogleAuthMissingCredentialsError extends GoogleAuthError {
  constructor(
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ) {
    super('Missing required authentication credentials', authType, context);
    // Override the code and statusCode using Object.defineProperty
    Object.defineProperty(this, 'code', {
      value: 'GOOGLE_AUTH_MISSING_CREDENTIALS',
      writable: false,
      configurable: false,
    });
    Object.defineProperty(this, 'statusCode', {
      value: 401,
      writable: false,
      configurable: false,
    });
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Google Sheets specific errors
 */
export class GoogleSheetsError extends GoogleWorkspaceError {
  public readonly spreadsheetId?: string;
  public readonly range?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    spreadsheetId?: string,
    range?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      message,
      code,
      statusCode,
      { spreadsheetId, range, ...context },
      cause
    );
    this.spreadsheetId = spreadsheetId;
    this.range = range;
  }

  public isRetryable(): boolean {
    // Rate limit and quota errors are typically retryable
    return (
      this.code === 'GOOGLE_SHEETS_RATE_LIMIT' ||
      this.code === 'GOOGLE_SHEETS_QUOTA_EXCEEDED' ||
      this.statusCode >= 500
    ); // Server errors are retryable
  }
}

/**
 * Specific Sheets error subtypes
 */
export class GoogleSheetsNotFoundError extends GoogleSheetsError {
  constructor(spreadsheetId: string, context?: Record<string, unknown>) {
    super(
      `Spreadsheet with ID '${spreadsheetId}' not found`,
      'GOOGLE_SHEETS_NOT_FOUND',
      404,
      spreadsheetId,
      undefined,
      context
    );
  }

  public isRetryable(): boolean {
    return false; // Not found errors won't resolve by retrying
  }
}

export class GoogleSheetsPermissionError extends GoogleSheetsError {
  constructor(
    spreadsheetId?: string,
    range?: string,
    context?: Record<string, unknown>
  ) {
    super(
      'Insufficient permissions to access the requested spreadsheet or range',
      'GOOGLE_SHEETS_PERMISSION_DENIED',
      403,
      spreadsheetId,
      range,
      context
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

export class GoogleSheetsRateLimitError extends GoogleSheetsError {
  public readonly retryAfterMs?: number;

  constructor(retryAfterMs?: number, context?: Record<string, unknown>) {
    super(
      'Rate limit exceeded for Google Sheets API',
      'GOOGLE_SHEETS_RATE_LIMIT',
      429,
      undefined,
      undefined,
      { retryAfterMs, ...context }
    );
    this.retryAfterMs = retryAfterMs;
  }

  public isRetryable(): boolean {
    return true;
  }
}

export class GoogleSheetsQuotaExceededError extends GoogleSheetsError {
  constructor(context?: Record<string, unknown>) {
    super(
      'Daily quota exceeded for Google Sheets API',
      'GOOGLE_SHEETS_QUOTA_EXCEEDED',
      429,
      undefined,
      undefined,
      context
    );
  }

  public isRetryable(): boolean {
    return true; // But with exponential backoff
  }
}

export class GoogleSheetsInvalidRangeError extends GoogleSheetsError {
  constructor(
    range: string,
    spreadsheetId?: string,
    context?: Record<string, unknown>
  ) {
    const reason = context?.reason as string;
    const message = reason || `Invalid range specified: '${range}'`;

    super(
      message,
      'GOOGLE_SHEETS_INVALID_RANGE',
      400,
      spreadsheetId,
      range,
      context
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Generic service errors for other Google Workspace APIs
 */
export class GoogleServiceError extends GoogleWorkspaceError {
  public readonly serviceName: string;

  constructor(
    message: string,
    serviceName: string,
    code: string,
    statusCode: number = 500,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, statusCode, { serviceName, ...context }, cause);
    this.serviceName = serviceName;
  }

  public isRetryable(): boolean {
    return this.statusCode >= 500;
  }
}

/**
 * Configuration and initialization errors
 */
export class GoogleConfigError extends GoogleWorkspaceError {
  constructor(
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, 'GOOGLE_CONFIG_ERROR', 500, context, cause);
  }

  public isRetryable(): boolean {
    return false; // Config errors require manual intervention
  }
}

/**
 * Type definitions for Result pattern integration
 */
export type GoogleWorkspaceResult<T> = Result<T, GoogleWorkspaceError>;
export type GoogleAuthResult<T> = Result<T, GoogleAuthError>;
export type GoogleSheetsResult<T> = Result<T, GoogleSheetsError>;

/**
 * Helper functions for creating Results
 */
export const googleOk = <T>(value: T): GoogleWorkspaceResult<T> =>
  new Ok(value);
export const googleErr = (
  error: GoogleWorkspaceError
): GoogleWorkspaceResult<never> => new Err(error);

export const authOk = <T>(value: T): GoogleAuthResult<T> => new Ok(value);
export const authErr = (error: GoogleAuthError): GoogleAuthResult<never> =>
  new Err(error);

export const sheetsOk = <T>(value: T): GoogleSheetsResult<T> => new Ok(value);
export const sheetsErr = (
  error: GoogleSheetsError
): GoogleSheetsResult<never> => new Err(error);

/**
 * Error factory functions for common error scenarios
 *
 * This factory uses normalized error extraction to avoid brittle string matching.
 * Error classification follows this priority:
 * 1. Structured reason field from Google API error details
 * 2. HTTP status code classification
 * 3. Fallback string matching (only if no structured data available)
 */
export class GoogleErrorFactory {
  /**
   * Create an authentication error from a generic error
   *
   * @param cause - The original error that occurred
   * @param authType - The type of authentication being used
   * @param context - Additional context data
   * @returns Appropriate GoogleAuthError subclass
   */
  static createAuthError(
    cause: Error | null | undefined,
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ): GoogleAuthError {
    // Extract normalized error information
    const errorToExtract = context?.originalGaxiosError || cause;
    const normalizedError = extractGoogleApiError(errorToExtract);
    const enrichedContext = {
      normalizedError,
      ...context,
    };

    // Handle null/undefined errors gracefully
    if (!cause) {
      return new GoogleAuthError(
        'Unknown authentication error',
        authType,
        enrichedContext
      );
    }

    // Helper function to create error with proper message override
    const createErrorWithMessage = (
      ErrorClass: new (
        authType?: 'service-account' | 'oauth2' | 'api-key',
        context?: Record<string, unknown>
      ) => GoogleAuthError
    ): GoogleAuthError => {
      const errorInstance = new ErrorClass(authType, enrichedContext);
      if (
        normalizedError.message &&
        normalizedError.message !== cause.message
      ) {
        Object.defineProperty(errorInstance, 'message', {
          value: normalizedError.message,
          writable: false,
          configurable: false,
        });
      }
      return errorInstance;
    };

    // Priority 1: Use structured reason field for classification
    if (normalizedError.reason) {
      switch (normalizedError.reason) {
        case 'authError':
        case 'expired':
        case 'tokenExpired':
          return createErrorWithMessage(GoogleAuthTokenExpiredError);

        case 'forbidden':
        case 'invalid':
        case 'invalidCredentials':
          return createErrorWithMessage(GoogleAuthInvalidCredentialsError);

        case 'required':
        case 'missing':
        case 'missingCredentials':
          return createErrorWithMessage(GoogleAuthMissingCredentialsError);
      }
    }

    // Priority 2: Use HTTP status for classification
    switch (normalizedError.httpStatus) {
      case 401:
        // For 401, check message content to distinguish between missing and expired
        if (
          normalizedError.message.toLowerCase().includes('missing') ||
          normalizedError.message.toLowerCase().includes('required')
        ) {
          return createErrorWithMessage(GoogleAuthMissingCredentialsError);
        }
        return createErrorWithMessage(GoogleAuthTokenExpiredError);

      case 403:
        return createErrorWithMessage(GoogleAuthInvalidCredentialsError);
    }

    // Priority 3: Fallback to string matching only if no structured data available
    if (!normalizedError.reason && cause.message) {
      const message = cause.message.toLowerCase();

      if (message.includes('token') && message.includes('expired')) {
        return new GoogleAuthTokenExpiredError(authType, enrichedContext);
      }

      if (message.includes('credential') || message.includes('invalid')) {
        return new GoogleAuthInvalidCredentialsError(authType, enrichedContext);
      }

      if (message.includes('missing') || message.includes('required')) {
        return new GoogleAuthMissingCredentialsError(authType, enrichedContext);
      }
    }

    // Default fallback
    return new GoogleAuthError(
      normalizedError.message,
      authType,
      enrichedContext,
      cause
    );
  }

  /**
   * Create a Sheets error from a generic error
   *
   * @param cause - The original error that occurred
   * @param spreadsheetId - The ID of the spreadsheet being accessed
   * @param range - The range being accessed (if applicable)
   * @param context - Additional context data
   * @returns Appropriate GoogleSheetsError subclass
   */
  static createSheetsError(
    cause: Error | null | undefined,
    spreadsheetId?: string,
    range?: string,
    context?: Record<string, unknown>
  ): GoogleSheetsError {
    // Extract normalized error information
    const errorToExtract = context?.originalGaxiosError || cause;
    const normalizedError = extractGoogleApiError(errorToExtract);
    const enrichedContext = {
      normalizedError,
      ...context,
    };

    // Handle null/undefined errors gracefully
    if (!cause) {
      return new GoogleSheetsError(
        'Unknown Sheets error',
        'GOOGLE_SHEETS_ERROR',
        500,
        spreadsheetId,
        range,
        enrichedContext
      );
    }

    // Helper function to override error message when normalized message is more specific
    const overrideMessageIfBetter = <T extends GoogleSheetsError>(
      errorInstance: T
    ): T => {
      if (
        normalizedError.message &&
        normalizedError.message !== cause.message
      ) {
        Object.defineProperty(errorInstance, 'message', {
          value: normalizedError.message,
          writable: false,
          configurable: false,
        });
      }
      return errorInstance;
    };

    // Helper function to extract retry-after from headers
    const extractRetryAfter = (): number | undefined => {
      if (context?.originalGaxiosError) {
        const gaxiosError = context.originalGaxiosError as GaxiosErrorLike;
        const retryAfterHeader = gaxiosError?.response?.headers?.[
          'retry-after'
        ] as string | undefined;
        if (retryAfterHeader) {
          return parseInt(retryAfterHeader, 10) * 1000;
        }
      }
      return undefined;
    };

    // Priority 1: Use structured reason field for classification
    if (normalizedError.reason) {
      switch (normalizedError.reason) {
        case 'notFound':
          return overrideMessageIfBetter(
            new GoogleSheetsNotFoundError(spreadsheetId || '', enrichedContext)
          );

        case 'forbidden':
          return overrideMessageIfBetter(
            new GoogleSheetsPermissionError(
              spreadsheetId,
              range,
              enrichedContext
            )
          );

        case 'rateLimitExceeded':
          return new GoogleSheetsRateLimitError(
            extractRetryAfter(),
            enrichedContext
          );

        case 'quotaExceeded':
          return new GoogleSheetsQuotaExceededError(enrichedContext);

        case 'invalidParameter':
        case 'badRequest':
        case 'invalidRange':
          const rangeError = new GoogleSheetsInvalidRangeError(
            range || normalizedError.location || 'unknown',
            spreadsheetId,
            enrichedContext
          );
          // Use specific error message from details if available
          if (normalizedError.details.length > 0) {
            const specificMessage = normalizedError.details[0].message;
            if (specificMessage && specificMessage !== cause.message) {
              Object.defineProperty(rangeError, 'message', {
                value: specificMessage,
                writable: false,
                configurable: false,
              });
            }
          }
          return rangeError;

        case 'backendError':
        case 'internalServerError':
          return new GoogleSheetsError(
            normalizedError.message,
            'GOOGLE_SHEETS_SERVER_ERROR',
            normalizedError.httpStatus,
            spreadsheetId,
            range,
            enrichedContext,
            cause
          );
      }
    }

    // Priority 2: Use HTTP status code for classification
    switch (normalizedError.httpStatus) {
      case 404:
        return overrideMessageIfBetter(
          new GoogleSheetsNotFoundError(spreadsheetId || '', enrichedContext)
        );

      case 403:
        return overrideMessageIfBetter(
          new GoogleSheetsPermissionError(spreadsheetId, range, enrichedContext)
        );

      case 429:
        // Distinguish between rate limit and quota based on context
        if (
          normalizedError.reason === 'quotaExceeded' ||
          normalizedError.domain === 'usageLimits' ||
          normalizedError.message.toLowerCase().includes('quota')
        ) {
          return new GoogleSheetsQuotaExceededError(enrichedContext);
        }
        return new GoogleSheetsRateLimitError(
          extractRetryAfter(),
          enrichedContext
        );

      case 400:
        return new GoogleSheetsInvalidRangeError(
          range || 'unknown',
          spreadsheetId,
          enrichedContext
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new GoogleSheetsError(
          normalizedError.message,
          'GOOGLE_SHEETS_SERVER_ERROR',
          normalizedError.httpStatus,
          spreadsheetId,
          range,
          enrichedContext,
          cause
        );
    }

    // Priority 3: Fallback to string matching only if no structured data available
    if (!normalizedError.reason && cause.message) {
      const message = cause.message.toLowerCase();

      if (message.includes('not found')) {
        return new GoogleSheetsNotFoundError(
          spreadsheetId || '',
          enrichedContext
        );
      }

      if (message.includes('permission')) {
        return new GoogleSheetsPermissionError(
          spreadsheetId,
          range,
          enrichedContext
        );
      }

      if (message.includes('rate limit')) {
        const retryAfterMatch = cause.message.match(/retry after (\d+)/i);
        const retryAfterMs = retryAfterMatch
          ? parseInt(retryAfterMatch[1], 10) * 1000
          : undefined;
        return new GoogleSheetsRateLimitError(retryAfterMs, enrichedContext);
      }

      if (message.includes('quota') || message.includes('exceeded')) {
        return new GoogleSheetsQuotaExceededError(enrichedContext);
      }

      if (message.includes('range') || message.includes('invalid')) {
        return new GoogleSheetsInvalidRangeError(
          range || 'unknown',
          spreadsheetId,
          enrichedContext
        );
      }
    }

    // Default fallback
    return new GoogleSheetsError(
      normalizedError.message,
      'GOOGLE_SHEETS_ERROR',
      normalizedError.httpStatus,
      spreadsheetId,
      range,
      enrichedContext,
      cause
    );
  }

  /**
   * Create a configuration error from a generic error
   *
   * Configuration errors typically indicate issues with service setup,
   * environment variables, or initialization that require manual intervention.
   *
   * @param cause - The original error that occurred
   * @param context - Additional context data
   * @returns GoogleConfigError instance
   */
  static createConfigError(
    cause: Error,
    context?: Record<string, unknown>
  ): GoogleConfigError {
    const normalizedError = extractGoogleApiError(cause);
    const enrichedContext = {
      normalizedError,
      ...context,
    };

    return new GoogleConfigError(
      normalizedError.message,
      enrichedContext,
      cause
    );
  }
}
