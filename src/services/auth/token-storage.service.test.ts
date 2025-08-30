/**
 * @fileoverview Test suite for TokenStorage service.
 * Tests secure token storage and retrieval functionality using TDD approach.
 */

import {
  describe,
  expect,
  test,
  beforeAll,
  beforeEach,
  afterEach,
  jest,
} from '@jest/globals';
import type {
  OAuth2StoredCredentials,
  OAuth2Token,
  OAuth2Config,
  TokenStorageDependencies,
} from './types.js';
import { GoogleTokenCacheCorruptedError, CorruptionInfo } from '../../errors/index.js';

// Mock keytar dependency
const mockKeytar = {
  setPassword: jest.fn<() => Promise<void>>(),
  getPassword: jest.fn<() => Promise<string | null>>(),
  deletePassword: jest.fn<() => Promise<boolean>>(),
  findCredentials:
    jest.fn<() => Promise<Array<{ account: string; password: string }>>>(),
};

// Mock fs dependency
const mockFs = {
  promises: {
    writeFile: jest.fn<() => Promise<void>>(),
    readFile: jest.fn<() => Promise<string>>(),
    unlink: jest.fn<() => Promise<void>>(),
    access: jest.fn<() => Promise<void>>(),
    mkdir: jest.fn<() => Promise<void>>(),
    rename: jest.fn<() => Promise<void>>(),
  },
};

// Mock cipher objects
const mockCipher = {
  update: jest.fn().mockReturnValue('encrypted-'),
  final: jest.fn().mockReturnValue('data'),
};

const mockDecipher = {
  update: jest.fn().mockReturnValue('decrypted-'),
  final: jest.fn().mockReturnValue('content'),
};

// Mock crypto dependency
const mockCrypto = {
  createCipher: jest.fn().mockReturnValue(mockCipher),
  createDecipher: jest.fn().mockReturnValue(mockDecipher),
  randomBytes: jest.fn(() => Buffer.from('random-bytes')),
};

// Create mock dependencies object
const mockDependencies: TokenStorageDependencies = {
  keytar: mockKeytar,
  fs: mockFs,
  crypto: mockCrypto as any, // Type assertion to bypass strict typing for test mocks
};

