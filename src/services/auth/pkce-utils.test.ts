/**
 * @fileoverview Test suite for PKCE (Proof Key for Code Exchange) utilities.
 *
 * Tests PKCE implementation following RFC 7636 specification for OAuth2 security.
 * Includes code verifier generation, code challenge generation, and validation.
 */

import { generateCodeVerifier, generateCodeChallenge } from './pkce-utils.js';
import { CryptoOperations } from './crypto-adapter.js';
import {
  GoogleServiceError,
  GoogleOAuth2Error,
  googleOk,
  googleErr,
} from '../../errors/index.js';

// Helper functions for testing Result types
const expectOkValue = <T>(result: any, expectedValue?: T) => {
  expect(result.isOk()).toBe(true);
  if (result.isOk() && expectedValue !== undefined) {
    expect(result.value).toEqual(expectedValue);
  }
  return result.isOk() ? result.value : undefined;
};

const expectErrType = (result: any, ErrorType: any) => {
  expect(result.isErr()).toBe(true);
  if (result.isErr()) {
    expect(result.error).toBeInstanceOf(ErrorType);
  }
};

const getOkValue = <T>(result: any): T => {
  expect(result.isOk()).toBe(true);
  if (result.isOk()) {
    return result.value as T;
  }
  throw new Error('Expected Ok result but got Err');
};

