import { z } from 'zod';
import type { EnvironmentConfig } from '../types/index.js';

/**
 * Environment variable schema definition for Google Workspace MCP Server.
 * Validates and transforms environment variables with retry configuration
 * and OAuth2 authentication support.
 */
const envSchema = z
  .object({
    // Service Account Configuration
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: z.string().optional(),
    GOOGLE_DRIVE_FOLDER_ID: z.string().optional(),

    // OAuth2 Configuration
    GOOGLE_AUTH_MODE: z.enum(['service-account', 'oauth2']).optional(),
    GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
    GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GOOGLE_OAUTH_REDIRECT_URI: z.string().optional(),
    GOOGLE_OAUTH_SCOPES: z.string().optional(),
    GOOGLE_OAUTH_PORT: z.string().optional(),

    // Retry Configuration
    GOOGLE_RETRY_MAX_ATTEMPTS: z.string().optional(),
    GOOGLE_RETRY_BASE_DELAY: z.string().optional(),
    GOOGLE_RETRY_MAX_DELAY: z.string().optional(),
    GOOGLE_RETRY_JITTER: z.string().optional(),
    GOOGLE_RETRY_RETRIABLE_CODES: z.string().optional(),

    // Timeout Configuration
    GOOGLE_REQUEST_TIMEOUT: z.string().optional(),
    GOOGLE_TOTAL_TIMEOUT: z.string().optional(),
  })
  .transform(data => ({
    // Service Account Configuration
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH: data.GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    GOOGLE_DRIVE_FOLDER_ID: data.GOOGLE_DRIVE_FOLDER_ID || '',

    // OAuth2 Configuration
    GOOGLE_AUTH_MODE: data.GOOGLE_AUTH_MODE as
      | 'service-account'
      | 'oauth2'
      | undefined,
    GOOGLE_OAUTH_CLIENT_ID: data.GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET: data.GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_REDIRECT_URI: data.GOOGLE_OAUTH_REDIRECT_URI,
    GOOGLE_OAUTH_SCOPES: data.GOOGLE_OAUTH_SCOPES,
    GOOGLE_OAUTH_PORT: parseIntegerEnvVar(
      data.GOOGLE_OAUTH_PORT,
      'GOOGLE_OAUTH_PORT'
    ),

    // Retry Configuration
    GOOGLE_RETRY_MAX_ATTEMPTS: parseIntegerEnvVar(
      data.GOOGLE_RETRY_MAX_ATTEMPTS,
      'GOOGLE_RETRY_MAX_ATTEMPTS'
    ),
    GOOGLE_RETRY_BASE_DELAY: parseIntegerEnvVar(
      data.GOOGLE_RETRY_BASE_DELAY,
      'GOOGLE_RETRY_BASE_DELAY'
    ),
    GOOGLE_RETRY_MAX_DELAY: parseIntegerEnvVar(
      data.GOOGLE_RETRY_MAX_DELAY,
      'GOOGLE_RETRY_MAX_DELAY'
    ),
    GOOGLE_RETRY_JITTER: parseFloatEnvVar(
      data.GOOGLE_RETRY_JITTER,
      'GOOGLE_RETRY_JITTER'
    ),
    GOOGLE_RETRY_RETRIABLE_CODES: parseRetryCodesEnvVar(
      data.GOOGLE_RETRY_RETRIABLE_CODES,
      'GOOGLE_RETRY_RETRIABLE_CODES'
    ),

    // Timeout Configuration
    GOOGLE_REQUEST_TIMEOUT: parseIntegerEnvVar(
      data.GOOGLE_REQUEST_TIMEOUT,
      'GOOGLE_REQUEST_TIMEOUT'
    ),
    GOOGLE_TOTAL_TIMEOUT: parseIntegerEnvVar(
      data.GOOGLE_TOTAL_TIMEOUT,
      'GOOGLE_TOTAL_TIMEOUT'
    ),
  }))
  .refine(data => {
    // Final validation of parsed values
    validateRetryConfig(data);
    validateAuthConfig(data);
    return true;
  });

