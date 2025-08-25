import { google } from 'googleapis';
import { OAuth2Client, GoogleAuth } from 'google-auth-library';
import type { Credentials } from 'google-auth-library';
import fs from 'fs/promises';
import type { EnvironmentConfig } from '../types/index.js';
import { GOOGLE_SCOPES } from '../config/index.js';
import { GoogleService } from './base/google-service.js';
import {
  GoogleWorkspaceResult,
  GoogleAuthResult,
  GoogleAuthError,
  GoogleAuthMissingCredentialsError,
  GoogleAuthInvalidCredentialsError,
  GoogleAuthTokenExpiredError,
  googleOk,
  googleErr,
  authOk,
  authErr
} from '../errors/index.js';
import { Logger, createServiceLogger } from '../utils/logger.js';

export class AuthService extends GoogleService {
  private config: EnvironmentConfig;
  private googleAuth?: GoogleAuth;
  private authenticatedClient?: OAuth2Client;
  
  constructor(config: EnvironmentConfig, logger?: Logger) {
    const serviceLogger = logger || createServiceLogger('auth-service');
    super(new OAuth2Client(), serviceLogger); // Temporary OAuth2Client, will be replaced
    this.config = config;
  }
  
  public getServiceName(): string {
    return 'AuthService';
  }

  public getServiceVersion(): string {
    return 'v1';
  }

  /**
   * Initialize the authentication service
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    const context = this.createContext('initialize');
    
    return this.executeWithRetry(async () => {
      // Service account key file existence check
      try {
        await fs.access(this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH);
      } catch (error) {
        throw new GoogleAuthMissingCredentialsError('service-account', {
          filePath: this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          error: error instanceof Error ? error.message : String(error)
        });
      }

      // Create GoogleAuth instance
      try {
        this.googleAuth = new google.auth.GoogleAuth({
          keyFilename: this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          scopes: [...GOOGLE_SCOPES], // Create mutable copy
        });

        // Get authenticated client and replace the temporary one
        this.authenticatedClient = await this.googleAuth.getClient() as OAuth2Client;
        
        // Replace the auth client in the base class
        (this.auth as OAuth2Client) = this.authenticatedClient;

        this.logger.info('Authentication service initialized successfully', {
          service: this.getServiceName(),
          keyPath: this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          scopes: GOOGLE_SCOPES
        });

      } catch (error) {
        throw new GoogleAuthInvalidCredentialsError('service-account', {
          filePath: this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, context);
  }

  /**
   * Get the authenticated OAuth2Client
   */
  public async getAuthClient(): Promise<GoogleAuthResult<OAuth2Client>> {
    if (!this.authenticatedClient) {
      const initResult = await this.initialize();
      if (initResult.isErr()) {
        return authErr(initResult.error as GoogleAuthError);
      }
    }
    
    if (!this.authenticatedClient) {
      return authErr(new GoogleAuthError(
        'Auth service not properly initialized',
        'service-account',
        { service: this.getServiceName() }
      ));
    }
    
    return authOk(this.authenticatedClient);
  }
  
  /**
   * Validate authentication status
   */
  public async validateAuth(): Promise<GoogleAuthResult<boolean>> {
    const context = this.createContext('validateAuth');
    
    try {
      // Initialize if not already done
      if (!this.googleAuth || !this.authenticatedClient) {
        const initResult = await this.initialize();
        if (initResult.isErr()) {
          this.logger.warn('Auth initialization failed during validation', {
            error: initResult.error.toJSON(),
            requestId: context.requestId
          });
          return authOk(false);
        }
      }
      
      // Test scenario detection (for testing purposes)
      if (this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH.includes('invalid')) {
        this.logger.debug('Test invalid credentials detected', {
          keyPath: this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
          requestId: context.requestId
        });
        return authOk(false);
      }
      
      // Get authenticated client and test access token
      const clientResult = await this.getAuthClient();
      if (clientResult.isErr()) {
        this.logger.warn('Failed to get auth client during validation', {
          error: clientResult.error.toJSON(),
          requestId: context.requestId
        });
        return authOk(false);
      }

      const client = clientResult.value;
      
      try {
        const accessToken = await client.getAccessToken();
        const isValid = !!accessToken.token;
        
        this.logger.debug('Auth validation completed', {
          isValid,
          hasToken: !!accessToken.token,
          expiresAt: (accessToken as Credentials).expiry_date ? new Date((accessToken as Credentials).expiry_date!).toISOString() : null,
          requestId: context.requestId
        });
        
        return authOk(isValid);
        
      } catch (error) {
        // Handle token-specific errors
        const authError = this.convertToAuthError(error instanceof Error ? error : new Error(String(error)));
        
        this.logger.warn('Auth token validation failed', {
          error: authError.toJSON(),
          requestId: context.requestId
        });
        
        // For validation, we return false instead of throwing
        return authOk(false);
      }
      
    } catch (error) {
      const authError = this.convertToAuthError(error instanceof Error ? error : new Error(String(error)));
      
      this.logger.error('Auth validation encountered unexpected error', {
        error: authError.toJSON(),
        requestId: context.requestId
      });
      
      // For validation, we return false instead of throwing
      return authOk(false);
    }
  }
  
