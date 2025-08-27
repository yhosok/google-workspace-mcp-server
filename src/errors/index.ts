/**
 * Custom error class hierarchy for Google Workspace MCP Server
 *
 * This module implements a comprehensive error handling system based on Context7 research
 * and TypeScript best practices for enterprise-grade error management.
 */

import { Result, Err, Ok } from 'neverthrow';

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
 */
export class GoogleErrorFactory {
  /**
   * Create an authentication error from a generic error
   */
  static createAuthError(
    cause: Error,
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ): GoogleAuthError {
    if (cause.message.includes('token') && cause.message.includes('expired')) {
      return new GoogleAuthTokenExpiredError(authType, context);
    }

    if (
      cause.message.includes('credential') ||
      cause.message.includes('invalid')
    ) {
      return new GoogleAuthInvalidCredentialsError(authType, context);
    }

    if (
      cause.message.includes('missing') ||
      cause.message.includes('required')
    ) {
      return new GoogleAuthMissingCredentialsError(authType, context);
    }

    return new GoogleAuthError(cause.message, authType, context, cause);
  }

  /**
   * Create a Sheets error from a generic error
   */
  static createSheetsError(
    cause: Error,
    spreadsheetId?: string,
    range?: string,
    context?: Record<string, unknown>
  ): GoogleSheetsError {
    const message = cause.message.toLowerCase();

    if (message.includes('not found') || message.includes('404')) {
      return new GoogleSheetsNotFoundError(spreadsheetId || '', context);
    }

    if (message.includes('permission') || message.includes('403')) {
      return new GoogleSheetsPermissionError(spreadsheetId, range, context);
    }

    if (message.includes('rate limit') || message.includes('429')) {
      const retryAfterMatch = cause.message.match(/retry after (\d+)/i);
      const retryAfterMs = retryAfterMatch
        ? parseInt(retryAfterMatch[1]) * 1000
        : undefined;
      return new GoogleSheetsRateLimitError(retryAfterMs, context);
    }

    if (message.includes('quota') || message.includes('exceeded')) {
      return new GoogleSheetsQuotaExceededError(context);
    }

    if (message.includes('range') || message.includes('invalid')) {
      return new GoogleSheetsInvalidRangeError(
        range || 'unknown',
        spreadsheetId,
        context
      );
    }

    // Extract status code from HTTP errors
    const statusMatch = cause.message.match(/(\d{3})/);
    const statusCode = statusMatch ? parseInt(statusMatch[1]) : 500;

    return new GoogleSheetsError(
      cause.message,
      'GOOGLE_SHEETS_ERROR',
      statusCode,
      spreadsheetId,
      range,
      context,
      cause
    );
  }

  /**
   * Create a configuration error from a generic error
   */
  static createConfigError(
    cause: Error,
    context?: Record<string, unknown>
  ): GoogleConfigError {
    return new GoogleConfigError(cause.message, context, cause);
  }
}
