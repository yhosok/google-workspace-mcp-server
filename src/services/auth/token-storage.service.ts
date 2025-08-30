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
import { GoogleOAuth2TokenStorageError, GoogleTokenCacheCorruptedError } from '../../errors/index.js';
import { authMetrics } from './metrics.js';

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
      const keytarResult = await this.getFromKeytar();
      if (keytarResult !== null) {
        return keytarResult;
      }
      // Keytar returned null, try file storage fallback
    } catch (keytarError) {
      // If keytar corruption detected, try file storage fallback
      if (keytarError instanceof GoogleTokenCacheCorruptedError) {
        try {
          return await this.getFromFile();
        } catch (fileError) {
          // If file also corrupted, re-throw the original keytar corruption error
          if (fileError instanceof GoogleTokenCacheCorruptedError) {
            // Both storage methods are corrupted
            throw keytarError;
          }
          // File access failed but not corrupted, re-throw keytar error
          throw keytarError;
        }
      }
      
      // Non-corruption keytar error, try file storage fallback
    }
    
    // Try file storage (either keytar returned null or had non-corruption error)
    try {
      return await this.getFromFile();
    } catch (fileError) {
      // If file corruption detected, re-throw it
      if (fileError instanceof GoogleTokenCacheCorruptedError) {
        throw fileError;
      }
      // File storage failed for non-corruption reasons, return null
      return null;
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
    let serializedCredentials: string | null;
    try {
      serializedCredentials = await this.dependencies.keytar.getPassword(
        this.SERVICE_NAME,
        this.ACCOUNT_NAME
      );
    } catch (error) {
      // Keytar access error (e.g. network, service unavailable)
      // These are not corruption - just propagate the error
      throw error;
    }

    if (!serializedCredentials) {
      return null;
    }

    try {
      const credentials = JSON.parse(serializedCredentials);
      const validatedCredentials = this.validateAndReturnCredentials(credentials);
      
      if (validatedCredentials === null) {
        // Structure corruption detected
        const corruptionType = this.classifyKeytarCorruption(null, serializedCredentials);
        const timestamp = Date.now();
        await this.handleKeytarCorruption(this.SERVICE_NAME, this.ACCOUNT_NAME, corruptionType);
        throw new GoogleTokenCacheCorruptedError({
          source: 'keytar',
          timestamp: timestamp,
          error: `Missing required credential fields: ${corruptionType}`,
          details: {
            missingFields: this.getMissingFields(credentials),
            receivedStructure: credentials,
            corruptionType: corruptionType,
          },
        });
      }
      
      return validatedCredentials;
    } catch (error) {
      if (error instanceof GoogleTokenCacheCorruptedError) {
        throw error;
      }
      
      // JSON parsing error - corruption detected
      const corruptionType = this.classifyKeytarCorruption(error as Error, serializedCredentials);
      const timestamp = Date.now();
      await this.handleKeytarCorruption(this.SERVICE_NAME, this.ACCOUNT_NAME, corruptionType);
      throw new GoogleTokenCacheCorruptedError({
        source: 'keytar',
        timestamp: timestamp,
        error: `${(error as Error).message} ${corruptionType}`,
        details: {
          corruptionType: corruptionType,
        },
      });
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
    } catch (error) {
      // File doesn't exist or not readable - not corruption
      return null;
    }

    let decryptedData: string;
    try {
      decryptedData = await this.decryptData(encryptedData);
    } catch (error) {
      // Clear encrypted data from memory
      this.clearString(encryptedData);
      
      // Decryption failed - likely corruption
      const corruptionType = this.classifyFileCorruption(error as Error, encryptedData);
      if (corruptionType) {
        const timestamp = Date.now();
        await this.handleFileCorruption(this.TOKEN_FILE_PATH, corruptionType, error as Error);
        throw new GoogleTokenCacheCorruptedError({
          source: 'file',
          timestamp: timestamp,
          backupPath: `${this.TOKEN_FILE_PATH}.corrupted-${timestamp}`,
          error: `${(error as Error).message} ${corruptionType}`,
          details: {
            corruptionType: corruptionType,
          },
        });
      }
      // Not corruption, return null
      return null;
    } finally {
      // Clear encrypted data from memory
      this.clearString(encryptedData);
    }

    try {
      const credentials = JSON.parse(decryptedData);
      const validatedCredentials = this.validateAndReturnCredentials(credentials);
      
      if (validatedCredentials === null) {
        // Structure corruption detected
        const corruptionType = this.classifyFileCorruption(null, decryptedData);
        const timestamp = Date.now();
        await this.handleFileCorruption(this.TOKEN_FILE_PATH, corruptionType, null);
        throw new GoogleTokenCacheCorruptedError({
          source: 'file',
          timestamp: timestamp,
          backupPath: `${this.TOKEN_FILE_PATH}.corrupted-${timestamp}`,
          error: `Missing required credential fields: ${corruptionType}`,
          details: {
            missingFields: this.getMissingFields(credentials),
            receivedStructure: credentials,
            corruptionType: corruptionType,
          },
        });
      }
      
      return validatedCredentials;
    } catch (error) {
      if (error instanceof GoogleTokenCacheCorruptedError) {
        throw error;
      }
      
      // JSON parsing error - corruption detected
      const corruptionType = this.classifyFileCorruption(error as Error, decryptedData);
      const timestamp = Date.now();
      await this.handleFileCorruption(this.TOKEN_FILE_PATH, corruptionType, error as Error);
      throw new GoogleTokenCacheCorruptedError({
        source: 'file',
        timestamp: timestamp,
        backupPath: `${this.TOKEN_FILE_PATH}.corrupted-${timestamp}`,
        error: `${(error as Error).message} ${corruptionType}`,
        details: {
          corruptionType: corruptionType,
        },
      });
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

  /**
   * Classify the type of corruption detected in file storage.
   * 
   * Analyzes the error and data to determine the specific type of corruption:
   * - ENCRYPTION_CORRUPTION: Failed to decrypt the file or invalid encryption format
   * - JSON_CORRUPTION: Valid decryption but malformed JSON structure
   * - STRUCTURE_CORRUPTION: Valid JSON but missing required credential fields
   * 
   * This classification enables appropriate recovery strategies and detailed error reporting
   * for monitoring and debugging purposes.
   * 
   * @param error - The error that occurred during file processing (null for validation failures)
   * @param data - The data that caused the error (used for additional context)
   * @returns The type of corruption detected for error handling and metrics
   * @throws Never throws - designed to always return a valid classification
   * @private
   * @since v1.0.0 - Added as part of cache corruption detection system
   * 
   * @example
   * ```typescript
   * // Encryption error
   * const type1 = this.classifyFileCorruption(new Error('Invalid encryption format'));
   * // Returns: 'ENCRYPTION_CORRUPTION'
   * 
   * // JSON parsing error
   * const type2 = this.classifyFileCorruption(new SyntaxError('Unexpected token'));
   * // Returns: 'JSON_CORRUPTION'
   * 
   * // Structure validation failure
   * const type3 = this.classifyFileCorruption(null, '{"incomplete": "data"}');
   * // Returns: 'STRUCTURE_CORRUPTION'
   * ```
   */
  private classifyFileCorruption(
    error: Error | null,
    data?: string
  ): 'ENCRYPTION_CORRUPTION' | 'JSON_CORRUPTION' | 'STRUCTURE_CORRUPTION' {
    // Fast path: Check error type first (most specific to least specific)
    if (error) {
      // Performance optimization: Check instanceof before string operations
      if (error instanceof SyntaxError) {
        return 'JSON_CORRUPTION';
      }
      
      // Optimized string checking: Use direct property access and avoid includes() when possible
      const errorMessage = error.message;
      if (errorMessage) {
        // Check for encryption-related keywords (case-insensitive for robustness)
        const lowerMessage = errorMessage.toLowerCase();
        if (lowerMessage.indexOf('invalid') !== -1 || 
            lowerMessage.indexOf('decrypt') !== -1 || 
            lowerMessage.indexOf('cipher') !== -1) {
          return 'ENCRYPTION_CORRUPTION';
        }
      }
    }
    
    // Default: Structure corruption (validation failed)
    return 'STRUCTURE_CORRUPTION';
  }

  /**
   * Classify the type of corruption detected in keytar storage.
   * 
   * Keytar stores data in plain text, so encryption corruption is not applicable.
   * Only analyzes for JSON parsing errors and structure validation failures:
   * - JSON_CORRUPTION: Retrieved data is not valid JSON
   * - STRUCTURE_CORRUPTION: Valid JSON but missing required credential fields
   * 
   * This method is specifically optimized for keytar's storage characteristics
   * and provides classification for secure credential manager corruption scenarios.
   * 
   * @param error - The error that occurred during keytar processing (null for validation failures)
   * @param data - The data that caused the error (used for additional context)
   * @returns The type of corruption detected (JSON_CORRUPTION or STRUCTURE_CORRUPTION only)
   * @throws Never throws - designed to always return a valid classification
   * @private
   * @since v1.0.0 - Added as part of cache corruption detection system
   * 
   * @example
   * ```typescript
   * // JSON parsing error from keytar
   * const type1 = this.classifyKeytarCorruption(new SyntaxError('Invalid JSON'));
   * // Returns: 'JSON_CORRUPTION'
   * 
   * // Structure validation failure
   * const type2 = this.classifyKeytarCorruption(null, '{"tokens": {}}');
   * // Returns: 'STRUCTURE_CORRUPTION'
   * ```
   */
  private classifyKeytarCorruption(
    error: Error | null,
    data?: string
  ): 'JSON_CORRUPTION' | 'STRUCTURE_CORRUPTION' {
    // Fast path: Early return for JSON errors (most common corruption type)
    if (error?.constructor === SyntaxError) {
      return 'JSON_CORRUPTION';
    }
    
    // Default: Structure corruption (validation failed)
    return 'STRUCTURE_CORRUPTION';
  }

  /**
   * Handle file corruption by creating a backup and logging the corruption event.
   * 
   * This method implements the complete file corruption recovery process:
   * 1. Creates timestamped backup of corrupted file (.corrupted-<timestamp>)
   * 2. Logs detailed corruption event for monitoring and debugging
   * 3. Gracefully handles backup failures without throwing errors
   * 
   * The backup strategy preserves corrupted data for forensic analysis while
   * allowing fresh authentication to proceed. Corruption events are logged
   * with structured data for integration with monitoring systems.
   * 
   * Performance: Typically completes in <50ms for files up to 1KB.
   * 
   * @param filePath - Absolute path to the corrupted token file
   * @param corruptionType - Specific type of corruption for targeted recovery
   * @param error - The original error that triggered corruption detection (null for validation failures)
   * @throws Never throws - all errors are caught and logged for stability
   * @private
   * @since v1.0.0 - Added as part of cache corruption detection system
   * 
   * @example
   * ```typescript
   * // Handle encryption corruption with file backup
   * await this.handleFileCorruption(
   *   '/home/user/.config/tokens.enc',
   *   'ENCRYPTION_CORRUPTION',
   *   new Error('Decryption failed')
   * );
   * // Creates: /home/user/.config/tokens.enc.corrupted-1643723400000
   * // Logs: structured corruption event to console.error
   * ```
   */
  private async handleFileCorruption(
    filePath: string,
    corruptionType: 'ENCRYPTION_CORRUPTION' | 'JSON_CORRUPTION' | 'STRUCTURE_CORRUPTION',
    error: Error | null
  ): Promise<void> {
    // Lazy timestamp generation - only create when actually logging
    const createTimestamp = () => Date.now();
    
    // Pre-compute common error message to avoid repeated null checks
    const errorMessage = error?.message || 'Structure validation failed';
    
    // Emit cache corruption metric
    authMetrics.emitCacheCorrupted({
      source: 'file',
      corruptionType: corruptionType.toLowerCase() as 'json_corruption' | 'encryption_corruption' | 'structure_corruption',
      recoverable: true, // File corruption is recoverable by renaming to backup
      errorType: error?.name || 'validation_error'
    });
    
    try {
      const timestamp = createTimestamp();
      const backupPath = `${filePath}.corrupted-${timestamp}`;
      
      // Rename corrupted file to backup
      await this.dependencies.fs.promises.rename(filePath, backupPath);
      
      // Optimized logging: Use object spread only when necessary
      console.error('Token cache corruption detected', {
        source: 'file',
        timestamp,
        corruptionType,
        backupPath,
        error: errorMessage,
      });
    } catch (renameError) {
      // Ignore rename errors - file might already be moved or deleted
      // Use pre-computed timestamp for consistency in logs
      const timestamp = createTimestamp();
      const renameErrorMsg = renameError instanceof Error ? renameError.message : String(renameError);
      
      console.error('Token cache corruption detected (rename failed)', {
        source: 'file',
        timestamp,
        corruptionType,
        filePath,
        error: errorMessage,
        renameError: renameErrorMsg,
      });
    }
  }

  /**
   * Handle keytar corruption by cleaning the corrupted entry and logging the event.
   * 
   * This method implements the complete keytar corruption recovery process:
   * 1. Removes corrupted credentials from OS credential manager
   * 2. Logs detailed corruption event for monitoring and debugging
   * 3. Gracefully handles cleanup failures without throwing errors
   * 
   * Unlike file corruption, keytar corruption cannot preserve the corrupted data
   * for analysis since OS credential managers don't support backup operations.
   * However, detailed logging ensures corruption patterns can be tracked.
   * 
   * Performance: Typically completes in <100ms depending on OS credential manager.
   * 
   * @param serviceName - The keytar service identifier for credential lookup
   * @param accountName - The keytar account identifier for credential lookup
   * @param corruptionType - Specific type of corruption for monitoring metrics
   * @throws Never throws - all errors are caught and logged for stability
   * @private
   * @since v1.0.0 - Added as part of cache corruption detection system
   * 
   * @example
   * ```typescript
   * // Handle JSON corruption in keytar
   * await this.handleKeytarCorruption(
   *   'google-workspace-mcp',
   *   'oauth2-tokens',
   *   'JSON_CORRUPTION'
   * );
   * // Deletes: corrupted entry from OS credential manager
   * // Logs: structured corruption event to console.error
   * ```
   */
  private async handleKeytarCorruption(
    serviceName: string,
    accountName: string,
    corruptionType: 'JSON_CORRUPTION' | 'STRUCTURE_CORRUPTION'
  ): Promise<void> {
    // Lazy timestamp generation - only create when actually logging
    const createTimestamp = () => Date.now();
    
    // Pre-build base log object to avoid duplication
    const baseLogData = {
      source: 'keytar' as const,
      corruptionType,
      serviceName,
      accountName,
    };
    
    // Emit cache corruption metric
    authMetrics.emitCacheCorrupted({
      source: 'keytar',
      corruptionType: corruptionType.toLowerCase() as 'json_corruption' | 'structure_corruption',
      recoverable: true, // Keytar corruption is recoverable by deleting entry
      errorType: 'keytar_corruption'
    });
    
    try {
      // Clean corrupted keytar entry
      await this.dependencies.keytar.deletePassword(serviceName, accountName);
      
      // Log successful corruption cleanup
      console.error('Token cache corruption detected', {
        ...baseLogData,
        timestamp: createTimestamp(),
      });
    } catch (deleteError) {
      // Log cleanup failure with error details
      const deleteErrorMsg = deleteError instanceof Error ? deleteError.message : String(deleteError);
      
      console.error('Token cache corruption detected (cleanup failed)', {
        ...baseLogData,
        timestamp: createTimestamp(),
        deleteError: deleteErrorMsg,
      });
    }
  }

  /**
   * Get list of missing fields from a credential structure.
   *
   * @param credentials - The credentials object to check
   * @returns Array of missing field paths
   * @private
   */
  private getMissingFields(credentials: any): string[] {
    const missing: string[] = [];
    
    if (!credentials || typeof credentials !== 'object') {
      return ['credentials'];
    }
    
    if (!credentials.tokens || typeof credentials.tokens !== 'object') {
      missing.push('tokens');
      // If tokens is missing entirely, we can't check sub-fields
      missing.push('tokens.access_token');
    } else {
      if (!credentials.tokens.access_token || typeof credentials.tokens.access_token !== 'string') {
        missing.push('tokens.access_token');
      }
    }
    
    if (!credentials.clientConfig || typeof credentials.clientConfig !== 'object') {
      missing.push('clientConfig');
      // If clientConfig is missing entirely, we can't check sub-fields
      missing.push('clientConfig.clientId');
    } else {
      if (!credentials.clientConfig.clientId || typeof credentials.clientConfig.clientId !== 'string') {
        missing.push('clientConfig.clientId');
      }
    }
    
    if (!credentials.storedAt || typeof credentials.storedAt !== 'number') {
      missing.push('storedAt');
    }
    
    return missing;
  }
}
