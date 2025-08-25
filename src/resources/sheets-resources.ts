import type { AuthService } from '../services/auth.service.js';
import type { SheetsService } from '../services/sheets.service.js';
import type { sheets_v4 } from 'googleapis';

export interface SpreadsheetSchemaContent {
  tools: Array<{
    name: string;
    description: string;
    parameters: Record<string, string>;
  }>;
  resources: Array<{
    name: string;
    description: string;
    uri: string;
  }>;
  version: string;
}

export interface SpreadsheetDataContent {
  id: string;
  title: string;
  url: string;
  sheets: Array<{
    title: string;
    index: number;
    sheetId: number;
  }>;
  properties: {
    title: string;
    locale: string;
    timeZone: string;
  };
}

export interface ResourceContent {
  uri: string;
  text?: string;
  mimeType?: string;
}

export class SheetsResources {
  private authService: AuthService;
  private sheetsService: SheetsService;

  constructor(authService: AuthService, sheetsService: SheetsService) {
    this.authService = authService;
    this.sheetsService = sheetsService;
  }

  async getSpreadsheetSchema(uri: string): Promise<ResourceContent> {
    if (!uri || uri.trim() === '') {
      throw new Error('Invalid URI provided');
    }

    const schema: SpreadsheetSchemaContent = {
      tools: [
        {
          name: 'sheets-list',
          description: 'List all spreadsheets in the configured Drive folder',
          parameters: {}
        },
        {
          name: 'sheets-read',
          description: 'Read data from a specific spreadsheet range',
          parameters: {
            spreadsheetId: 'string',
            range: 'string'
          }
        },
        {
          name: 'sheets-write',
          description: 'Write data to a specific spreadsheet range',
          parameters: {
            spreadsheetId: 'string',
            range: 'string',
            values: 'string[][]'
          }
        },
        {
          name: 'sheets-append',
          description: 'Append data to a spreadsheet',
          parameters: {
            spreadsheetId: 'string',
            range: 'string',
            values: 'string[][]'
          }
        }
      ],
      resources: [
        {
          name: 'spreadsheet-data',
          description: 'Metadata and structure information for a specific spreadsheet',
          uri: 'spreadsheet://{spreadsheetId}'
        }
      ],
      version: '1.0.0'
    };

    return {
      uri,
      text: JSON.stringify(schema),
      mimeType: 'application/json'
    };
  }

  async getSpreadsheetData(uri: string, spreadsheetId: string): Promise<ResourceContent> {
    if (!uri || uri.trim() === '') {
      throw new Error('Invalid URI provided');
    }

    if (!spreadsheetId || spreadsheetId.trim() === '') {
      throw new Error('Invalid spreadsheet ID provided');
    }

    // Get spreadsheet metadata from the sheets service
    const spreadsheetResult = await this.sheetsService.getSpreadsheetMetadata(spreadsheetId);
    if (spreadsheetResult.isErr()) {
      throw new Error(`Failed to get spreadsheet metadata: ${spreadsheetResult.error.message}`);
    }

    const spreadsheet = spreadsheetResult.value;

    const data: SpreadsheetDataContent = {
      id: spreadsheet.spreadsheetId || '',
      title: spreadsheet.properties?.title || '',
      url: spreadsheet.spreadsheetUrl || '',
      sheets: spreadsheet.sheets?.map((sheet: sheets_v4.Schema$Sheet) => ({
        title: sheet.properties?.title || '',
        index: sheet.properties?.index || 0,
        sheetId: sheet.properties?.sheetId || 0
      })) || [],
      properties: {
        title: spreadsheet.properties?.title || '',
        locale: spreadsheet.properties?.locale || '',
        timeZone: spreadsheet.properties?.timeZone || ''
      }
    };

    return {
      uri,
      text: JSON.stringify(data),
      mimeType: 'application/json'
    };
  }

  // ユーティリティメソッド：URIからspreadsheetIdを抽出
  extractSpreadsheetId(uri: string): string {
    if (!uri || uri.trim() === '') {
      throw new Error('Invalid URI: URI cannot be empty');
    }

    // Check if URI starts with the expected protocol
    if (!uri.startsWith('spreadsheet://')) {
      throw new Error('Invalid URI: Must start with "spreadsheet://"');
    }

    // Extract the part after the protocol
    const afterProtocol = uri.substring('spreadsheet://'.length);
    
    if (!afterProtocol) {
      throw new Error('Invalid URI: No spreadsheet ID provided');
    }

    // Remove query parameters and hash fragments
    let spreadsheetId = afterProtocol;
    
    // Remove hash fragment if present
    const hashIndex = spreadsheetId.indexOf('#');
    if (hashIndex !== -1) {
      spreadsheetId = spreadsheetId.substring(0, hashIndex);
    }
    
    // Remove query parameters if present
    const queryIndex = spreadsheetId.indexOf('?');
    if (queryIndex !== -1) {
      spreadsheetId = spreadsheetId.substring(0, queryIndex);
    }

    if (!spreadsheetId) {
      throw new Error('Invalid URI: No valid spreadsheet ID found');
    }

    return spreadsheetId;
  }
}