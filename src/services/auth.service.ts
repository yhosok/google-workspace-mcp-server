import { OAuth2Client, GoogleAuth } from 'google-auth-library';
import type { EnvironmentConfig } from '../types/index.js';
import { GoogleService } from './base/google-service.js';
import {
  GoogleWorkspaceResult,
  GoogleAuthResult,
  GoogleAuthError,
  GoogleAuthMissingCredentialsError,
  googleOk,
  googleErr,
  authOk,
  authErr,
} from '../errors/index.js';
import { Logger, createServiceLogger } from '../utils/logger.js';
import { AuthFactory } from './auth/auth-factory.js';
import type { AuthProvider } from './auth/auth-provider.interface.js';

/**
 * Unified AuthService wrapper that maintains backward compatibility.
 *
 * This service acts as a facade over the new AuthProvider architecture,
 * using AuthFactory internally to create appropriate providers while
 * maintaining the exact same interface as the legacy AuthService.
 *
 * Features:
 * - Automatic provider selection (Service Account or OAuth2)
 * - Seamless delegation to underlying providers
 * - Full backward compatibility with existing code
 * - Support for both authentication methods
 * - Consistent error handling and logging
 */
export class AuthService extends GoogleService {
  private readonly config: EnvironmentConfig;
  private provider: AuthProvider | null = null;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: EnvironmentConfig, logger?: Logger) {
    // Validate basic configuration
    if (
      !config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH &&
      (!config.GOOGLE_OAUTH_CLIENT_ID || !config.GOOGLE_OAUTH_CLIENT_SECRET)
    ) {
      throw new GoogleAuthMissingCredentialsError('service-account', {
        message:
          'Either service account key path or OAuth2 credentials are required for AuthService',
      });
    }

    const serviceLogger = logger || createServiceLogger('auth-service');
    super(new OAuth2Client(), serviceLogger); // Temporary OAuth2Client, will be replaced by provider
    this.config = config;
  }

  public getServiceName(): string {
    return 'AuthService';
  }

  public getServiceVersion(): string {
    return 'v1';
  }

  /**
   * Ensure provider is initialized.
   * Uses singleton pattern with concurrent initialization prevention.
   */
  private async ensureProvider(): Promise<AuthProvider> {
    if (this.provider) {
      return this.provider;
    }

    // Prevent concurrent initialization
    if (this.initializationPromise) {
      await this.initializationPromise;
      if (this.provider) {
        return this.provider;
      }
    }

    this.initializationPromise = this.createProvider();

    try {
      await this.initializationPromise;
      if (!this.provider) {
        throw new GoogleAuthError(
          'Provider creation failed',
          'service-account',
          {
            service: this.getServiceName(),
          }
        );
      }
      return this.provider;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * Create the appropriate provider using AuthFactory.
   */
  private async createProvider(): Promise<void> {
    try {
      this.logger.info('Creating authentication provider via AuthFactory', {
        service: this.getServiceName(),
        hasServiceAccount: !!this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
        hasOAuth2Config: !!(
          this.config.GOOGLE_OAUTH_CLIENT_ID &&
          this.config.GOOGLE_OAUTH_CLIENT_SECRET
        ),
      });

      this.provider = await AuthFactory.createAuthProvider(
        this.config,
        this.logger
      );

      this.logger.info('Authentication provider created successfully', {
        service: this.getServiceName(),
        providerType: this.provider.authType,
      });
    } catch (error) {
      this.logger.error('Failed to create authentication provider', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      // Convert factory errors to AuthService errors
      if (error instanceof GoogleAuthError) {
        throw error;
      }

      throw new GoogleAuthError(
        `Failed to create authentication provider: ${error instanceof Error ? error.message : String(error)}`,
        'service-account',
        { service: this.getServiceName() }
      );
    }
  }

  /**
   * Initialize the authentication service.
   * Delegates to the underlying provider after ensuring it exists.
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    try {
      const provider = await this.ensureProvider();
      const result = await provider.initialize();

      if (result.isOk()) {
        this.logger.info('Authentication service initialized successfully', {
          service: this.getServiceName(),
          providerType: provider.authType,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Authentication service initialization failed', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof GoogleAuthError) {
        return googleErr(error);
      }

      return googleErr(
        new GoogleAuthError(
          `Authentication initialization failed: ${error instanceof Error ? error.message : String(error)}`,
          'service-account',
          { service: this.getServiceName() }
        )
      );
    }
  }

  /**
   * Get the authenticated OAuth2Client.
   * Delegates to the underlying provider after ensuring initialization.
   */
  public async getAuthClient(): Promise<GoogleAuthResult<OAuth2Client>> {
    try {
      const provider = await this.ensureProvider();

      // Ensure provider is initialized before getting auth client
      const initResult = await provider.initialize();
      if (initResult.isErr()) {
        return authErr(initResult.error as GoogleAuthError);
      }

      return await provider.getAuthClient();
    } catch (error) {
      this.logger.error('Failed to get authentication client', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof GoogleAuthError) {
        return authErr(error);
      }

      return authErr(
        new GoogleAuthError(
          `Failed to get authentication client: ${error instanceof Error ? error.message : String(error)}`,
          'service-account',
          { service: this.getServiceName() }
        )
      );
    }
  }

  /**
   * Validate authentication status.
   * Delegates to the underlying provider after ensuring initialization.
   */
  public async validateAuth(): Promise<GoogleAuthResult<boolean>> {
    try {
      const provider = await this.ensureProvider();

      // Ensure provider is initialized before validation
      const initResult = await provider.initialize();
      if (initResult.isErr()) {
        this.logger.warn('Auth initialization failed during validation', {
          service: this.getServiceName(),
          error: initResult.error.message,
        });
        return authOk(false);
      }

      return await provider.validateAuth();
    } catch (error) {
      this.logger.error('Authentication validation failed', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      // For validation, return false instead of throwing
      return authOk(false);
    }
  }

  /**
   * Get the GoogleAuth instance for backward compatibility.
   *
   * Note: This method is provided for backward compatibility but may not
   * be available for all provider types. OAuth2 providers don't have a
   * GoogleAuth instance, so this method will create a minimal compatibility wrapper.
   */
  public async getGoogleAuth(): Promise<GoogleAuthResult<GoogleAuth>> {
    try {
      const provider = await this.ensureProvider();

      // For service account providers, we can try to get the GoogleAuth instance
      if (provider.authType === 'service-account') {
        // Ensure provider is initialized
        const initResult = await provider.initialize();
        if (initResult.isErr()) {
          return authErr(initResult.error as GoogleAuthError);
        }

        // Service account providers may expose GoogleAuth
        if (
          'getGoogleAuth' in provider &&
          typeof (provider as { getGoogleAuth: () => Promise<unknown> })
            .getGoogleAuth === 'function'
        ) {
          return await (
            provider as {
              getGoogleAuth: () => Promise<GoogleAuthResult<GoogleAuth>>;
            }
          ).getGoogleAuth();
        }
      }

      // For backward compatibility, create a minimal GoogleAuth-like object
      this.logger.warn(
        'GoogleAuth instance not available for this provider type, creating compatibility wrapper',
        {
          service: this.getServiceName(),
          providerType: provider.authType,
        }
      );

      const authClientResult = await provider.getAuthClient();
      if (authClientResult.isErr()) {
        return authErr(authClientResult.error);
      }

      // Create a minimal GoogleAuth-compatible object
      const compatibilityAuth = {
        getClient: async () => authClientResult.value,
      };

      return authOk(compatibilityAuth as GoogleAuth);
    } catch (error) {
      this.logger.error('Failed to get GoogleAuth instance', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof GoogleAuthError) {
        return authErr(error);
      }

      return authErr(
        new GoogleAuthError(
          `Failed to get GoogleAuth instance: ${error instanceof Error ? error.message : String(error)}`,
          'service-account',
          { service: this.getServiceName() }
        )
      );
    }
  }

  /**
   * Health check for the auth service.
   * Delegates to the underlying provider after ensuring initialization.
   */
  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    try {
      const provider = await this.ensureProvider();

      // Ensure provider is initialized before health check
      const initResult = await provider.initialize();
      if (initResult.isErr()) {
        this.logger.warn('Provider initialization failed during health check', {
          service: this.getServiceName(),
          error: initResult.error.message,
        });
        return googleOk(false);
      }

      const result = await provider.healthCheck();

      if (result.isOk()) {
        this.logger.info('Auth health check completed', {
          service: this.getServiceName(),
          isHealthy: result.value,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Auth health check failed', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      return googleOk(false); // Health check failures should not throw
    }
  }

  /**
   * Refresh the authentication token.
   * Delegates to the underlying provider after ensuring initialization.
   */
  public async refreshToken(): Promise<GoogleAuthResult<void>> {
    try {
      const provider = await this.ensureProvider();

      // Ensure provider is initialized before refresh
      const initResult = await provider.initialize();
      if (initResult.isErr()) {
        return authErr(initResult.error as GoogleAuthError);
      }

      const result = await provider.refreshToken();

      if (result.isOk()) {
        this.logger.info('Token refreshed successfully', {
          service: this.getServiceName(),
          providerType: provider.authType,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Token refresh failed', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof GoogleAuthError) {
        return authErr(error);
      }

      return authErr(
        new GoogleAuthError(
          `Token refresh failed: ${error instanceof Error ? error.message : String(error)}`,
          'service-account',
          { service: this.getServiceName() }
        )
      );
    }
  }

  /**
   * Get current authentication information.
   *
   * For backward compatibility, this method returns the legacy structure
   * while internally using the new AuthInfo interface from the provider.
   */
  public async getAuthInfo(): Promise<
    GoogleAuthResult<{
      isAuthenticated: boolean;
      keyFile: string;
      scopes: string[];
      tokenInfo?: {
        expiresAt?: Date;
        hasToken: boolean;
      };
    }>
  > {
    try {
      const provider = await this.ensureProvider();

      // Ensure provider is initialized before getting auth info
      const initResult = await provider.initialize();
      if (initResult.isErr()) {
        this.logger.warn('Provider initialization failed during getAuthInfo', {
          service: this.getServiceName(),
          error: initResult.error.message,
        });

        // Return minimal info for backward compatibility
        return authOk({
          isAuthenticated: false,
          keyFile:
            this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || 'oauth2-client',
          scopes: [],
        });
      }

      // Get auth info from provider
      const authInfoResult = await provider.getAuthInfo();
      if (authInfoResult.isErr()) {
        return authErr(authInfoResult.error);
      }

      const authInfo = authInfoResult.value;

      // Convert AuthInfo to legacy format for backward compatibility
      const legacyInfo = {
        isAuthenticated: authInfo.isAuthenticated,
        keyFile: authInfo.keyFile,
        scopes: authInfo.scopes,
        tokenInfo: authInfo.tokenInfo,
      };

      this.logger.debug('Auth info retrieved successfully', {
        service: this.getServiceName(),
        providerType: provider.authType,
        isAuthenticated: legacyInfo.isAuthenticated,
        scopes: legacyInfo.scopes,
      });

      return authOk(legacyInfo);
    } catch (error) {
      this.logger.error('Failed to get auth info', {
        service: this.getServiceName(),
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof GoogleAuthError) {
        return authErr(error);
      }

      return authErr(
        new GoogleAuthError(
          `Failed to get auth info: ${error instanceof Error ? error.message : String(error)}`,
          'service-account',
          { service: this.getServiceName() }
        )
      );
    }
  }
}
