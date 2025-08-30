/**
 * @fileoverview PKCE (Proof Key for Code Exchange) utilities for OAuth2 security.
 *
 * Implements RFC 7636 PKCE specification for OAuth2 authorization code flow.
 * Provides cryptographically secure code verifier generation and SHA256-based
 * code challenge creation with base64url encoding.
 *
 * Features:
 * - RFC 7636 compliant PKCE implementation
 * - Cryptographically secure random generation using Node.js crypto
 * - Base64url encoding (URL-safe, no padding)
 * - Comprehensive error handling with Result types
 * - Integration with existing authentication error patterns
 */

import {
  GoogleAuthResult,
  authOk,
  authErr,
  GoogleOAuth2Error,
} from '../../errors/index.js';
import { cryptoAdapter, CryptoOperations } from './crypto-adapter.js';

/**
 * Convert buffer to base64url encoding (URL-safe, no padding).
 * Following RFC 4648 Section 5 for base64url encoding.
 *
 * @param buffer - Buffer to encode
 * @returns base64url encoded string
 * @internal
 */
const toBase64Url = (buffer: Buffer): string => {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-') // Replace + with -
    .replace(/\//g, '_') // Replace / with _
    .replace(/=/g, ''); // Remove padding
};

/**
 * Generate a cryptographically secure PKCE code verifier.
 *
 * Creates a high-entropy random string following RFC 7636 specification:
 * - Uses crypto.randomBytes(32) for cryptographic security
 * - Produces 43-character base64url encoded string
 * - Uses only unreserved characters: [A-Za-z0-9_-]
 *
 * @param crypto - Optional crypto operations for testing (uses cryptoAdapter by default)
 * @returns Result containing 43-character code verifier or OAuth2 error
 *
 * @example
 * ```typescript
 * const result = generateCodeVerifier();
 * if (result.isOk()) {
 *   const verifier = result.value; // 43-character string
 *   console.log('Code verifier:', verifier);
 * } else {
 *   console.error('Failed to generate verifier:', result.error.message);
 * }
 * ```
 */
export function generateCodeVerifier(
  crypto: CryptoOperations = cryptoAdapter
): GoogleAuthResult<string> {
  try {
    // Generate 32 cryptographically secure random bytes
    // 32 bytes = 256 bits of entropy (recommended by RFC 7636)
    const buffer = crypto.randomBytes(32);

    // Convert to base64url encoding (43 characters)
    const codeVerifier = toBase64Url(buffer);

    return authOk(codeVerifier);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown crypto error';
    return authErr(
      new GoogleOAuth2Error(
        `Failed to generate PKCE code verifier: ${message}`,
        'GOOGLE_OAUTH2_PKCE_VERIFIER_GENERATION_ERROR',
        500,
        { operation: 'generateCodeVerifier' },
        error instanceof Error ? error : undefined
      )
    );
  }
}

/**
 * Generate a PKCE code challenge from a code verifier.
 *
 * Creates SHA256 hash of the verifier following RFC 7636 specification:
 * - Validates input verifier format
 * - Creates SHA256 hash of ASCII-encoded verifier
 * - Encodes hash as base64url (43 characters)
 *
 * @param verifier - Code verifier string to hash
 * @param crypto - Optional crypto operations for testing (uses cryptoAdapter by default)
 * @returns Result containing 43-character code challenge or OAuth2 error
 *
 * @example
 * ```typescript
 * const challengeResult = generateCodeChallenge('my-code-verifier-123');
 * if (challengeResult.isOk()) {
 *   const challenge = challengeResult.value; // 43-character hash
 *   console.log('Code challenge:', challenge);
 * } else {
 *   console.error('Failed to generate challenge:', challengeResult.error.message);
 * }
 * ```
 */
export function generateCodeChallenge(
  verifier: string,
  crypto: CryptoOperations = cryptoAdapter
): GoogleAuthResult<string> {
  // Validate input verifier
  if (!verifier || typeof verifier !== 'string') {
    return authErr(
      new GoogleOAuth2Error(
        'Code verifier must be a non-empty string',
        'GOOGLE_OAUTH2_PKCE_INVALID_VERIFIER',
        400,
        { verifier: verifier ? '[hidden]' : verifier }
      )
    );
  }

  // Validate verifier format (base64url characters only)
  if (!/^[A-Za-z0-9_-]+$/.test(verifier)) {
    return authErr(
      new GoogleOAuth2Error(
        'Code verifier contains invalid characters. Must use base64url encoding: [A-Za-z0-9_-]',
        'GOOGLE_OAUTH2_PKCE_INVALID_VERIFIER_FORMAT',
        400,
        { verifierLength: verifier.length }
      )
    );
  }

  try {
    // Create SHA256 hash of ASCII-encoded verifier
    const hash = crypto.createHash('sha256');
    hash.update(verifier, 'ascii');
    const hashBuffer = hash.digest();

    // Convert hash to base64url encoding (43 characters)
    const codeChallenge = toBase64Url(hashBuffer);

    return authOk(codeChallenge);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown hash error';
    return authErr(
      new GoogleOAuth2Error(
        `Failed to generate PKCE code challenge: ${message}`,
        'GOOGLE_OAUTH2_PKCE_CHALLENGE_GENERATION_ERROR',
        500,
        {
          operation: 'generateCodeChallenge',
          verifierLength: verifier.length,
        },
        error instanceof Error ? error : undefined
      )
    );
  }
}
