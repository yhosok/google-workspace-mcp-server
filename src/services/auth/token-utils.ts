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
 * Actual jitter will be ±30 seconds from the calculated refresh time.
 * @constant {number}
 */
export const DEFAULT_REFRESH_JITTER_MS = 30 * 1000; // 30 seconds

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
 * @param expiryMs - Token expiration timestamp in milliseconds
 * @param thresholdMs - Threshold before expiry to trigger refresh (default: 5 minutes)
 * @param jitterMs - Random variance to add/subtract from threshold (default: ±30 seconds)
 * @returns true if token should be refreshed, false otherwise
 */
export function isExpiringSoon(
  expiryMs: number,
  thresholdMs = DEFAULT_REFRESH_THRESHOLD_MS,
  jitterMs = DEFAULT_REFRESH_JITTER_MS
): boolean {
  // Input validation
  if (expiryMs === null || expiryMs === undefined) {
    throw new Error('Token expiry timestamp cannot be null or undefined');
  }
  
  if (!Number.isFinite(expiryMs)) {
    throw new Error('Token expiry timestamp must be a finite number');
  }
  
  if (thresholdMs < 0) {
    throw new Error('Refresh threshold cannot be negative (provided: ' + thresholdMs + ')');
  }
  
  if (jitterMs < 0) {
    throw new Error('Jitter value cannot be negative (provided: ' + jitterMs + ')');
  }
  
  // Handle negative expiry (already expired)
  if (expiryMs < 0) {
    return true;
  }
  
  const nowMs = Date.now();
  
  // Handle already expired tokens
  if (expiryMs <= nowMs) {
    return true;
  }
  
  // Special case: zero threshold means only expired tokens should return true
  if (thresholdMs === 0) {
    return false;
  }
  
  // Apply jitter: random value between -jitterMs and +jitterMs
  // Optimized calculation to avoid floating point precision issues
  const jitter = jitterMs > 0 ? Math.round((Math.random() - 0.5) * 2 * jitterMs) : 0;
  
  // Calculate time remaining until expiry
  const timeUntilExpiry = expiryMs - nowMs;
  
  // Check if time remaining is within threshold (adjusted for jitter)
  // Positive jitter makes us refresh EARLIER (more conservative)
  // Negative jitter makes us refresh LATER (less conservative)
  return timeUntilExpiry <= (thresholdMs - jitter);
}

/**
 * Calculates a complete refresh window with timing information for token refresh.
 * 
 * @param expiryMs - Token expiration timestamp in milliseconds
 * @param thresholdMs - Threshold before expiry to trigger refresh (default: 5 minutes)
 * @param jitterMs - Random variance to add/subtract from refresh timing (default: ±30 seconds)
 * @returns Complete refresh window information
 */
export function calculateRefreshWindow(
  expiryMs: number,
  thresholdMs = DEFAULT_REFRESH_THRESHOLD_MS,
  jitterMs = DEFAULT_REFRESH_JITTER_MS
): RefreshWindow {
  // Input validation
  if (expiryMs === null || expiryMs === undefined) {
    throw new Error('Token expiry timestamp cannot be null or undefined');
  }
  
  if (!Number.isFinite(expiryMs)) {
    throw new Error('Token expiry timestamp must be a finite number');
  }
  
  if (thresholdMs < 0) {
    throw new Error('Refresh threshold cannot be negative (provided: ' + thresholdMs + ')');
  }
  
  if (jitterMs < 0) {
    throw new Error('Jitter value cannot be negative (provided: ' + jitterMs + ')');
  }
  
  const nowMs = Date.now();
  
  // Apply jitter: random value between -jitterMs and +jitterMs
  // Optimized calculation to avoid floating point precision issues
  const jitter = jitterMs > 0 ? Math.round((Math.random() - 0.5) * 2 * jitterMs) : 0;
  
  // Calculate when to refresh (threshold before expiry, adjusted for jitter)
  // Positive jitter makes us refresh EARLIER (more conservative)
  const refreshAtMs = expiryMs - thresholdMs - jitter;
  
  // Determine if refresh should happen now (use same jitter for consistency)
  const timeUntilExpiry = expiryMs - nowMs;
  
  // Handle already expired tokens
  if (expiryMs <= nowMs) {
    return {
      shouldRefresh: true,
      refreshAtMs,
      timeUntilRefresh: 0,
      expiryMs,
      thresholdMs
    };
  }
  
  // Special case: zero threshold
  if (thresholdMs === 0) {
    return {
      shouldRefresh: false,
      refreshAtMs,
      timeUntilRefresh: refreshAtMs - nowMs,
      expiryMs,
      thresholdMs
    };
  }
  
  const shouldRefresh = timeUntilExpiry <= (thresholdMs - jitter);
  
  // Calculate time until refresh, ensuring logical consistency
  const rawTimeUntilRefresh = refreshAtMs - nowMs;
  const timeUntilRefresh = shouldRefresh ? Math.max(0, rawTimeUntilRefresh) : rawTimeUntilRefresh;
  
  // For immediate refresh scenarios, adjust refreshAtMs to be logical
  const adjustedRefreshAtMs = shouldRefresh && rawTimeUntilRefresh < 0 ? nowMs : refreshAtMs;
  
  return {
    shouldRefresh,
    refreshAtMs: adjustedRefreshAtMs,
    timeUntilRefresh,
    expiryMs,
    thresholdMs
  };
}