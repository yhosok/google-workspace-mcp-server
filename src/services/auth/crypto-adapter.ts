/**
 * @fileoverview Crypto adapter for testable crypto operations.
 *
 * Provides a thin wrapper around Node.js crypto module to enable proper testing
 * by allowing mock injection in test environments.
 */

import * as crypto from 'crypto';

/**
 * Crypto operations interface for dependency injection.
 * Enables mocking in tests while using real crypto in production.
 */
export interface CryptoOperations {
  randomBytes(size: number): Buffer;
  createHash(algorithm: string): crypto.Hash;
}

/**
 * Production crypto adapter using Node.js crypto module.
 */
export const cryptoAdapter: CryptoOperations = {
  randomBytes: (size: number): Buffer => {
    return crypto.randomBytes(size);
  },

  createHash: (algorithm: string): crypto.Hash => {
    return crypto.createHash(algorithm);
  },
};
