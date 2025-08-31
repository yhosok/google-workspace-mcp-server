/**
 * @fileoverview OAuth2 authentication type definitions.
 * These types support the OAuth2 authentication provider implementation.
 */

import type { OAuth2Client } from 'google-auth-library';

/**
 * OAuth2 configuration parameters required for authentication.
 *
 * Google OAuth2 requires both client ID and client secret for all applications.
 * PKCE (Proof Key for Code Exchange) is used for enhanced security in addition to the client secret.
 */
export interface OAuth2Config {
  /** Google OAuth2 client ID */
  readonly clientId: string;
  /**
   * Google OAuth2 client secret (required for all OAuth2 flows).
   * Google OAuth2 specification requires client secret for authentication.
   */
  readonly clientSecret: string;
  /** OAuth2 redirect URI for callback (default: http://localhost:3000/oauth2callback) */
  readonly redirectUri?: string;
  /** OAuth2 scopes to request */
  readonly scopes: string[];
  /** Optional port for local callback server (default: 3000) */
  readonly port?: number;
}

/**
 * OAuth2 token information returned from Google.
 */
export interface OAuth2Token {
  /** Access token for API calls */
  readonly access_token: string;
  /** Refresh token for obtaining new access tokens */
  readonly refresh_token?: string;
  /** ID token containing user information */
  readonly id_token?: string;
  /** Token expiration time in milliseconds since epoch */
  readonly expiry_date?: number;
  /** Token type (typically 'Bearer') */
  readonly token_type?: string;
  /** Scope granted by the user */
  readonly scope?: string;
}

/**
 * Stored OAuth2 credentials with metadata.
 */
export interface OAuth2StoredCredentials {
  /** OAuth2 tokens */
  readonly tokens: OAuth2Token;
  /** Client configuration used to obtain tokens */
  readonly clientConfig: Pick<OAuth2Config, 'clientId' | 'scopes'>;
  /** Timestamp when tokens were stored */
  readonly storedAt: number;
  /** User identifier or email (if available) */
  readonly userId?: string;
}

/**
 * OAuth2 authentication flow state during authorization.
 */
export interface OAuth2AuthState {
  /** Authorization URL generated for user consent */
  readonly authUrl: string;
  /** Local server port for callback */
  readonly port: number;
  /** State parameter for CSRF protection */
  readonly state: string;
  /** Challenge verifier for PKCE (if implemented) */
  readonly codeVerifier?: string;
}

/**
 * Token storage interface for secure credential persistence.
 */
export interface TokenStorage {
  /**
   * Save OAuth2 credentials securely.
   * @param credentials - The credentials to store
   * @returns Promise resolving when storage completes
   */
  saveTokens(credentials: OAuth2StoredCredentials): Promise<void>;

  /**
   * Retrieve stored OAuth2 credentials.
   * @returns Promise resolving to stored credentials or null if none found
   */
  getTokens(): Promise<OAuth2StoredCredentials | null>;

  /**
   * Delete stored OAuth2 credentials.
   * @returns Promise resolving when deletion completes
   */
  deleteTokens(): Promise<void>;

  /**
   * Check if tokens exist in storage.
   * @returns Promise resolving to true if tokens exist
   */
  hasTokens(): Promise<boolean>;
}

/**
 * Keytar dependency interface for secure credential storage.
 */
export interface KeytarDependency {
  setPassword(
    service: string,
    account: string,
    password: string
  ): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<boolean>;
  findCredentials(
    service: string
  ): Promise<Array<{ account: string; password: string }>>;
}

/**
 * File system dependency interface.
 */
export interface FileSystemDependency {
  promises: {
    writeFile(
      file: string,
      data: string,
      options?: { mode?: number; flag?: string }
    ): Promise<void>;
    readFile(file: string, encoding?: string): Promise<string>;
    unlink(file: string): Promise<void>;
    access(file: string): Promise<void>;
    mkdir(dir: string, options?: { recursive?: boolean }): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
  };
}

/**
 * Crypto dependency interface for encryption/decryption.
 */
export interface CryptoDependency {
  createCipher(
    algorithm: string,
    key: string
  ): {
    update(data: string, inputEncoding: string, outputEncoding: string): string;
    final(outputEncoding: string): string;
  };
  createDecipher(
    algorithm: string,
    key: string
  ): {
    update(data: string, inputEncoding: string, outputEncoding: string): string;
    final(outputEncoding: string): string;
  };
  randomBytes(size: number): Buffer;
}

/**
 * Dependencies required by TokenStorageService.
 */
export interface TokenStorageDependencies {
  keytar: KeytarDependency;
  fs: FileSystemDependency;
  crypto: CryptoDependency;
}

/**
 * OAuth2 authentication provider context for operations.
 */
export interface OAuth2Context {
  /** Client configuration */
  readonly config: OAuth2Config;
  /** Token storage instance */
  readonly tokenStorage: TokenStorage;
  /** Authenticated OAuth2 client (available after initialization) */
  readonly client?: OAuth2Client;
}
