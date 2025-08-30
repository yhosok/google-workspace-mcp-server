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
  public readonly errorCode: string;

  /**
   * Legacy property for backwards compatibility
   * @deprecated Use errorCode instead
   */
  public get code(): string {
    return this.errorCode;
  }

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
    errorCode: string,
    statusCode: number = 500,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.errorCode = errorCode;
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
      code: this.code, // Keep for backwards compatibility
      errorCode: this.errorCode,
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
    return this.errorCode === 'GOOGLE_AUTH_TOKEN_EXPIRED';
  }
}

/**
 * Specific authentication error subtypes
 */
export class GoogleAuthTokenExpiredError extends GoogleWorkspaceError {
  public readonly authType: 'service-account' | 'oauth2' | 'api-key';

  constructor(
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ) {
    super(
      'Authentication token has expired',
      'GOOGLE_AUTH_TOKEN_EXPIRED',
      401,
      { authType, ...context }
    );
    this.authType = authType;
  }

  public isRetryable(): boolean {
    return true;
  }
}

export class GoogleAuthInvalidCredentialsError extends GoogleWorkspaceError {
  public readonly authType: 'service-account' | 'oauth2' | 'api-key';

  constructor(
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ) {
    super(
      'Invalid authentication credentials provided',
      'GOOGLE_AUTH_INVALID_CREDENTIALS',
      403,
      { authType, ...context }
    );
    this.authType = authType;
  }

  public isRetryable(): boolean {
    return false; // Invalid credentials won't fix themselves
  }
}

export class GoogleAuthMissingCredentialsError extends GoogleWorkspaceError {
  public readonly authType: 'service-account' | 'oauth2' | 'api-key';

  constructor(
    authType: 'service-account' | 'oauth2' | 'api-key' = 'service-account',
    context?: Record<string, unknown>
  ) {
    super(
      'Missing required authentication credentials',
      'GOOGLE_AUTH_MISSING_CREDENTIALS',
      401,
      { authType, ...context }
    );
    this.authType = authType;
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * OAuth2 specific authentication errors
 */
export class GoogleOAuth2Error extends GoogleWorkspaceError {
  public readonly authType = 'oauth2' as const;
  public readonly redirectUri?: string;
  public readonly scopes?: string[];

  constructor(
    message: string,
    errorCode: string = 'GOOGLE_OAUTH2_ERROR',
    statusCode: number = 401,
    context?: Record<string, unknown> & {
      redirectUri?: string;
      scopes?: string[];
    },
    cause?: Error
  ) {
    super(
      message,
      errorCode,
      statusCode,
      { authType: 'oauth2', ...context },
      cause
    );
    this.redirectUri = context?.redirectUri;
    this.scopes = context?.scopes;
  }

  public isRetryable(): boolean {
    return false; // Most OAuth2 errors require user intervention
  }
}

export class GoogleOAuth2AuthorizationRequiredError extends GoogleOAuth2Error {
  public readonly authorizationUrl: string;

  constructor(
    authorizationUrl: string,
    context?: Record<string, unknown> & {
      redirectUri?: string;
      scopes?: string[];
    }
  ) {
    super(
      'User authorization required',
      'GOOGLE_OAUTH2_AUTHORIZATION_REQUIRED',
      401,
      { authorizationUrl, ...context }
    );
    this.authorizationUrl = authorizationUrl;
  }

  public isRetryable(): boolean {
    return false; // Requires user interaction
  }
}

export class GoogleOAuth2UserDeniedError extends GoogleOAuth2Error {
  constructor(
    context?: Record<string, unknown> & {
      redirectUri?: string;
      scopes?: string[];
    }
  ) {
    super(
      'User denied authorization request',
      'GOOGLE_OAUTH2_USER_DENIED',
      403,
      context
    );
  }

  public isRetryable(): boolean {
    return false; // User explicitly denied access
  }
}

export class GoogleOAuth2TokenStorageError extends GoogleOAuth2Error {
  constructor(
    operation: 'save' | 'load' | 'delete',
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `Failed to ${operation} OAuth2 tokens`,
      'GOOGLE_OAUTH2_TOKEN_STORAGE_ERROR',
      500,
      { operation, ...context },
      cause
    );
  }

  public isRetryable(): boolean {
    return true; // Storage issues might be transient
  }
}

export class GoogleOAuth2RefreshTokenExpiredError extends GoogleOAuth2Error {
  constructor(context?: Record<string, unknown>) {
    super(
      'OAuth2 refresh token has expired and cannot be renewed',
      'GOOGLE_OAUTH2_REFRESH_TOKEN_EXPIRED',
      401,
      context
    );
  }

