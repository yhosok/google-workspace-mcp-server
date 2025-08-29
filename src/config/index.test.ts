/**
 * @fileoverview Test suite for environment configuration loading and validation.
 *
 * Tests all aspects of the configuration system including:
 * - Service account configuration validation
 * - OAuth2 configuration validation
 * - Retry and timeout parameter parsing
 * - Error handling for invalid configurations
 * - Environment variable transformation and defaults
 */

import { loadConfig } from './index.js';

describe('Config Loading', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear all Google-related env vars
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('GOOGLE_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Service Account Configuration', () => {
    it('should validate service account configuration', () => {
      process.env.GOOGLE_AUTH_MODE = 'service-account';
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';

      const config = loadConfig();

      expect(config.GOOGLE_AUTH_MODE).toBe('service-account');
      expect(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH).toBe(
        '/path/to/service-account.json'
      );
      expect(config.GOOGLE_DRIVE_FOLDER_ID).toBe('test-folder-id');
    });

    it('should throw error when service account key path is missing for service-account mode', () => {
      process.env.GOOGLE_AUTH_MODE = 'service-account';
      delete process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;

      expect(() => loadConfig()).toThrow(
        'GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required when GOOGLE_AUTH_MODE is "service-account"'
      );
    });
  });

  describe('OAuth2 Configuration', () => {
    it('should validate OAuth2 configuration', () => {
      process.env.GOOGLE_AUTH_MODE = 'oauth2';
      process.env.GOOGLE_OAUTH_CLIENT_ID =
        'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_OAUTH_REDIRECT_URI =
        'http://localhost:3000/oauth/callback';
      process.env.GOOGLE_OAUTH_SCOPES =
        'https://www.googleapis.com/auth/spreadsheets';
      process.env.GOOGLE_OAUTH_PORT = '3000';

      const config = loadConfig();

      expect(config.GOOGLE_AUTH_MODE).toBe('oauth2');
      expect(config.GOOGLE_OAUTH_CLIENT_ID).toBe(
        'test-client-id.apps.googleusercontent.com'
      );
      expect(config.GOOGLE_OAUTH_CLIENT_SECRET).toBe('test-client-secret');
      expect(config.GOOGLE_OAUTH_REDIRECT_URI).toBe(
        'http://localhost:3000/oauth/callback'
      );
      expect(config.GOOGLE_OAUTH_SCOPES).toBe(
        'https://www.googleapis.com/auth/spreadsheets'
      );
      expect(config.GOOGLE_OAUTH_PORT).toBe(3000);
    });

    it('should throw error when OAuth2 client ID is missing for oauth2 mode', () => {
      process.env.GOOGLE_AUTH_MODE = 'oauth2';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;

      expect(() => loadConfig()).toThrow(
        'GOOGLE_OAUTH_CLIENT_ID is required when GOOGLE_AUTH_MODE is "oauth2"'
      );
    });

    it('should throw error when OAuth2 client secret is missing for oauth2 mode', () => {
      process.env.GOOGLE_AUTH_MODE = 'oauth2';
      process.env.GOOGLE_OAUTH_CLIENT_ID =
        'test-client-id.apps.googleusercontent.com';
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;

      expect(() => loadConfig()).toThrow(
        'GOOGLE_OAUTH_CLIENT_SECRET is required when GOOGLE_AUTH_MODE is "oauth2"'
      );
    });

    it('should validate OAuth2 port number range', () => {
      process.env.GOOGLE_AUTH_MODE = 'oauth2';
      process.env.GOOGLE_OAUTH_CLIENT_ID =
        'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_OAUTH_PORT = '70000'; // Invalid port

      expect(() => loadConfig()).toThrow(
        'GOOGLE_OAUTH_PORT must be a valid port number (1-65535)'
      );
    });

    it('should validate OAuth2 port as zero or negative', () => {
      process.env.GOOGLE_AUTH_MODE = 'oauth2';
      process.env.GOOGLE_OAUTH_CLIENT_ID =
        'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
      process.env.GOOGLE_OAUTH_PORT = '0'; // Invalid port

      expect(() => loadConfig()).toThrow(
        'GOOGLE_OAUTH_PORT must be a valid port number (1-65535)'
      );
    });
  });

  describe('Retry Configuration', () => {
    it('should parse retry configuration from environment variables', () => {
      // Basic service account config to satisfy validation
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';

      process.env.GOOGLE_RETRY_MAX_ATTEMPTS = '5';
      process.env.GOOGLE_RETRY_BASE_DELAY = '1000';
      process.env.GOOGLE_RETRY_MAX_DELAY = '30000';
      process.env.GOOGLE_RETRY_JITTER = '0.1';
      process.env.GOOGLE_RETRY_RETRIABLE_CODES = '429,500,502,503,504';

      const config = loadConfig();

      expect(config.GOOGLE_RETRY_MAX_ATTEMPTS).toBe(5);
      expect(config.GOOGLE_RETRY_BASE_DELAY).toBe(1000);
      expect(config.GOOGLE_RETRY_MAX_DELAY).toBe(30000);
      expect(config.GOOGLE_RETRY_JITTER).toBe(0.1);
      expect(config.GOOGLE_RETRY_RETRIABLE_CODES).toEqual([
        429, 500, 502, 503, 504,
      ]);
    });

    it('should handle invalid integer values for retry configuration', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_RETRY_MAX_ATTEMPTS = 'not-a-number';

      expect(() => loadConfig()).toThrow(
        'GOOGLE_RETRY_MAX_ATTEMPTS must be a valid integer'
      );
    });

    it('should handle invalid float values for retry jitter', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_RETRY_JITTER = 'not-a-number';

      expect(() => loadConfig()).toThrow(
        'GOOGLE_RETRY_JITTER must be a valid number, got: not-a-number'
      );
    });

    it('should handle invalid retry codes', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_RETRY_RETRIABLE_CODES = '200,not-a-number,404';

      expect(() => loadConfig()).toThrow(
        'GOOGLE_RETRY_RETRIABLE_CODES contains invalid code: not-a-number'
      );
    });
  });

  describe('Timeout Configuration', () => {
    it('should parse timeout configuration from environment variables', () => {
      // Basic service account config to satisfy validation
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';

      process.env.GOOGLE_REQUEST_TIMEOUT = '30000';
      process.env.GOOGLE_TOTAL_TIMEOUT = '120000';

      const config = loadConfig();

      expect(config.GOOGLE_REQUEST_TIMEOUT).toBe(30000);
      expect(config.GOOGLE_TOTAL_TIMEOUT).toBe(120000);
    });

    it('should handle invalid timeout values', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_REQUEST_TIMEOUT = 'not-a-number';

      expect(() => loadConfig()).toThrow(
        'GOOGLE_REQUEST_TIMEOUT must be a valid integer'
      );
    });
  });

  describe('Mixed Configuration Scenarios', () => {
    it('should handle both service account and OAuth2 credentials present', () => {
      // Both service account and OAuth2 credentials - should not throw
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_OAUTH_CLIENT_ID =
        'test-client-id.apps.googleusercontent.com';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';

      const config = loadConfig();

      expect(config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH).toBe(
        '/path/to/service-account.json'
      );
      expect(config.GOOGLE_OAUTH_CLIENT_ID).toBe(
        'test-client-id.apps.googleusercontent.com'
      );
      expect(config.GOOGLE_OAUTH_CLIENT_SECRET).toBe('test-client-secret');
    });

    it('should require client secret if client ID is provided', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_OAUTH_CLIENT_ID =
        'test-client-id.apps.googleusercontent.com';
      // Missing GOOGLE_OAUTH_CLIENT_SECRET

      expect(() => loadConfig()).toThrow(
        'GOOGLE_OAUTH_CLIENT_ID requires GOOGLE_OAUTH_CLIENT_SECRET'
      );
    });

    it('should require client ID if client secret is provided', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
      // Missing GOOGLE_OAUTH_CLIENT_ID

      expect(() => loadConfig()).toThrow(
        'GOOGLE_OAUTH_CLIENT_SECRET requires GOOGLE_OAUTH_CLIENT_ID'
      );
    });

    it('should throw error when no authentication method is configured', () => {
      // No service account key path and no OAuth2 credentials

      expect(() => loadConfig()).toThrow(
        'At least one authentication method must be configured'
      );
    });
  });

  describe('Default Values and Optional Fields', () => {
    it('should provide default value for GOOGLE_DRIVE_FOLDER_ID', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';

      const config = loadConfig();

      expect(config.GOOGLE_DRIVE_FOLDER_ID).toBe('');
    });

    it('should leave optional fields as undefined when not provided', () => {
      // Need to provide at least one auth method for validation to pass
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
      delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      delete process.env.GOOGLE_RETRY_MAX_ATTEMPTS;

      const config = loadConfig();

      expect(config.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
      expect(config.GOOGLE_OAUTH_CLIENT_SECRET).toBeUndefined();
      expect(config.GOOGLE_RETRY_MAX_ATTEMPTS).toBeUndefined();
    });
  });
});
