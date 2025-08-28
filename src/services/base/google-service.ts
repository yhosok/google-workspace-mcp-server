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
  extractGoogleApiError,
} from '../../errors/index.js';
import { Logger } from '../../utils/logger.js';
import { loadConfig } from '../../config/index.js';
import type { RetryConfig } from '../../types/index.js';

/**
 * Extended retry configuration for Google services.
 * Extends the base RetryConfig with additional properties specific to Google API operations.
 */
export interface GoogleServiceRetryConfig {
  /**
   * Maximum number of retry attempts
   */
  maxAttempts: number;

  /**
   * Base delay in milliseconds between attempts
   */
  baseDelay: number;

  /**
   * Initial delay in milliseconds (alias for baseDelay for backward compatibility)
   */
  initialDelayMs: number;

  /**
   * Base delay in milliseconds (alias for initialDelayMs)
   */
  baseDelayMs?: number;

  /**
   * Maximum delay in milliseconds
   */
  maxDelay: number;

  /**
   * Maximum delay in milliseconds (alias for maxDelay)
   */
  maxDelayMs: number;

  /**
   * Backoff multiplier for exponential backoff strategy
   */
  backoffMultiplier: number;

  /**
   * Jitter factor to prevent thundering herd (0-1)
   */
  jitter: number;

  /**
   * Jitter factor to prevent thundering herd (0-1, alias for jitter)
   */
  jitterFactor: number;

  /**
   * HTTP status codes that should trigger retries
   */
  retriableCodes: number[];
}

// Re-export for backward compatibility
export type { RetryConfig } from '../../types/index.js';

/**
 * Default retry configuration for Google services.
 * These values provide a good balance between reliability and performance.
 */
export const DEFAULT_RETRY_CONFIG: GoogleServiceRetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  initialDelayMs: 1000, // Alias for backward compatibility
  maxDelay: 30000,
  maxDelayMs: 30000, // Alias for backward compatibility
  jitter: 0.1,
  jitterFactor: 0.1, // Alias for backward compatibility
  backoffMultiplier: 2,
  retriableCodes: [429, 500, 502, 503, 504],
};

/**
 * Create retry configuration from environment variables and defaults.
 * This function merges environment-based configuration with sensible defaults.
 * 
 * @returns Normalized retry configuration for Google services
 */
export function createRetryConfigFromEnv(): GoogleServiceRetryConfig {
  try {
    const envConfig = loadConfig();
    
    const maxAttempts = envConfig.GOOGLE_RETRY_MAX_ATTEMPTS || DEFAULT_RETRY_CONFIG.maxAttempts;
    const baseDelay = envConfig.GOOGLE_RETRY_BASE_DELAY || DEFAULT_RETRY_CONFIG.baseDelay;
    const maxDelay = envConfig.GOOGLE_RETRY_MAX_DELAY || DEFAULT_RETRY_CONFIG.maxDelay;
    const jitter = envConfig.GOOGLE_RETRY_JITTER || DEFAULT_RETRY_CONFIG.jitter;
    const retriableCodes = envConfig.GOOGLE_RETRY_RETRIABLE_CODES || DEFAULT_RETRY_CONFIG.retriableCodes;

    return {
      maxAttempts,
      baseDelay,
      initialDelayMs: baseDelay, // Alias
      baseDelayMs: baseDelay, // Alias
      maxDelay,
      maxDelayMs: maxDelay, // Alias
      backoffMultiplier: DEFAULT_RETRY_CONFIG.backoffMultiplier, // Not configurable via env
      jitter,
      jitterFactor: jitter, // Alias
      retriableCodes,
    };
  } catch {
    // When env parsing fails completely, fall back to server errors only (no rate limits)
    const fallbackConfig = {
      ...DEFAULT_RETRY_CONFIG,
      retriableCodes: [500, 502, 503, 504], // Exclude 429 for fallback
    };
    
    return {
      maxAttempts: fallbackConfig.maxAttempts,
      baseDelay: fallbackConfig.baseDelay,
      initialDelayMs: fallbackConfig.initialDelayMs,
      baseDelayMs: fallbackConfig.baseDelay,
      maxDelay: fallbackConfig.maxDelay,
      maxDelayMs: fallbackConfig.maxDelayMs,
      backoffMultiplier: fallbackConfig.backoffMultiplier,
      jitter: fallbackConfig.jitter,
      jitterFactor: fallbackConfig.jitterFactor,
      retriableCodes: fallbackConfig.retriableCodes,
    };
  }
}

