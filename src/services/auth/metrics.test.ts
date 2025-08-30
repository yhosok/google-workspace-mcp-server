import { AuthMetrics, authMetrics } from './metrics.js';

describe('AuthMetrics', () => {
  let originalStderr: typeof process.stderr.write;
  let stderrOutput: string[];
  let originalEnv: string | undefined;

  beforeEach(() => {
    // Capture stderr output
    stderrOutput = [];
    originalStderr = process.stderr.write;
    process.stderr.write = ((chunk: any) => {
      stderrOutput.push(chunk.toString());
      return true;
    }) as any;

    // Store original environment
    originalEnv = process.env.AUTH_METRICS;
  });

  afterEach(() => {
    // Restore stderr
    process.stderr.write = originalStderr;

    // Restore environment
    if (originalEnv === undefined) {
      delete process.env.AUTH_METRICS;
    } else {
      process.env.AUTH_METRICS = originalEnv;
    }
  });

  describe('singleton pattern', () => {
    it('should return the same instance with getInstance()', () => {
      const instance1 = AuthMetrics.getInstance();
      const instance2 = AuthMetrics.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should provide singleton instance as export', () => {
      expect(authMetrics).toBeInstanceOf(AuthMetrics);
      expect(authMetrics).toBe(AuthMetrics.getInstance());
    });

    it('should create new instances with createInstance()', () => {
      const instance1 = AuthMetrics.createInstance();
      const instance2 = AuthMetrics.createInstance();
      expect(instance1).not.toBe(instance2);
      expect(instance1).toBeInstanceOf(AuthMetrics);
      expect(instance2).toBeInstanceOf(AuthMetrics);
    });
  });

  describe('constructor', () => {
    it('should be enabled by default', () => {
      const metrics = AuthMetrics.createInstance();
      expect(metrics.isEnabled()).toBe(true);
    });

    it('should be disabled when AUTH_METRICS=off', () => {
      process.env.AUTH_METRICS = 'off';
      const metrics = AuthMetrics.createInstance();
      expect(metrics.isEnabled()).toBe(false);
    });

    it('should be disabled when AUTH_METRICS=false', () => {
      process.env.AUTH_METRICS = 'false';
      const metrics = AuthMetrics.createInstance();
      expect(metrics.isEnabled()).toBe(false);
    });

    it('should be disabled when AUTH_METRICS=0', () => {
      process.env.AUTH_METRICS = '0';
      const metrics = AuthMetrics.createInstance();
      expect(metrics.isEnabled()).toBe(false);
    });

    it('should be enabled for any other AUTH_METRICS value', () => {
      process.env.AUTH_METRICS = 'custom';
      const metrics = AuthMetrics.createInstance();
      expect(metrics.isEnabled()).toBe(true);
    });
  });

  describe('refresh_success event', () => {
    it('should emit refresh_success with duration and type', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 1234,
        type: 'proactive'
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=refresh_success duration=1234 type=proactive\n$/);
    });

    it('should emit refresh_success with minimal data', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 567
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=refresh_success duration=567\n$/);
    });

    it('should emit refresh_success with all optional fields', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 2000,
        type: 'on-demand',
        cached: true,
        timeUntilExpiry: 300000
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(
        /^AUTH_METRIC event=refresh_success duration=2000 type=on-demand cached=true timeUntilExpiry=300000\n$/
      );
    });

    it('should not emit when disabled', () => {
      process.env.AUTH_METRICS = 'off';
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({ duration: 1000 });

      expect(stderrOutput).toHaveLength(0);
    });
  });

  describe('refresh_failure event', () => {
    it('should emit refresh_failure with error and duration', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({
        error: 'token_expired',
        duration: 5000
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=refresh_failure error=token_expired duration=5000\n$/);
    });

    it('should emit refresh_failure with all fields', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({
        error: 'network_error',
        duration: 10000,
        type: 'proactive',
        retryCount: 3
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(
        /^AUTH_METRIC event=refresh_failure error=network_error duration=10000 type=proactive retryCount=3\n$/
      );
    });

    it('should sanitize error messages with spaces', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({
        error: 'network connection failed',
        duration: 2000
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=refresh_failure error=network_connection_failed duration=2000\n$/);
    });

    it('should not emit when disabled', () => {
      process.env.AUTH_METRICS = 'off';
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({ error: 'test_error', duration: 1000 });

      expect(stderrOutput).toHaveLength(0);
    });
  });

  describe('refresh_proactive event', () => {
    it('should emit refresh_proactive with timeUntilExpiry', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshProactive({
        timeUntilExpiry: 180000
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=refresh_proactive timeUntilExpiry=180000\n$/);
    });

    it('should emit refresh_proactive with threshold', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshProactive({
        timeUntilExpiry: 240000,
        threshold: 300000
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=refresh_proactive timeUntilExpiry=240000 threshold=300000\n$/);
    });

    it('should not emit when disabled', () => {
      process.env.AUTH_METRICS = 'off';
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshProactive({ timeUntilExpiry: 180000 });

      expect(stderrOutput).toHaveLength(0);
    });
  });

  describe('cache_corrupted event', () => {
    it('should emit cache_corrupted with source and type', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitCacheCorrupted({
        source: 'keytar',
        corruptionType: 'json_corruption'
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(/^AUTH_METRIC event=cache_corrupted source=keytar corruptionType=json_corruption\n$/);
    });

    it('should emit cache_corrupted with all fields', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitCacheCorrupted({
        source: 'file',
        corruptionType: 'encryption_corruption',
        recoverable: true,
        errorType: 'decrypt_failed'
      });

      expect(stderrOutput).toHaveLength(1);
      expect(stderrOutput[0]).toMatch(
        /^AUTH_METRIC event=cache_corrupted source=file corruptionType=encryption_corruption recoverable=true errorType=decrypt_failed\n$/
      );
    });

    it('should not emit when disabled', () => {
      process.env.AUTH_METRICS = 'off';
      const metrics = AuthMetrics.createInstance();
      metrics.emitCacheCorrupted({ source: 'keytar', corruptionType: 'json_corruption' });

      expect(stderrOutput).toHaveLength(0);
    });
  });

  describe('output format validation', () => {
    it('should produce parseable key-value format', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 1500,
        type: 'proactive',
        cached: false,
        timeUntilExpiry: 600000
      });

      const output = stderrOutput[0];
      expect(output).toMatch(/^AUTH_METRIC /);
      expect(output).toMatch(/event=refresh_success/);
      expect(output).toMatch(/duration=1500/);
      expect(output).toMatch(/type=proactive/);
      expect(output).toMatch(/cached=false/);
      expect(output).toMatch(/timeUntilExpiry=600000/);
      expect(output).toMatch(/\n$/);
    });

    it('should handle special characters in values', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({
        error: 'connection=failed&retry=false',
        duration: 2000
      });

      expect(stderrOutput[0]).toMatch(/error=connection_failed_retry_false/);
    });

    it('should handle numeric values correctly', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 0,
        timeUntilExpiry: 999999
      });

      expect(stderrOutput[0]).toMatch(/duration=0/);
      expect(stderrOutput[0]).toMatch(/timeUntilExpiry=999999/);
    });

    it('should handle boolean values correctly', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 1000,
        cached: true
      });
      
      metrics.emitCacheCorrupted({
        source: 'file',
        corruptionType: 'json_corruption',
        recoverable: false
      });

      expect(stderrOutput[0]).toMatch(/cached=true/);
      expect(stderrOutput[1]).toMatch(/recoverable=false/);
    });
  });

  describe('performance and thread safety', () => {
    it('should handle multiple concurrent emissions', () => {
      const metrics = AuthMetrics.createInstance();
      
      // Simulate concurrent metric emissions
      Promise.all([
        metrics.emitRefreshSuccess({ duration: 100 }),
        metrics.emitRefreshFailure({ error: 'test1', duration: 200 }),
        metrics.emitRefreshProactive({ timeUntilExpiry: 300000 }),
        metrics.emitCacheCorrupted({ source: 'keytar', corruptionType: 'json_corruption' })
      ]);

      expect(stderrOutput).toHaveLength(4);
      expect(stderrOutput[0]).toMatch(/event=refresh_success/);
      expect(stderrOutput[1]).toMatch(/event=refresh_failure/);
      expect(stderrOutput[2]).toMatch(/event=refresh_proactive/);
      expect(stderrOutput[3]).toMatch(/event=cache_corrupted/);
    });

    it('should have minimal performance overhead when disabled', () => {
      process.env.AUTH_METRICS = 'off';
      const metrics = AuthMetrics.createInstance();
      
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        metrics.emitRefreshSuccess({ duration: i });
      }
      const duration = Date.now() - start;

      expect(stderrOutput).toHaveLength(0);
      expect(duration).toBeLessThan(10); // Should be very fast when disabled
    });
  });

  describe('error handling and edge cases', () => {
    it('should handle undefined values gracefully', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshSuccess({
        duration: 1000,
        type: undefined,
        cached: undefined
      } as any);

      const output = stderrOutput[0];
      expect(output).toMatch(/duration=1000/);
      expect(output).not.toMatch(/type=/);
      expect(output).not.toMatch(/cached=/);
    });

    it('should handle null values gracefully', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({
        error: 'test_error',
        duration: 1000,
        type: null,
        retryCount: null
      } as any);

      const output = stderrOutput[0];
      expect(output).toMatch(/error=test_error/);
      expect(output).toMatch(/duration=1000/);
      expect(output).not.toMatch(/type=/);
      expect(output).not.toMatch(/retryCount=/);
    });

    it('should handle empty string values', () => {
      const metrics = AuthMetrics.createInstance();
      metrics.emitRefreshFailure({
        error: '',
        duration: 1000
      });

      expect(stderrOutput[0]).toMatch(/error=/);
      expect(stderrOutput[0]).toMatch(/duration=1000/);
    });

    it('should handle stderr write failures gracefully', () => {
      // Mock stderr.write to throw an error
      const mockStderr = jest.fn().mockImplementation(() => {
        throw new Error('stderr write failed');
      });
      process.stderr.write = mockStderr as any;

      const metrics = AuthMetrics.createInstance();
      
      // Should not throw
      expect(() => {
        metrics.emitRefreshSuccess({ duration: 1000 });
      }).not.toThrow();
    });
  });

  describe('configuration validation', () => {
    it('should handle case-insensitive disable values', () => {
      process.env.AUTH_METRICS = 'OFF';
      const metrics1 = new AuthMetrics();
      expect(metrics1.isEnabled()).toBe(false);

      process.env.AUTH_METRICS = 'False';
      const metrics2 = new AuthMetrics();
      expect(metrics2.isEnabled()).toBe(false);

      process.env.AUTH_METRICS = 'FALSE';
      const metrics3 = new AuthMetrics();
      expect(metrics3.isEnabled()).toBe(false);
    });

    it('should handle whitespace in environment variables', () => {
      process.env.AUTH_METRICS = ' off ';
      const metrics = AuthMetrics.createInstance();
      expect(metrics.isEnabled()).toBe(false);
    });
  });
});