/**
 * Helper function to parse integer environment variables.
 * @param value - The environment variable value
 * @param name - The environment variable name for error reporting
 * @returns Parsed integer or undefined
 */
function parseIntegerEnvVar(
  value: string | undefined,
  name: string
): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`${name} must be a valid integer, got: ${value}`);
  }
  return parsed;
}

/**
 * Helper function to parse float environment variables.
 * @param value - The environment variable value
 * @param name - The environment variable name for error reporting
 * @returns Parsed float or undefined
 */
function parseFloatEnvVar(
  value: string | undefined,
  name: string
): number | undefined {
  if (!value) return undefined;
  const parsed = parseFloat(value);
  if (isNaN(parsed)) {
    throw new Error(`${name} must be a valid number, got: ${value}`);
  }
  return parsed;
}

/**
 * Helper function to parse retry codes environment variable.
 * @param value - The environment variable value (comma-separated codes)
 * @param name - The environment variable name for error reporting
 * @returns Array of parsed integers or undefined
 */
function parseRetryCodesEnvVar(
  value: string | undefined,
  name: string
): number[] | undefined {
  if (!value) return undefined;

  const codes = value.split(',').map(code => {
    const trimmed = code.trim();
    const parsed = parseInt(trimmed, 10);
    if (isNaN(parsed)) {
      throw new Error(`${name} contains invalid code: ${trimmed}`);
    }
    return parsed;
  });

  return codes;
}

/**
 * Validates retry configuration values.
 * @param data - The parsed environment configuration
 */
function validateRetryConfig(data: EnvironmentConfig): void {
  const {
    GOOGLE_RETRY_MAX_ATTEMPTS,
    GOOGLE_RETRY_BASE_DELAY,
    GOOGLE_RETRY_MAX_DELAY,
    GOOGLE_RETRY_JITTER,
  } = data;

  if (
    GOOGLE_RETRY_MAX_ATTEMPTS !== undefined &&
    GOOGLE_RETRY_MAX_ATTEMPTS <= 0
  ) {
    throw new Error('GOOGLE_RETRY_MAX_ATTEMPTS must be a positive number');
  }

  if (GOOGLE_RETRY_BASE_DELAY !== undefined && GOOGLE_RETRY_BASE_DELAY <= 0) {
    throw new Error('GOOGLE_RETRY_BASE_DELAY must be a positive number');
  }

  if (GOOGLE_RETRY_MAX_DELAY !== undefined && GOOGLE_RETRY_MAX_DELAY <= 0) {
    throw new Error('GOOGLE_RETRY_MAX_DELAY must be a positive number');
  }

  if (
    GOOGLE_RETRY_JITTER !== undefined &&
    (GOOGLE_RETRY_JITTER < 0 || GOOGLE_RETRY_JITTER > 1)
  ) {
    throw new Error('GOOGLE_RETRY_JITTER must be a number between 0 and 1');
  }

  // Validate that max delay is greater than base delay
  if (
    GOOGLE_RETRY_BASE_DELAY !== undefined &&
    GOOGLE_RETRY_MAX_DELAY !== undefined &&
    GOOGLE_RETRY_MAX_DELAY < GOOGLE_RETRY_BASE_DELAY
  ) {
    throw new Error(
      'GOOGLE_RETRY_MAX_DELAY must be greater than or equal to GOOGLE_RETRY_BASE_DELAY'
    );
  }
}

/**
 * Validates authentication configuration values.
 * Ensures that required credentials are provided for the selected auth mode.
 * @param data - The parsed environment configuration
 */
