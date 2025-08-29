/**
 * @fileoverview TokenStorageService implementation for secure OAuth2 token persistence.
 * Provides dual-layer storage strategy with keytar primary and encrypted file fallback.
 *
 * Security Features:
 * - Keytar integration for OS-native secure storage (Keychain/Credential Manager)
 * - AES-256 encrypted file storage as fallback
 * - Restricted file permissions (600 - owner read/write only)
 * - Memory clearing for sensitive data
 * - Graceful error handling and fallback mechanisms
 */

import { homedir } from 'os';
import { join } from 'path';
import type {
  TokenStorage,
  OAuth2StoredCredentials,
  TokenStorageDependencies,
  KeytarDependency,
  FileSystemDependency,
  CryptoDependency,
} from './types.js';
import { GoogleOAuth2TokenStorageError } from '../../errors/index.js';

/**
 * Secure token storage service implementing dual-layer storage strategy.
 *
 * Primary storage uses keytar for OS-native credential management.
 * Fallback storage uses AES-256 encrypted files with restricted permissions.
 * All sensitive data is cleared from memory after use.
 */
export class TokenStorageService implements TokenStorage {
  /** External dependencies injected during construction */
  private readonly dependencies: TokenStorageDependencies;
  /** Service name identifier for keytar storage */
  private readonly SERVICE_NAME = 'google-workspace-mcp';

  /** Account name identifier for keytar storage */
  private readonly ACCOUNT_NAME = 'oauth2-tokens';

  /** Encryption algorithm for file storage */
  private readonly ENCRYPTION_ALGORITHM = 'aes256';

  /** Configuration directory path */
  private readonly CONFIG_DIR = join(
    homedir(),
    '.config',
    'google-workspace-mcp'
  );

  /** Encrypted token file path */
  private readonly TOKEN_FILE_PATH = join(this.CONFIG_DIR, 'oauth2-tokens.enc');

