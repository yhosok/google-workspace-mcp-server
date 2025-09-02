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

  describe('Access Control Configuration', () => {
    beforeEach(() => {
      // Basic service account config to satisfy authentication validation
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
    });

    describe('GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER', () => {
      it('should parse valid boolean values - true', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'true';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(true);
      });

      it('should parse valid boolean values - false', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'false';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(false);
      });

      it('should parse numeric boolean values - 1', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = '1';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(true);
      });

      it('should parse numeric boolean values - 0', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = '0';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(false);
      });

      it('should handle case insensitive values', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'TRUE';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(true);
      });

      it('should throw error for invalid boolean values', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'invalid';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER must be 'true', 'false', '1', or '0', got: invalid"
        );
      });

      it('should be undefined when not provided', () => {
        delete process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER;

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBeUndefined();
      });
    });

    describe('GOOGLE_ALLOWED_WRITE_SERVICES', () => {
      it('should parse comma-separated service names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets,docs,calendar';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual([
          'sheets',
          'docs',
          'calendar',
        ]);
      });

      it('should trim whitespace from service names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES =
          ' sheets , docs , calendar ';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual([
          'sheets',
          'docs',
          'calendar',
        ]);
      });

      it('should handle single service name', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual(['sheets']);
      });

      it('should throw error for empty values in comma-separated list', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets,,docs';

        expect(() => loadConfig()).toThrow(
          'GOOGLE_ALLOWED_WRITE_SERVICES contains empty value'
        );
      });

      it('should validate service names - all valid', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES =
          'sheets,docs,calendar,drive';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual([
          'sheets',
          'docs',
          'calendar',
          'drive',
        ]);
      });

      it('should throw error for invalid service names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets,invalid,docs';

        expect(() => loadConfig()).toThrow(
          'GOOGLE_ALLOWED_WRITE_SERVICES contains invalid services: invalid. Valid services are: sheets, docs, calendar, drive'
        );
      });

      it('should throw error for multiple invalid service names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES =
          'invalid1,sheets,invalid2,docs';

        expect(() => loadConfig()).toThrow(
          'GOOGLE_ALLOWED_WRITE_SERVICES contains invalid services: invalid1, invalid2. Valid services are: sheets, docs, calendar, drive'
        );
      });

      it('should handle case sensitivity in service validation', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'SHEETS,Docs';

        const config = loadConfig();

        // Service names should be preserved as provided, but validation should be case-insensitive
        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual([
          'SHEETS',
          'Docs',
        ]);
      });

      it('should be undefined when not provided', () => {
        delete process.env.GOOGLE_ALLOWED_WRITE_SERVICES;

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toBeUndefined();
      });
    });

    describe('GOOGLE_ALLOWED_WRITE_TOOLS', () => {
      it('should parse comma-separated tool names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__create,google-workspace__calendar-list';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual([
          'google-workspace__docs__create',
          'google-workspace__calendar-list',
        ]);
      });

      it('should trim whitespace from tool names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          ' google-workspace__docs__create , google-workspace__calendar-list ';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual([
          'google-workspace__docs__create',
          'google-workspace__calendar-list',
        ]);
      });

      it('should handle single tool name', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__create';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual([
          'google-workspace__docs__create',
        ]);
      });

      it('should throw error for empty values in comma-separated list', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__create,,google-workspace__calendar-list';

        expect(() => loadConfig()).toThrow(
          'GOOGLE_ALLOWED_WRITE_TOOLS contains empty value'
        );
      });

      it('should validate tool name format - valid names with different patterns', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__create,google-workspace__calendar-list,sheets-write';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual([
          'google-workspace__docs__create',
          'google-workspace__calendar-list',
          'sheets-write',
        ]);
      });

      it('should throw error for invalid tool name format - missing prefix', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'invalid-tool,google-workspace__docs__create';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_ALLOWED_WRITE_TOOLS contains invalid tool names: invalid-tool. Tool names must follow valid patterns: 'google-workspace__[service-name]__[tool-name]', 'google-workspace__[service-name]-[tool-name]', or '[service-name]-[tool-name]'"
        );
      });

      it('should throw error for invalid tool name format - invalid characters', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__write!';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_ALLOWED_WRITE_TOOLS contains invalid tool names: google-workspace__docs__write!. Tool names must follow valid patterns: 'google-workspace__[service-name]__[tool-name]', 'google-workspace__[service-name]-[tool-name]', or '[service-name]-[tool-name]'"
        );
      });

      it('should throw error for invalid tool name format - uppercase', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__DOCS__write';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_ALLOWED_WRITE_TOOLS contains invalid tool names: google-workspace__DOCS__write. Tool names must follow valid patterns: 'google-workspace__[service-name]__[tool-name]', 'google-workspace__[service-name]-[tool-name]', or '[service-name]-[tool-name]'"
        );
      });

      it('should throw error for multiple invalid tool names', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'totally-invalid,google-workspace__docs__create,also-bad!';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_ALLOWED_WRITE_TOOLS contains invalid tool names: totally-invalid, also-bad!. Tool names must follow valid patterns: 'google-workspace__[service-name]__[tool-name]', 'google-workspace__[service-name]-[tool-name]', or '[service-name]-[tool-name]'"
        );
      });

      it('should be undefined when not provided', () => {
        delete process.env.GOOGLE_ALLOWED_WRITE_TOOLS;

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toBeUndefined();
      });
    });

    describe('GOOGLE_READ_ONLY_MODE', () => {
      it('should parse valid boolean values - true', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'true';

        const config = loadConfig();

        expect(config.GOOGLE_READ_ONLY_MODE).toBe(true);
      });

      it('should parse valid boolean values - false', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'false';

        const config = loadConfig();

        expect(config.GOOGLE_READ_ONLY_MODE).toBe(false);
      });

      it('should parse numeric boolean values - 1', () => {
        process.env.GOOGLE_READ_ONLY_MODE = '1';

        const config = loadConfig();

        expect(config.GOOGLE_READ_ONLY_MODE).toBe(true);
      });

      it('should parse numeric boolean values - 0', () => {
        process.env.GOOGLE_READ_ONLY_MODE = '0';

        const config = loadConfig();

        expect(config.GOOGLE_READ_ONLY_MODE).toBe(false);
      });

      it('should handle case insensitive values', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'FALSE';

        const config = loadConfig();

        expect(config.GOOGLE_READ_ONLY_MODE).toBe(false);
      });

      it('should throw error for invalid boolean values', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'maybe';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_READ_ONLY_MODE must be 'true', 'false', '1', or '0', got: maybe"
        );
      });

      it('should default to true when not provided (secure by default)', () => {
        delete process.env.GOOGLE_READ_ONLY_MODE;

        const config = loadConfig();

        expect(config.GOOGLE_READ_ONLY_MODE).toBe(true);
      });
    });

    describe('Access Control Validation Logic', () => {
      let consoleSpy: jest.SpyInstance;

      beforeEach(() => {
        consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      });

      afterEach(() => {
        consoleSpy.mockRestore();
      });

      it('should warn when folder restrictions are enabled without folder ID', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'false';
        delete process.env.GOOGLE_DRIVE_FOLDER_ID;

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER is false but GOOGLE_DRIVE_FOLDER_ID is not set. All write operations will be blocked unless allowed through other access control settings.'
        );
      });

      it('should warn when folder restrictions are enabled with empty folder ID', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'false';
        process.env.GOOGLE_DRIVE_FOLDER_ID = '';

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER is false but GOOGLE_DRIVE_FOLDER_ID is not set. All write operations will be blocked unless allowed through other access control settings.'
        );
      });

      it('should warn when folder restrictions are enabled with whitespace-only folder ID', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'false';
        process.env.GOOGLE_DRIVE_FOLDER_ID = '   ';

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER is false but GOOGLE_DRIVE_FOLDER_ID is not set. All write operations will be blocked unless allowed through other access control settings.'
        );
      });

      it('should not warn when folder restrictions are enabled with valid folder ID', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'false';
        process.env.GOOGLE_DRIVE_FOLDER_ID = 'valid-folder-id';

        loadConfig();

        expect(consoleSpy).not.toHaveBeenCalled();
      });

      it('should not warn when folder restrictions are disabled', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'true';
        process.env.GOOGLE_READ_ONLY_MODE = 'false'; // Must explicitly disable read-only mode
        delete process.env.GOOGLE_DRIVE_FOLDER_ID;

        loadConfig();

        expect(consoleSpy).not.toHaveBeenCalled();
      });

      it('should warn when read-only mode conflicts with write permissions - services', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'true';
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets,docs';

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_READ_ONLY_MODE is enabled but other write permissions are configured. Read-only mode will override all write permissions.'
        );
      });

      it('should warn when read-only mode conflicts with write permissions - tools', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'true';
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS = 'sheets-write';

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_READ_ONLY_MODE is enabled but other write permissions are configured. Read-only mode will override all write permissions.'
        );
      });

      it('should warn when read-only mode conflicts with write permissions - folder writes', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'true';
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'true';

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_READ_ONLY_MODE is enabled but other write permissions are configured. Read-only mode will override all write permissions.'
        );
      });

      it('should warn when read-only mode conflicts with multiple write permissions', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'true';
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets';
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__create';
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'true';

        loadConfig();

        expect(consoleSpy).toHaveBeenCalledWith(
          'Warning: GOOGLE_READ_ONLY_MODE is enabled but other write permissions are configured. Read-only mode will override all write permissions.'
        );
      });

      it('should not warn when read-only mode has no conflicting write permissions', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'true';
        process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder';
        delete process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER;
        delete process.env.GOOGLE_ALLOWED_WRITE_SERVICES;
        delete process.env.GOOGLE_ALLOWED_WRITE_TOOLS;

        loadConfig();

        expect(consoleSpy).not.toHaveBeenCalled();
      });

      it('should not warn when read-only mode is disabled', () => {
        process.env.GOOGLE_READ_ONLY_MODE = 'false';
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets,docs';
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS = 'sheets-write';
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'true';

        loadConfig();

        expect(consoleSpy).not.toHaveBeenCalled();
      });
    });

    describe('Combined Access Control Configurations', () => {
      it('should handle all access control options together - permissive', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'true';
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES =
          'sheets,docs,calendar,drive';
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS =
          'google-workspace__docs__create,sheets-write';
        process.env.GOOGLE_READ_ONLY_MODE = 'false';
        process.env.GOOGLE_DRIVE_FOLDER_ID = 'test-folder-id';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(true);
        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual([
          'sheets',
          'docs',
          'calendar',
          'drive',
        ]);
        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual([
          'google-workspace__docs__create',
          'sheets-write',
        ]);
        expect(config.GOOGLE_READ_ONLY_MODE).toBe(false);
        expect(config.GOOGLE_DRIVE_FOLDER_ID).toBe('test-folder-id');
      });

      it('should handle all access control options together - restrictive', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'false';
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = 'sheets';
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS = 'sheets-read';
        process.env.GOOGLE_READ_ONLY_MODE = 'true';
        process.env.GOOGLE_DRIVE_FOLDER_ID = 'restricted-folder';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(false);
        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toEqual(['sheets']);
        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual(['sheets-read']);
        expect(config.GOOGLE_READ_ONLY_MODE).toBe(true);
        expect(config.GOOGLE_DRIVE_FOLDER_ID).toBe('restricted-folder');
      });

      it('should handle mixed boolean string formats', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = 'True';
        process.env.GOOGLE_READ_ONLY_MODE = '0';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBe(true);
        expect(config.GOOGLE_READ_ONLY_MODE).toBe(false);
      });
    });

    describe('Edge Cases and Error Handling', () => {
      it('should handle empty string for boolean fields', () => {
        process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER = '';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBeUndefined();
      });

      it('should handle empty string for array fields', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = '';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toBeUndefined();
      });

      it('should handle whitespace-only values for arrays', () => {
        process.env.GOOGLE_ALLOWED_WRITE_SERVICES = '   ';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toBeUndefined();
      });

      it('should throw error for tool names with only double underscores', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS = 'google-workspace__';

        expect(() => loadConfig()).toThrow(
          "GOOGLE_ALLOWED_WRITE_TOOLS contains invalid tool names: google-workspace__. Tool names must follow valid patterns: 'google-workspace__[service-name]__[tool-name]', 'google-workspace__[service-name]-[tool-name]', or '[service-name]-[tool-name]'"
        );
      });

      it('should handle valid service names in legacy format', () => {
        process.env.GOOGLE_ALLOWED_WRITE_TOOLS = 'docs-create';

        const config = loadConfig();

        expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toEqual(['docs-create']);
      });
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

    it('should leave optional access control fields as undefined when not provided', () => {
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH =
        '/path/to/service-account.json';
      delete process.env.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER;
      delete process.env.GOOGLE_ALLOWED_WRITE_SERVICES;
      delete process.env.GOOGLE_ALLOWED_WRITE_TOOLS;
      delete process.env.GOOGLE_READ_ONLY_MODE;

      const config = loadConfig();

      expect(config.GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER).toBeUndefined();
      expect(config.GOOGLE_ALLOWED_WRITE_SERVICES).toBeUndefined();
      expect(config.GOOGLE_ALLOWED_WRITE_TOOLS).toBeUndefined();
      // GOOGLE_READ_ONLY_MODE now has a secure default of true
      expect(config.GOOGLE_READ_ONLY_MODE).toBe(true);
    });
  });
});
