/**
 * @fileoverview Test suite for token utilities - proactive refresh functionality.
 * 
 * Tests TDD Red phase for token expiration detection and refresh window calculation
 * to enable proactive token refreshing before expiration. This prevents 401 errors
 * and tool response delays by refreshing tokens before they expire.
 */

import { isExpiringSoon, calculateRefreshWindow, RefreshWindow } from './token-utils.js';

// Helper functions for testing (following pkce-utils.test.ts patterns)
const expectOkValue = <T>(result: any, expectedValue?: T) => {
  expect(result.isOk()).toBe(true);
  if (result.isOk() && expectedValue !== undefined) {
    expect(result.value).toEqual(expectedValue);
  }
  return result.isOk() ? result.value : undefined;
};

const expectErrType = (result: any, ErrorType: any) => {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error).toBeInstanceOf(ErrorType);
  }
};

const getOkValue = <T>(result: any): T => {
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    return result.value as T;
  }
  throw new Error('Expected Ok result but got Err');
};

describe('Token Utils', () => {
  // Test constants for consistent timing
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300000ms
  const FOUR_MINUTES_MS = 4 * 60 * 1000; // 240000ms  
  const SIX_MINUTES_MS = 6 * 60 * 1000; // 360000ms
  const THIRTY_SECONDS_MS = 30 * 1000; // 30000ms
  const ONE_MINUTE_MS = 60 * 1000; // 60000ms
  const TEN_MINUTES_MS = 10 * 60 * 1000; // 600000ms

  describe('isExpiringSoon', () => {
    describe('with default threshold (5 minutes)', () => {
      it('should return true for token expiring in 4 minutes (within threshold)', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        const result = isExpiringSoon(expiryMs);
        expect(result).toBe(true);
      });

      it('should return false for token expiring in 6 minutes (outside threshold)', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + SIX_MINUTES_MS;
        
        const result = isExpiringSoon(expiryMs);
        expect(result).toBe(false);
      });

      it('should return true for already expired token', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs - ONE_MINUTE_MS; // Expired 1 minute ago
        
        const result = isExpiringSoon(expiryMs);
        expect(result).toBe(true);
      });

      it('should handle exactly 5 minute expiration with jitter variance', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FIVE_MINUTES_MS;
        
        // Call multiple times and expect some variance due to jitter
        const results = [];
        for (let i = 0; i < 50; i++) {
          results.push(isExpiringSoon(expiryMs));
        }
        
        // Should have both true and false results due to ±30s jitter
        const trueResults = results.filter(r => r === true);
        const falseResults = results.filter(r => r === false);
        
        expect(trueResults.length).toBeGreaterThan(0);
        expect(falseResults.length).toBeGreaterThan(0);
      });
    });

    describe('with custom threshold', () => {
      it('should use custom 1 minute threshold', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + (30 * 1000); // 30 seconds from now
        
        const result = isExpiringSoon(expiryMs, ONE_MINUTE_MS);
        expect(result).toBe(true);
      });

      it('should use custom 10 minute threshold', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + (8 * 60 * 1000); // 8 minutes from now
        
        const result = isExpiringSoon(expiryMs, TEN_MINUTES_MS);
        expect(result).toBe(true);
      });

      it('should respect custom threshold over default', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS; // 4 minutes from now
        
        // With 10 minute threshold, 4 minutes should be within threshold
        const result = isExpiringSoon(expiryMs, TEN_MINUTES_MS);
        expect(result).toBe(true);
      });
    });

    describe('with custom jitter', () => {
      it('should use custom jitter value', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FIVE_MINUTES_MS;
        const customJitter = 60 * 1000; // 1 minute jitter
        
        // With larger jitter, should see more variance
        const results = [];
        for (let i = 0; i < 100; i++) {
          results.push(isExpiringSoon(expiryMs, FIVE_MINUTES_MS, customJitter));
        }
        
        const trueResults = results.filter(r => r === true);
        const falseResults = results.filter(r => r === false);
        
        // Should have significant variance with 1 minute jitter
        expect(trueResults.length).toBeGreaterThan(10);
        expect(falseResults.length).toBeGreaterThan(10);
      });

      it('should handle zero jitter (deterministic results)', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        // With zero jitter, results should be consistent
        const result1 = isExpiringSoon(expiryMs, FIVE_MINUTES_MS, 0);
        const result2 = isExpiringSoon(expiryMs, FIVE_MINUTES_MS, 0);
        const result3 = isExpiringSoon(expiryMs, FIVE_MINUTES_MS, 0);
        
        expect(result1).toBe(result2);
        expect(result2).toBe(result3);
        expect(result1).toBe(true); // 4 minutes < 5 minute threshold
      });
    });

    describe('edge cases and error handling', () => {
      it('should handle null expiry timestamp', () => {
        expect(() => isExpiringSoon(null as any)).toThrow();
      });

      it('should handle undefined expiry timestamp', () => {
        expect(() => isExpiringSoon(undefined as any)).toThrow();
      });

      it('should handle negative expiry timestamp', () => {
        const result = isExpiringSoon(-1000);
        expect(result).toBe(true); // Negative timestamp is always expired
      });

      it('should handle negative threshold', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        expect(() => isExpiringSoon(expiryMs, -1000)).toThrow();
      });

      it('should handle negative jitter', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        expect(() => isExpiringSoon(expiryMs, FIVE_MINUTES_MS, -1000)).toThrow();
      });

      it('should handle very large expiry times', () => {
        const futureMs = Date.now() + (365 * 24 * 60 * 60 * 1000); // 1 year from now
        
        const result = isExpiringSoon(futureMs);
        expect(result).toBe(false);
      });

      it('should handle zero threshold', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + 1000; // 1 second from now
        
        const result = isExpiringSoon(expiryMs, 0);
        expect(result).toBe(false); // Only expired tokens would return true with 0 threshold
      });
    });
  });

  describe('calculateRefreshWindow', () => {
    describe('basic functionality', () => {
      it('should calculate refresh window for token expiring in 4 minutes', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        const result = calculateRefreshWindow(expiryMs);
        
        expect(result.shouldRefresh).toBe(true);
        expect(result.expiryMs).toBe(expiryMs);
        expect(result.thresholdMs).toBe(FIVE_MINUTES_MS); // Default threshold
        expect(result.timeUntilRefresh).toBeGreaterThanOrEqual(0);
        expect(result.refreshAtMs).toBeGreaterThanOrEqual(nowMs); // Can be equal for immediate refresh
        expect(result.refreshAtMs).toBeLessThanOrEqual(expiryMs);
      });

      it('should calculate refresh window for token expiring in 6 minutes', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + SIX_MINUTES_MS;
        
        const result = calculateRefreshWindow(expiryMs);
        
        expect(result.shouldRefresh).toBe(false);
        expect(result.expiryMs).toBe(expiryMs);
        expect(result.thresholdMs).toBe(FIVE_MINUTES_MS);
        expect(result.timeUntilRefresh).toBeGreaterThan(0);
        expect(result.refreshAtMs).toBeGreaterThan(nowMs);
      });

      it('should handle already expired token', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs - ONE_MINUTE_MS; // Expired 1 minute ago
        
        const result = calculateRefreshWindow(expiryMs);
        
        expect(result.shouldRefresh).toBe(true);
        expect(result.expiryMs).toBe(expiryMs);
        expect(result.timeUntilRefresh).toBe(0); // Should refresh immediately
        expect(result.refreshAtMs).toBeLessThanOrEqual(nowMs);
      });
    });

    describe('jitter application', () => {
      it('should apply jitter to refresh timing', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FIVE_MINUTES_MS; // Exactly at threshold
        
        // Calculate multiple windows and check for variance
        const windows = [];
        for (let i = 0; i < 50; i++) {
          windows.push(calculateRefreshWindow(expiryMs));
        }
        
        // Should have variance in refreshAtMs due to jitter
        const refreshTimes = windows.map(w => w.refreshAtMs);
        const uniqueRefreshTimes = new Set(refreshTimes);
        
        expect(uniqueRefreshTimes.size).toBeGreaterThan(1);
        
        // All refresh times should be within jitter range of expected time
        const expectedRefreshMs = expiryMs - FIVE_MINUTES_MS;
        refreshTimes.forEach(refreshMs => {
          expect(refreshMs).toBeGreaterThanOrEqual(expectedRefreshMs - THIRTY_SECONDS_MS);
          expect(refreshMs).toBeLessThanOrEqual(expectedRefreshMs + THIRTY_SECONDS_MS);
        });
      });

      it('should include jitter in timeUntilRefresh calculation', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FIVE_MINUTES_MS;
        
        const result = calculateRefreshWindow(expiryMs);
        
        // Time until refresh should account for jitter
        const expectedTimeUntilRefresh = result.refreshAtMs - nowMs;
        expect(result.timeUntilRefresh).toBeCloseTo(expectedTimeUntilRefresh, -2); // Within 100ms
      });
    });

    describe('custom parameters', () => {
      it('should use custom threshold and jitter', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + (2 * 60 * 1000); // 2 minutes from now
        const customThreshold = 3 * 60 * 1000; // 3 minutes
        const customJitter = 60 * 1000; // 1 minute
        
        const result = calculateRefreshWindow(expiryMs, customThreshold, customJitter);
        
        expect(result.shouldRefresh).toBe(true); // 2 min < 3 min threshold
        expect(result.thresholdMs).toBe(customThreshold);
        
        // Refresh time should be within custom jitter range
        const expectedRefreshMs = expiryMs - customThreshold;
        expect(result.refreshAtMs).toBeGreaterThanOrEqual(expectedRefreshMs - customJitter);
        expect(result.refreshAtMs).toBeLessThanOrEqual(expectedRefreshMs + customJitter);
      });

      it('should handle zero jitter for deterministic timing', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        const result = calculateRefreshWindow(expiryMs, FIVE_MINUTES_MS, 0);
        
        expect(result.shouldRefresh).toBe(true);
        
        // With zero jitter and immediate refresh needed, refreshAtMs should be nowMs
        // and timeUntilRefresh should be 0 (since shouldRefresh is true)
        expect(result.refreshAtMs).toBe(nowMs); // Immediate refresh
        expect(result.timeUntilRefresh).toBe(0); // No wait time for immediate refresh
      });
    });

    describe('edge cases', () => {
      it('should handle null expiry timestamp', () => {
        expect(() => calculateRefreshWindow(null as any)).toThrow();
      });

      it('should handle undefined expiry timestamp', () => {
        expect(() => calculateRefreshWindow(undefined as any)).toThrow();
      });

      it('should handle negative threshold', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        expect(() => calculateRefreshWindow(expiryMs, -1000)).toThrow();
      });

      it('should handle negative jitter', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        expect(() => calculateRefreshWindow(expiryMs, FIVE_MINUTES_MS, -1000)).toThrow();
      });

      it('should handle threshold larger than time until expiry', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + ONE_MINUTE_MS; // 1 minute from now
        const largeThreshold = TEN_MINUTES_MS; // 10 minutes
        
        const result = calculateRefreshWindow(expiryMs, largeThreshold);
        
        expect(result.shouldRefresh).toBe(true);
        expect(result.refreshAtMs).toBeLessThanOrEqual(nowMs); // Should refresh immediately or in past
      });
    });

    describe('RefreshWindow interface compliance', () => {
      it('should return complete RefreshWindow object', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        const result = calculateRefreshWindow(expiryMs);
        
        // Check all required properties are present
        expect(result).toHaveProperty('shouldRefresh');
        expect(result).toHaveProperty('refreshAtMs');
        expect(result).toHaveProperty('timeUntilRefresh');
        expect(result).toHaveProperty('expiryMs');
        expect(result).toHaveProperty('thresholdMs');
        
        // Check types
        expect(typeof result.shouldRefresh).toBe('boolean');
        expect(typeof result.refreshAtMs).toBe('number');
        expect(typeof result.timeUntilRefresh).toBe('number');
        expect(typeof result.expiryMs).toBe('number');
        expect(typeof result.thresholdMs).toBe('number');
        
        // Check values are reasonable
        expect(result.expiryMs).toBeGreaterThan(0);
        expect(result.thresholdMs).toBeGreaterThan(0);
        expect(result.refreshAtMs).toBeGreaterThan(0);
        expect(result.timeUntilRefresh).toBeGreaterThanOrEqual(0);
      });

      it('should maintain consistency between calculated values', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        
        const result = calculateRefreshWindow(expiryMs);
        
        // timeUntilRefresh should be consistent with our refresh logic
        // For shouldRefresh=true cases, timeUntilRefresh is clamped to >= 0
        const calculatedTimeUntil = result.refreshAtMs - nowMs;
        if (result.shouldRefresh) {
          expect(result.timeUntilRefresh).toBe(Math.max(0, calculatedTimeUntil));
        } else {
          expect(result.timeUntilRefresh).toBeCloseTo(calculatedTimeUntil, -1); // Within 10ms
        }
        
        // refreshAtMs should be before expiryMs for non-expired tokens
        if (expiryMs > nowMs) {
          expect(result.refreshAtMs).toBeLessThanOrEqual(expiryMs);
        }
      });
    });
  });

  describe('integration scenarios', () => {
    it('should handle OAuth2 token refresh timing scenarios', () => {
      // Simulate typical OAuth2 token scenarios
      const scenarios = [
        { description: 'fresh token - 55 minutes remaining', timeUntil: 55 * 60 * 1000, shouldRefresh: false },
        { description: 'approaching expiry - 4 minutes remaining', timeUntil: 4 * 60 * 1000, shouldRefresh: true },
        { description: 'very close to expiry - 30 seconds remaining', timeUntil: 30 * 1000, shouldRefresh: true },
        { description: 'already expired - 5 minutes ago', timeUntil: -5 * 60 * 1000, shouldRefresh: true }
      ];
      
      scenarios.forEach(scenario => {
        const nowMs = Date.now();
        const expiryMs = nowMs + scenario.timeUntil;
        
        const isExpiring = isExpiringSoon(expiryMs);
        const window = calculateRefreshWindow(expiryMs);
        
        expect(isExpiring).toBe(scenario.shouldRefresh);
        expect(window.shouldRefresh).toBe(scenario.shouldRefresh);
        
        if (scenario.shouldRefresh) {
          expect(window.timeUntilRefresh).toBeGreaterThanOrEqual(0);
        }
      });
    });

    it('should handle multiple sequential calls consistently', () => {
      const nowMs = Date.now();
      const expiryMs = nowMs + FOUR_MINUTES_MS;
      
      // Multiple calls should show consistent shouldRefresh decision
      const calls = [];
      for (let i = 0; i < 10; i++) {
        calls.push({
          isExpiring: isExpiringSoon(expiryMs),
          window: calculateRefreshWindow(expiryMs)
        });
      }
      
      // All should agree on shouldRefresh (even with jitter affecting timing)
      const shouldRefreshResults = calls.map(c => c.window.shouldRefresh);
      const uniqueRefreshDecisions = new Set(shouldRefreshResults);
      
      // Should be consistent decision (all true for 4 minute scenario)
      expect(uniqueRefreshDecisions.size).toBe(1);
      expect(shouldRefreshResults[0]).toBe(true);
    });

    it('should provide reasonable refresh scheduling', () => {
      const nowMs = Date.now();
      const expiryMs = nowMs + (30 * 60 * 1000); // 30 minutes from now
      
      const window = calculateRefreshWindow(expiryMs);
      
      // Should not refresh immediately for distant expiry
      expect(window.shouldRefresh).toBe(false);
      
      // Refresh should be scheduled for reasonable time before expiry
      expect(window.refreshAtMs).toBeLessThan(expiryMs);
      expect(window.refreshAtMs).toBeGreaterThan(nowMs);
      
      // Should be around 5 minutes before expiry (with jitter)
      const refreshLeadTime = expiryMs - window.refreshAtMs;
      expect(refreshLeadTime).toBeGreaterThan(FIVE_MINUTES_MS - THIRTY_SECONDS_MS);
      expect(refreshLeadTime).toBeLessThan(FIVE_MINUTES_MS + THIRTY_SECONDS_MS);
    });
  });
});