function validateAuthConfig(data: EnvironmentConfig): void {
  const {
    GOOGLE_AUTH_MODE,
    GOOGLE_SERVICE_ACCOUNT_KEY_PATH,
    GOOGLE_OAUTH_CLIENT_ID,
    GOOGLE_OAUTH_CLIENT_SECRET,
    GOOGLE_OAUTH_PORT,
  } = data;

  // If auth mode is explicitly set, validate required credentials
  if (GOOGLE_AUTH_MODE === 'service-account') {
    if (!GOOGLE_SERVICE_ACCOUNT_KEY_PATH) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_KEY_PATH is required when GOOGLE_AUTH_MODE is "service-account"'
      );
    }
  } else if (GOOGLE_AUTH_MODE === 'oauth2') {
    if (!GOOGLE_OAUTH_CLIENT_ID) {
      throw new Error(
        'GOOGLE_OAUTH_CLIENT_ID is required when GOOGLE_AUTH_MODE is "oauth2"'
      );
    }
    if (!GOOGLE_OAUTH_CLIENT_SECRET) {
      throw new Error(
        'GOOGLE_OAUTH_CLIENT_SECRET is required when GOOGLE_AUTH_MODE is "oauth2"'
      );
    }
  }

  // If no explicit auth mode, but OAuth2 credentials are provided, validate them
  if (
    !GOOGLE_AUTH_MODE &&
    (GOOGLE_OAUTH_CLIENT_ID || GOOGLE_OAUTH_CLIENT_SECRET)
  ) {
    if (!GOOGLE_OAUTH_CLIENT_ID) {
      throw new Error(
        'GOOGLE_OAUTH_CLIENT_SECRET requires GOOGLE_OAUTH_CLIENT_ID'
      );
    }
    if (!GOOGLE_OAUTH_CLIENT_SECRET) {
      throw new Error(
        'GOOGLE_OAUTH_CLIENT_ID requires GOOGLE_OAUTH_CLIENT_SECRET'
      );
    }
  }

  // Validate OAuth2 port if provided
  if (GOOGLE_OAUTH_PORT !== undefined) {
    if (GOOGLE_OAUTH_PORT <= 0 || GOOGLE_OAUTH_PORT > 65535) {
      throw new Error(
        'GOOGLE_OAUTH_PORT must be a valid port number (1-65535)'
      );
    }
    if (
      GOOGLE_OAUTH_PORT < 1024 &&
      GOOGLE_OAUTH_PORT !== 80 &&
      GOOGLE_OAUTH_PORT !== 443
    ) {
      console.warn(
        'Warning: GOOGLE_OAUTH_PORT is set to a privileged port (<1024). This may require admin privileges.'
      );
    }
  }

  // Validate that at least one auth method is configured
  const hasServiceAccount = !!GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
  const hasOAuth2 = !!(GOOGLE_OAUTH_CLIENT_ID && GOOGLE_OAUTH_CLIENT_SECRET);

  if (!hasServiceAccount && !hasOAuth2) {
    throw new Error(
      'At least one authentication method must be configured. ' +
        'Provide either GOOGLE_SERVICE_ACCOUNT_KEY_PATH or both GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.'
    );
  }
}

/**
 * Loads and validates the environment configuration.
 * @returns Validated environment configuration
 * @throws Error if configuration is invalid
 */
export function loadConfig(): EnvironmentConfig {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      throw new Error(
        `Configuration validation failed: ${firstError?.message || 'Unknown error'}`
      );
    }
    throw error;
  }
}

/**
 * Google API scopes required by the MCP server.
 * These scopes provide the necessary permissions for:
 * - Reading and writing Google Sheets
 * - Creating and managing files in Google Drive
 * - Reading and writing Google Calendar events
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  // Drive file scope needed to create/move spreadsheets into folders
  // Note: drive.readonly would block spreadsheet creation operations
  'https://www.googleapis.com/auth/drive.file',
  // Calendar scope for reading and writing calendar events
  'https://www.googleapis.com/auth/calendar',
] as const;

/**
 * Type for Google API scopes.
 */
export type GoogleScope = (typeof GOOGLE_SCOPES)[number];