  public isRetryable(): boolean {
    return false; // Requires re-authorization
  }
}

export class GoogleOAuth2NetworkError extends GoogleOAuth2Error {
  constructor(
    message: string,
    cause?: Error,
    context?: Record<string, unknown>
  ) {
    super(
      `OAuth2 network error: ${message}`,
      'GOOGLE_OAUTH2_NETWORK_ERROR',
      503,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return true; // Network issues are often transient
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
      this.errorCode === 'GOOGLE_SHEETS_RATE_LIMIT' ||
      this.errorCode === 'GOOGLE_SHEETS_QUOTA_EXCEEDED' ||
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
 * Specialized timeout error for Google API operations
 *
 * This error is thrown when operations exceed their configured timeout limits,
 * either for individual requests or total retry duration.
 */
export class GoogleTimeoutError extends GoogleWorkspaceError {
  public readonly timeoutType: 'request' | 'total';
  public readonly timeoutMs: number;

  constructor(
    message: string,
    timeoutType: 'request' | 'total',
    timeoutMs: number,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, 'TIMEOUT_ERROR', 408, context, cause);
    this.timeoutType = timeoutType;
    this.timeoutMs = timeoutMs;
  }

  public isRetryable(): boolean {
    return false; // Timeout errors are not retryable
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      timeoutType: this.timeoutType,
      timeoutMs: this.timeoutMs,
      timeout: true, // Flag for logging systems
    };
  }
}

/**
 * Calendar Service Errors
 */
export class GoogleCalendarError extends GoogleWorkspaceError {
  public readonly calendarId?: string;
  public readonly eventId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    calendarId?: string,
    eventId?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      message,
      code,
      statusCode,
      { calendarId, eventId, ...context },
      cause
    );
    this.calendarId = calendarId;
    this.eventId = eventId;
  }

  public isRetryable(): boolean {
    return this.statusCode >= 500;
  }
}

/**
 * Calendar not found error
 */