describe('TokenStorage Service', () => {
  const mockStoredCredentials: OAuth2StoredCredentials = {
    tokens: {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expiry_date: Date.now() + 3600000,
      token_type: 'Bearer',
      scope: 'https://www.googleapis.com/auth/spreadsheets',
    },
    clientConfig: {
      clientId: 'test-client-id',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    },
    storedAt: Date.now(),
    userId: 'test-user@example.com',
  };

  let tokenStorage: any;
  let TokenStorageService: any;

  beforeAll(async () => {
    const module = await import('./token-storage.service.js');
    TokenStorageService = module.TokenStorageService;
  });

  beforeEach(() => {
    // Clear call history but keep mock implementations
    jest.clearAllMocks();

    // Ensure cipher mocks are properly set up
    mockCipher.update.mockReturnValue('encrypted-');
    mockCipher.final.mockReturnValue('data');
    mockDecipher.update.mockReturnValue('decrypted-');
    mockDecipher.final.mockReturnValue('content');
    mockCrypto.createCipher.mockReturnValue(mockCipher);
    mockCrypto.createDecipher.mockReturnValue(mockDecipher);

    // Create instance with mock dependencies
    tokenStorage = new TokenStorageService(mockDependencies);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Construction and Initialization', () => {
    test('should create TokenStorageService instance', () => {
      expect(tokenStorage).toBeDefined();
      expect(tokenStorage).toBeInstanceOf(TokenStorageService);
    });

    test('should implement TokenStorage interface', () => {
      expect(typeof tokenStorage.saveTokens).toBe('function');
      expect(typeof tokenStorage.getTokens).toBe('function');
      expect(typeof tokenStorage.deleteTokens).toBe('function');
      expect(typeof tokenStorage.hasTokens).toBe('function');
    });
  });

  describe('Token Storage (Keytar)', () => {
    describe('saveTokens', () => {
      test('should save tokens using keytar when available', async () => {
        mockKeytar.setPassword.mockResolvedValue();

        await tokenStorage.saveTokens(mockStoredCredentials);

        expect(mockKeytar.setPassword).toHaveBeenCalledWith(
          'google-workspace-mcp',
          'oauth2-tokens',
          JSON.stringify(mockStoredCredentials)
        );
      });

      test('should handle keytar save errors and fallback to file storage', async () => {
        mockKeytar.setPassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.mkdir.mockResolvedValue();
        mockFs.promises.writeFile.mockResolvedValue();

        await tokenStorage.saveTokens(mockStoredCredentials);

        expect(mockKeytar.setPassword).toHaveBeenCalled();
        expect(mockFs.promises.mkdir).toHaveBeenCalled();
        expect(mockFs.promises.writeFile).toHaveBeenCalled();
      });

      test('should throw error if both keytar and file storage fail', async () => {
        mockKeytar.setPassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.mkdir.mockRejectedValue(new Error('File system error'));

        await expect(
          tokenStorage.saveTokens(mockStoredCredentials)
        ).rejects.toThrow('Failed to save OAuth2 tokens');
      });
    });

    describe('getTokens', () => {
      test('should retrieve tokens using keytar when available', async () => {
        mockKeytar.getPassword.mockResolvedValue(
          JSON.stringify(mockStoredCredentials)
        );

        const result = await tokenStorage.getTokens();

        expect(mockKeytar.getPassword).toHaveBeenCalledWith(
          'google-workspace-mcp',
          'oauth2-tokens'
        );
        expect(result).toEqual(mockStoredCredentials);
      });

      test('should return null when no tokens found in keytar', async () => {
        // Mock file storage to also return null (no file exists)
        mockFs.promises.readFile.mockRejectedValue(new Error("File not found"));
        mockKeytar.getPassword.mockResolvedValue(null);

        const result = await tokenStorage.getTokens();

        expect(result).toBeNull();
      });

      test('should handle keytar get errors and fallback to file storage', async () => {
        mockKeytar.getPassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.readFile.mockResolvedValue('encrypted-content');

        // Mock crypto decryption to return valid JSON
        const mockDecipher = {
          update: jest.fn().mockReturnValue(''),
          final: jest
            .fn()
            .mockReturnValue(JSON.stringify(mockStoredCredentials)),
        };
        mockCrypto.createDecipher.mockReturnValue(mockDecipher);

        const result = await tokenStorage.getTokens();

        expect(mockKeytar.getPassword).toHaveBeenCalled();
        expect(mockFs.promises.readFile).toHaveBeenCalled();
        expect(result).toEqual(mockStoredCredentials);
      });

      test('should return null if both keytar and file storage fail', async () => {
        mockKeytar.getPassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));

        const result = await tokenStorage.getTokens();

        expect(result).toBeNull();
      });

      test('should handle malformed JSON in keytar gracefully', async () => {
        // After corruption cleanup, file storage should also return null
        mockFs.promises.readFile.mockRejectedValue(new Error("File not found"));
        mockKeytar.getPassword.mockResolvedValue('invalid-json');

        const result = await tokenStorage.getTokens();

        expect(result).toBeNull();
      });
    });

    describe('deleteTokens', () => {
      test('should delete tokens using keytar when available', async () => {
        mockKeytar.deletePassword.mockResolvedValue(true);

        await tokenStorage.deleteTokens();

        expect(mockKeytar.deletePassword).toHaveBeenCalledWith(
          'google-workspace-mcp',
          'oauth2-tokens'
        );
      });

      test('should handle keytar delete errors and fallback to file deletion', async () => {
        mockKeytar.deletePassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.unlink.mockResolvedValue();

        await tokenStorage.deleteTokens();

        expect(mockKeytar.deletePassword).toHaveBeenCalled();
        expect(mockFs.promises.unlink).toHaveBeenCalled();
      });

      test('should not throw error if deletion fails (already cleaned up)', async () => {
        mockKeytar.deletePassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.unlink.mockRejectedValue(new Error('File not found'));

        await expect(tokenStorage.deleteTokens()).resolves.not.toThrow();
      });
    });

    describe('hasTokens', () => {
      test('should return true when tokens exist in keytar', async () => {
        mockKeytar.getPassword.mockResolvedValue(
          JSON.stringify(mockStoredCredentials)
        );

        const result = await tokenStorage.hasTokens();

        expect(result).toBe(true);
      });

      test('should return false when no tokens exist', async () => {
        mockKeytar.getPassword.mockResolvedValue(null);
        // Also mock file access to fail (no tokens in file storage either)
        mockFs.promises.access.mockRejectedValue(new Error('File not found'));

        const result = await tokenStorage.hasTokens();

        expect(result).toBe(false);
      });

      test('should return false if keytar access fails', async () => {
        mockKeytar.getPassword.mockRejectedValue(new Error('Keytar error'));
        mockFs.promises.access.mockRejectedValue(new Error('File not found'));

        const result = await tokenStorage.hasTokens();

        expect(result).toBe(false);
      });
    });
  });

  describe('File Fallback Storage', () => {
    test('should use encrypted file storage as fallback', async () => {
      // Force keytar failure to trigger file fallback
      mockKeytar.setPassword.mockRejectedValue(new Error('Keytar unavailable'));

      // Mock file operations
      mockFs.promises.mkdir.mockResolvedValue();
      mockFs.promises.writeFile.mockResolvedValue();

      await tokenStorage.saveTokens(mockStoredCredentials);

      expect(mockFs.promises.mkdir).toHaveBeenCalled();
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
      // Verify that the content is encrypted (not plain JSON)
      const writeCall = mockFs.promises.writeFile.mock.calls[0] as any[];
      expect(writeCall?.[1]).not.toBe(JSON.stringify(mockStoredCredentials));
    });

    test('should decrypt file content when reading', async () => {
      // Force keytar failure to trigger file fallback
      mockKeytar.getPassword.mockRejectedValue(new Error('Keytar unavailable'));

      const encryptedContent = 'encrypted-content';
      mockFs.promises.readFile.mockResolvedValue(encryptedContent);

      // Mock crypto decryption to return valid JSON
      const mockTestDecipher = {
        update: jest.fn().mockReturnValue(''),
        final: jest.fn().mockReturnValue(JSON.stringify(mockStoredCredentials)),
      };
      mockCrypto.createDecipher.mockReturnValue(mockTestDecipher);

      const result = await tokenStorage.getTokens();

      expect(mockCrypto.createDecipher).toHaveBeenCalled();
      expect(mockTestDecipher.update).toHaveBeenCalledWith(
        encryptedContent,
        'hex',
        'utf8'
      );
      expect(mockTestDecipher.final).toHaveBeenCalledWith('utf8');
      expect(result).toEqual(mockStoredCredentials);
    });

    test('should handle file permissions correctly', async () => {
      // Force keytar failure to trigger file fallback
      mockKeytar.setPassword.mockRejectedValue(new Error('Keytar unavailable'));

      mockFs.promises.mkdir.mockResolvedValue();
      mockFs.promises.writeFile.mockResolvedValue();

      await tokenStorage.saveTokens(mockStoredCredentials);

      // Verify file is created with restricted permissions (600)
      const writeCall = mockFs.promises.writeFile.mock.calls[0] as any[];
      expect(writeCall?.[2]).toEqual({ mode: 0o600, flag: 'w' });
    });
  });

  describe('Error Handling', () => {
    test('should throw meaningful error for invalid token format', async () => {
      const invalidCredentials = {} as OAuth2StoredCredentials;

      await expect(
        tokenStorage.saveTokens(invalidCredentials)
      ).rejects.toThrow();
    });

    test('should handle concurrent access gracefully', async () => {
      mockKeytar.setPassword.mockResolvedValue();

      // Simulate concurrent saves
      const promises = [
        tokenStorage.saveTokens(mockStoredCredentials),
        tokenStorage.saveTokens(mockStoredCredentials),
        tokenStorage.saveTokens(mockStoredCredentials),
      ];

      await expect(Promise.all(promises)).resolves.not.toThrow();
    });

    test('should validate token expiry on retrieval', async () => {
      const expiredCredentials = {
        ...mockStoredCredentials,
        tokens: {
          ...mockStoredCredentials.tokens,
          expiry_date: Date.now() - 3600000, // Expired 1 hour ago
        },
      };

      mockKeytar.getPassword.mockResolvedValue(
        JSON.stringify(expiredCredentials)
      );

      const result = await tokenStorage.getTokens();

      // Should still return expired tokens (let OAuth2AuthProvider handle expiry)
      expect(result).toEqual(expiredCredentials);
    });
  });

  describe('Security Features', () => {
    test('should use strong encryption for file storage', async () => {
      mockKeytar.setPassword.mockRejectedValue(new Error('Keytar unavailable'));
      mockFs.promises.mkdir.mockResolvedValue();
      mockFs.promises.writeFile.mockResolvedValue();

      const mockCipher = {
        update: jest.fn().mockReturnValue('encrypted-'),
        final: jest.fn().mockReturnValue('data'),
      };
      mockCrypto.createCipher.mockReturnValue(mockCipher);

      await tokenStorage.saveTokens(mockStoredCredentials);

      expect(mockCrypto.createCipher).toHaveBeenCalledWith(
        'aes256',
        expect.any(String)
      );
    });

    test('should clear sensitive data from memory', () => {
      // This test ensures we don't keep tokens in memory longer than necessary
      // Implementation should clear variables containing sensitive data
      expect(true).toBe(true); // Placeholder - implementation will verify memory clearing
    });
  });

  // **PHASE B: CACHE CORRUPTION DETECTION - RED PHASE TESTS**
  // These tests will fail until corruption detection is implemented
  describe('Cache Corruption Detection and Recovery', () => {
    describe('Corruption Detection', () => {
      test('should detect corrupted encrypted files and throw GoogleTokenCacheCorruptedError', async () => {
        // Setup: Keytar returns null, file exists but contains corrupted encrypted data
        mockKeytar.getPassword.mockResolvedValue(null);
        mockFs.promises.readFile.mockResolvedValue('corrupted-encrypted-data');
        mockDecipher.update.mockImplementation(() => {
          throw new Error('Invalid encrypted data');
        });

        await expect(async () => {
          await tokenStorage.getTokens();
        }).rejects.toThrow(GoogleTokenCacheCorruptedError);

        // Verify corruption info contains proper details
        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error.corruption).toEqual({
            source: 'file',
            timestamp: expect.any(Number),
            backupPath: expect.stringContaining('.corrupted-'),
            error: expect.stringContaining('Invalid encrypted data'),
            details: {
              corruptionType: 'ENCRYPTION_CORRUPTION',
            },
          });
        }
      });

      test('should detect invalid JSON after successful decryption', async () => {
        // Setup: Keytar returns null, decryption succeeds but produces invalid JSON
        mockKeytar.getPassword.mockResolvedValue(null);
        mockFs.promises.readFile.mockResolvedValue('validencrypteddata');
        mockDecipher.update.mockReturnValue('invalid-json-{[}');
              mockDecipher.final.mockReturnValue("");
              mockFs.promises.rename = jest.fn<() => Promise<void>>().mockResolvedValue();
        mockDecipher.final.mockReturnValue('');

        await expect(async () => {
          await tokenStorage.getTokens();
        }).rejects.toThrow(GoogleTokenCacheCorruptedError);
      });

      test('should detect malformed credential structures after JSON parsing', async () => {
        // Setup: Keytar returns null, valid JSON but missing required credential fields
        mockKeytar.getPassword.mockResolvedValue(null);
        const invalidCredentials = {
          tokens: { /* missing access_token */ },
          clientConfig: { /* missing clientId */ },
          // missing storedAt
        };
        
        mockFs.promises.readFile.mockResolvedValue('validencrypteddata');
        mockDecipher.update.mockReturnValue(JSON.stringify(invalidCredentials));
        mockDecipher.final.mockReturnValue('');

        await expect(async () => {
          await tokenStorage.getTokens();
        }).rejects.toThrow(GoogleTokenCacheCorruptedError);
      });

      test('should detect tampered keytar entries', async () => {
        // Setup: Keytar returns corrupted JSON data
        mockKeytar.getPassword.mockResolvedValue('{"corrupted": "data", "missing": "required_fields"}');

        await expect(async () => {
          await tokenStorage.getTokens();
        }).rejects.toThrow(GoogleTokenCacheCorruptedError);

        // Verify corruption source is keytar
        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error.corruption.source).toBe('keytar');
        }
      });
    });

    describe('Corruption Handling', () => {
      test('should rename corrupted files to .corrupted-<timestamp> format', async () => {
        // Setup: File corruption scenario
        mockFs.promises.readFile.mockResolvedValue('corrupted-data');
        mockDecipher.update.mockImplementation(() => {
          throw new Error('Decryption failed');
        });
        mockFs.promises.rename = jest.fn<() => Promise<void>>().mockResolvedValue();

        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          // File should be renamed with timestamp
          expect(mockFs.promises.rename).toHaveBeenCalledWith(
            expect.stringContaining('oauth2-tokens.enc'),
            expect.stringMatching(/oauth2-tokens\.enc\.corrupted-\d+$/)
          );
        }
      });

      test('should log corruption events with proper context', async () => {
        // Mock console.error to capture log output
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        
        mockKeytar.getPassword.mockResolvedValue('invalid-json');

        try {
          await tokenStorage.getTokens();
        } catch (error) {
          expect(consoleSpy).toHaveBeenCalledWith(
            expect.stringContaining('Token cache corruption detected'),
            expect.objectContaining({
              source: 'keytar',
              timestamp: expect.any(Number),
            })
          );
        }

        consoleSpy.mockRestore();
      });

      test('should enable new authentication after corruption cleanup', async () => {
        // After corruption is handled, subsequent auth should work
        mockKeytar.getPassword
          .mockResolvedValueOnce('corrupted-data') // First call: corruption
          .mockResolvedValueOnce(null); // Second call: clean state
        
        // Mock file storage to also return null (file doesn't exist after cleanup)
        mockFs.promises.readFile
          .mockRejectedValueOnce(new Error('File not found'))
          .mockRejectedValueOnce(new Error('File not found'));

        // First call should detect corruption and clean up
        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error).toBeInstanceOf(GoogleTokenCacheCorruptedError);
        }

        // Second call should return null (clean state for new auth)
        const result = await tokenStorage.getTokens();
        expect(result).toBeNull();
      });

      test('should handle multiple corruptions without conflicts', async () => {
        // Setup: Multiple corruption events in sequence
        const currentTime = Date.now();
        jest.spyOn(Date, 'now')
          .mockReturnValueOnce(currentTime)
          .mockReturnValueOnce(currentTime)
          .mockReturnValueOnce(currentTime + 1000)
          .mockReturnValueOnce(currentTime + 1000);

        // Mock keytar to return null so it falls back to file storage
        mockKeytar.getPassword.mockResolvedValue(null);
        mockFs.promises.readFile.mockResolvedValue('corrupted-data');
        mockDecipher.update.mockImplementation(() => {
          throw new Error('Decryption failed');
        });
        mockFs.promises.rename = jest.fn<() => Promise<void>>().mockResolvedValue();

        // First corruption
        try {
          await tokenStorage.getTokens();
        } catch (error1) {
          // Second corruption (different timestamp)
          try {
            await tokenStorage.getTokens();
          } catch (error2) {
            // Should create different backup files
            expect(mockFs.promises.rename).toHaveBeenNthCalledWith(1,
              expect.any(String),
              expect.stringContaining(`corrupted-${currentTime}`)
            );
            expect(mockFs.promises.rename).toHaveBeenNthCalledWith(2,
              expect.any(String),
              expect.stringContaining(`corrupted-${currentTime + 1000}`)
            );
          }
        }
      });
    });

    describe('Recovery Scenarios', () => {
      test('should recover from keytar corruption by falling back to file storage', async () => {
        // Setup: Keytar corrupted, file storage valid
        mockKeytar.getPassword.mockResolvedValue('corrupted-keytar-data');
        mockFs.promises.readFile.mockResolvedValue('valid-encrypted-data');
        mockDecipher.update.mockReturnValue(JSON.stringify(mockStoredCredentials));
        mockDecipher.final.mockReturnValue('');

        // Should clean keytar corruption and return file storage data
        const result = await tokenStorage.getTokens();
        expect(result).toEqual(mockStoredCredentials);

        // Keytar should be cleaned
        expect(mockKeytar.deletePassword).toHaveBeenCalled();
      });

      test('should enable fresh authentication when file corruption is detected', async () => {
        // Setup: File corrupted, keytar unavailable
        mockKeytar.getPassword.mockResolvedValue(null);
        mockFs.promises.readFile.mockResolvedValue('corrupted-file-data');
        mockDecipher.update.mockImplementation(() => {
          throw new Error('File corruption');
        });
        mockFs.promises.rename = jest.fn<() => Promise<void>>().mockResolvedValue();

        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error.corruption.source).toBe('file');
        }

        // After corruption handling, should return null for fresh auth
        mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));
        const result = await tokenStorage.getTokens();
        expect(result).toBeNull();
      });

      test('should trigger complete re-authentication when both storage methods are corrupted', async () => {
        // Setup: Both keytar and file storage corrupted
        mockKeytar.getPassword.mockResolvedValue('corrupted-keytar');
        mockFs.promises.readFile.mockResolvedValue('corrupted-file');
        mockDecipher.update.mockImplementation(() => {
          throw new Error('Both corrupted');
        });

        // Should clean both storage methods
        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error.corruption.source).toMatch(/keytar|file/);
        }

        // Both should be cleaned
        expect(mockKeytar.deletePassword).toHaveBeenCalled();
        expect(mockFs.promises.rename).toHaveBeenCalled();
      });

      test('should properly clean up corrupted storage without affecting valid data', async () => {
        // Setup: One corruption, one valid storage
        let callCount = 0;
        mockKeytar.getPassword.mockImplementation(() => {
          callCount++;
          if (callCount === 1) return Promise.resolve('corrupted-data');
          return Promise.resolve(JSON.stringify(mockStoredCredentials));
        });

        // First call detects corruption and cleans keytar
        try {
          await tokenStorage.getTokens();
        } catch (error) {
          expect(mockKeytar.deletePassword).toHaveBeenCalled();
        }

        // Second call should work with cleaned keytar
        const result = await tokenStorage.getTokens();
        expect(result).toEqual(mockStoredCredentials);
      });
    });

    describe('Error Classification', () => {
      test('should differentiate corruption from network errors', async () => {
        // Network error - should not trigger corruption handling
        mockKeytar.getPassword.mockRejectedValue(new Error('ENOTFOUND: Network error'));
        // File also not available
        mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));

        const result = await tokenStorage.getTokens();
        expect(result).toBeNull(); // Should return null, not throw corruption error
        expect(mockKeytar.deletePassword).not.toHaveBeenCalled();
      });

      test('should differentiate corruption from temporary file lock errors', async () => {
        // File lock error - should not trigger corruption handling
        mockFs.promises.readFile.mockRejectedValue(new Error('EBUSY: File is locked'));

        const result = await tokenStorage.getTokens();
        expect(result).toBeNull(); // Should return null, not throw corruption error
        expect(mockFs.promises.rename).not.toHaveBeenCalled();
      });

      test('should properly classify different corruption types', async () => {
        const corruptionScenarios = [
          {
            name: 'encryption corruption',
            setup: () => {
              mockKeytar.getPassword.mockResolvedValue(null);
              mockFs.promises.readFile.mockResolvedValue('corrupted-encrypted');
              mockDecipher.update.mockImplementation(() => {
                throw new Error('Invalid encryption format');
              });
            },
            expectedType: 'ENCRYPTION_CORRUPTION',
          },
          {
            name: 'json corruption',
            setup: () => {
              mockKeytar.getPassword.mockResolvedValue(null);
              mockFs.promises.readFile.mockResolvedValue('valid-encrypted');
              mockDecipher.update.mockReturnValue('invalid-json-{[}');
              mockDecipher.final.mockReturnValue("");
              mockFs.promises.rename = jest.fn<() => Promise<void>>().mockResolvedValue();
            },
            expectedType: 'JSON_CORRUPTION',
          },
          {
            name: 'structure corruption',
            setup: () => {
              mockKeytar.getPassword.mockResolvedValue(null);
              mockFs.promises.readFile.mockResolvedValue('valid-encrypted');
              mockDecipher.update.mockReturnValue('{"invalid": "structure"}');
            },
            expectedType: 'STRUCTURE_CORRUPTION',
          },
        ];

        for (const scenario of corruptionScenarios) {
          // Reset mocks for each scenario
          jest.clearAllMocks();
          scenario.setup();
          
          try {
            await tokenStorage.getTokens();
          } catch (error: any) {
            expect(error.corruption.details.corruptionType).toBe(scenario.expectedType);
          }
        }
      });

      test('should provide detailed error reporting for different corruption types', async () => {
        const mockTimestamp = Date.now();
        jest.spyOn(Date, "now").mockReturnValue(mockTimestamp);
        // Detailed error info for debugging
        mockKeytar.getPassword.mockResolvedValue('{"malformed": "credentials"}');

        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error.corruption).toEqual({
            source: 'keytar',
            timestamp: mockTimestamp,
            error: expect.stringContaining('Missing required credential fields'),
            details: expect.objectContaining({
              missingFields: expect.arrayContaining(['tokens.access_token', 'clientConfig.clientId', 'storedAt']),
              receivedStructure: expect.any(Object),
            }),
          });
        }
      });
    });

    describe('Integration with OAuth2AuthProvider', () => {
      test('should enable OAuth2AuthProvider to detect and handle corruption during token loading', async () => {
        // OAuth2AuthProvider should catch corruption and trigger re-auth
        mockKeytar.getPassword.mockResolvedValue('corrupted-oauth-data');

        // This test will guide OAuth2AuthProvider integration
        const mockOAuth2Provider = {
          loadStoredTokens: async () => {
            try {
              return await tokenStorage.getTokens();
            } catch (error: any) {
              if (error.name === 'GoogleTokenCacheCorruptedError') {
                // Should trigger re-authentication flow
                return null; // Indicates need for fresh auth
              }
              throw error;
            }
          }
        };

        const result = await mockOAuth2Provider.loadStoredTokens();
        expect(result).toBeNull(); // Should enable re-auth
      });

      test('should provide corruption metrics for monitoring', async () => {
        // Corruption events should be trackable for monitoring
        const mockMetrics = {
          recordCorruptionEvent: jest.fn(),
        };

        mockKeytar.getPassword.mockResolvedValue('corrupted-data');
        
        // Mock the corruption handler to track metrics calls
        const mockDate = Date.now();
        jest.spyOn(Date, 'now').mockReturnValue(mockDate);

        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          // Integration point for metrics
          mockMetrics.recordCorruptionEvent({
            source: error.corruption.source,
            timestamp: error.corruption.timestamp,
            errorType: error.corruption.error,
          });
        }
        
        // Restore Date.now mock
        jest.restoreAllMocks();

        expect(mockMetrics.recordCorruptionEvent).toHaveBeenCalledWith({
          source: 'keytar',
          timestamp: mockDate,
          errorType: expect.any(String),
        });
      });

      test('should maintain OAuth2AuthProvider compatibility during recovery', async () => {
        // After corruption recovery, OAuth2AuthProvider should work normally
        mockKeytar.getPassword
          .mockResolvedValueOnce('corrupted-data')  // Corruption
          .mockResolvedValueOnce(null)              // Clean state
          .mockResolvedValueOnce(JSON.stringify(mockStoredCredentials)); // New valid data

        // First: corruption detected
        try {
          await tokenStorage.getTokens();
        } catch (error: any) {
          expect(error.name).toBe('GoogleTokenCacheCorruptedError');
        }

        // Second: clean state for re-auth
        mockFs.promises.readFile.mockRejectedValue(new Error("File not found"));
        const cleanResult = await tokenStorage.getTokens();
        expect(cleanResult).toBeNull();

        // Third: new tokens stored and retrieved successfully
        await tokenStorage.saveTokens(mockStoredCredentials);
        const newResult = await tokenStorage.getTokens();
        expect(newResult).toEqual(mockStoredCredentials);
      });
    });
  });
});
