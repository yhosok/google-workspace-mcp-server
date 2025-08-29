/**
 * @fileoverview OAuth2AuthProvider implementation for Google Workspace authentication.
 *
 * This provider implements the complete OAuth2 authorization code flow using
 * Google Auth Library patterns, following the established TDD architecture.
 *
 * Features:
 * - Complete OAuth2 authorization code flow
 * - Local HTTP server for callback handling
 * - Browser integration for user authentication
 * - Token refresh and automatic management
 * - Secure token storage with TokenStorageService
 * - CSRF protection with state parameter
 * - Comprehensive error handling
 * - Integration with GoogleService base class
 */

import { OAuth2Client } from 'google-auth-library';
import { ResultAsync } from 'neverthrow';
import { createServer, Server } from 'http';
import { URL } from 'url';
import { randomBytes } from 'crypto';
import enableDestroy from 'server-destroy';
// Dynamic import for open to avoid Jest ES module issues

import { AuthProvider, AuthProviderType } from './auth-provider.interface.js';
import {
  OAuth2Config,
  OAuth2StoredCredentials,
  TokenStorage,
} from './types.js';
import { TokenStorageService } from './token-storage.service.js';
import { GoogleService } from '../base/google-service.js';
import { Logger } from '../../utils/logger.js';
import { AuthInfo } from '../../types/index.js';
import {
  GoogleWorkspaceResult,
  GoogleAuthResult,
  googleOk,
  googleErr,
  authOk,
  authErr,
} from '../../errors/index.js';
import {
  GoogleOAuth2Error,
  GoogleOAuth2AuthorizationRequiredError,
  GoogleOAuth2UserDeniedError,
  GoogleOAuth2TokenStorageError,
  GoogleOAuth2RefreshTokenExpiredError,
  GoogleOAuth2NetworkError,
  GoogleServiceError,
} from '../../errors/index.js';

/**
 * HTTP server configuration for OAuth2 callback handling.
 * @internal
 */
interface OAuth2CallbackServer {
  server: Server & { destroy?: () => void };
  port: number;
  authorizationCode?: string;
  error?: string;
  state?: string;
}

/**
 * OAuth2 authorization flow state management.
 * @internal
 */
interface AuthFlowState {
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  scopes: string[];
}

/**
 * OAuth2AuthProvider implements complete OAuth2 authorization code flow
 * for Google Workspace authentication.
 *
 * This provider extends GoogleService to inherit retry/timeout mechanisms,
 * error handling, logging, and health checking patterns.
 *
 * @example Basic usage
 * ```typescript
 * const config: OAuth2Config = {
 *   clientId: 'your-client-id',
 *   clientSecret: 'your-client-secret',
 *   redirectUri: 'http://localhost:3000/oauth2callback',
 *   scopes: ['https://www.googleapis.com/auth/spreadsheets']
 * };
 *
 * const provider = new OAuth2AuthProvider(config);
 * await provider.initialize();
 * const client = await provider.getAuthClient();
 * ```
 */
export class OAuth2AuthProvider extends GoogleService implements AuthProvider {
  public readonly authType: AuthProviderType = 'oauth2';

  private oauth2Client?: OAuth2Client;
  private tokenStorage: TokenStorage;
  private config: OAuth2Config;
  private initializingPromise?: Promise<GoogleWorkspaceResult<void>>;
  private authFlowPromise?: Promise<OAuth2Client>;

  /**
   * Initialize OAuth2AuthProvider.
   *
   * @param config - OAuth2 configuration with client credentials and scopes
   * @param tokenStorage - Optional token storage service (creates default if not provided)
   * @param logger - Optional logger instance
   */
  constructor(
    config: OAuth2Config,
    tokenStorage?: TokenStorage,
    logger?: Logger
  ) {
    // Create a placeholder OAuth2Client for GoogleService constructor
    // This will be replaced with the properly configured client during initialization
    const placeholderClient = new OAuth2Client();

    super(placeholderClient, logger || (console as unknown as Logger));

    this.config = this.validateConfig(config);
    this.tokenStorage = tokenStorage || new TokenStorageService({} as any); // Will be created properly in initialize()
  }

  /**
   * Get the service name for logging and error handling.
   * @returns Service name identifier
   */
  public getServiceName(): string {
    return 'OAuth2AuthProvider';
  }

  /**
   * Get the service version.
   * @returns Service version string
   */
  public getServiceVersion(): string {
    return '1.0.0';
  }