describe('PKCE Utils', () => {
  describe('generateCodeVerifier', () => {
    it('should generate a 43-character base64url-encoded verifier', () => {
      const result = generateCodeVerifier();

      const verifier = getOkValue<string>(result);
      expect(verifier).toHaveLength(43);
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/); // base64url pattern
    });

    it('should generate unique verifiers on multiple calls', () => {
      const result1 = generateCodeVerifier();
      const result2 = generateCodeVerifier();

      const verifier1 = getOkValue<string>(result1);
      const verifier2 = getOkValue<string>(result2);

      expect(verifier1).not.toEqual(verifier2);
    });

    it('should use cryptographically secure randomness', () => {
      const verifiers = new Set<string>();

      // Generate 100 verifiers to check for collisions
      for (let i = 0; i < 100; i++) {
        const result = generateCodeVerifier();
        const verifier = getOkValue<string>(result);
        verifiers.add(verifier);
      }

      // Should have 100 unique verifiers (no collisions)
      expect(verifiers.size).toBe(100);
    });

    it('should return error when crypto operations fail', () => {
      // Create mock crypto operations that fail
      const mockCrypto: CryptoOperations = {
        randomBytes: jest.fn().mockImplementation(() => {
          throw new Error('Crypto operation failed');
        }),
        createHash: jest.fn(),
      };

      const result = generateCodeVerifier(mockCrypto);
      expectErrType(result, GoogleOAuth2Error);
    });
  });

  describe('generateCodeChallenge', () => {
    it('should generate SHA256 base64url-encoded challenge from verifier', () => {
      const testVerifier = 'test-code-verifier-123456789012345678901234567';

      const result = generateCodeChallenge(testVerifier);

      const challenge = getOkValue<string>(result);
      expect(challenge).toHaveLength(43); // SHA256 hash = 32 bytes = 43 base64url chars
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/); // base64url pattern
    });

    it('should generate consistent challenges for same verifier', () => {
      const testVerifier = 'consistent-test-verifier-abcdefghijklmnop';

      const result1 = generateCodeChallenge(testVerifier);
      const result2 = generateCodeChallenge(testVerifier);

      const challenge1 = getOkValue<string>(result1);
      const challenge2 = getOkValue<string>(result2);

      expect(challenge1).toEqual(challenge2);
    });

    it('should generate different challenges for different verifiers', () => {
      const verifier1 = 'test-verifier-one-1234567890123456789012';
      const verifier2 = 'test-verifier-two-1234567890123456789012';

      const result1 = generateCodeChallenge(verifier1);
      const result2 = generateCodeChallenge(verifier2);

      const challenge1 = getOkValue<string>(result1);
      const challenge2 = getOkValue<string>(result2);

      expect(challenge1).not.toEqual(challenge2);
    });

    it('should handle empty verifier input', () => {
      const result = generateCodeChallenge('');

      expectErrType(result, GoogleOAuth2Error);
    });

    it('should handle invalid verifier input', () => {
      const result = generateCodeChallenge('invalid verifier with spaces!');

      expectErrType(result, GoogleOAuth2Error);
    });

    it('should return error when hashing fails', () => {
      // Create mock crypto operations that fail
      const mockCrypto: CryptoOperations = {
        randomBytes: jest.fn(),
        createHash: jest.fn().mockImplementation(() => {
          throw new Error('Hash operation failed');
        }),
      };

      const result = generateCodeChallenge(
        'valid-test-verifier-12345678901234567890',
        mockCrypto
      );
      expectErrType(result, GoogleOAuth2Error);
    });
  });

  describe('PKCE flow validation', () => {
    it('should create valid verifier/challenge pairs', () => {
      const verifierResult = generateCodeVerifier();
      const verifier = getOkValue<string>(verifierResult);

      const challengeResult = generateCodeChallenge(verifier);
      const challenge = getOkValue<string>(challengeResult);

      // Both should be valid base64url strings
      expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

      // Challenge should be derived from verifier
      expect(challenge).not.toEqual(verifier);
    });

    it('should follow RFC 7636 specifications', () => {
      const verifierResult = generateCodeVerifier();
      const verifier = getOkValue<string>(verifierResult);

      // RFC 7636: code_verifier = high-entropy cryptographic random STRING of
      // 43-128 characters (our implementation uses 43 for efficiency)
      expect(verifier).toHaveLength(43);

      // RFC 7636: only unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
      // base64url uses [A-Za-z0-9_-] which is a subset of unreserved
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);

      const challengeResult = generateCodeChallenge(verifier);
      const challenge = getOkValue<string>(challengeResult);

      // RFC 7636: code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
      expect(challenge).toHaveLength(43); // SHA256 = 32 bytes = 43 base64url chars
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should handle multiple sequential PKCE flows', () => {
      const flows = [];

      // Generate 5 different PKCE flows
      for (let i = 0; i < 5; i++) {
        const verifierResult = generateCodeVerifier();
        const verifier = getOkValue<string>(verifierResult);

        const challengeResult = generateCodeChallenge(verifier);
        const challenge = getOkValue<string>(challengeResult);

        flows.push({ verifier, challenge });
      }

      // All verifiers should be unique
      const verifiers = flows.map(f => f.verifier);
      const uniqueVerifiers = new Set(verifiers);
      expect(uniqueVerifiers.size).toBe(5);

      // All challenges should be unique
      const challenges = flows.map(f => f.challenge);
      const uniqueChallenges = new Set(challenges);
      expect(uniqueChallenges.size).toBe(5);

      // No verifier should equal its corresponding challenge
      flows.forEach(({ verifier, challenge }) => {
        expect(verifier).not.toEqual(challenge);
      });
    });
  });

  describe('base64url encoding validation', () => {
    it('should not include padding characters', () => {
      const verifierResult = generateCodeVerifier();
      const verifier = getOkValue<string>(verifierResult);

      const challengeResult = generateCodeChallenge(verifier);
      const challenge = getOkValue<string>(challengeResult);

      // base64url should not include padding characters
      expect(verifier).not.toContain('=');
      expect(challenge).not.toContain('=');
    });

    it('should use URL-safe characters only', () => {
      const verifierResult = generateCodeVerifier();
      const verifier = getOkValue<string>(verifierResult);

      const challengeResult = generateCodeChallenge(verifier);
      const challenge = getOkValue<string>(challengeResult);

      // Should not contain + or / (standard base64 characters)
      expect(verifier).not.toContain('+');
      expect(verifier).not.toContain('/');
      expect(challenge).not.toContain('+');
      expect(challenge).not.toContain('/');

      // Should only contain base64url characters
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });
});
