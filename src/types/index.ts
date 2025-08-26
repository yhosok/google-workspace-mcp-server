// 環境変数の型定義
export interface EnvironmentConfig {
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH: string;
  GOOGLE_DRIVE_FOLDER_ID: string;
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
  contents: MCPResourceContent[];
}