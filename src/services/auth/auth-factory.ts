/**
 * @fileoverview AuthFactory for creating appropriate AuthProvider instances.
 * Implements the Factory pattern to enable configuration-based provider selection.
 */

import type {
  AuthProvider,
  AuthProviderType,
} from './auth-provider.interface.js';
import type { OAuth2Config } from './types.js';
import type { EnvironmentConfig } from '../../types/index.js';
import type { Logger } from '../../utils/logger.js';
import type { GoogleWorkspaceResult } from '../../errors/index.js';

import { ServiceAccountAuthProvider } from './service-account-auth.provider.js';
import { OAuth2AuthProvider } from './oauth2-auth.provider.js';
import { TokenStorageService } from './token-storage.service.js';
import {
  GoogleAuthError,
  GoogleAuthMissingCredentialsError,
  GoogleAuthInvalidCredentialsError,
} from '../../errors/index.js';
import { ok, err } from 'neverthrow';

/**
 * Default OAuth2 scopes for Google Workspace integration.
 */
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/drive.readonly',
];

/**
 * Default OAuth2 configuration values.
 */
const DEFAULT_OAUTH_PORT = 3000;
const DEFAULT_REDIRECT_URI = 'http://localhost:3000/oauth2callback';

/**
 * Factory class for creating AuthProvider instances based on configuration.
 *
 * The factory determines the appropriate authentication method by analyzing
 * environment configuration and creates the corresponding provider instance
 * with proper validation and error handling.
 *
 * @example
 * ```typescript
 * // Automatic provider selection
 * const authProvider = await AuthFactory.createAuthProvider(config, logger);
 * await authProvider.initialize();
 *
 * // Get authenticated client for API calls
 * const clientResult = await authProvider.getAuthClient();
 * ```
 */
export class AuthFactory {
  /**
   * Create an appropriate AuthProvider based on configuration.
   *
   * This method analyzes the environment configuration to determine the
   * authentication type and creates the corresponding provider instance.
   * It performs comprehensive validation of the configuration and handles
   * any setup required for the chosen authentication method.
   *
   * @param config - Environment configuration containing auth settings
   * @param logger - Optional logger instance for tracking operations
   * @returns Promise resolving to configured AuthProvider
   *
   * @throws {GoogleAuthMissingCredentialsError} When required credentials are missing
   * @throws {GoogleAuthInvalidCredentialsError} When credentials are invalid
   * @throws {GoogleAuthError} For general factory errors
   *
   * @example
   * ```typescript
   * // Service account authentication
   * const config = {
   *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json',
   *   GOOGLE_DRIVE_FOLDER_ID: 'folder-id'
   * };
   * const provider = await AuthFactory.createAuthProvider(config);
   *
   * // OAuth2 authentication
   * const oauthConfig = {
   *   GOOGLE_AUTH_MODE: 'oauth2',
   *   GOOGLE_OAUTH_CLIENT_ID: 'client-id',
   *   GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
   *   GOOGLE_DRIVE_FOLDER_ID: 'folder-id'
   * };
   * const oauthProvider = await AuthFactory.createAuthProvider(oauthConfig);
   * ```
   */
  static async createAuthProvider(
    config: EnvironmentConfig,
    logger?: Logger
  ): Promise<AuthProvider> {
    logger?.info('AuthFactory: Creating authentication provider', {
      hasServiceAccount: !!config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      hasOAuthConfig: !!(
        config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET
      ),
      explicitAuthMode: config.GOOGLE_AUTH_MODE,
    });

    // Determine authentication type from configuration
    const authType = this.determineAuthType(config);

    logger?.info('AuthFactory: Determined authentication type', { authType });

    // Validate configuration for the selected auth type
    const validationResult = this.validateConfig(config, authType);
    if (validationResult.isErr()) {
      logger?.error('AuthFactory: Configuration validation failed', {
        authType,
        error: validationResult.error.message,
      });
      throw validationResult.error;
    }

    logger?.info('AuthFactory: Configuration validated successfully', {
      authType,
    });

    // Create the appropriate provider
    try {
      switch (authType) {
        case 'service-account':
          return new ServiceAccountAuthProvider(config, logger);

        case 'oauth2': {
          const oauth2Config = this.extractOAuth2Config(config);
          logger?.debug('AuthFactory: Creating OAuth2 provider with config', {
            clientId: oauth2Config.clientId,
            redirectUri: oauth2Config.redirectUri,
            scopes: oauth2Config.scopes,
            port: oauth2Config.port,
          });

          const tokenStorage = await TokenStorageService.create();
          return new OAuth2AuthProvider(oauth2Config, tokenStorage, logger);
        }

        default:
          const error = new GoogleAuthError(
            `Unsupported authentication type: ${authType}`,
            'service-account',
            { operation: 'AUTH_FACTORY_ERROR' }
          );
          logger?.error('AuthFactory: Unsupported auth type', {
            authType,
            error: error.message,
          });
          throw error;
      }
    } catch (error) {
      logger?.error('AuthFactory: Provider creation failed', {
        authType,
        error: error instanceof Error ? error.message : String(error),
      });

      // Re-throw our own errors, wrap others
      if (error instanceof GoogleAuthError) {
        throw error;
      }

      throw new GoogleAuthError(
        `Failed to create ${authType} authentication provider: ${error instanceof Error ? error.message : String(error)}`,
        authType === 'oauth2' ? 'oauth2' : 'service-account',
        { operation: 'AUTH_FACTORY_ERROR' }
      );
    }
  }