  /**
   * Initialize the OAuth2 authentication provider.
   *
   * Sets up OAuth2Client, checks for existing tokens, and prepares
   * for authentication flow. Uses concurrent initialization prevention
   * following the SheetsService pattern.
   *
   * @returns Promise resolving to success or error result
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    // Prevent concurrent initialization attempts
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    // Fast path: if already initialized, return immediately
    if (this.oauth2Client && this.isConfigured(this.oauth2Client)) {
      return googleOk(undefined);
    }

    // Start initialization
    this.initializingPromise = this.performInitialization();

    try {
      const result = await this.initializingPromise;

      // Clear the promise on success
      if (result.isOk()) {
        this.initializingPromise = undefined;
      }

      return result;
    } catch (error) {
      // Clear the promise on error to allow re-initialization
      this.initializingPromise = undefined;
      throw error;
    }
  }

  /**
   * Get an authenticated OAuth2 client for API calls.
   *
   * Returns an authenticated client ready for Google API calls.
   * May trigger user authentication flow if no valid tokens exist.
   *
   * @returns Promise resolving to authenticated client or error
   */
  public async getAuthClient(): Promise<GoogleAuthResult<OAuth2Client>> {
    // Ensure provider is initialized
    const initResult = await this.initialize();
    if (initResult.isErr()) {
      return authErr(this.convertAuthError(initResult.error));
    }

    if (!this.oauth2Client) {
      return authErr(
        new GoogleServiceError(
          'OAuth2Client not initialized',
          this.getServiceName(),
          'OAUTH2_CLIENT_NOT_INITIALIZED',
          500,
          { operation: 'getAuthClient' }
        ) as any
      );
    }

    // Check if we have valid credentials
    const validationResult = await this.validateAuth();
    if (validationResult.isErr()) {
      return authErr(validationResult.error);
    }

    if (validationResult.value) {
      // We have valid authentication
      return authOk(this.oauth2Client);
    }

    // Need to perform authentication flow
    try {
      const authenticatedClient = await this.performAuthFlow();
      return authOk(authenticatedClient);
    } catch (error) {
      return authErr(this.convertAuthError(error));
    }
  }

  /**
   * Validate current authentication status.
   *
   * Checks if the provider has valid credentials and can make
   * authenticated requests, including token expiration checks.
   *
   * @returns Promise resolving to validation result
   */
  public async validateAuth(): Promise<GoogleAuthResult<boolean>> {
    if (!this.oauth2Client) {
      return authOk(false);
    }

    try {
      // Check if we have stored credentials
      const credentials = this.oauth2Client.credentials;
      if (!credentials.access_token) {
        return authOk(false);
      }

      // Check token expiration
      if (credentials.expiry_date && credentials.expiry_date <= Date.now()) {
        // Token is expired, try to refresh
        if (credentials.refresh_token) {
          try {
            await this.oauth2Client.refreshAccessToken();
            await this.saveCurrentTokens();
            return authOk(true);
          } catch (refreshError) {
            // Refresh failed
            return authOk(false);
          }
        } else {
          // No refresh token available
          return authOk(false);
        }
      }

      return authOk(true);
    } catch (error) {
      return authErr(this.convertAuthError(error));
    }
  }

  /**
   * Refresh authentication tokens if supported and necessary.
   *
   * Refreshes access token using refresh token if available.
   *
   * @returns Promise resolving to refresh result
   */
  public async refreshToken(): Promise<GoogleAuthResult<void>> {
    if (!this.oauth2Client) {
      return authErr(
        new GoogleServiceError(
          'OAuth2Client not initialized',
          this.getServiceName(),
          'OAUTH2_CLIENT_NOT_INITIALIZED',
          500,
          { operation: 'refreshToken' }
        ) as any
      );
    }

    const credentials = this.oauth2Client.credentials;
    if (!credentials.refresh_token) {
      return authErr(
        new GoogleOAuth2RefreshTokenExpiredError({
          operation: 'refreshToken',
          clientId: this.config.clientId,
        })
      );
    }

    try {
      const response = await this.oauth2Client.refreshAccessToken();
      this.oauth2Client.setCredentials(response.credentials);

      // Save refreshed tokens
      await this.saveCurrentTokens();

      this.logger.info('OAuth2 tokens refreshed successfully', {
        service: this.getServiceName(),
        operation: 'refreshToken',
        expiresAt: response.credentials.expiry_date
          ? new Date(response.credentials.expiry_date)
          : undefined,
      });

      return authOk(undefined);
    } catch (error) {
      const refreshError = new GoogleOAuth2RefreshTokenExpiredError({
        operation: 'refreshToken',
        clientId: this.config.clientId,
        error: error instanceof Error ? error.message : String(error),
      });

      this.logger.error('Failed to refresh OAuth2 tokens', {
        service: this.getServiceName(),
        operation: 'refreshToken',
        error: refreshError.message,
      });

      return authErr(refreshError);
    }
  }