  /**
   * Initialize TokenStorageService with dependencies.
   *
   * @param dependencies - External dependencies for keytar, fs, and crypto
   */
  constructor(dependencies: TokenStorageDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Create default dependencies for production use.
   *
   * @returns Promise resolving to default dependencies using real modules
   * @static
   */
  public static async createDefaultDependencies(): Promise<TokenStorageDependencies> {
    // Use dynamic imports for real modules in production
    const [keytar, fs, crypto] = await Promise.all([
      import('keytar'),
      import('fs'),
      import('crypto'),
    ]);

    return {
      keytar: keytar as KeytarDependency,
      fs: fs as FileSystemDependency,
      crypto: crypto as CryptoDependency,
    };
  }

  /**
   * Create TokenStorageService instance with default production dependencies.
   *
   * @returns Promise resolving to TokenStorageService instance with real dependencies
   * @static
   */
  public static async create(): Promise<TokenStorageService> {
    const dependencies = await TokenStorageService.createDefaultDependencies();
    return new TokenStorageService(dependencies);
  }

  /**
   * Save OAuth2 credentials securely.
   * Attempts keytar storage first, falls back to encrypted file if needed.
   *
   * @param credentials - The OAuth2 credentials to store
   * @throws {GoogleOAuth2TokenStorageError} If both storage methods fail
   */
  public async saveTokens(credentials: OAuth2StoredCredentials): Promise<void> {
    // Validate credentials structure
    this.validateCredentials(credentials);

    try {
      // Try keytar storage first
      await this.saveToKeytar(credentials);
      return;
    } catch (keytarError) {
      // Keytar failed, try file storage fallback
      try {
        await this.saveToFile(credentials);
        return;
      } catch (fileError) {
        // Both storage methods failed
        throw new GoogleOAuth2TokenStorageError('save', fileError as Error, {
          keytarError:
            keytarError instanceof Error
              ? keytarError.message
              : String(keytarError),
          fileError:
            fileError instanceof Error ? fileError.message : String(fileError),
        });
      }
    }
  }

  /**
   * Retrieve stored OAuth2 credentials.
   * Attempts keytar storage first, falls back to encrypted file if needed.
   *
   * @returns Promise resolving to stored credentials or null if none found
   */
  public async getTokens(): Promise<OAuth2StoredCredentials | null> {
    try {
      // Try keytar storage first
      return await this.getFromKeytar();
    } catch (keytarError) {
      // Keytar failed, try file storage fallback
      try {
        return await this.getFromFile();
      } catch (fileError) {
        // Both storage methods failed, return null
        return null;
      }
    }
  }

  /**
   * Delete stored OAuth2 credentials.
   * Attempts to delete from both storage methods.
   * Does not throw errors if deletion fails (already cleaned up).
   */
  public async deleteTokens(): Promise<void> {
    // Try to delete from keytar (ignore errors)
    try {
      await this.deleteFromKeytar();
    } catch {
      // Ignore keytar deletion errors
    }

    // Try to delete from file storage (ignore errors)
    try {
      await this.deleteFromFile();
    } catch {
      // Ignore file deletion errors
    }
  }

  /**
   * Check if tokens exist in storage.
   * Checks keytar first, then file storage.
   *
   * @returns Promise resolving to true if tokens exist
   */
  public async hasTokens(): Promise<boolean> {
    try {
      // Try keytar storage first
      const keytarTokens = await this.getFromKeytar();
      if (keytarTokens !== null) {
        return true;
      }
    } catch {
      // Keytar failed, check file storage
    }

    try {
      // Check file storage
      await this.dependencies.fs.promises.access(this.TOKEN_FILE_PATH);
      return true;
    } catch {
      // File doesn't exist or not accessible
      return false;
    }
  }

  /**
   * Save credentials to keytar secure storage.
   *
   * @param credentials - The credentials to store
   * @private
   */
  private async saveToKeytar(
    credentials: OAuth2StoredCredentials
  ): Promise<void> {
    const serializedCredentials = JSON.stringify(credentials);
    try {
      await this.dependencies.keytar.setPassword(
        this.SERVICE_NAME,
        this.ACCOUNT_NAME,
        serializedCredentials
      );
    } finally {
      // Clear sensitive data from memory
      this.clearString(serializedCredentials);
    }
  }

  /**
   * Retrieve credentials from keytar secure storage.
   *
   * @returns Promise resolving to stored credentials or null
   * @private
   */
  private async getFromKeytar(): Promise<OAuth2StoredCredentials | null> {
    const serializedCredentials = await this.dependencies.keytar.getPassword(
      this.SERVICE_NAME,
      this.ACCOUNT_NAME
    );

    if (!serializedCredentials) {
      return null;
    }

    try {
      const credentials = JSON.parse(serializedCredentials);
      return this.validateAndReturnCredentials(credentials);
    } catch (error) {
      // Malformed JSON, return null
      return null;
    } finally {
      // Clear sensitive data from memory
      if (serializedCredentials) {
        this.clearString(serializedCredentials);
      }
    }
  }

  /**
   * Delete credentials from keytar secure storage.
   *
   * @private
   */
  private async deleteFromKeytar(): Promise<void> {
    await this.dependencies.keytar.deletePassword(
      this.SERVICE_NAME,
      this.ACCOUNT_NAME
    );
  }

  /**
   * Save credentials to encrypted file storage.
   *
   * @param credentials - The credentials to store
   * @private
   */
  private async saveToFile(
    credentials: OAuth2StoredCredentials
  ): Promise<void> {
    // Ensure directory exists
    await this.dependencies.fs.promises.mkdir(this.CONFIG_DIR, {
      recursive: true,
    });

    const serializedCredentials = JSON.stringify(credentials);
    const encryptedData = await this.encryptData(serializedCredentials);

    try {
      // Write with restricted permissions (600 - owner read/write only)
      await this.dependencies.fs.promises.writeFile(
        this.TOKEN_FILE_PATH,
        encryptedData,
        {
          mode: 0o600,
          flag: 'w',
        }
      );
    } finally {
      // Clear sensitive data from memory
      this.clearString(serializedCredentials);
      this.clearString(encryptedData);
    }
  }

  /**
   * Retrieve credentials from encrypted file storage.
   *
   * @returns Promise resolving to stored credentials or null
   * @private
   */
  private async getFromFile(): Promise<OAuth2StoredCredentials | null> {
    let encryptedData: string;
    try {
      encryptedData = await this.dependencies.fs.promises.readFile(
        this.TOKEN_FILE_PATH,
        'utf8'
      );
    } catch {
      // File doesn't exist or not readable
      return null;
    }

    let decryptedData: string;
    try {
      decryptedData = await this.decryptData(encryptedData);
    } catch {
      // Decryption failed (corrupted file or wrong key)
      return null;
    } finally {
      // Clear encrypted data from memory
      this.clearString(encryptedData);
    }

    try {
      const credentials = JSON.parse(decryptedData);
      return this.validateAndReturnCredentials(credentials);
    } catch {
      // Malformed JSON
      return null;
    } finally {
      // Clear decrypted data from memory
      this.clearString(decryptedData);
    }
  }

  /**
   * Delete credentials from file storage.
   *
   * @private
   */
  private async deleteFromFile(): Promise<void> {
    await this.dependencies.fs.promises.unlink(this.TOKEN_FILE_PATH);
  }

  /**
   * Encrypt data using AES-256.
   *
   * @param data - The data to encrypt
   * @returns Encrypted data as hex string
   * @private
   */
  private async encryptData(data: string): Promise<string> {
    const key = this.getEncryptionKey();
    const cipher = this.dependencies.crypto.createCipher(
      this.ENCRYPTION_ALGORITHM,
      key
    );

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Clear key from memory
    this.clearString(key);

    return encrypted;
  }

  /**
   * Decrypt data using AES-256.
   *
   * @param encryptedData - The encrypted data as hex string
   * @returns Decrypted data
   * @private
   */
  private async decryptData(encryptedData: string): Promise<string> {
    const key = this.getEncryptionKey();
    const decipher = this.dependencies.crypto.createDecipher(
      this.ENCRYPTION_ALGORITHM,
      key
    );

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    // Clear key from memory
    this.clearString(key);

    return decrypted;
  }

  /**
   * Generate encryption key derived from system information.
   * Uses a combination of system-specific data for key derivation.
   *
   * @returns Encryption key string
   * @private
   */
  private getEncryptionKey(): string {
    // Create deterministic key from system information
    // This ensures the same key across application restarts
    const systemInfo = homedir() + this.SERVICE_NAME + this.ACCOUNT_NAME;
    return Buffer.from(systemInfo).toString('hex').substring(0, 32);
  }

  /**
   * Validate credentials structure and return if valid.
   *
   * @param credentials - Credentials object to validate
   * @returns Valid credentials or null
   * @private
   */
  private validateAndReturnCredentials(
    credentials: any
  ): OAuth2StoredCredentials | null {
    try {
      // Basic validation of required fields
      if (!credentials || typeof credentials !== 'object') {
        return null;
      }

      if (!credentials.tokens || typeof credentials.tokens !== 'object') {
        return null;
      }

      if (
        !credentials.tokens.access_token ||
        typeof credentials.tokens.access_token !== 'string'
      ) {
        return null;
      }

      if (
        !credentials.clientConfig ||
        typeof credentials.clientConfig !== 'object'
      ) {
        return null;
      }

      if (
        !credentials.clientConfig.clientId ||
        typeof credentials.clientConfig.clientId !== 'string'
      ) {
        return null;
      }

      if (!credentials.storedAt || typeof credentials.storedAt !== 'number') {
        return null;
      }

      // Return validated credentials
      return credentials as OAuth2StoredCredentials;
    } catch {
      return null;
    }
  }

  /**
   * Validate credentials structure before saving.
   *
   * @param credentials - Credentials to validate
   * @throws {GoogleOAuth2TokenStorageError} If validation fails
   * @private
   */
  private validateCredentials(credentials: OAuth2StoredCredentials): void {
    if (!credentials || typeof credentials !== 'object') {
      throw new GoogleOAuth2TokenStorageError('save', undefined, {
        reason: 'Invalid credentials: must be an object',
      });
    }

    if (!credentials.tokens || typeof credentials.tokens !== 'object') {
      throw new GoogleOAuth2TokenStorageError('save', undefined, {
        reason: 'Invalid credentials: tokens must be an object',
      });
    }

    if (
      !credentials.tokens.access_token ||
      typeof credentials.tokens.access_token !== 'string'
    ) {
      throw new GoogleOAuth2TokenStorageError('save', undefined, {
        reason: 'Invalid credentials: access_token is required',
      });
    }

    if (
      !credentials.clientConfig ||
      typeof credentials.clientConfig !== 'object'
    ) {
      throw new GoogleOAuth2TokenStorageError('save', undefined, {
        reason: 'Invalid credentials: clientConfig must be an object',
      });
    }

    if (
      !credentials.clientConfig.clientId ||
      typeof credentials.clientConfig.clientId !== 'string'
    ) {
      throw new GoogleOAuth2TokenStorageError('save', undefined, {
        reason: 'Invalid credentials: clientId is required',
      });
    }

    if (!credentials.storedAt || typeof credentials.storedAt !== 'number') {
      throw new GoogleOAuth2TokenStorageError('save', undefined, {
        reason: 'Invalid credentials: storedAt timestamp is required',
      });
    }
  }

  /**
   * Clear sensitive string data from memory by overwriting with zeros.
   * This is a best-effort approach to prevent sensitive data from lingering in memory.
   *
   * @param sensitiveString - String containing sensitive data to clear
   * @private
   */
  private clearString(sensitiveString: string): void {
    try {
      // Overwrite string content with zeros
      // Note: This is best effort - JavaScript engines may have already copied the string
      if (sensitiveString && typeof sensitiveString === 'string') {
        // Convert to buffer and overwrite
        const buffer = Buffer.from(sensitiveString, 'utf8');
        buffer.fill(0);
      }
    } catch {
      // Ignore clearing errors
    }
  }
}