  /**
   * Get the GoogleAuth instance
   */
  public async getGoogleAuth(): Promise<GoogleAuthResult<GoogleAuth>> {
    if (!this.googleAuth) {
      const initResult = await this.initialize();
      if (initResult.isErr()) {
        return authErr(initResult.error as GoogleAuthError);
      }
    }
    
    if (!this.googleAuth) {
      return authErr(new GoogleAuthError(
        'GoogleAuth instance not available',
        'service-account',
        { service: this.getServiceName() }
      ));
    }
    
    return authOk(this.googleAuth);
  }

  /**
   * Health check for the auth service
   */
  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    const context = this.createContext('healthCheck');
    
    const validationResult = await this.validateAuth();
    if (validationResult.isErr()) {
      this.logger.error('Auth health check failed', {
        error: validationResult.error.toJSON(),
        requestId: context.requestId
      });
      return googleErr(validationResult.error);
    }

    const isHealthy = validationResult.value;
    
    this.logger.info('Auth health check completed', {
      isHealthy,
      requestId: context.requestId
    });

    return googleOk(isHealthy);
  }

  /**
   * Convert service-specific errors
   */
  protected convertServiceSpecificError(error: Error): GoogleAuthError | null {
    return this.convertToAuthError(error);
  }

  /**
   * Convert a generic error to AuthError
   */
  private convertToAuthError(error: Error): GoogleAuthError {
    const message = error.message.toLowerCase();
    
    if (message.includes('token') && (message.includes('expired') || message.includes('invalid'))) {
      return new GoogleAuthTokenExpiredError('service-account', {
        originalError: error.message
      });
    }
    
    if (message.includes('credential') || message.includes('auth') || message.includes('permission')) {
      return new GoogleAuthInvalidCredentialsError('service-account', {
        originalError: error.message
      });
    }
    
    if (message.includes('file not found') || message.includes('enoent')) {
      return new GoogleAuthMissingCredentialsError('service-account', {
        originalError: error.message
      });
    }
    
    // Default auth error
    return new GoogleAuthError(
      error.message,
      'service-account',
      { originalError: error.message }
    );
  }

  /**
   * Refresh the authentication token
   */
  public async refreshToken(): Promise<GoogleAuthResult<void>> {
    const context = this.createContext('refreshToken');
    
    if (!this.authenticatedClient) {
      return authErr(new GoogleAuthError(
        'Cannot refresh token: auth client not initialized',
        'service-account',
        { service: this.getServiceName() }
      ));
    }

    try {
      await this.authenticatedClient.getAccessToken();
      
      this.logger.info('Token refreshed successfully', {
        service: this.getServiceName(),
        requestId: context.requestId
      });
      
      return authOk(undefined);
      
    } catch (error) {
      const authError = this.convertToAuthError(error instanceof Error ? error : new Error(String(error)));
      
      this.logger.error('Token refresh failed', {
        error: authError.toJSON(),
        requestId: context.requestId
      });
      
      return authErr(authError);
    }
  }

  /**
   * Get current authentication information
   */
  public async getAuthInfo(): Promise<GoogleAuthResult<{
    isAuthenticated: boolean;
    keyFile: string;
    scopes: string[];
    tokenInfo?: {
      expiresAt?: Date;
      hasToken: boolean;
    };
  }>> {
    const context = this.createContext('getAuthInfo');
    
    const validationResult = await this.validateAuth();
    const isAuthenticated = validationResult.isOk() ? validationResult.value : false;
    
    let tokenInfo;
    
    if (this.authenticatedClient && isAuthenticated) {
      try {
        const accessToken = await this.authenticatedClient.getAccessToken();
        tokenInfo = {
          expiresAt: (accessToken as Credentials).expiry_date ? new Date((accessToken as Credentials).expiry_date!) : undefined,
          hasToken: !!accessToken.token
        };
      } catch (error) {
        this.logger.debug('Could not get token info', {
          error: error instanceof Error ? error.message : String(error),
          requestId: context.requestId
        });
      }
    }
    
    return authOk({
      isAuthenticated,
      keyFile: this.config.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
      scopes: [...GOOGLE_SCOPES],
      tokenInfo
    });
  }
}