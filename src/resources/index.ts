export * from './sheets-resources.js';

// IMPLEMENT_PLAN.mdで指定されたリソース名定数（更新）
export const RESOURCE_NAMES = {
  SPREADSHEET_SCHEMA: 'spreadsheet-schema',
  SPREADSHEET_DATA: 'spreadsheet-data',
} as const;

export const RESOURCE_URIS = {
  SCHEMA: 'schema://spreadsheets',
  DATA_TEMPLATE: 'spreadsheet://{spreadsheetId}',
} as const;