/**
 * Validate and normalize retry configuration.
 * Ensures all configuration values are valid and within acceptable ranges.
 * 
 * @param config - The retry configuration to validate
 * @returns Normalized and validated retry configuration
 * @throws Error if configuration values are invalid
 */
function normalizeRetryConfig(config: GoogleServiceRetryConfig): GoogleServiceRetryConfig {
  try {
    // Validate parameters
    if (config.maxAttempts <= 0) {
      throw new Error('maxAttempts must be positive');
    }
    
    const initialDelayMs = config.baseDelayMs || config.initialDelayMs;
    if (initialDelayMs <= 0) {
      throw new Error('initialDelayMs must be positive');
    }
    
    if (config.maxDelayMs <= 0) {
      throw new Error('maxDelayMs must be positive');
    }
    
    if (config.backoffMultiplier <= 0) {
      throw new Error('backoffMultiplier must be positive');
    }
    
    if (config.jitterFactor < 0 || config.jitterFactor > 1) {
      throw new Error('jitterFactor must be between 0 and 1');
    }

    // Filter out non-retriable HTTP codes
    const retriableCodes = config.retriableCodes || DEFAULT_RETRY_CONFIG.retriableCodes!;
    const validRetriableCodes = [429, 500, 502, 503, 504];
    const filteredCodes = retriableCodes.filter(code => 
      typeof code === 'number' && validRetriableCodes.includes(code)
    );

    return {
      maxAttempts: config.maxAttempts,
      baseDelay: initialDelayMs,
      initialDelayMs,
      baseDelayMs: initialDelayMs,
      maxDelay: config.maxDelayMs,
      maxDelayMs: config.maxDelayMs,
      backoffMultiplier: config.backoffMultiplier,
      jitter: config.jitterFactor,
      jitterFactor: config.jitterFactor,
      retriableCodes: filteredCodes,
    };
  } catch (error) {
    throw new Error('Invalid retry configuration');
  }
}

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
  protected readonly retryConfig: GoogleServiceRetryConfig;

  constructor(
    auth: OAuth2Client,
    logger: Logger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    this.auth = auth;
    this.logger = logger;
    this.retryConfig = normalizeRetryConfig(retryConfig || createRetryConfigFromEnv());
    
    // Log retry configuration at service startup
    this.logger.info(`${this.constructor.name}: Retry configuration initialized`, {
      maxAttempts: this.retryConfig.maxAttempts,
      initialDelayMs: this.retryConfig.initialDelayMs,
      maxDelayMs: this.retryConfig.maxDelayMs,
      backoffMultiplier: this.retryConfig.backoffMultiplier,
      jitterFactor: this.retryConfig.jitterFactor,
      retriableCodes: this.retryConfig.retriableCodes,
    });
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
   * Determine if an error should be retried using normalized error information.
   * 
   * Priority order:
   * 1. Original error's isRetryable() method (if it explicitly returns false)
   * 2. HTTP status code in retriable codes list (explicit configuration)
   * 3. HTTP status code ranges (4xx are not retriable, 5xx might be)
   * 4. Normalized error's isRetryable flag (based on structured analysis) 
   * 5. Converted error's isRetryable() method
   * 
   * @param error - The original error that occurred
   * @param customError - The converted GoogleWorkspaceError
   * @returns Object indicating whether to retry and the reason
   */
  protected shouldRetryError(error: Error, customError: GoogleWorkspaceError): { shouldRetry: boolean; reason: string } {
    // Extract normalized error information for better retry decisions
    const normalizedError = extractGoogleApiError(error);
    const statusCode = normalizedError.httpStatus || this.extractStatusCode(error, customError);
    
    // First priority: Check if original error had explicit isRetryable that said no
    if ('isRetryable' in error && typeof (error as any).isRetryable === 'function' && !(error as any).isRetryable()) {
      return { shouldRetry: false, reason: 'error_override_not_retryable' };
    }
    
    // Second priority: If we have an explicit HTTP status code in our retriable list, retry
    if (statusCode && this.retryConfig.retriableCodes?.includes(statusCode)) {
      return { shouldRetry: true, reason: 'retriable_http_status' };
    }
    
    // Third priority: If we have a definitely non-retriable status code, don't retry
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      // Make an exception for 429 (rate limit) which should always be retryable
      if (statusCode === 429) {
        return { shouldRetry: true, reason: 'rate_limit_retryable' };
      }
      return { shouldRetry: false, reason: `non_retriable_http_status:${statusCode}` };
    }
    
    // Fourth priority: Use normalized error's isRetryable flag (based on structured analysis)
    if (normalizedError.isRetryable) {
      return { shouldRetry: true, reason: `normalized_retryable:${normalizedError.reason || 'status_' + statusCode}` };
    }
    
    // Fifth priority: Use converted error's isRetryable() method
    const isRetryable = customError.isRetryable();
    if (!isRetryable) {
      return { shouldRetry: false, reason: 'error_not_retryable' };
    }
    
    // Error says it's retryable
    return { shouldRetry: true, reason: 'error_is_retryable' };
  }

  /**
   * Extract HTTP status code using normalized error extraction.
   * Uses the new normalized error system to reliably extract status codes
   * from various error sources including GaxiosError structures.
   * 
   * @param error - The original error object
   * @param customError - The converted error object
   * @returns HTTP status code or null if not found
   */
  protected extractStatusCode(error: Error, customError: GoogleWorkspaceError): number | null {
    // Use normalized error extraction for reliable status code detection
    const normalizedError = extractGoogleApiError(error);
    
    // Return the normalized status code, which follows priority-based extraction
    return normalizedError.httpStatus || customError.statusCode || null;
  }

  /**
   * Execute an operation with comprehensive retry logic and error handling.
   * 
   * This method provides:
   * - Exponential backoff with jitter
   * - Configurable retry attempts
   * - Detailed logging at each step
   * - Smart error classification
   * - Proper error conversion and handling
   * 
   * @param operation - The async operation to execute
   * @param context - Service context for logging and error handling
   * @returns Promise resolving to either success result or error
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
        retryConfig: this.retryConfig,
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

        const isFinalAttempt = attempt >= this.retryConfig.maxAttempts;
        const logData: any = {
          service: this.getServiceName(),
          operation: operationName,
          attempt,
          isFinalAttempt,
          requestId,
          error: lastError.message,
          stack: lastError.stack,
        };
        
        // Convert to our custom error type
        const customError = this.convertError(lastError, context);
        
        // Add next retry delay if this isn't the final attempt
        if (!isFinalAttempt) {
          const nextDelay = this.calculateRetryDelay(attempt, customError);
          logData.nextRetryIn = nextDelay;
        }

        this.logger.warn(
          `${this.getServiceName()}: Attempt ${attempt} failed`,
          logData
        );

        // Check if error should be retried
        const { shouldRetry, reason } = this.shouldRetryError(lastError, customError);
        
        if (!shouldRetry) {
          const statusCode = this.extractStatusCode(lastError, customError);
          const isRetryable = customError.isRetryable();
          
          this.logger.error(
            `${this.getServiceName()}: Non-retryable error encountered`,
            {
              service: this.getServiceName(),
              operation: operationName,
              error: customError.toJSON(),
              requestId,
              retrySkippedReason: reason,
              errorCode: customError.code,
              statusCode,
              httpStatusRetriable: statusCode ? this.retryConfig.retriableCodes?.includes(statusCode) : undefined,
              errorRetryable: isRetryable,
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
        const statusCode = this.extractStatusCode(lastError, customError);

        this.logger.info(`${this.getServiceName()}: Retrying in ${delay}ms`, {
          service: this.getServiceName(),
          operation: operationName,
          attempt,
          maxAttempts: this.retryConfig.maxAttempts,
          delayMs: delay,
          nextDelayMs: delay, // Alias for backwards compatibility
          retryReason: reason,
          statusCode,
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
   * Convert a generic error to our custom error type using normalized error extraction.
   * 
   * This method now uses the normalized error system to make better decisions about
   * error classification and avoid brittle string matching.
   * 
   * @param error - The original error
   * @param context - Service context for additional information
   * @returns Appropriate GoogleWorkspaceError subclass
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

    // Extract normalized error information for better classification
    const normalizedError = extractGoogleApiError(error);
    const enrichedContext = {
      normalizedError,
      ...context.data
    };

    // Use structured data for error classification instead of string matching
    if (normalizedError.reason) {
      // Check for authentication-related errors using structured reason
      const authReasons = ['authError', 'forbidden', 'invalid', 'required', 'missing', 'expired', 'tokenExpired'];
      if (authReasons.includes(normalizedError.reason)) {
        return GoogleErrorFactory.createAuthError(error, 'service-account', enrichedContext);
      }
    }

    // Fallback to HTTP status-based classification
    if (normalizedError.httpStatus === 401 || normalizedError.httpStatus === 403) {
      return GoogleErrorFactory.createAuthError(error, 'service-account', enrichedContext);
    }

    // Last resort: string matching (only if no structured data available)
    if (!normalizedError.reason) {
      const message = error.message.toLowerCase();
      if (message.includes('auth') || message.includes('credential') || message.includes('token')) {
        return GoogleErrorFactory.createAuthError(error, 'service-account', enrichedContext);
      }
    }

    // Default to generic service error
    const statusCode = normalizedError.httpStatus || 500;
    const genericServiceError = new GoogleServiceError(
      normalizedError.message,
      this.getServiceName(),
      'GOOGLE_SERVICE_ERROR',
      statusCode,
      enrichedContext,
      error
    );
    
    // Preserve retryAfterMs if it exists on the original error
    if ('retryAfterMs' in error && typeof (error as any).retryAfterMs === 'number') {
      (genericServiceError as any).retryAfterMs = (error as any).retryAfterMs;
    }
    
    // Preserve original isRetryable logic if it exists
    if ('isRetryable' in error && typeof (error as any).isRetryable === 'function') {
      const originalIsRetryable = (error as any).isRetryable();
      (genericServiceError as any)._originalIsRetryable = originalIsRetryable;
      
      // Override the isRetryable method to return the original value
      genericServiceError.isRetryable = () => originalIsRetryable;
    }
    
    return genericServiceError;
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
   * Calculate retry delay using exponential backoff with jitter.
   * 
   * The delay calculation follows this strategy:
   * 1. Check if error specifies a retry-after time (e.g., rate limit)
   * 2. Apply exponential backoff: baseDelay * (multiplier ^ (attempt - 1))
   * 3. Cap at maximum delay
   * 4. Add random jitter to prevent thundering herd
   * 
   * @param attempt - Current attempt number (1-based)
   * @param error - The error that triggered the retry
   * @returns Delay in milliseconds before next attempt
   */
  protected calculateRetryDelay(
    attempt: number,
    error: GoogleWorkspaceError
  ): number {
    // Some errors (like rate limits) may specify a retry-after time
    // Rate limit delays should be respected exactly, not capped by maxDelayMs
    if (
      error instanceof Error &&
      'retryAfterMs' in error &&
      typeof error.retryAfterMs === 'number'
    ) {
      return error.retryAfterMs;
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
   * Generate a unique request ID for tracing and correlation.
   * Format: serviceName-timestamp-randomString
   * 
   * @returns Unique identifier for the current operation
   */
  protected generateRequestId(): string {
    return `${this.getServiceName()}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create a standardized service context for operations.
   * The context is used throughout the operation lifecycle for consistent
   * logging, error handling, and request tracing.
   * 
   * @param operation - Name of the operation being performed
   * @param data - Additional context data for the operation
   * @returns ServiceContext object with operation details
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