  /**
   * Get authentication information and metadata.
   *
   * Returns details about the current authentication state including
   * authentication type, user information, token expiration, and scopes.
   *
   * @returns Promise resolving to authentication information
   */
  public async getAuthInfo(): Promise<GoogleAuthResult<AuthInfo>> {
    if (!this.oauth2Client) {
      return authErr(
        new GoogleServiceError(
          'OAuth2Client not initialized',
          this.getServiceName(),
          'OAUTH2_CLIENT_NOT_INITIALIZED',
          500,
          { operation: 'getAuthInfo' }
        ) as any
      );
    }

    try {
      const credentials = this.oauth2Client.credentials;
      const expiresAt = credentials.expiry_date
        ? new Date(credentials.expiry_date)
        : undefined;
      const scopes = credentials.scope
        ? credentials.scope.split(' ')
        : this.config.scopes;

      // Try to get user info if we have valid credentials
      let userInfo: any = undefined;
      if (credentials.access_token) {
        try {
          // This would require making an API call to get user info
          // For now, we'll leave it undefined to avoid extra API calls
          userInfo = undefined;
        } catch {
          // Ignore errors getting user info
        }
      }

      const authInfo: AuthInfo = {
        isAuthenticated: !!credentials.access_token,
        keyFile: this.config.clientId, // Use client ID as the key file identifier for OAuth2
        scopes,
        tokenInfo: credentials.access_token
          ? {
              expiresAt,
              hasToken: true,
            }
          : undefined,
      };

      return authOk(authInfo);
    } catch (error) {
      return authErr(this.convertAuthError(error));
    }
  }

