/**
 * @fileoverview Unit tests for AuthFactory.
 * Tests factory pattern implementation, configuration validation, and provider creation.
 */

import {
  describe,
  it,
  expect,
  jest,
  beforeEach,
  afterEach,
} from '@jest/globals';
import type { EnvironmentConfig } from '../../types/index.js';
import type { Logger } from '../../utils/logger.js';
import { AuthFactory } from './auth-factory.js';
import { ServiceAccountAuthProvider } from './service-account-auth.provider.js';
import { OAuth2AuthProvider } from './oauth2-auth.provider.js';
import { TokenStorageService } from './token-storage.service.js';
import {
  GoogleAuthError,
  GoogleAuthMissingCredentialsError,
  GoogleAuthInvalidCredentialsError,
} from '../../errors/index.js';

// Mock dependencies
jest.mock('./service-account-auth.provider.js');
jest.mock('./oauth2-auth.provider.js');
jest.mock('./token-storage.service.js');

const MockedServiceAccountAuthProvider = jest.mocked(
  ServiceAccountAuthProvider
);
const MockedOAuth2AuthProvider = jest.mocked(OAuth2AuthProvider);
const MockedTokenStorageService = jest.mocked(TokenStorageService);

describe('AuthFactory', () => {
  let mockLogger: Logger;
  let mockTokenStorage: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      fatal: jest.fn(),
    } as any;

    // Mock token storage
    mockTokenStorage = {
      saveTokens: jest.fn(),
      getTokens: jest.fn(),
      deleteTokens: jest.fn(),
      hasTokens: jest.fn(),
    };

    MockedTokenStorageService.create.mockResolvedValue(mockTokenStorage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('determineAuthType', () => {
    it('should return explicit auth mode when provided', () => {
      const config: EnvironmentConfig = {
        GOOGLE_AUTH_MODE: 'oauth2',
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
      };

      const authType = AuthFactory.determineAuthType(config);
      expect(authType).toBe('oauth2');
    });

    it('should auto-detect service account when only service account config exists', () => {
      const config: EnvironmentConfig = {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
        GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
      };

      const authType = AuthFactory.determineAuthType(config);
      expect(authType).toBe('service-account');
    });

    it('should auto-detect oauth2 when only OAuth2 config exists', () => {
      const config: EnvironmentConfig = {
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
      };

      const authType = AuthFactory.determineAuthType(config);
      expect(authType).toBe('oauth2');
    });

    it('should prefer service account when both configurations exist', () => {
      const config: EnvironmentConfig = {
        GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
        GOOGLE_OAUTH_CLIENT_ID: 'client-id',
        GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
        GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
      };

      const authType = AuthFactory.determineAuthType(config);
      expect(authType).toBe('service-account');
    });

    it('should default to service account when no configuration exists', () => {
      const config: EnvironmentConfig = {
        GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
      };

      const authType = AuthFactory.determineAuthType(config);
      expect(authType).toBe('service-account');
    });
  });

  describe('validateConfig', () => {
    describe('service account validation', () => {
      it('should pass validation for valid service account config', () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'service-account');
        expect(result.isOk()).toBe(true);
      });

      it('should fail validation when service account key path is missing', () => {
        const config: EnvironmentConfig = {
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'service-account');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthMissingCredentialsError
        );
        expect(result._unsafeUnwrapErr().context?.message).toContain(
          'GOOGLE_SERVICE_ACCOUNT_KEY_PATH'
        );
      });

      it('should fail validation when service account key path is empty', () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'service-account');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthInvalidCredentialsError
        );
      });

      it('should fail validation when service account key path is whitespace only', () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '   ',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'service-account');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthInvalidCredentialsError
        );
      });
    });

    describe('oauth2 validation', () => {
      it('should pass validation for valid OAuth2 config', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isOk()).toBe(true);
      });

      it('should pass validation for OAuth2 config with optional fields', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:3000/callback',
          GOOGLE_OAUTH_PORT: 3000,
          GOOGLE_OAUTH_SCOPES: 'scope1,scope2',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isOk()).toBe(true);
      });

      it('should fail validation when client ID is missing', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthMissingCredentialsError
        );
        expect(result._unsafeUnwrapErr().context?.message).toContain(
          'GOOGLE_OAUTH_CLIENT_ID'
        );
      });

      it('should fail validation when client secret is missing', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthMissingCredentialsError
        );
        expect(result._unsafeUnwrapErr().context?.message).toContain(
          'GOOGLE_OAUTH_CLIENT_SECRET'
        );
      });

      it('should fail validation when client ID is empty', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: '',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthInvalidCredentialsError
        );
      });

      it('should fail validation when client secret is empty', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: '',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthInvalidCredentialsError
        );
      });

      it('should fail validation for invalid port number', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_OAUTH_PORT: 70000, // Invalid port
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthInvalidCredentialsError
        );
        expect(result._unsafeUnwrapErr().context?.message).toContain(
          'GOOGLE_OAUTH_PORT'
        );
      });

      it('should fail validation for invalid redirect URI', () => {
        const config: EnvironmentConfig = {
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_OAUTH_REDIRECT_URI: 'invalid-url',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const result = AuthFactory.validateConfig(config, 'oauth2');
        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAuthInvalidCredentialsError
        );
        expect(result._unsafeUnwrapErr().context?.message).toContain(
          'valid URL'
        );
      });
    });

    it('should fail validation for unknown auth type', () => {
      const config: EnvironmentConfig = {
        GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
      };

      const result = AuthFactory.validateConfig(config, 'unknown-type' as any);
      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(
        GoogleAuthInvalidCredentialsError
      );
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(
        GoogleAuthInvalidCredentialsError
      );
    });
  });

  describe('createAuthProvider', () => {
    describe('service account provider creation', () => {
      it('should create service account provider successfully', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = {
          authType: 'service-account',
        } as any;

        MockedServiceAccountAuthProvider.mockReturnValue(mockProvider);

        const result = await AuthFactory.createAuthProvider(config, mockLogger);

        expect(result).toBe(mockProvider);
        expect(MockedServiceAccountAuthProvider).toHaveBeenCalledWith(
          config,
          mockLogger
        );
        expect(mockLogger.info).toHaveBeenCalledWith(
          'AuthFactory: Creating authentication provider',
          expect.objectContaining({
            hasServiceAccount: true,
            hasOAuthConfig: false,
          })
        );
      });

      it('should create service account provider with explicit auth mode', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'service-account',
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = { authType: 'service-account' } as any;
        MockedServiceAccountAuthProvider.mockReturnValue(mockProvider);

        const result = await AuthFactory.createAuthProvider(config);

        expect(result).toBe(mockProvider);
        expect(MockedServiceAccountAuthProvider).toHaveBeenCalledWith(
          config,
          undefined
        );
      });
    });

    describe('oauth2 provider creation', () => {
      it('should create OAuth2 provider successfully with minimal config', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'oauth2',
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = { authType: 'oauth2' } as any;
        MockedOAuth2AuthProvider.mockReturnValue(mockProvider);

        const result = await AuthFactory.createAuthProvider(config, mockLogger);

        expect(result).toBe(mockProvider);
        expect(MockedTokenStorageService.create).toHaveBeenCalled();
        expect(MockedOAuth2AuthProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'client-id',
            clientSecret: 'client-secret',
            redirectUri: 'http://localhost:3000/oauth2callback',
            scopes: [
              'https://www.googleapis.com/auth/spreadsheets',
              'https://www.googleapis.com/auth/calendar',
              'https://www.googleapis.com/auth/drive.file',
              'https://www.googleapis.com/auth/documents',
            ],
            port: 3000,
          }),
          mockTokenStorage,
          mockLogger
        );
      });

      it('should create OAuth2 provider with custom configuration', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'oauth2',
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_OAUTH_REDIRECT_URI: 'http://localhost:8080/callback',
          GOOGLE_OAUTH_PORT: 8080,
          GOOGLE_OAUTH_SCOPES: 'scope1,scope2,scope3',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = { authType: 'oauth2' } as any;
        MockedOAuth2AuthProvider.mockReturnValue(mockProvider);

        const result = await AuthFactory.createAuthProvider(config, mockLogger);

        expect(result).toBe(mockProvider);
        expect(MockedOAuth2AuthProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'client-id',
            clientSecret: 'client-secret',
            redirectUri: 'http://localhost:8080/callback',
            scopes: ['scope1', 'scope2', 'scope3'],
            port: 8080,
          }),
          mockTokenStorage,
          mockLogger
        );
      });

      it('should generate default redirect URI with custom port', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'oauth2',
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_OAUTH_PORT: 8080,
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = { authType: 'oauth2' } as any;
        MockedOAuth2AuthProvider.mockReturnValue(mockProvider);

        await AuthFactory.createAuthProvider(config, mockLogger);

        expect(MockedOAuth2AuthProvider).toHaveBeenCalledWith(
          expect.objectContaining({
            redirectUri: 'http://localhost:8080/oauth2callback',
            port: 8080,
          }),
          mockTokenStorage,
          mockLogger
        );
      });
    });

    describe('error handling', () => {
      it('should throw validation error for invalid configuration', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'service-account',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
          // Missing GOOGLE_SERVICE_ACCOUNT_KEY_PATH
        };

        await expect(
          AuthFactory.createAuthProvider(config, mockLogger)
        ).rejects.toThrow(GoogleAuthMissingCredentialsError);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'AuthFactory: Configuration validation failed',
          expect.objectContaining({
            authType: 'service-account',
          })
        );
      });

      it('should handle service account provider creation error', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const originalError = new Error('Provider creation failed');
        MockedServiceAccountAuthProvider.mockImplementation(() => {
          throw originalError;
        });

        await expect(
          AuthFactory.createAuthProvider(config, mockLogger)
        ).rejects.toThrow(GoogleAuthError);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'AuthFactory: Provider creation failed',
          expect.objectContaining({
            authType: 'service-account',
            error: 'Provider creation failed',
          })
        );
      });

      it('should handle OAuth2 provider creation error', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'oauth2',
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const originalError = new Error('OAuth2 provider failed');
        MockedOAuth2AuthProvider.mockImplementation(() => {
          throw originalError;
        });

        await expect(
          AuthFactory.createAuthProvider(config, mockLogger)
        ).rejects.toThrow(GoogleAuthError);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'AuthFactory: Provider creation failed',
          expect.objectContaining({
            authType: 'oauth2',
            error: 'OAuth2 provider failed',
          })
        );
      });

      it('should handle token storage creation error', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_AUTH_MODE: 'oauth2',
          GOOGLE_OAUTH_CLIENT_ID: 'client-id',
          GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const storageError = new Error('Token storage failed');
        MockedTokenStorageService.create.mockRejectedValue(storageError);

        await expect(
          AuthFactory.createAuthProvider(config, mockLogger)
        ).rejects.toThrow(GoogleAuthError);

        expect(mockLogger.error).toHaveBeenCalledWith(
          'AuthFactory: Provider creation failed',
          expect.objectContaining({
            authType: 'oauth2',
            error: 'Token storage failed',
          })
        );
      });

      it('should re-throw GoogleAuthError instances without wrapping', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const originalError = new GoogleAuthError(
          'Original auth error',
          'service-account',
          { operation: 'ORIGINAL_ERROR' }
        );

        MockedServiceAccountAuthProvider.mockImplementation(() => {
          throw originalError;
        });

        await expect(
          AuthFactory.createAuthProvider(config, mockLogger)
        ).rejects.toThrow(originalError);
      });

      it('should handle unsupported auth type (should not happen in practice)', async () => {
        // This test covers the default case in the switch statement
        const config: EnvironmentConfig = {
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        // Mock determineAuthType to return an unsupported type
        const originalDetermineAuthType = AuthFactory.determineAuthType;
        jest
          .spyOn(AuthFactory, 'determineAuthType')
          .mockReturnValue('unsupported' as any);

        // Mock validateConfig to pass validation
        const originalValidateConfig = AuthFactory.validateConfig;
        jest
          .spyOn(AuthFactory, 'validateConfig')
          .mockReturnValue({ isErr: () => false } as any);

        await expect(
          AuthFactory.createAuthProvider(config, mockLogger)
        ).rejects.toThrow(GoogleAuthError);

        // Restore mocks
        jest
          .spyOn(AuthFactory, 'determineAuthType')
          .mockImplementation(originalDetermineAuthType);
        jest
          .spyOn(AuthFactory, 'validateConfig')
          .mockImplementation(originalValidateConfig);
      });
    });

    describe('logging behavior', () => {
      it('should log authentication provider creation process', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = { authType: 'service-account' } as any;
        MockedServiceAccountAuthProvider.mockReturnValue(mockProvider);

        await AuthFactory.createAuthProvider(config, mockLogger);

        expect(mockLogger.info).toHaveBeenCalledWith(
          'AuthFactory: Creating authentication provider',
          expect.objectContaining({
            hasServiceAccount: true,
            hasOAuthConfig: false,
            explicitAuthMode: undefined,
          })
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          'AuthFactory: Determined authentication type',
          { authType: 'service-account' }
        );

        expect(mockLogger.info).toHaveBeenCalledWith(
          'AuthFactory: Configuration validated successfully',
          { authType: 'service-account' }
        );
      });

      it('should work without logger', async () => {
        const config: EnvironmentConfig = {
          GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
          GOOGLE_DRIVE_FOLDER_ID: 'folder-id',
        };

        const mockProvider = { authType: 'service-account' } as any;
        MockedServiceAccountAuthProvider.mockReturnValue(mockProvider);

        const result = await AuthFactory.createAuthProvider(config);

        expect(result).toBe(mockProvider);
        expect(MockedServiceAccountAuthProvider).toHaveBeenCalledWith(
          config,
          undefined
        );
      });
    });
  });
});
