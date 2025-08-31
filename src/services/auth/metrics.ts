/**
 * Authentication Metrics System
 *
 * Provides minimal performance overhead metrics for OAuth2 authentication operations.
 * Outputs structured metrics to stderr in format: AUTH_METRIC event=name key=value
 *
 * Features:
 * - Environment variable AUTH_METRICS=off for opt-out (default: enabled)
 * - Singleton instance for optimal memory usage
 * - Zero-allocation fast path when disabled
 * - Thread-safe metric emission
 * - Automatic value sanitization for security
 * - Graceful error handling
 *
 * Environment variable AUTH_METRICS=off disables all metric collection.
 */

export interface RefreshSuccessMetrics {
  /** Duration of refresh operation in milliseconds */
  duration: number;
  /** Type of refresh: 'proactive' | 'on-demand' */
  type?: string;
  /** Whether tokens were retrieved from cache */
  cached?: boolean;
  /** Time until expiry in milliseconds */
  timeUntilExpiry?: number;
}

export interface RefreshFailureMetrics {
  /** Error type or message (sanitized) */
  error: string;
  /** Duration of failed operation in milliseconds */
  duration: number;
  /** Type of refresh that failed */
  type?: string;
  /** Number of retry attempts */
  retryCount?: number;
}

export interface RefreshProactiveMetrics {
  /** Time until expiry when proactive refresh was triggered */
  timeUntilExpiry: number;
  /** Configured threshold for proactive refresh */
  threshold?: number;
}

export interface CacheCorruptedMetrics {
  /** Source of corruption: 'keytar' | 'file' */
  source: 'keytar' | 'file';
  /** Type of corruption detected */
  corruptionType:
    | 'json_corruption'
    | 'encryption_corruption'
    | 'structure_corruption';
  /** Whether corruption was recoverable */
  recoverable?: boolean;
  /** Error type that led to corruption detection */
  errorType?: string;
}

/**
 * Authentication metrics collector with minimal performance overhead
 * and environment-based opt-out capability.
 */
export class AuthMetrics {
  private readonly enabled: boolean;
  private static instance: AuthMetrics | null = null;

  constructor() {
    // Environment-based configuration with opt-out capability
    const metricsEnv = process.env.AUTH_METRICS?.toLowerCase().trim();
    this.enabled = !(
      metricsEnv === 'off' ||
      metricsEnv === 'false' ||
      metricsEnv === '0'
    );
  }

  /**
   * Get singleton instance for optimal memory usage
   */
  public static getInstance(): AuthMetrics {
    if (!AuthMetrics.instance) {
      AuthMetrics.instance = new AuthMetrics();
    }
    return AuthMetrics.instance;
  }

  /**
   * Create new instance (primarily for testing)
   */
  public static createInstance(): AuthMetrics {
    return new AuthMetrics();
  }

  /**
   * Check if metrics collection is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Emit refresh success metric
   * Zero-allocation fast path when disabled
   */
  public emitRefreshSuccess(metrics: RefreshSuccessMetrics): void {
    if (!this.enabled) return; // Fast path: no allocations when disabled

    this.emit('refresh_success', metrics);
  }

  /**
   * Emit refresh failure metric
   * Automatically sanitizes error messages for security
   */
  public emitRefreshFailure(metrics: RefreshFailureMetrics): void {
    if (!this.enabled) return; // Fast path: no allocations when disabled

    // Sanitize error message for safe output
    const sanitizedMetrics = {
      ...metrics,
      error: this.sanitizeValue(metrics.error),
    };

    this.emit('refresh_failure', sanitizedMetrics);
  }

  /**
   * Emit proactive refresh triggered metric
   */
  public emitRefreshProactive(metrics: RefreshProactiveMetrics): void {
    if (!this.enabled) return; // Fast path: no allocations when disabled

    this.emit('refresh_proactive', metrics);
  }

  /**
   * Emit cache corruption detected metric
   */
  public emitCacheCorrupted(metrics: CacheCorruptedMetrics): void {
    if (!this.enabled) return; // Fast path: no allocations when disabled

    this.emit('cache_corrupted', metrics);
  }

  /**
   * Low-level metric emission to stderr with performance optimizations
   */
  private emit(event: string, data: Record<string, any>): void {
    try {
      // Pre-allocate array for better performance
      const pairs: string[] = [`event=${event}`];

      // Build key-value pairs with minimal allocations
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined && value !== null) {
          const sanitizedValue =
            typeof value === 'string'
              ? this.sanitizeValue(value)
              : String(value);
          pairs.push(`${key}=${sanitizedValue}`);
        }
      }

      // Single write to stderr for better performance and atomicity
      const output = `AUTH_METRIC ${pairs.join(' ')}\n`;
      process.stderr.write(output);
    } catch (error) {
      // Silently handle stderr write failures to prevent disrupting application flow
      // No logging to avoid potential recursive issues or infinite loops
    }
  }

  /**
   * Sanitize string values for safe key-value output
   * Optimized for minimal allocations and security
   */
  private sanitizeValue(value: string): string {
    if (!value) return value;

    return value
      .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace unsafe characters
      .replace(/_+/g, '_') // Collapse multiple underscores
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  }
}

// Export singleton instance for convenient usage
export const authMetrics = AuthMetrics.getInstance();