  /**
   * Perform health check on the authentication provider.
   *
   * Verifies that the provider is in a healthy state and ready
   * to handle requests. Used by ServiceRegistry for monitoring.
   *
   * @returns Promise resolving to health status
   */
  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    try {
      // Check if provider is initialized
      if (!this.oauth2Client) {
        return googleOk(false);
      }

      // Check if token storage is accessible
      const hasTokens = await this.tokenStorage.hasTokens();

      // Provider is healthy if it's initialized and token storage is accessible
      return googleOk(true);
    } catch (error) {
      this.logger.error('OAuth2AuthProvider health check failed', {
        service: this.getServiceName(),
        operation: 'healthCheck',
        error: error instanceof Error ? error.message : String(error),
      });

      return googleOk(false);
    }
  }

  /**
   * Perform the actual initialization logic.
   * @private
   */
  private async performInitialization(): Promise<GoogleWorkspaceResult<void>> {
    const context = this.createContext('initialize');

    // Create OAuth2Client outside of retry logic to prevent duplication
    // Only create if not properly configured (replaces placeholder from constructor)
    if (!this.oauth2Client || !this.isConfigured(this.oauth2Client)) {
      this.oauth2Client = new OAuth2Client({
        clientId: this.config.clientId,
        clientSecret: this.config.clientSecret,
        redirectUri: this.config.redirectUri,
      });
    }

    return this.executeWithRetry(async () => {
      // Create token storage if not provided
      if (
        !this.tokenStorage ||
        typeof this.tokenStorage.hasTokens !== 'function'
      ) {
        this.tokenStorage = await TokenStorageService.create();
      }

      // Set up token refresh handlers (safe to call multiple times)
      this.setupTokenRefreshHandlers();

      // Try to load existing tokens
      await this.loadStoredTokens();

      this.logger.info('OAuth2AuthProvider initialized successfully', {
        service: this.getServiceName(),
        operation: 'initialize',
        clientId: this.config.clientId,
        scopes: this.config.scopes,
        hasStoredTokens: !!this.oauth2Client!.credentials.access_token,
      });

      return undefined;
    }, context);
  }

  /**
   * Check if OAuth2Client is properly configured.
   * @private
   */
  private isConfigured(client: OAuth2Client): boolean {
    return !!(
      client._clientId &&
      client._clientSecret &&
      (client as any).redirectUri
    );
  }

  /**
   * Validate OAuth2 configuration.
   * @private
   */
  private validateConfig(config: OAuth2Config): OAuth2Config {
    if (!config.clientId || typeof config.clientId !== 'string') {
      throw new Error(
        'OAuth2Config: clientId is required and must be a string'
      );
    }

    if (!config.clientSecret || typeof config.clientSecret !== 'string') {
      throw new Error(
        'OAuth2Config: clientSecret is required and must be a string'
      );
    }

    if (!config.redirectUri || typeof config.redirectUri !== 'string') {
      throw new Error(
        'OAuth2Config: redirectUri is required and must be a string'
      );
    }

    if (!Array.isArray(config.scopes) || config.scopes.length === 0) {
      throw new Error(
        'OAuth2Config: scopes is required and must be a non-empty array'
      );
    }

    // Validate redirect URI format
    try {
      new URL(config.redirectUri);
    } catch {
      throw new Error('OAuth2Config: redirectUri must be a valid URL');
    }

    return {
      ...config,
      port: config.port || 3000, // Default port
    };
  }

  /**
   * Set up automatic token refresh handlers.
   * @private
   */
  private setupTokenRefreshHandlers(): void {
    if (!this.oauth2Client) return;

    // Listen for token refresh events
    this.oauth2Client.on('tokens', async tokens => {
      this.logger.info('OAuth2 tokens updated', {
        service: this.getServiceName(),
        operation: 'tokenRefresh',
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      });

      // Save updated tokens
      try {
        await this.saveCurrentTokens();
      } catch (error) {
        this.logger.error('Failed to save refreshed tokens', {
          service: this.getServiceName(),
          operation: 'tokenRefresh',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  /**
   * Load stored tokens from TokenStorage.
   * @private
   */
  private async loadStoredTokens(): Promise<void> {
    try {
      const storedCredentials = await this.tokenStorage.getTokens();
      if (storedCredentials && this.oauth2Client) {
        // Verify the tokens are for the same client
        if (storedCredentials.clientConfig.clientId === this.config.clientId) {
          this.oauth2Client.setCredentials(storedCredentials.tokens);

          this.logger.info('Loaded stored OAuth2 tokens', {
            service: this.getServiceName(),
            operation: 'loadStoredTokens',
            hasAccessToken: !!storedCredentials.tokens.access_token,
            hasRefreshToken: !!storedCredentials.tokens.refresh_token,
            storedAt: new Date(storedCredentials.storedAt),
          });
        } else {
          this.logger.warn('Stored tokens are for different client, ignoring', {
            service: this.getServiceName(),
            operation: 'loadStoredTokens',
            storedClientId: storedCredentials.clientConfig.clientId,
            currentClientId: this.config.clientId,
          });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load stored tokens', {
        service: this.getServiceName(),
        operation: 'loadStoredTokens',
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - missing tokens just means we need to authenticate
    }
  }

  /**
   * Save current tokens to storage.
   * @private
   */
  private async saveCurrentTokens(): Promise<void> {
    if (!this.oauth2Client?.credentials.access_token) {
      return;
    }

    const credentials: OAuth2StoredCredentials = {
      tokens: this.oauth2Client.credentials as any, // OAuth2Client credentials are compatible
      clientConfig: {
        clientId: this.config.clientId,
        scopes: this.config.scopes,
      },
      storedAt: Date.now(),
    };

    try {
      await this.tokenStorage.saveTokens(credentials);

      this.logger.debug('Saved OAuth2 tokens to storage', {
        service: this.getServiceName(),
        operation: 'saveCurrentTokens',
        hasAccessToken: !!credentials.tokens.access_token,
        hasRefreshToken: !!credentials.tokens.refresh_token,
      });
    } catch (error) {
      throw new GoogleOAuth2TokenStorageError(
        'save',
        error instanceof Error ? error : new Error(String(error)),
        {
          operation: 'saveCurrentTokens',
          clientId: this.config.clientId,
        }
      );
    }
  }

  /**
   * Perform the complete OAuth2 authorization flow.
   * @private
   */
  private async performAuthFlow(): Promise<OAuth2Client> {
    // Prevent concurrent auth flows
    if (this.authFlowPromise) {
      return this.authFlowPromise;
    }

    this.authFlowPromise = this.executeAuthFlow();

    try {
      const result = await this.authFlowPromise;
      this.authFlowPromise = undefined;
      return result;
    } catch (error) {
      this.authFlowPromise = undefined;
      throw error;
    }
  }

  /**
   * Execute the OAuth2 authorization flow.
   * @private
   */
  private async executeAuthFlow(): Promise<OAuth2Client> {
    if (!this.oauth2Client) {
      throw new GoogleServiceError(
        'OAuth2Client not initialized',
        this.getServiceName(),
        'OAUTH2_CLIENT_NOT_INITIALIZED',
        500,
        { operation: 'executeAuthFlow' }
      );
    }

    // Generate CSRF protection state (allow test override)
    const state = (process.env.NODE_ENV === 'test' && process.env.TEST_OAUTH_STATE) 
      ? process.env.TEST_OAUTH_STATE 
      : randomBytes(32).toString('hex');
    const authFlowState: AuthFlowState = {
      state,
      redirectUri: this.config.redirectUri,
      scopes: this.config.scopes,
    };

    // Generate authorization URL
    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Required for refresh token
      scope: this.config.scopes,
      state,
      prompt: 'consent', // Force consent screen to ensure refresh token
    });

    this.logger.info('Starting OAuth2 authorization flow', {
      service: this.getServiceName(),
      operation: 'executeAuthFlow',
      authUrl,
      state,
      scopes: this.config.scopes,
    });

    // Start callback server
    const callbackServer = await this.startCallbackServer();

    try {
      // Open browser for user authentication
      await this.openBrowserForAuth(authUrl);

      // Wait for callback with timeout
      const timeoutMs = process.env.NODE_ENV === 'test' ? 5000 : 300000; // 5s in test, 5min in prod
      const authCode = await this.waitForAuthCallback(
        callbackServer,
        authFlowState,
        timeoutMs
      );

      // Exchange authorization code for tokens
      const { tokens } = await this.oauth2Client.getToken(authCode);
      this.oauth2Client.setCredentials(tokens);

      // Save tokens
      await this.saveCurrentTokens();

      this.logger.info('OAuth2 authorization flow completed successfully', {
        service: this.getServiceName(),
        operation: 'executeAuthFlow',
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresAt: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : undefined,
      });

      return this.oauth2Client;
    } finally {
      // Always cleanup the callback server
      if (callbackServer.server.destroy) {
        callbackServer.server.destroy();
      } else {
        callbackServer.server.close();
      }
    }
  }

  /**
   * Start local HTTP server for OAuth2 callback.
   * @private
   */
  private async startCallbackServer(): Promise<OAuth2CallbackServer> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400);
          res.end('Bad Request: No URL');
          return;
        }

        const url = new URL(req.url, `http://localhost:${this.config.port}`);

        if (
          url.pathname === '/oauth2callback' ||
          url.pathname === new URL(this.config.redirectUri).pathname
        ) {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');
          const state = url.searchParams.get('state');

          // Store the result on the callbackServer wrapper object
          // Find the wrapper object that contains this server
          const callbackServer = (server as any)._callbackServer;
          if (callbackServer) {
            callbackServer.authorizationCode = code || undefined;
            callbackServer.error = error || undefined;
            callbackServer.state = state || undefined;
          }

          // Send response to user
          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Authorization Failed</title></head>
                <body>
                  <h1>Authorization Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this tab and try again.</p>
                </body>
              </html>
            `);
          } else if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Authorization Successful</title></head>
                <body>
                  <h1>Authorization Successful</h1>
                  <p>You have successfully authorized the application.</p>
                  <p>You can close this tab and return to the application.</p>
                </body>
              </html>
            `);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(`
              <html>
                <head><title>Authorization Error</title></head>
                <body>
                  <h1>Authorization Error</h1>
                  <p>No authorization code received.</p>
                  <p>You can close this tab and try again.</p>
                </body>
              </html>
            `);
          }
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      // Add server destroy functionality
      enableDestroy(server);

      server.listen(this.config.port, 'localhost', () => {
        const callbackServer: OAuth2CallbackServer = {
          server: server as any,
          port: this.config.port!,
        };

        // Store reference to wrapper for HTTP handler to use
        (server as any)._callbackServer = callbackServer;

        resolve(callbackServer);
      });

      server.on('error', error => {
        reject(
          new GoogleOAuth2NetworkError(
            `Failed to start callback server on port ${this.config.port}`,
            error,
            { port: this.config.port, operation: 'startCallbackServer' }
          )
        );
      });
    });
  }

  /**
   * Open browser for user authentication.
   * @private
   */
  private async openBrowserForAuth(authUrl: string): Promise<void> {
    // Skip browser opening in test environment
    if (process.env.NODE_ENV === 'test') {
      this.logger.info('Skipping browser opening in test environment', {
        service: this.getServiceName(),
        operation: 'openBrowserForAuth',
        authUrl,
      });
      return;
    }

    try {
      this.logger.info('Opening browser for OAuth2 authorization', {
        service: this.getServiceName(),
        operation: 'openBrowserForAuth',
        authUrl,
      });

      // Use dynamic import to handle ES module in tests
      try {
        const { default: open } = await import('open');
        await open(authUrl);
      } catch (importError) {
        // If dynamic import fails (e.g., in tests), just log the URL
        throw new Error(`Could not open browser: ${importError}`);
      }
    } catch (error) {
      // If browser opening fails, we still want to continue
      // The user can manually copy the URL
      this.logger.warn('Failed to open browser automatically', {
        service: this.getServiceName(),
        operation: 'openBrowserForAuth',
        error: error instanceof Error ? error.message : String(error),
        authUrl,
      });

      // Log the URL for manual copying
      console.log(
        '\nPlease open the following URL in your browser to authorize the application:'
      );
      console.log(authUrl);
      console.log('');
    }
  }

  /**
   * Wait for OAuth2 callback with timeout.
   * @private
   */
  private async waitForAuthCallback(
    callbackServer: OAuth2CallbackServer,
    authFlowState: AuthFlowState,
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let timeout: NodeJS.Timeout | undefined;
      let pollInterval: NodeJS.Timeout | undefined;

      const cleanup = () => {
        if (timeout) {
          clearTimeout(timeout);
          timeout = undefined;
        }
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = undefined;
        }
      };

      timeout = setTimeout(() => {
        cleanup();
        reject(
          new GoogleOAuth2NetworkError(
            `Authorization timeout after ${timeoutMs}ms`,
            undefined,
            {
              operation: 'waitForAuthCallback',
              timeoutMs,
              state: authFlowState.state,
            }
          )
        );
      }, timeoutMs);

      // Poll for callback results
      pollInterval = setInterval(() => {
        const serverError = callbackServer.error;
        const serverCode = callbackServer.authorizationCode;
        const serverState = callbackServer.state;

        if (serverError) {
          cleanup();

          if (serverError === 'access_denied') {
            reject(
              new GoogleOAuth2UserDeniedError({
                operation: 'waitForAuthCallback',
                redirectUri: authFlowState.redirectUri,
                scopes: authFlowState.scopes,
              })
            );
          } else {
            reject(
              new GoogleOAuth2NetworkError(
                `Authorization error: ${serverError}`,
                undefined,
                {
                  operation: 'waitForAuthCallback',
                  error: serverError,
                  state: serverState,
                }
              )
            );
          }
          return;
        }

        if (serverCode) {
          cleanup();

          // Verify state parameter for CSRF protection
          if (serverState !== authFlowState.state) {
            reject(
              new GoogleOAuth2NetworkError(
                'State parameter mismatch - possible CSRF attack',
                undefined,
                {
                  operation: 'waitForAuthCallback',
                  expectedState: authFlowState.state,
                  receivedState: serverState,
                }
              )
            );
            return;
          }

          resolve(serverCode);
        }
      }, 100); // Poll every 100ms
    });
  }

  /**
   * Convert generic errors to appropriate OAuth2 error types.
   * @private
   */
  private convertAuthError(error: unknown): GoogleOAuth2Error {
    if (error instanceof GoogleOAuth2Error) {
      return error;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error ? error : new Error(String(error));

    // Check for specific error patterns
    if (
      errorMessage.includes('refresh token') ||
      errorMessage.includes('invalid_grant')
    ) {
      return new GoogleOAuth2RefreshTokenExpiredError({
        operation: 'convertAuthError',
        originalError: errorMessage,
      });
    }

    if (
      errorMessage.includes('access_denied') ||
      errorMessage.includes('user denied')
    ) {
      return new GoogleOAuth2UserDeniedError({
        operation: 'convertAuthError',
        originalError: errorMessage,
      });
    }

    if (
      errorMessage.includes('network') ||
      errorMessage.includes('ECONNREFUSED') ||
      errorMessage.includes('timeout')
    ) {
      return new GoogleOAuth2NetworkError(errorMessage, cause, {
        operation: 'convertAuthError',
      });
    }

    // Default to generic OAuth2 error
    return new GoogleOAuth2Error(
      errorMessage,
      'GOOGLE_OAUTH2_ERROR',
      401,
      {
        operation: 'convertAuthError',
      },
      cause
    );
  }
}