  /**
   * Determine authentication type from configuration.
   *
   * Uses the following priority order:
   * 1. Explicit GOOGLE_AUTH_MODE setting
   * 2. Auto-detection based on available configuration
   *    - Service account: GOOGLE_SERVICE_ACCOUNT_KEY_PATH exists
   *    - OAuth2: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET exist
   *
   * @param config - Environment configuration
   * @returns Authentication provider type
   *
   * @example
   * ```typescript
   * // Explicit mode
   * const type1 = AuthFactory.determineAuthType({
   *   GOOGLE_AUTH_MODE: 'oauth2',
   *   GOOGLE_OAUTH_CLIENT_ID: 'client-id',
   *   GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret'
   * }); // Returns 'oauth2'
   *
   * // Auto-detection
   * const type2 = AuthFactory.determineAuthType({
   *   GOOGLE_SERVICE_ACCOUNT_KEY_PATH: '/path/to/key.json'
   * }); // Returns 'service-account'
   * ```
   */
  static determineAuthType(config: EnvironmentConfig): AuthProviderType {
    // Check for explicit auth mode setting
    if (config.GOOGLE_AUTH_MODE) {
      return config.GOOGLE_AUTH_MODE;
    }

    // Auto-detect based on available configuration
    const hasServiceAccount = !!config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
    const hasOAuthConfig = !!(
      config.GOOGLE_OAUTH_CLIENT_ID && config.GOOGLE_OAUTH_CLIENT_SECRET
    );

    if (hasServiceAccount && !hasOAuthConfig) {
      return 'service-account';
    }

    if (hasOAuthConfig && !hasServiceAccount) {
      return 'oauth2';
    }

    if (hasServiceAccount && hasOAuthConfig) {
      // Both configurations present - prefer service account for backwards compatibility
      return 'service-account';
    }

    // No configuration found - default to service account for backwards compatibility
    return 'service-account';
  }

  /**
   * Validate configuration for specific auth type.
   *
   * Performs comprehensive validation of the configuration required
   * for the specified authentication type, including required fields,
   * format validation, and logical consistency checks.
   *
   * @param config - Environment configuration
   * @param authType - Target authentication type
   * @returns Configuration validation result
   *
   * @example
   * ```typescript
   * const result = AuthFactory.validateConfig(config, 'oauth2');
   * if (result.isErr()) {
   *   console.error('Validation failed:', result.error.message);
   * }
   * ```
   */
  static validateConfig(
    config: EnvironmentConfig,
    authType: AuthProviderType
  ): GoogleWorkspaceResult<void> {
    switch (authType) {
      case 'service-account':
        return this.validateServiceAccountConfig(config);
      case 'oauth2':
        return this.validateOAuth2Config(config);
      default:
        return err(
          new GoogleAuthInvalidCredentialsError('service-account', {
            operation: 'INVALID_AUTH_TYPE',
            authType,
          })
        );
    }
  }

  /**
   * Validate service account configuration.
   *
   * @private
   * @param config - Environment configuration
   * @returns Validation result
   */
  private static validateServiceAccountConfig(
    config: EnvironmentConfig
  ): GoogleWorkspaceResult<void> {
    if (
      config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH === undefined ||
      config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH === null
    ) {
      return err(
        new GoogleAuthMissingCredentialsError('service-account', {
          operation: 'MISSING_SERVICE_ACCOUNT_KEY',
          message:
            'Service account authentication requires GOOGLE_SERVICE_ACCOUNT_KEY_PATH to be set',
        })
      );
    }

    if (
      typeof config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH !== 'string' ||
      config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH.trim() === ''
    ) {
      return err(
        new GoogleAuthInvalidCredentialsError('service-account', {
          operation: 'INVALID_SERVICE_ACCOUNT_KEY_PATH',
          message: 'GOOGLE_SERVICE_ACCOUNT_KEY_PATH must be a non-empty string',
        })
      );
    }

    return ok(undefined);
  }

