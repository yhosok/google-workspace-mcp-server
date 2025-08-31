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
  'https://www.googleapis.com/auth/drive.file',
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
      hasOAuthConfig: !!config.GOOGLE_OAUTH_CLIENT_ID,
      hasOAuthSecret: !!config.GOOGLE_OAUTH_CLIENT_SECRET,
      explicitAuthMode: config.GOOGLE_AUTH_MODE,
    });

    // Provide helpful logging about authentication configuration
    if (config.GOOGLE_AUTH_MODE) {
      logger?.info(`AuthFactory: Explicit authentication mode selected: ${config.GOOGLE_AUTH_MODE}`);
    } else {
      logger?.info('AuthFactory: Auto-detecting authentication mode from available configuration');
    }

    // Determine authentication type from configuration
    const authType = this.determineAuthType(config);

    // Provide detailed information about the selected authentication method
    if (authType === 'service-account') {
      logger?.info('AuthFactory: Service Account authentication selected', {
        authType,
        keyPath: config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH ? '[CONFIGURED]' : '[NOT_SET]',
        description: 'Server-to-server authentication using JWT tokens',
        bestFor: 'Automated workflows, server applications, organization-wide access',
        security: 'High (no user interaction required)',
      });
    } else if (authType === 'oauth2') {
      const clientType = config.GOOGLE_OAUTH_CLIENT_SECRET ? 'confidential' : 'public';
      const usesPKCE = !config.GOOGLE_OAUTH_CLIENT_SECRET;
      
      logger?.info('AuthFactory: OAuth2 authentication selected', {
        authType,
        clientType,
        usesPKCE,
        clientId: config.GOOGLE_OAUTH_CLIENT_ID ? '[CONFIGURED]' : '[NOT_SET]',
        hasClientSecret: !!config.GOOGLE_OAUTH_CLIENT_SECRET,
        description: `${clientType} client OAuth2 authentication`,
        bestFor: clientType === 'public' 
          ? 'CLI tools, desktop applications, development environments'
          : 'Web applications with secure backend',
        security: usesPKCE 
          ? 'High (PKCE protection, no client secret needed)'
          : 'Medium (requires secure client secret storage)',
      });

      if (usesPKCE) {
        logger?.info('AuthFactory: PKCE (Proof Key for Code Exchange) will be used for enhanced security');
      }
    }

    // Validate configuration for the selected auth type
    const validationResult = this.validateConfig(config, authType);
    if (validationResult.isErr()) {
      logger?.error('AuthFactory: Configuration validation failed', {
        authType,
        error: validationResult.error.message,
        troubleshooting: 'Check environment variables and ensure required credentials are properly configured',
      });
      throw validationResult.error;
    }

    logger?.info('AuthFactory: Configuration validated successfully', {
      authType,
      message: `${authType} authentication configuration is valid and ready to use`,
    });

    // Create the appropriate provider
    try {
      switch (authType) {
        case 'service-account':
          return new ServiceAccountAuthProvider(config, logger);

        case 'oauth2': {
          const oauth2Config = this.extractOAuth2Config(config);
          const clientType = oauth2Config.clientSecret ? 'confidential' : 'public';
          
          logger?.info('AuthFactory: Creating OAuth2 provider', {
            clientType,
            clientId: oauth2Config.clientId,
            redirectUri: oauth2Config.redirectUri,
            scopes: oauth2Config.scopes,
            port: oauth2Config.port,
            hasClientSecret: !!oauth2Config.clientSecret,
            securityMode: clientType === 'public' ? 'PKCE' : 'Client Secret',
            tokenStorage: 'Secure OS keychain with encrypted file fallback',
          });

          if (clientType === 'public') {
            logger?.info('AuthFactory: Public client configuration detected', {
              securityFeatures: [
                'PKCE (Proof Key for Code Exchange)',
                'State parameter for CSRF protection',
                'Secure token storage in OS keychain',
                'No client secret required'
              ],
              recommendation: 'This is the recommended secure configuration for CLI tools and desktop applications'
            });
          } else {
            logger?.warn('AuthFactory: Confidential client configuration detected', {
              securityNotes: [
                'Client secret must be kept secure',
                'Consider using public client (PKCE) for better security',
                'Ensure client secret is not committed to version control'
              ],
              recommendation: 'Consider removing GOOGLE_OAUTH_CLIENT_SECRET to use PKCE instead'
            });
          }

          logger?.debug('AuthFactory: OAuth2 configuration details', {
            clientId: oauth2Config.clientId,
            redirectUri: oauth2Config.redirectUri,
            scopes: oauth2Config.scopes,
            port: oauth2Config.port,
            clientType,
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
    const hasOAuthConfig = !!config.GOOGLE_OAUTH_CLIENT_ID; // OAuth2 supports public clients (client ID only)

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

    // Note: GOOGLE_OAUTH_CLIENT_SECRET is optional for public clients (PKCE flow)
    // This allows for more secure OAuth2 implementation without requiring client secrets

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

    // Validate client secret format if provided (optional for public clients)
    if (
      config.GOOGLE_OAUTH_CLIENT_SECRET !== undefined &&
      config.GOOGLE_OAUTH_CLIENT_SECRET !== null &&
      (typeof config.GOOGLE_OAUTH_CLIENT_SECRET !== 'string' ||
        config.GOOGLE_OAUTH_CLIENT_SECRET.trim() === '')
    ) {
      return err(
        new GoogleAuthInvalidCredentialsError('oauth2', {
          operation: 'INVALID_OAUTH_CLIENT_SECRET',
          message: 'GOOGLE_OAUTH_CLIENT_SECRET must be a non-empty string when provided',
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
   * Creates a properly typed OAuth2Config object with defaults already
   * applied by the config loading process.
   *
   * @private
   * @param config - Environment configuration
   * @returns OAuth2 configuration object
   */
  private static extractOAuth2Config(config: EnvironmentConfig): OAuth2Config {
    // configで既にデフォルト値が適用済みなので、単純に使用
    const scopes = config.GOOGLE_OAUTH_SCOPES
      ? config.GOOGLE_OAUTH_SCOPES.split(',').map(s => s.trim()).filter(s => s.length > 0)
      : DEFAULT_SCOPES;

    const redirectUri = config.GOOGLE_OAUTH_REDIRECT_URI!; // configで必ず設定される
    const port = config.GOOGLE_OAUTH_PORT || DEFAULT_OAUTH_PORT;

    return {
      clientId: config.GOOGLE_OAUTH_CLIENT_ID!,
      clientSecret: config.GOOGLE_OAUTH_CLIENT_SECRET,
      redirectUri,
      scopes,
      port,
    };
  }
}
