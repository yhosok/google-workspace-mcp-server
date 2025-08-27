/**
 * Abstract base class for Google Workspace service implementations
 *
 * This class provides common functionality for all Google service implementations:
 * - OAuth2Client management
 * - Retry logic with exponential backoff
 * - Structured error handling
 * - Logging integration
 */

import { OAuth2Client } from 'google-auth-library';
import { Result, ResultAsync } from 'neverthrow';
import {
  GoogleWorkspaceError,
  GoogleAuthError,
  GoogleServiceError,
  GoogleErrorFactory,
  GoogleWorkspaceResult,
  googleOk,
  googleErr,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';

/**
 * Retry configuration for service operations
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Initial delay in milliseconds
   */
  initialDelayMs: number;

  /**
   * Maximum delay in milliseconds (for exponential backoff)
   */
  maxDelayMs: number;

  /**
   * Backoff multiplier
   */
  backoffMultiplier: number;

  /**
   * Jitter factor to prevent thundering herd (0-1)
   */
  jitterFactor: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * Service operation context for logging and error handling
 */
export interface ServiceContext {
  /**
   * Operation identifier (e.g., 'listSpreadsheets', 'readRange')
   */
  operation: string;

  /**
   * Additional context data
   */
  data?: Record<string, unknown>;

  /**
   * Request ID for tracing
   */
  requestId?: string;
}

/**
 * Abstract base class for Google Workspace services
 */
export abstract class GoogleService {
  protected readonly auth: OAuth2Client;
  protected readonly logger: Logger;
  protected readonly retryConfig: RetryConfig;

  constructor(
    auth: OAuth2Client,
    logger: Logger,
    retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG
  ) {
    this.auth = auth;
    this.logger = logger;
    this.retryConfig = retryConfig;
  }

  /**
   * Get the name of this service (for logging and error handling)
   */
  public abstract getServiceName(): string;

  /**
   * Get the version of the service API being used
   */
  public abstract getServiceVersion(): string;

  /**
   * Initialize the service (set up API clients, validate credentials, etc.)
   */
  protected abstract initialize(): Promise<GoogleWorkspaceResult<void>>;

  /**
   * Health check for the service
   */
  public abstract healthCheck(): Promise<GoogleWorkspaceResult<boolean>>;

  /**
   * Execute an operation with retry logic and error handling
   */
  protected async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: ServiceContext
  ): Promise<GoogleWorkspaceResult<T>> {
    const { operation: operationName, data, requestId } = context;

    this.logger.info(
      `${this.getServiceName()}: Starting operation '${operationName}'`,
      {
        service: this.getServiceName(),
        operation: operationName,
        requestId,
        data,
      }
    );

    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < this.retryConfig.maxAttempts) {
      attempt++;

      try {
        this.logger.debug(
          `${this.getServiceName()}: Attempt ${attempt}/${this.retryConfig.maxAttempts}`,
          {
            service: this.getServiceName(),
            operation: operationName,
            attempt,
            requestId,
          }
        );

        const result = await operation();

        this.logger.info(
          `${this.getServiceName()}: Operation '${operationName}' succeeded`,
          {
            service: this.getServiceName(),
            operation: operationName,
            attempt,
            requestId,
          }
        );

        return googleOk(result);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        this.logger.warn(
          `${this.getServiceName()}: Attempt ${attempt} failed`,
          {
            service: this.getServiceName(),
            operation: operationName,
            attempt,
            requestId,
            error: lastError.message,
            stack: lastError.stack,
          }
        );

        // Convert to our custom error type
        const customError = this.convertError(lastError, context);

        // Don't retry if the error is not retryable
        if (!customError.isRetryable()) {
          this.logger.error(
            `${this.getServiceName()}: Non-retryable error encountered`,
            {
              service: this.getServiceName(),
              operation: operationName,
              error: customError.toJSON(),
              requestId,
            }
          );

          return googleErr(customError);
        }

        // Don't retry on the last attempt
        if (attempt >= this.retryConfig.maxAttempts) {
          break;
        }

        // Calculate delay for next attempt
        const delay = this.calculateRetryDelay(attempt, customError);

        this.logger.info(`${this.getServiceName()}: Retrying in ${delay}ms`, {
          service: this.getServiceName(),
          operation: operationName,
          attempt,
          delayMs: delay,
          requestId,
        });

        await this.sleep(delay);
      }
    }

    // All attempts failed
    const finalError = this.convertError(lastError!, context);

    this.logger.error(
      `${this.getServiceName()}: All retry attempts exhausted`,
      {
        service: this.getServiceName(),
        operation: operationName,
        attempts: this.retryConfig.maxAttempts,
        finalError: finalError.toJSON(),
        requestId,
      }
    );

    return googleErr(finalError);
  }

  /**
   * Execute an operation wrapped in ResultAsync
   */
  protected executeAsyncWithRetry<T>(
    operation: () => Promise<T>,
    context: ServiceContext
  ): ResultAsync<T, GoogleWorkspaceError> {
    return ResultAsync.fromPromise(
      this.executeWithRetry(operation, context),
      error =>
        error instanceof GoogleWorkspaceError
          ? error
          : this.convertError(
              error instanceof Error ? error : new Error(String(error)),
              context
            )
    ).andThen(result => result);
  }

  /**
   * Convert a generic error to our custom error type
   */
  protected convertError(
    error: Error,
    context: ServiceContext
  ): GoogleWorkspaceError {
    // Try service-specific error conversion first
    const serviceError = this.convertServiceSpecificError(error, context);
    if (serviceError) {
      return serviceError;
    }

    // Check if it's already our custom error type
    if (error instanceof GoogleWorkspaceError) {
      return error;
    }

    // Try to identify common Google API errors
    const message = error.message.toLowerCase();

    if (
      message.includes('auth') ||
      message.includes('credential') ||
      message.includes('token')
    ) {
      return GoogleErrorFactory.createAuthError(
        error,
        'service-account',
        context.data
      );
    }

    // Default to generic service error
    return new GoogleServiceError(
      error.message,
      this.getServiceName(),
      'GOOGLE_SERVICE_ERROR',
      500,
      context.data,
      error
    );
  }

  /**
   * Convert service-specific errors (to be implemented by subclasses)
   */
  protected convertServiceSpecificError(
    error: Error,
    context: ServiceContext
  ): GoogleWorkspaceError | null {
    // Base implementation returns null - subclasses should override
    return null;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  protected calculateRetryDelay(
    attempt: number,
    error: GoogleWorkspaceError
  ): number {
    // Some errors (like rate limits) may specify a retry-after time
    if (
      error instanceof Error &&
      'retryAfterMs' in error &&
      typeof error.retryAfterMs === 'number'
    ) {
      return Math.min(error.retryAfterMs, this.retryConfig.maxDelayMs);
    }

    // Exponential backoff: initialDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay =
      this.retryConfig.initialDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attempt - 1);

    // Apply maximum delay limit
    const cappedDelay = Math.min(exponentialDelay, this.retryConfig.maxDelayMs);

    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.retryConfig.jitterFactor * Math.random();

    return Math.floor(cappedDelay + jitter);
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate that the OAuth2Client is properly authenticated
   */
  protected async validateAuthentication(): Promise<
    GoogleWorkspaceResult<void>
  > {
    try {
      const accessToken = await this.auth.getAccessToken();

      if (!accessToken.token) {
        return googleErr(
          new GoogleAuthError('No access token available', 'service-account', {
            service: this.getServiceName(),
          })
        );
      }

      return googleOk(undefined);
    } catch (error) {
      const authError = GoogleErrorFactory.createAuthError(
        error instanceof Error ? error : new Error(String(error)),
        'service-account',
        { service: this.getServiceName() }
      );

      return googleErr(authError);
    }
  }

  /**
   * Get current authentication status
   */
  public async getAuthenticationStatus(): Promise<
    GoogleWorkspaceResult<{
      authenticated: boolean;
      expiresAt?: Date;
      scopes?: string[];
    }>
  > {
    try {
      const accessToken = await this.auth.getAccessToken();

      if (!accessToken.token) {
        return googleOk({ authenticated: false });
      }

      // Get token expiry if available
      const expiresAt = (accessToken as any).expires_at
        ? new Date((accessToken as any).expires_at)
        : undefined;

      // Get scopes if available
      const credentials = this.auth.credentials;
      const scopes = credentials.scope?.split(' ');

      return googleOk({
        authenticated: true,
        expiresAt,
        scopes,
      });
    } catch (error) {
      const authError = GoogleErrorFactory.createAuthError(
        error instanceof Error ? error : new Error(String(error)),
        'service-account',
        { service: this.getServiceName() }
      );

      return googleErr(authError);
    }
  }

  /**
   * Generate a unique request ID for tracing
   */
  protected generateRequestId(): string {
    return `${this.getServiceName()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a service context for operations
   */
  protected createContext(
    operation: string,
    data?: Record<string, unknown>
  ): ServiceContext {
    return {
      operation,
      data,
      requestId: this.generateRequestId(),
    };
  }
}
