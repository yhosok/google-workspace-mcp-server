/**
 * @fileoverview AuthProvider interface for unified authentication abstraction.
 * This interface enables support for both Service Account and OAuth2 authentication methods.
 */

import type { OAuth2Client } from 'google-auth-library';
import type {
  GoogleWorkspaceResult,
  GoogleAuthResult,
} from '../../errors/index.js';
import type { AuthInfo } from '../../types/index.js';

/**
 * Authentication provider types supported by the system.
 */
export type AuthProviderType = 'service-account' | 'oauth2';

/**
 * Base interface for all authentication providers.
 * Provides a unified API for different authentication methods while maintaining
 * compatibility with the existing service architecture.
 *
 * All methods return Result types following the existing error handling patterns,
 * ensuring consistent error propagation throughout the application.
 */
export interface AuthProvider {
  /**
   * The type of authentication provider.
   * Used for provider selection and configuration validation.
   */
  readonly authType: AuthProviderType;

  /**
   * Initialize the authentication provider.
   *
   * For Service Account: Validates key file and creates GoogleAuth instance.
   * For OAuth2: Sets up OAuth2Client and checks for stored tokens.
   *
   * @returns Promise resolving to success or error result
   *
   * @example
   * ```typescript
   * const result = await provider.initialize();
   * if (result.isErr()) {
   *   console.error('Initialization failed:', result.error.message);
   * }
   * ```
   */
  initialize(): Promise<GoogleWorkspaceResult<void>>;

  /**
   * Get an authenticated OAuth2 client for API calls.
   *
   * This is the primary method used by services to obtain authentication.
   * The returned client is ready to make authenticated requests to Google APIs.
   *
   * For OAuth2 providers, may trigger user authentication flow if no valid tokens exist.
   *
   * @returns Promise resolving to authenticated client or error
   *
   * @example
   * ```typescript
   * const clientResult = await provider.getAuthClient();
   * if (clientResult.isOk()) {
   *   const response = await clientResult.value.fetch(url);
   * }
   * ```
   */
  getAuthClient(): Promise<GoogleAuthResult<OAuth2Client>>;

  /**
   * Validate current authentication status.
   *
   * Checks if the provider has valid credentials and can make authenticated requests.
   * For token-based authentication, this includes checking token expiration.
   *
   * @returns Promise resolving to validation result
   *
   * @example
   * ```typescript
   * const validResult = await provider.validateAuth();
   * if (validResult.isOk() && validResult.value) {
   *   // Authentication is valid
   * }
   * ```
   */
  validateAuth(): Promise<GoogleAuthResult<boolean>>;

  /**
   * Refresh authentication tokens if supported and necessary.
   *
   * For Service Account: No-op as service accounts don't require token refresh.
   * For OAuth2: Refreshes access token using refresh token if available.
   *
   * @returns Promise resolving to refresh result
   *
   * @example
   * ```typescript
   * const refreshResult = await provider.refreshToken();
   * if (refreshResult.isErr()) {
   *   // May need to re-authenticate
   * }
   * ```
   */
  refreshToken(): Promise<GoogleAuthResult<void>>;

  /**
   * Get authentication information and metadata.
   *
   * Returns details about the current authentication state, including:
   * - Authentication type
   * - User/service account information
   * - Token expiration (if applicable)
   * - Granted scopes
   *
   * @returns Promise resolving to authentication information
   *
   * @example
   * ```typescript
   * const infoResult = await provider.getAuthInfo();
   * if (infoResult.isOk()) {
   *   console.log('Auth type:', infoResult.value.type);
   *   console.log('Scopes:', infoResult.value.scopes);
   * }
   * ```
   */
  getAuthInfo(): Promise<GoogleAuthResult<AuthInfo>>;

  /**
   * Perform health check on the authentication provider.
   *
   * Verifies that the provider is in a healthy state and ready to handle requests.
   * This is used by the ServiceRegistry for monitoring and diagnostics.
   *
   * @returns Promise resolving to health status
   *
   * @example
   * ```typescript
   * const healthResult = await provider.healthCheck();
   * if (healthResult.isOk() && healthResult.value) {
   *   // Provider is healthy
   * }
   * ```
   */
  healthCheck(): Promise<GoogleWorkspaceResult<boolean>>;
}
