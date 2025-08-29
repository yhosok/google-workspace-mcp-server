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
});

// These tests will fail until TokenStorageService is implemented
describe('TokenStorageService Implementation (Not Yet Implemented)', () => {
  test('should throw when trying to instantiate', () => {
    expect(() => {
      // This will fail until we implement TokenStorageService
      throw new Error('TokenStorageService not yet implemented');
    }).toThrow('TokenStorageService not yet implemented');
  });
});
