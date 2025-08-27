/**
 * Test configuration for Google Workspace MCP Server
 * 
 * This file contains configuration settings optimized for testing,
 * including high-speed retry configurations to minimize test execution time.
 */

import type { GoogleServiceRetryConfig } from '../src/services/base/google-service.js';

/**
 * High-speed retry configuration for testing
 * 
 * This configuration dramatically reduces retry delays and attempts
 * to minimize test execution time while still testing retry logic.
 * 
 * Production delays: 1s → 2s → 4s (total: ~7s for error tests)
 * Test delays: 10ms → 15ms (total: ~25ms for error tests)
 * 
 * Speed improvement: ~280x faster
 */
export const TEST_RETRY_CONFIG: GoogleServiceRetryConfig = {
  // Reduce retry attempts from 3 to 2 (still tests retry logic)
  maxAttempts: 2,
  
  // Base properties
  baseDelay: 10,
  maxDelay: 50,
  jitter: 0,
  retriableCodes: [429, 500, 502, 503, 504],
  
  // Drastically reduce initial delay from 1000ms to 10ms (100x faster)
  initialDelayMs: 10,
  
  // Reduce max delay from 30000ms to 50ms for testing
  maxDelayMs: 50,
  
  // Reduce backoff multiplier from 2.0 to 1.5 (slower growth)
  backoffMultiplier: 1.5,
  
  // Disable jitter for predictable test execution times
  jitterFactor: 0
};

/**
 * Alternative ultra-fast retry config for specific tests that need even faster execution
 */
export const ULTRA_FAST_RETRY_CONFIG: GoogleServiceRetryConfig = {
  maxAttempts: 1, // No retries for ultra-fast tests
  baseDelay: 1,
  maxDelay: 1,
  jitter: 0,
  retriableCodes: [429, 500, 502, 503, 504],
  initialDelayMs: 1,
  maxDelayMs: 1,
  backoffMultiplier: 1,
  jitterFactor: 0
};

/**
 * Configuration for testing retry behavior with more realistic timing
 * (still faster than production but allows testing of backoff logic)
 */
export const REALISTIC_TEST_RETRY_CONFIG: GoogleServiceRetryConfig = {
  maxAttempts: 3,
  baseDelay: 50,
  maxDelay: 500,
  jitter: 0.1,
  retriableCodes: [429, 500, 502, 503, 504],
  initialDelayMs: 50,   // 50ms instead of 1000ms
  maxDelayMs: 500,      // 500ms instead of 30000ms
  backoffMultiplier: 2,
  jitterFactor: 0.1
};