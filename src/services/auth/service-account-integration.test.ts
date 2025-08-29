/**
 * @fileoverview Integration tests for ServiceAccountAuthProvider
 * These tests verify the real implementation works correctly with the AuthProvider interface
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import { ServiceAccountAuthProvider } from './service-account-auth.provider.js';
import type { EnvironmentConfig } from '../../types/index.js';
import { createServiceLogger } from '../../utils/logger.js';
import { GoogleAuthError } from '../../errors/index.js';

describe('ServiceAccountAuthProvider Integration', () => {
  let provider: ServiceAccountAuthProvider;
  let mockConfig: EnvironmentConfig;
  let logger: any;

  beforeEach(() => {
    logger = createServiceLogger('test-service-account');

    mockConfig = {
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH:
        '/path/to/nonexistent/service-account.json',
      GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id',
    };

    provider = new ServiceAccountAuthProvider(mockConfig, logger);
  });

  describe('Basic Implementation', () => {
    test('should implement AuthProvider interface correctly', () => {
      expect(provider.authType).toBe('service-account');
      expect(provider.getServiceName()).toBe('ServiceAccountAuthProvider');
      expect(provider.getServiceVersion()).toBe('v1');

      // Verify all methods exist
      expect(typeof provider.initialize).toBe('function');
      expect(typeof provider.getAuthClient).toBe('function');
      expect(typeof provider.validateAuth).toBe('function');
      expect(typeof provider.refreshToken).toBe('function');
      expect(typeof provider.getAuthInfo).toBe('function');
      expect(typeof provider.healthCheck).toBe('function');
    });

    test('should handle missing service account file gracefully', async () => {
      const result = await provider.initialize();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('authentication credentials');
        if (result.error instanceof GoogleAuthError) {
          expect(result.error.authType).toBe('service-account');
        }
      }
    });

    test('should return false for validateAuth when not initialized', async () => {
      const result = await provider.validateAuth();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false);
      }
    });

    test('should return auth info even when not authenticated', async () => {
      const result = await provider.getAuthInfo();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const authInfo = result.value;
        expect(authInfo.isAuthenticated).toBe(false);
        expect(authInfo.keyFile).toBe(
          mockConfig.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
        );
        expect(Array.isArray(authInfo.scopes)).toBe(true);
        expect(authInfo.tokenInfo).toBeUndefined();
      }
    });

    test('should handle healthCheck properly', async () => {
      const result = await provider.healthCheck();

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(false); // Should be false since auth is not working
      }
    });

    test('should handle refreshToken when not initialized', async () => {
      const result = await provider.refreshToken();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Cannot refresh token');
        if (result.error instanceof GoogleAuthError) {
          expect(result.error.authType).toBe('service-account');
        }
      }
    });

    test('should handle getAuthClient when not initialized', async () => {
      const result = await provider.getAuthClient();

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        if (result.error instanceof GoogleAuthError) {
          expect(result.error.authType).toBe('service-account');
        }
      }
    });
  });

  describe('Backward Compatibility', () => {
    test('should provide getGoogleAuth method for backward compatibility', async () => {
      expect(typeof provider.getGoogleAuth).toBe('function');

      const result = await provider.getGoogleAuth();
      expect(result.isErr()).toBe(true); // Should fail since not initialized with valid file
    });
  });
});
