/**
 * @fileoverview Integration tests for AuthFactory.
 * Tests actual provider creation and initialization with real dependencies.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import type { EnvironmentConfig } from '../../types/index.js';
import { AuthFactory } from './auth-factory.js';
import { ServiceAccountAuthProvider } from './service-account-auth.provider.js';
import { OAuth2AuthProvider } from './oauth2-auth.provider.js';
import { Logger } from '../../utils/logger.js';

describe('AuthFactory Integration Tests', () => {
  let tempDir: string;
  let logger: Logger;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = await mkdtemp(join(tmpdir(), 'auth-factory-test-'));

    // Create logger for integration tests
    logger = new Logger({
      level: 0, // DEBUG level for detailed logging
      debugMode: true,
      serviceName: 'auth-factory-integration-test',
      includePerformanceMetrics: false,
      prettyPrint: false,
    });
  });

  afterEach(async () => {
    // Clean up temporary directory
    if (tempDir) {
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (error) {
        console.warn('Failed to clean up temp directory:', error);
      }
    }
  });

  describe('Service Account Provider Integration', () => {
    it('should create and configure service account provider with valid key file', async () => {
      // Create a mock service account key file
      const keyFilePath = join(tempDir, 'service-account-key.json');
      const serviceAccountKey = {
        type: 'service_account',
        project_id: 'test-project',
        private_key_id: 'key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...',
        client_email: 'test@test-project.iam.gserviceaccount.com',
        client_id: '123456789',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/test%40test-project.iam.gserviceaccount.com',
      };

      await writeFile(keyFilePath, JSON.stringify(serviceAccountKey, null, 2));

      const config: EnvironmentConfig = {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: keyFilePath,
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      // Create provider using factory
      const provider = await AuthFactory.createAuthProvider(config, logger);

      // Verify provider type and characteristics
      expect(provider).toBeInstanceOf(ServiceAccountAuthProvider);
      expect(provider.authType).toBe('service-account');

      // Note: We don't call initialize() as it would require actual Google API access
      // The integration test focuses on successful instantiation with real file system
    });

    it('should handle invalid service account key file gracefully', async () => {
      const keyFilePath = join(tempDir, 'invalid-key.json');
      await writeFile(keyFilePath, 'invalid json content');

      const config: EnvironmentConfig = {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: keyFilePath,
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      // Factory should create provider successfully (validation happens during initialization)
      const provider = await AuthFactory.createAuthProvider(config, logger);

      expect(provider).toBeInstanceOf(ServiceAccountAuthProvider);
      expect(provider.authType).toBe('service-account');

      // The actual validation of key file format happens during provider initialization,
      // not during factory creation. This is by design to allow lazy validation.
    });
  });

  describe('OAuth2 Provider Integration', () => {
    it('should create and configure OAuth2 provider with minimal config', async () => {
      const config: EnvironmentConfig = {
        GOOGLE_AUTH_MODE: 'oauth2',
        GOOGLE_OAUTH_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: 'test-client-secret',
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      const provider = await AuthFactory.createAuthProvider(config, logger);

      expect(provider).toBeInstanceOf(OAuth2AuthProvider);
      expect(provider.authType).toBe('oauth2');

      // Initialize the provider to prepare it for use
      await provider.initialize();

      // Test that the provider has access to required dependencies
      // (TokenStorage is created internally and should be available)
      const authInfo = await provider.getAuthInfo();
      expect(authInfo.isOk()).toBe(true);

      if (authInfo.isOk()) {
        expect(authInfo.value.isAuthenticated).toBe(false); // No tokens stored initially
        expect(authInfo.value.scopes).toEqual([
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/documents',
        ]);
      }
    });

    it('should create OAuth2 provider with custom configuration', async () => {
      const config: EnvironmentConfig = {
        GOOGLE_AUTH_MODE: 'oauth2',
        GOOGLE_OAUTH_CLIENT_ID: 'custom-client-id.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: 'custom-client-secret',
        GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:8080/custom-callback',
        GOOGLE_OAUTH_PORT: 8080,
        GOOGLE_OAUTH_SCOPES:
          'https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive',
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      const provider = await AuthFactory.createAuthProvider(config, logger);

      expect(provider).toBeInstanceOf(OAuth2AuthProvider);
      expect(provider.authType).toBe('oauth2');

      // Initialize the provider to prepare it for use
      await provider.initialize();

      const authInfo = await provider.getAuthInfo();
      expect(authInfo.isOk()).toBe(true);

      if (authInfo.isOk()) {
        expect(authInfo.value.scopes).toEqual([
          'https://www.googleapis.com/auth/calendar',
          'https://www.googleapis.com/auth/drive',
        ]);
      }
    });
  });

  describe('Configuration Auto-Detection Integration', () => {
    it('should auto-detect and create service account provider', async () => {
      const keyFilePath = join(tempDir, 'auto-detect-key.json');
      const serviceAccountKey = {
        type: 'service_account',
        project_id: 'auto-detect-project',
        private_key_id: 'key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...',
        client_email: 'auto@auto-detect-project.iam.gserviceaccount.com',
        client_id: '123456789',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/auto%40auto-detect-project.iam.gserviceaccount.com',
      };

      await writeFile(keyFilePath, JSON.stringify(serviceAccountKey, null, 2));

      const config: EnvironmentConfig = {
        // No explicit auth mode - should auto-detect from key path
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: keyFilePath,
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      const provider = await AuthFactory.createAuthProvider(config, logger);

      expect(provider).toBeInstanceOf(ServiceAccountAuthProvider);
      expect(provider.authType).toBe('service-account');
    });

    it('should auto-detect and create OAuth2 provider', async () => {
      const config: EnvironmentConfig = {
        // No explicit auth mode - should auto-detect from OAuth2 config
        GOOGLE_OAUTH_CLIENT_ID:
          'auto-detect-client-id.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: 'auto-detect-client-secret',
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      const provider = await AuthFactory.createAuthProvider(config, logger);

      expect(provider).toBeInstanceOf(OAuth2AuthProvider);
      expect(provider.authType).toBe('oauth2');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle missing key file gracefully during provider creation', async () => {
      const nonExistentPath = join(tempDir, 'nonexistent-key.json');

      const config: EnvironmentConfig = {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: nonExistentPath,
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      // Factory should create provider successfully
      // File existence is checked during initialization, not creation
      const provider = await AuthFactory.createAuthProvider(config, logger);

      expect(provider).toBeInstanceOf(ServiceAccountAuthProvider);
      expect(provider.authType).toBe('service-account');

      // The error would occur during initialization when the provider
      // attempts to read the non-existent file
    });

    it('should validate OAuth2 configuration during factory creation', async () => {
      const config: EnvironmentConfig = {
        GOOGLE_AUTH_MODE: 'oauth2',
        GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
        // Missing client secret
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      await expect(
        AuthFactory.createAuthProvider(config, logger)
      ).rejects.toThrow('Missing required authentication credentials');
    });
  });

  describe('Logger Integration', () => {
    it('should use provided logger for detailed operation tracking', async () => {
      const config: EnvironmentConfig = {
        GOOGLE_OAUTH_CLIENT_ID: 'logger-test-client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'logger-test-client-secret',
        GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
      };

      // Capture log entries
      const logEntries: any[] = [];
      const originalWrite = process.stderr.write;
      process.stderr.write = function (data: any) {
        if (typeof data === 'string') {
          try {
            const logEntry = JSON.parse(data);
            if (logEntry.source?.service === 'auth-factory-integration-test') {
              logEntries.push(logEntry);
            }
          } catch {
            // Not JSON, ignore
          }
        }
        return true;
      };

      try {
        const provider = await AuthFactory.createAuthProvider(config, logger);

        expect(provider).toBeInstanceOf(OAuth2AuthProvider);

        // Verify that logs were generated
        expect(logEntries.length).toBeGreaterThan(0);

        const factoryLogs = logEntries.filter(entry =>
          entry.message?.includes('AuthFactory')
        );

        expect(factoryLogs.length).toBeGreaterThan(0);
        expect(
          factoryLogs.some(log =>
            log.message?.includes('Creating authentication provider')
          )
        ).toBe(true);
      } finally {
        // Restore original stderr
        process.stderr.write = originalWrite;
      }
    });
  });

  describe('Provider Health Check Integration', () => {
    it('should create providers that respond to health checks', async () => {
      const keyFilePath = join(tempDir, 'health-check-key.json');
      const serviceAccountKey = {
        type: 'service_account',
        project_id: 'health-check-project',
        private_key_id: 'key-id',
        private_key:
          '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...',
        client_email: 'health@health-check-project.iam.gserviceaccount.com',
        client_id: '123456789',
        auth_uri: 'https://accounts.google.com/o/oauth2/auth',
        token_uri: 'https://oauth2.googleapis.com/token',
        auth_provider_x509_cert_url:
          'https://www.googleapis.com/oauth2/v1/certs',
        client_x509_cert_url:
          'https://www.googleapis.com/robot/v1/metadata/x509/health%40health-check-project.iam.gserviceaccount.com',
      };

      await writeFile(keyFilePath, JSON.stringify(serviceAccountKey, null, 2));

      const configs = [
        {
          name: 'Service Account',
          config: {
            GOOGLE_SERVICE_ACCOUNT_KEY_PATH: keyFilePath,
            GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
          } as EnvironmentConfig,
        },
        {
          name: 'OAuth2',
          config: {
            GOOGLE_AUTH_MODE: 'oauth2',
            GOOGLE_OAUTH_CLIENT_ID: 'health-test-client-id',
            GOOGLE_OAUTH_CLIENT_SECRET: 'health-test-client-secret',
            GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
          } as EnvironmentConfig,
        },
      ];

      for (const { name, config } of configs) {
        const provider = await AuthFactory.createAuthProvider(config, logger);

        // All providers should respond to health checks
        const healthResult = await provider.healthCheck();
        expect(healthResult.isOk()).toBe(true);

        if (healthResult.isOk()) {
          // Health check should return boolean status
          expect(typeof healthResult.value).toBe('boolean');
        }
      }
    });
  });

  describe('Real-World Configuration Scenarios', () => {
    it('should handle environment variable-like configuration', async () => {
      // Simulate configuration that would come from process.env
      const envConfig: EnvironmentConfig = {
        GOOGLE_AUTH_MODE: 'oauth2' as const,
        GOOGLE_OAUTH_CLIENT_ID: '123456789.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: 'GOCSPX-abcdefghijklmnopqrstuvwxyz123456',
        GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/auth/callback',
        GOOGLE_OAUTH_SCOPES:
          'https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar',
        GOOGLE_OAUTH_PORT: 3000,
        GOOGLE_DRIVE_FOLDER_ID: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        GOOGLE_RETRY_MAX_ATTEMPTS: 3,
        GOOGLE_RETRY_BASE_DELAY: 1000,
        GOOGLE_REQUEST_TIMEOUT: 30000,
      };

      const provider = await AuthFactory.createAuthProvider(envConfig, logger);

      expect(provider).toBeInstanceOf(OAuth2AuthProvider);
      expect(provider.authType).toBe('oauth2');

      // Initialize the provider to prepare it for use
      await provider.initialize();

      // Verify that the provider can provide auth info
      const authInfo = await provider.getAuthInfo();
      expect(authInfo.isOk()).toBe(true);

      if (authInfo.isOk()) {
        expect(authInfo.value.scopes).toEqual([
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/calendar',
        ]);
      }
    });
  });
});