  /**
   * Validate OAuth2 configuration.
   *
   * @private
   * @param config - Environment configuration
   * @returns Validation result
   */
  private static validateOAuth2Config(
    config: EnvironmentConfig
  ): GoogleWorkspaceResult<void> {
    // Required fields
    if (
      config.GOOGLE_OAUTH_CLIENT_ID === undefined ||
      config.GOOGLE_OAUTH_CLIENT_ID === null
    ) {
      return err(
        new GoogleAuthMissingCredentialsError('oauth2', {
          operation: 'MISSING_OAUTH_CLIENT_ID',
          message:
            'OAuth2 authentication requires GOOGLE_OAUTH_CLIENT_ID to be set',
        })
      );
    }

    if (
      config.GOOGLE_OAUTH_CLIENT_SECRET === undefined ||
      config.GOOGLE_OAUTH_CLIENT_SECRET === null
    ) {
      return err(
        new GoogleAuthMissingCredentialsError('oauth2', {
          operation: 'MISSING_OAUTH_CLIENT_SECRET',
          message:
            'OAuth2 authentication requires GOOGLE_OAUTH_CLIENT_SECRET to be set',
        })
      );
    }

    // Validate field formats
    if (
      typeof config.GOOGLE_OAUTH_CLIENT_ID !== 'string' ||
      config.GOOGLE_OAUTH_CLIENT_ID.trim() === ''
    ) {
      return err(
        new GoogleAuthInvalidCredentialsError('oauth2', {
          operation: 'INVALID_OAUTH_CLIENT_ID',
          message: 'GOOGLE_OAUTH_CLIENT_ID must be a non-empty string',
        })
      );
    }

    if (
      typeof config.GOOGLE_OAUTH_CLIENT_SECRET !== 'string' ||
      config.GOOGLE_OAUTH_CLIENT_SECRET.trim() === ''
    ) {
      return err(
        new GoogleAuthInvalidCredentialsError('oauth2', {
          operation: 'INVALID_OAUTH_CLIENT_SECRET',
          message: 'GOOGLE_OAUTH_CLIENT_SECRET must be a non-empty string',
        })
      );
    }

    // Validate optional port
    if (config.GOOGLE_OAUTH_PORT !== undefined) {
      if (
        typeof config.GOOGLE_OAUTH_PORT !== 'number' ||
        config.GOOGLE_OAUTH_PORT < 1 ||
        config.GOOGLE_OAUTH_PORT > 65535
      ) {
        return err(
          new GoogleAuthInvalidCredentialsError('oauth2', {
            operation: 'INVALID_OAUTH_PORT',
            message: 'GOOGLE_OAUTH_PORT must be a number between 1 and 65535',
          })
        );
      }
    }

    // Validate optional redirect URI format
    if (config.GOOGLE_OAUTH_REDIRECT_URI) {
      try {
        new URL(config.GOOGLE_OAUTH_REDIRECT_URI);
      } catch {
        return err(
          new GoogleAuthInvalidCredentialsError('oauth2', {
            operation: 'INVALID_OAUTH_REDIRECT_URI',
            message: 'GOOGLE_OAUTH_REDIRECT_URI must be a valid URL',
          })
        );
      }
    }

    return ok(undefined);
  }

  /**
   * Extract OAuth2 configuration from environment config.
   *
   * Creates a properly typed OAuth2Config object with sensible defaults
   * for optional fields.
   *
   * @private
   * @param config - Environment configuration
   * @returns OAuth2 configuration object
   */
  private static extractOAuth2Config(config: EnvironmentConfig): OAuth2Config {
    const scopes = config.GOOGLE_OAUTH_SCOPES
      ? config.GOOGLE_OAUTH_SCOPES.split(',').map(s => s.trim())
      : DEFAULT_SCOPES;

    const redirectUri =
      config.GOOGLE_OAUTH_REDIRECT_URI ||
      `http://localhost:${config.GOOGLE_OAUTH_PORT || DEFAULT_OAUTH_PORT}/oauth2callback`;

    return {
      clientId: config.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirectUri,
      scopes,
      port: config.GOOGLE_OAUTH_PORT || DEFAULT_OAUTH_PORT,
    };
  }
}
