/**
 * @fileoverview Test suite for token utilities - unified schedule-driven model
 *
 * Tests the new unified schedule-driven model with early-only jitter that provides:
 * - Single refreshAt calculation for consistency
 * - Early-only jitter (0 to +jitterMs) for safety
 * - Dependency injection for deterministic testing
 * - Unified logic between isExpiringSoon and calculateRefreshWindow
 */

import {
  isExpiringSoon,
  calculateRefreshWindow,
  TokenTimingDeps,
} from './token-utils.js';

describe('Token Utils - Unified Schedule-Driven Model', () => {
  // Test constants for consistent timing
  const FIVE_MINUTES_MS = 5 * 60 * 1000; // 300000ms
  const FOUR_MINUTES_MS = 4 * 60 * 1000; // 240000ms
  const SIX_MINUTES_MS = 6 * 60 * 1000; // 360000ms
  const THIRTY_SECONDS_MS = 30 * 1000; // 30000ms
  const ONE_MINUTE_MS = 60 * 1000; // 60000ms
  const TEN_MINUTES_MS = 10 * 60 * 1000; // 600000ms

  // Mock dependencies for deterministic testing
  const createMockDeps = (nowMs: number, jitterValue = 0): TokenTimingDeps => ({
    now: () => nowMs,
    randomInt: (maxInclusive: number) => Math.min(jitterValue, maxInclusive),
  });

  describe('calculateRefreshWindow', () => {
    describe('basic functionality', () => {
      it('should return immediate refresh for expired token', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs - ONE_MINUTE_MS; // expired 1 minute ago
        const deps = createMockDeps(nowMs);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          0,
          deps
        );

        expect(result.shouldRefresh).toBe(true);
        expect(result.refreshAtMs).toBe(nowMs);
        expect(result.timeUntilRefresh).toBe(0);
        expect(result.expiryMs).toBe(expiryMs);
        expect(result.thresholdMs).toBe(FIVE_MINUTES_MS);
      });

      it('should handle zero threshold (proactive refresh disabled)', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + FOUR_MINUTES_MS;
        const deps = createMockDeps(nowMs);

        const result = calculateRefreshWindow(expiryMs, 0, 0, deps);

        expect(result.shouldRefresh).toBe(false);
        expect(result.refreshAtMs).toBe(expiryMs);
        expect(result.timeUntilRefresh).toBe(FOUR_MINUTES_MS);
        expect(result.expiryMs).toBe(expiryMs);
        expect(result.thresholdMs).toBe(0);
      });

      it('should calculate refreshAt without jitter correctly', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + SIX_MINUTES_MS;
        const deps = createMockDeps(nowMs, 0);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          0,
          deps
        );

        expect(result.shouldRefresh).toBe(false);
        expect(result.refreshAtMs).toBe(expiryMs - FIVE_MINUTES_MS); // exactly 5 minutes before expiry
        expect(result.timeUntilRefresh).toBe(ONE_MINUTE_MS); // 1 minute until refresh
      });

      it('should apply early-only jitter correctly', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + SIX_MINUTES_MS;
        const jitterValue = THIRTY_SECONDS_MS;
        const deps = createMockDeps(nowMs, jitterValue);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          THIRTY_SECONDS_MS,
          deps
        );

        expect(result.shouldRefresh).toBe(false);
        // refreshAt should be earlier due to jitter
        expect(result.refreshAtMs).toBe(
          expiryMs - FIVE_MINUTES_MS - jitterValue
        );
        expect(result.timeUntilRefresh).toBe(ONE_MINUTE_MS - jitterValue); // less time until refresh
      });
    });

    describe('boundary conditions', () => {
      it('should trigger refresh at exactly threshold boundary with no jitter', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + FIVE_MINUTES_MS; // exactly at threshold
        const deps = createMockDeps(nowMs, 0);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          0,
          deps
        );

        expect(result.shouldRefresh).toBe(true);
        expect(result.refreshAtMs).toBe(nowMs);
        expect(result.timeUntilRefresh).toBe(0);
      });

      it('should not trigger refresh just outside threshold with no jitter', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + FIVE_MINUTES_MS + 1000; // 1 second past threshold
        const deps = createMockDeps(nowMs, 0);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          0,
          deps
        );

        expect(result.shouldRefresh).toBe(false);
        expect(result.refreshAtMs).toBe(nowMs + 1000);
        expect(result.timeUntilRefresh).toBe(1000);
      });

      it('should handle past-due refresh times correctly', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + FOUR_MINUTES_MS; // within threshold
        const deps = createMockDeps(nowMs, 0);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          0,
          deps
        );

        expect(result.shouldRefresh).toBe(true);
        expect(result.refreshAtMs).toBe(nowMs); // adjusted to now since refresh time is in past
        expect(result.timeUntilRefresh).toBe(0);
      });
    });

    describe('jitter behavior', () => {
      it('should only apply early-direction jitter', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + SIX_MINUTES_MS;

        // Test multiple jitter values to ensure they're all early-only
        for (
          let jitterValue = 0;
          jitterValue <= THIRTY_SECONDS_MS;
          jitterValue += 5000
        ) {
          const deps = createMockDeps(nowMs, jitterValue);
          const result = calculateRefreshWindow(
            expiryMs,
            FIVE_MINUTES_MS,
            THIRTY_SECONDS_MS,
            deps
          );

          const baseRefreshAt = expiryMs - FIVE_MINUTES_MS;
          // refresh should be at or before base time (early-only)
          expect(result.refreshAtMs).toBeLessThanOrEqual(baseRefreshAt);
          expect(result.refreshAtMs).toBe(baseRefreshAt - jitterValue);
        }
      });

      it('should cap jitter to maxInclusive value', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + SIX_MINUTES_MS;
        const largeJitterValue = THIRTY_SECONDS_MS * 2; // 60 seconds
        const deps = createMockDeps(nowMs, largeJitterValue);

        const result = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          THIRTY_SECONDS_MS,
          deps
        );

        const baseRefreshAt = expiryMs - FIVE_MINUTES_MS;
        // Should only apply max jitter (30s), not the larger value (60s)
        expect(result.refreshAtMs).toBe(baseRefreshAt - THIRTY_SECONDS_MS);
      });

      it('should handle zero jitter consistently', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + SIX_MINUTES_MS;
        const deps = createMockDeps(nowMs, 0);

        const result1 = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          THIRTY_SECONDS_MS,
          deps
        );
        const result2 = calculateRefreshWindow(
          expiryMs,
          FIVE_MINUTES_MS,
          THIRTY_SECONDS_MS,
          deps
        );

        expect(result1.refreshAtMs).toBe(result2.refreshAtMs);
        expect(result1.shouldRefresh).toBe(result2.shouldRefresh);
      });
    });

    describe('input validation', () => {
      it('should reject null/undefined expiry', () => {
        const deps = createMockDeps(1000000);

        expect(() =>
          calculateRefreshWindow(null as any, FIVE_MINUTES_MS, 0, deps)
        ).toThrow('Token expiry timestamp cannot be null or undefined');

        expect(() =>
          calculateRefreshWindow(undefined as any, FIVE_MINUTES_MS, 0, deps)
        ).toThrow('Token expiry timestamp cannot be null or undefined');
      });

      it('should reject non-finite expiry', () => {
        const deps = createMockDeps(1000000);

        expect(() =>
          calculateRefreshWindow(Infinity, FIVE_MINUTES_MS, 0, deps)
        ).toThrow('Token expiry timestamp must be a finite number');

        expect(() =>
          calculateRefreshWindow(NaN, FIVE_MINUTES_MS, 0, deps)
        ).toThrow('Token expiry timestamp must be a finite number');
      });

      it('should reject negative threshold', () => {
        const deps = createMockDeps(1000000);

        expect(() => calculateRefreshWindow(2000000, -1000, 0, deps)).toThrow(
          'Refresh threshold cannot be negative (provided: -1000)'
        );
      });

      it('should reject negative jitter', () => {
        const deps = createMockDeps(1000000);

        expect(() =>
          calculateRefreshWindow(2000000, FIVE_MINUTES_MS, -1000, deps)
        ).toThrow('Jitter value cannot be negative (provided: -1000)');
      });
    });
  });

  describe('isExpiringSoon', () => {
    describe('consistency with calculateRefreshWindow', () => {
      it('should return same result as calculateRefreshWindow.shouldRefresh', () => {
        const nowMs = 1000000;
        const deps = createMockDeps(nowMs, 15000); // 15 second jitter

        const testCases = [
          nowMs - ONE_MINUTE_MS, // expired
          nowMs + FOUR_MINUTES_MS, // within threshold
          nowMs + SIX_MINUTES_MS, // outside threshold
          nowMs + FIVE_MINUTES_MS, // exactly at threshold
        ];

        testCases.forEach(expiryMs => {
          const windowResult = calculateRefreshWindow(
            expiryMs,
            FIVE_MINUTES_MS,
            THIRTY_SECONDS_MS,
            deps
          );
          const expiringSoonResult = isExpiringSoon(
            expiryMs,
            FIVE_MINUTES_MS,
            THIRTY_SECONDS_MS,
            deps
          );

          expect(expiringSoonResult).toBe(windowResult.shouldRefresh);
        });
      });

      it('should handle all parameter combinations consistently', () => {
        const nowMs = 1000000;
        const deps = createMockDeps(nowMs, 10000);

        const thresholds = [0, ONE_MINUTE_MS, FIVE_MINUTES_MS, TEN_MINUTES_MS];
        const jitters = [0, 15000, THIRTY_SECONDS_MS];
        const expiries = [
          nowMs - ONE_MINUTE_MS,
          nowMs + FOUR_MINUTES_MS,
          nowMs + SIX_MINUTES_MS,
        ];

        thresholds.forEach(threshold => {
          jitters.forEach(jitter => {
            expiries.forEach(expiry => {
              const windowResult = calculateRefreshWindow(
                expiry,
                threshold,
                jitter,
                deps
              );
              const expiringSoonResult = isExpiringSoon(
                expiry,
                threshold,
                jitter,
                deps
              );

              expect(expiringSoonResult).toBe(windowResult.shouldRefresh);
            });
          });
        });
      });
    });

    describe('deterministic behavior with dependency injection', () => {
      it('should provide consistent results with fixed dependencies', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + FIVE_MINUTES_MS;
        const deps = createMockDeps(nowMs, 20000); // 20 second jitter

        // Multiple calls should return same result
        const results = Array.from({ length: 10 }, () =>
          isExpiringSoon(expiryMs, FIVE_MINUTES_MS, THIRTY_SECONDS_MS, deps)
        );

        const firstResult = results[0];
        results.forEach(result => {
          expect(result).toBe(firstResult);
        });
      });

      it('should vary results with different jitter values', () => {
        const nowMs = 1000000;
        const expiryMs = nowMs + FIVE_MINUTES_MS + 15000; // 15 seconds past threshold

        const noJitterDeps = createMockDeps(nowMs, 0);
        const jitterDeps = createMockDeps(nowMs, 20000); // 20 second jitter

        const noJitterResult = isExpiringSoon(
          expiryMs,
          FIVE_MINUTES_MS,
          THIRTY_SECONDS_MS,
          noJitterDeps
        );
        const jitterResult = isExpiringSoon(
          expiryMs,
          FIVE_MINUTES_MS,
          THIRTY_SECONDS_MS,
          jitterDeps
        );

        expect(noJitterResult).toBe(false); // outside threshold without jitter
        expect(jitterResult).toBe(true); // within threshold with jitter
      });
    });

    describe('backward compatibility', () => {
      it('should work without dependency injection', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs - ONE_MINUTE_MS; // expired

        const result = isExpiringSoon(expiryMs);
        expect(result).toBe(true);
      });

      it('should use default values correctly', () => {
        const nowMs = Date.now();
        const expiryMs = nowMs + FOUR_MINUTES_MS; // within default threshold

        const result = isExpiringSoon(expiryMs);
        expect(result).toBe(true);
      });
    });
  });

  describe('edge cases and robustness', () => {
    it('should handle very large threshold values', () => {
      const nowMs = 1000000;
      const expiryMs = nowMs + ONE_MINUTE_MS; // 1 minute from now
      const largeThreshold = TEN_MINUTES_MS; // 10 minute threshold
      const deps = createMockDeps(nowMs, 0);

      const result = calculateRefreshWindow(expiryMs, largeThreshold, 0, deps);

      expect(result.shouldRefresh).toBe(true);
      expect(result.refreshAtMs).toBe(nowMs); // adjusted to now since refresh time would be in past
      expect(result.timeUntilRefresh).toBe(0);
    });

    it('should handle very small time windows', () => {
      const nowMs = 1000000;
      const expiryMs = nowMs + 1000; // 1 second from now
      const deps = createMockDeps(nowMs, 0);

      const result = calculateRefreshWindow(expiryMs, 5000, 0, deps); // 5 second threshold

      expect(result.shouldRefresh).toBe(true);
      expect(result.timeUntilRefresh).toBe(0);
    });

    it('should prevent refresh times in the past', () => {
      const nowMs = 1000000;
      const expiryMs = nowMs + FOUR_MINUTES_MS; // within threshold
      const largeJitter = SIX_MINUTES_MS; // very large jitter
      const deps = createMockDeps(nowMs, largeJitter);

      const result = calculateRefreshWindow(
        expiryMs,
        FIVE_MINUTES_MS,
        largeJitter,
        deps
      );

      expect(result.refreshAtMs).toBeGreaterThanOrEqual(nowMs);
      expect(result.shouldRefresh).toBe(true);
    });
  });
});
