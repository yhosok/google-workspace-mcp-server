// 環境変数の型定義
export interface EnvironmentConfig {
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: string;
  GOOGLE_DRIVE_FOLDER_ID: string;
  GOOGLE_RETRY_MAX_ATTEMPTS?: number;
  GOOGLE_RETRY_BASE_DELAY?: number;
  GOOGLE_RETRY_MAX_DELAY?: number;
  GOOGLE_RETRY_JITTER?: number;
  GOOGLE_RETRY_RETRIABLE_CODES?: number[];
}

// Google Sheets関連の型定義
export interface SpreadsheetInfo {
  id: string;
  title: string;
  url: string;
  modifiedTime?: string;
}

export interface SheetData {
  range: string;
  values: string[][];
  majorDimension?: string;
}

// MCPツール関連の型定義
export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'resource_link';
    text?: string;
    uri?: string;
    name?: string;
    mimeType?: string;
    description?: string;
  }>;
  isError?: boolean;
}

// Sheetsツール用の結果型
export interface SheetsListResult {
  spreadsheets: Array<{
    id: string;
    title: string;
    url: string;
    modifiedTime?: string;
  }>;
}

export interface SheetsReadResult {
  range: string;
  values: string[][];
  majorDimension: string;
}

export interface SheetsWriteResult {
  updatedCells: number;
  updatedRows: number;
  updatedColumns: number;
}

export interface SheetsAppendResult {
  updates: {
    updatedRows: number;
    updatedCells: number;
  };
}

export interface SheetsAddSheetResult {
  sheetId: number;
  title: string;
  index: number;
  spreadsheetId: string;
}

export interface SheetsCreateSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
  }>;
}

// MCPリソース関連の型定義
export interface MCPResourceContent {
  uri: string;
  text?: string;
  mimeType?: string;
}

export interface MCPResourceResponse {
  /** Array of resource contents */
  contents: MCPResourceContent[];
}

/**
 * Configuration interface for retry behavior.
 * Used by GoogleService for handling transient failures.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;

  /** Base delay in milliseconds between attempts (default: 1000) */
  baseDelay: number;

  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number;

  /** Jitter factor to randomize delays (0-1, default: 0.1) */
  jitter: number;

  /** HTTP status codes that should trigger retry attempts */
  retriableCodes: number[];
}

/**
 * HTTP status codes commonly used in Google API error handling.
 */
export enum HttpStatusCode {
  /** Request succeeded */
  OK = 200,

  /** Bad request - client error */
  BAD_REQUEST = 400,

  /** Authentication failed */
  UNAUTHORIZED = 401,

  /** Access denied */
  FORBIDDEN = 403,

  /** Resource not found */
  NOT_FOUND = 404,

  /** Request method not allowed */
  METHOD_NOT_ALLOWED = 405,

  /** Request timeout */
  REQUEST_TIMEOUT = 408,

  /** Rate limit exceeded */
  TOO_MANY_REQUESTS = 429,

  /** Internal server error */
  INTERNAL_SERVER_ERROR = 500,

  /** Bad gateway */
  BAD_GATEWAY = 502,

  /** Service unavailable */
  SERVICE_UNAVAILABLE = 503,

  /** Gateway timeout */
  GATEWAY_TIMEOUT = 504,
}