export class GoogleCalendarNotFoundError extends GoogleCalendarError {
  constructor(
    calendarId: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      `Calendar not found: ${calendarId}`,
      'GOOGLE_CALENDAR_NOT_FOUND',
      404,
      calendarId,
      undefined,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Event not found error
 */
export class GoogleCalendarEventNotFoundError extends GoogleCalendarError {
  constructor(
    calendarId: string,
    eventId: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      `Event not found: ${eventId} in calendar ${calendarId}`,
      'GOOGLE_CALENDAR_EVENT_NOT_FOUND',
      404,
      calendarId,
      eventId,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Calendar permission error
 */
export class GoogleCalendarPermissionError extends GoogleCalendarError {
  constructor(
    calendarId?: string,
    eventId?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    const resourceInfo = eventId
      ? `event ${eventId} in calendar ${calendarId}`
      : calendarId
        ? `calendar ${calendarId}`
        : 'calendar resource';

    super(
      `Permission denied for ${resourceInfo}`,
      'GOOGLE_CALENDAR_PERMISSION_DENIED',
      403,
      calendarId,
      eventId,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Calendar rate limit error
 */
export class GoogleCalendarRateLimitError extends GoogleCalendarError {
  public readonly retryAfterMs?: number;

  constructor(
    retryAfterMs?: number,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    const message = retryAfterMs
      ? `Rate limit exceeded. Retry after ${retryAfterMs}ms`
      : 'Rate limit exceeded. Please retry later';

    super(
      message,
      'GOOGLE_CALENDAR_RATE_LIMIT',
      429,
      undefined,
      undefined,
      context,
      cause
    );
    this.retryAfterMs = retryAfterMs;
  }

  public isRetryable(): boolean {
    return true;
  }

  public override toJSON(): Record<string, unknown> {
    return {
      ...super.toJSON(),
      retryAfterMs: this.retryAfterMs,
    };
  }
}

/**
 * Calendar quota exceeded error
 */
export class GoogleCalendarQuotaExceededError extends GoogleCalendarError {
  constructor(context?: Record<string, unknown>, cause?: Error) {
    super(
      'Calendar API quota exceeded',
      'GOOGLE_CALENDAR_QUOTA_EXCEEDED',
      429,
      undefined,
      undefined,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Invalid calendar operation error
 */
export class GoogleCalendarInvalidOperationError extends GoogleCalendarError {
  constructor(
    operation: string,
    reason: string,
    calendarId?: string,
    eventId?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      `Invalid ${operation} operation: ${reason}`,
      'GOOGLE_CALENDAR_INVALID_OPERATION',
      400,
      calendarId,
      eventId,
      { operation, reason, ...context },
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

/**
 * Google Drive Service Errors
 */
export class GoogleDriveError extends GoogleWorkspaceError {
  public readonly fileId?: string;
  public readonly folderId?: string;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    fileId?: string,
    folderId?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(message, code, statusCode, { fileId, folderId, ...context }, cause);
    this.fileId = fileId;
    this.folderId = folderId;
  }

  public isRetryable(): boolean {
    // Rate limit and quota errors are typically retryable
    return (
      this.errorCode === 'GOOGLE_DRIVE_RATE_LIMIT' ||
      this.errorCode === 'GOOGLE_DRIVE_QUOTA_EXCEEDED' ||
      this.statusCode >= 500
    ); // Server errors are retryable
  }
}

/**
 * Drive specific error subtypes
 */
export class GoogleDriveNotFoundError extends GoogleDriveError {
  constructor(
    fileId: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      `File not found: ${fileId}`,
      'GOOGLE_DRIVE_FILE_NOT_FOUND',
      404,
      fileId,
      undefined,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

export class GoogleDrivePermissionError extends GoogleDriveError {
  constructor(
    fileId?: string,
    folderId?: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    const resourceInfo = fileId || folderId || 'resource';
    super(
      `Permission denied for ${resourceInfo}`,
      'GOOGLE_DRIVE_PERMISSION_DENIED',
      403,
      fileId,
      folderId,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return false;
  }
}

export class GoogleDriveRateLimitError extends GoogleDriveError {
  public readonly retryAfterMs?: number;

  constructor(
    retryAfterMs?: number,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(
      'Rate limit exceeded for Google Drive API',
      'GOOGLE_DRIVE_RATE_LIMIT',
      429,
      undefined,
      undefined,
      { retryAfterMs, ...context },
      cause
    );
    this.retryAfterMs = retryAfterMs;
  }

  public isRetryable(): boolean {
    return true;
  }
}

export class GoogleDriveQuotaExceededError extends GoogleDriveError {
  constructor(context?: Record<string, unknown>, cause?: Error) {
    super(
      'Daily quota exceeded for Google Drive API',
      'GOOGLE_DRIVE_QUOTA_EXCEEDED',
      429,
      undefined,
      undefined,
      context,
      cause
    );
  }

  public isRetryable(): boolean {
    return true;
  }
}

/**
 * Type definitions for Result pattern integration
 */
export type GoogleWorkspaceResult<T> = Result<T, GoogleWorkspaceError>;
export type GoogleAuthResult<T> = Result<T, GoogleAuthError>;
export type GoogleSheetsResult<T> = Result<T, GoogleSheetsError>;
export type GoogleCalendarResult<T> = Result<T, GoogleCalendarError>;
export type GoogleDriveResult<T> = Result<T, GoogleDriveError>;

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

export const calendarOk = <T>(value: T): GoogleCalendarResult<T> =>
  new Ok(value);
export const calendarErr = (
  error: GoogleCalendarError
): GoogleCalendarResult<never> => new Err(error);

export const driveOk = <T>(value: T): GoogleDriveResult<T> => new Ok(value);
export const driveErr = (error: GoogleDriveError): GoogleDriveResult<never> =>
  new Err(error);

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
   * Create a Calendar error from a generic error
   *
   * @param cause - The original error that occurred
   * @param calendarId - The ID of the calendar being accessed
   * @param eventId - The ID of the event being accessed (if applicable)
   * @param context - Additional context data
   * @returns Appropriate GoogleCalendarError subclass
   */
  static createCalendarError(
    cause: Error | null | undefined,
    calendarId?: string,
    eventId?: string,
    context?: Record<string, unknown>
  ): GoogleCalendarError {
    // Extract normalized error information
    const errorToExtract = context?.originalGaxiosError || cause;
    const normalizedError = extractGoogleApiError(errorToExtract);
    const enrichedContext = {
      normalizedError,
      ...context,
    };

    // Handle null/undefined errors gracefully
    if (!cause) {
      return new GoogleCalendarError(
        'Unknown Calendar error',
        'GOOGLE_CALENDAR_ERROR',
        500,
        calendarId,
        eventId,
        enrichedContext
      );
    }

    // Helper function to override error message when normalized message is more specific
    const overrideMessageIfBetter = <T extends GoogleCalendarError>(
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
          if (eventId) {
            return overrideMessageIfBetter(
              new GoogleCalendarEventNotFoundError(
                calendarId || 'unknown',
                eventId,
                enrichedContext
              )
            );
          } else {
            return overrideMessageIfBetter(
              new GoogleCalendarNotFoundError(
                calendarId || 'unknown',
                enrichedContext
              )
            );
          }

        case 'forbidden':
          return overrideMessageIfBetter(
            new GoogleCalendarPermissionError(
              calendarId,
              eventId,
              enrichedContext
            )
          );

        case 'rateLimitExceeded':
          return new GoogleCalendarRateLimitError(
            extractRetryAfter(),
            enrichedContext
          );

        case 'quotaExceeded':
          return new GoogleCalendarQuotaExceededError(enrichedContext);

        case 'invalidParameter':
        case 'badRequest':
        case 'invalid':
          return new GoogleCalendarInvalidOperationError(
            'calendar operation',
            normalizedError.message || 'Invalid parameters',
            calendarId,
            eventId,
            enrichedContext
          );

        case 'backendError':
        case 'internalServerError':
          return new GoogleCalendarError(
            normalizedError.message,
            'GOOGLE_CALENDAR_SERVER_ERROR',
            normalizedError.httpStatus,
            calendarId,
            eventId,
            enrichedContext,
            cause
          );
      }
    }

    // Priority 2: Use HTTP status code for classification
    switch (normalizedError.httpStatus) {
      case 404:
        if (eventId) {
          return overrideMessageIfBetter(
            new GoogleCalendarEventNotFoundError(
              calendarId || 'unknown',
              eventId,
              enrichedContext
            )
          );
        } else {
          return overrideMessageIfBetter(
            new GoogleCalendarNotFoundError(
              calendarId || 'unknown',
              enrichedContext
            )
          );
        }

      case 403:
        return overrideMessageIfBetter(
          new GoogleCalendarPermissionError(
            calendarId,
            eventId,
            enrichedContext
          )
        );

      case 429:
        // Distinguish between rate limit and quota based on context
        if (
          normalizedError.reason === 'quotaExceeded' ||
          normalizedError.domain === 'usageLimits' ||
          normalizedError.message.toLowerCase().includes('quota')
        ) {
          return new GoogleCalendarQuotaExceededError(enrichedContext);
        }
        return new GoogleCalendarRateLimitError(
          extractRetryAfter(),
          enrichedContext
        );

      case 400:
        return new GoogleCalendarInvalidOperationError(
          'calendar operation',
          normalizedError.message || 'Bad request',
          calendarId,
          eventId,
          enrichedContext
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new GoogleCalendarError(
          normalizedError.message,
          'GOOGLE_CALENDAR_SERVER_ERROR',
          normalizedError.httpStatus,
          calendarId,
          eventId,
          enrichedContext,
          cause
        );
    }

    // Priority 3: Fallback to string matching only if no structured data available
    if (!normalizedError.reason && cause.message) {
      const message = cause.message.toLowerCase();

      if (message.includes('not found')) {
        if (eventId) {
          return new GoogleCalendarEventNotFoundError(
            calendarId || 'unknown',
            eventId,
            enrichedContext
          );
        } else {
          return new GoogleCalendarNotFoundError(
            calendarId || 'unknown',
            enrichedContext
          );
        }
      }

      if (message.includes('permission') || message.includes('forbidden')) {
        return new GoogleCalendarPermissionError(
          calendarId,
          eventId,
          enrichedContext
        );
      }

      if (message.includes('rate limit')) {
        const retryAfterMatch = cause.message.match(/retry after (\d+)/i);
        const retryAfterMs = retryAfterMatch
          ? parseInt(retryAfterMatch[1], 10) * 1000
          : undefined;
        return new GoogleCalendarRateLimitError(retryAfterMs, enrichedContext);
      }

      if (message.includes('quota') || message.includes('exceeded')) {
        return new GoogleCalendarQuotaExceededError(enrichedContext);
      }

      if (message.includes('invalid') || message.includes('bad request')) {
        return new GoogleCalendarInvalidOperationError(
          'calendar operation',
          cause.message,
          calendarId,
          eventId,
          enrichedContext
        );
      }
    }

    // Default fallback
    return new GoogleCalendarError(
      normalizedError.message,
      'GOOGLE_CALENDAR_ERROR',
      normalizedError.httpStatus,
      calendarId,
      eventId,
      enrichedContext,
      cause
    );
  }

  /**
   * Create a Drive error from a generic error
   *
   * @param cause - The original error that occurred
   * @param fileId - The ID of the file being accessed (if applicable)
   * @param folderId - The ID of the folder being accessed (if applicable)
   * @param context - Additional context data
   * @returns Appropriate GoogleDriveError subclass
   */
  static createDriveError(
    cause: Error | null | undefined,
    fileId?: string,
    folderId?: string,
    context?: Record<string, unknown>
  ): GoogleDriveError {
    // Handle null/undefined errors gracefully
    if (!cause) {
      return new GoogleDriveError(
        'Unknown Drive error',
        'GOOGLE_DRIVE_ERROR',
        500,
        fileId,
        folderId,
        context
      );
    }

    // If it's already a GoogleDriveError, return it as-is
    if (cause instanceof GoogleDriveError) {
      return cause;
    }

    // If it's a GoogleAuthError, convert it to DriveError while preserving status
    if (cause instanceof GoogleAuthError) {
      return new GoogleDriveError(
        cause.message,
        'GOOGLE_DRIVE_AUTH_ERROR',
        cause.statusCode,
        fileId,
        folderId,
        { ...context, authType: cause.authType },
        cause
      );
    }

    // Extract normalized error information
    const errorToExtract = context?.originalGaxiosError || cause;
    const normalizedError = extractGoogleApiError(errorToExtract);
    const enrichedContext = {
      normalizedError,
      ...context,
    };

    // Helper function to override error message when normalized message is more specific
    const overrideMessageIfBetter = <T extends GoogleDriveError>(
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
            new GoogleDriveNotFoundError(
              fileId || folderId || 'unknown',
              enrichedContext
            )
          );

        case 'forbidden':
          return overrideMessageIfBetter(
            new GoogleDrivePermissionError(fileId, folderId, enrichedContext)
          );

        case 'rateLimitExceeded':
          return new GoogleDriveRateLimitError(
            extractRetryAfter(),
            enrichedContext
          );

        case 'quotaExceeded':
          return new GoogleDriveQuotaExceededError(enrichedContext);

        case 'backendError':
        case 'internalServerError':
          return new GoogleDriveError(
            normalizedError.message,
            'GOOGLE_DRIVE_SERVER_ERROR',
            normalizedError.httpStatus,
            fileId,
            folderId,
            enrichedContext,
            cause
          );
      }
    }

    // Check for simple status/message objects (common in tests)
    if (
      typeof cause === 'object' &&
      'status' in cause &&
      typeof (cause as { status: unknown }).status === 'number'
    ) {
      const causeWithStatus = cause as { status: number; message?: string };
      const statusCode = causeWithStatus.status;
      const errorMessage = causeWithStatus.message || normalizedError.message;

      switch (statusCode) {
        case 404:
          return new GoogleDriveNotFoundError(
            fileId || folderId || 'unknown',
            enrichedContext
          );
        case 403:
          return new GoogleDrivePermissionError(
            fileId,
            folderId,
            enrichedContext
          );
        case 429:
          return new GoogleDriveRateLimitError(undefined, enrichedContext);
        default:
          return new GoogleDriveError(
            errorMessage,
            'GOOGLE_DRIVE_ERROR',
            statusCode,
            fileId,
            folderId,
            enrichedContext,
            cause
          );
      }
    }

    // Priority 2: Use HTTP status code for classification
    switch (normalizedError.httpStatus) {
      case 404:
        return overrideMessageIfBetter(
          new GoogleDriveNotFoundError(
            fileId || folderId || 'unknown',
            enrichedContext
          )
        );

      case 403:
        return overrideMessageIfBetter(
          new GoogleDrivePermissionError(fileId, folderId, enrichedContext)
        );

      case 429:
        // Distinguish between rate limit and quota based on context
        if (
          normalizedError.reason === 'quotaExceeded' ||
          normalizedError.domain === 'usageLimits' ||
          normalizedError.message.toLowerCase().includes('quota')
        ) {
          return new GoogleDriveQuotaExceededError(enrichedContext);
        }
        return new GoogleDriveRateLimitError(
          extractRetryAfter(),
          enrichedContext
        );

      case 400:
        return new GoogleDriveError(
          normalizedError.message,
          'GOOGLE_DRIVE_INVALID_REQUEST',
          400,
          fileId,
          folderId,
          enrichedContext,
          cause
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new GoogleDriveError(
          normalizedError.message,
          'GOOGLE_DRIVE_SERVER_ERROR',
          normalizedError.httpStatus,
          fileId,
          folderId,
          enrichedContext,
          cause
        );
    }

    // Priority 3: Fallback to string matching only if no structured data available
    if (!normalizedError.reason && cause.message) {
      const message = cause.message.toLowerCase();

      if (message.includes('not found')) {
        return new GoogleDriveNotFoundError(
          fileId || folderId || 'unknown',
          enrichedContext
        );
      }

      if (message.includes('permission') || message.includes('forbidden')) {
        return new GoogleDrivePermissionError(
          fileId,
          folderId,
          enrichedContext
        );
      }

      if (message.includes('rate limit')) {
        const retryAfterMatch = cause.message.match(/retry after (\d+)/i);
        const retryAfterMs = retryAfterMatch
          ? parseInt(retryAfterMatch[1], 10) * 1000
          : undefined;
        return new GoogleDriveRateLimitError(retryAfterMs, enrichedContext);
      }

      if (message.includes('quota') || message.includes('exceeded')) {
        return new GoogleDriveQuotaExceededError(enrichedContext);
      }
    }

    // Default fallback
    return new GoogleDriveError(
      normalizedError.message,
      'GOOGLE_DRIVE_ERROR',
      normalizedError.httpStatus,
      fileId,
      folderId,
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
