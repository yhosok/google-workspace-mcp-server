/**
 * @fileoverview Token utilities for proactive refresh functionality.
 *
 * Provides utilities for detecting when tokens are expiring soon and calculating
 * optimal refresh windows to prevent 401 errors and tool response delays.
 *
 * This module implements a proactive token refresh strategy with jitter to prevent
 * thundering herd problems when multiple clients refresh simultaneously.
 *
 * Key features:
 * - Configurable refresh thresholds and jitter
 * - Mathematical consistency in edge cases
 * - Robust error handling and input validation
 * - Optimized for OAuth2 token refresh scenarios
 *
 * @author Google Workspace MCP Server Team
 * @since 1.0.0
 */

/**
 * Default threshold for token refresh - tokens will be refreshed when they have
 * less than this amount of time remaining until expiration.
 * @constant {number}
 */
export const DEFAULT_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Default jitter range for randomizing refresh timing to prevent thundering herd.
 * Actual jitter will be 0 to +30 seconds (early-only) from the calculated refresh time.
 * @constant {number}
 */
export const DEFAULT_REFRESH_JITTER_MS = 30 * 1000; // 30 seconds

/**
 * Dependency injection interface for token timing operations.
 * Enables deterministic testing by allowing custom time and random number generation.
 */
export interface TokenTimingDeps {
  /** Custom time function for testing (defaults to Date.now) */
  now?: () => number;
  /** Custom random integer function for testing (0 to maxInclusive, defaults to Math.random based) */
  randomInt?: (maxInclusive: number) => number;
}

/**
 * Complete information about when and whether to refresh a token.
 *
 * @interface RefreshWindow
 */
export interface RefreshWindow {
  /** Whether the token should be refreshed immediately */
  shouldRefresh: boolean;

  /** Timestamp when the token should be refreshed (may be adjusted for immediate refresh) */
  refreshAtMs: number;

  /** Time in milliseconds until refresh should occur (0 for immediate refresh) */
  timeUntilRefresh: number;

  /** Original token expiration timestamp */
  expiryMs: number;

  /** Threshold used for refresh calculation */
  thresholdMs: number;
}

/**
 * Determines if a token is expiring soon and should be proactively refreshed.
 *
 * This function uses calculateRefreshWindow internally to ensure consistency
 * between timing calculations and refresh decisions.
 *
 * @param expiryMs - Token expiration timestamp in milliseconds
 * @param thresholdMs - Threshold before expiry to trigger refresh (default: 5 minutes)
 * @param jitterMs - Random variance for early refresh (default: 0-30 seconds earlier)
 * @param deps - Optional dependency injection for testing
 * @returns true if token should be refreshed, false otherwise
 */
export function isExpiringSoon(
  expiryMs: number,
  thresholdMs = DEFAULT_REFRESH_THRESHOLD_MS,
  jitterMs = DEFAULT_REFRESH_JITTER_MS,
  deps?: TokenTimingDeps
): boolean {
  const refreshWindow = calculateRefreshWindow(
    expiryMs,
    thresholdMs,
    jitterMs,
    deps
  );
  return refreshWindow.shouldRefresh;
}

/**
 * Calculates a complete refresh window with timing information for token refresh.
 *
 * This implements a unified schedule-driven model where:
 * - A single refreshAt timestamp is calculated once
 * - Jitter is applied in early-only direction (0 to +jitterMs)
 * - Both timing and decision logic use the same refreshAt value
 *
 * @param expiryMs - Token expiration timestamp in milliseconds
 * @param thresholdMs - Threshold before expiry to trigger refresh (default: 5 minutes)
 * @param jitterMs - Random variance for early refresh only (default: 0-30 seconds earlier)
 * @param deps - Optional dependency injection for testing
 * @returns Complete refresh window information
 */
export function calculateRefreshWindow(
  expiryMs: number,
  thresholdMs = DEFAULT_REFRESH_THRESHOLD_MS,
  jitterMs = DEFAULT_REFRESH_JITTER_MS,
  deps?: TokenTimingDeps
): RefreshWindow {
  // Input validation
  if (expiryMs === null || expiryMs === undefined) {
    throw new Error('Token expiry timestamp cannot be null or undefined');
  }

  if (!Number.isFinite(expiryMs)) {
    throw new Error('Token expiry timestamp must be a finite number');
  }

  if (thresholdMs < 0) {
    throw new Error(
      'Refresh threshold cannot be negative (provided: ' + thresholdMs + ')'
    );
  }

  if (jitterMs < 0) {
    throw new Error(
      'Jitter value cannot be negative (provided: ' + jitterMs + ')'
    );
  }

  const now = (deps?.now ?? Date.now)();

  // Handle already expired tokens immediately
  if (expiryMs <= now) {
    return {
      shouldRefresh: true,
      refreshAtMs: now,
      timeUntilRefresh: 0,
      expiryMs,
      thresholdMs,
    };
  }

  // Special case: zero threshold means proactive refresh is disabled
  // Only refresh when token is actually expired
  if (thresholdMs === 0) {
    return {
      shouldRefresh: false,
      refreshAtMs: expiryMs,
      timeUntilRefresh: expiryMs - now,
      expiryMs,
      thresholdMs,
    };
  }

  // Calculate base refresh time (before jitter)
  const baseRefreshAt = expiryMs - thresholdMs;

  // Apply early-only jitter: 0 to +jitterMs (makes refresh EARLIER)
  const jitter =
    jitterMs > 0
      ? deps?.randomInt
        ? deps.randomInt(jitterMs)
        : Math.floor(Math.random() * (jitterMs + 1))
      : 0;

  // Calculate actual refresh time (early-only jitter subtracts from base time)
  const refreshAtCandidate = baseRefreshAt - jitter;

  // Ensure we don't schedule refresh in the past
  const refreshAtMs = Math.max(refreshAtCandidate, now);

  // Determine if refresh should happen now
  const shouldRefresh = now >= refreshAtMs;

  // Calculate time until refresh
  const timeUntilRefresh = shouldRefresh ? 0 : refreshAtMs - now;

  return {
    shouldRefresh,
    refreshAtMs,
    timeUntilRefresh,
    expiryMs,
    thresholdMs,
  };
}
