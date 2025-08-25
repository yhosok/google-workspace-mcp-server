import { SheetsResources } from '../../src/resources/sheets-resources.js';
import { AuthService } from '../../src/services/auth.service.js';
import { SheetsService } from '../../src/services/sheets.service.js';
import type { EnvironmentConfig } from '../../src/types/index.js';

describe('SheetsResources', () => {
  let sheetsResources: SheetsResources;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockSheetsService: jest.Mocked<SheetsService>;
  let mockConfig: EnvironmentConfig;

  beforeEach(() => {
    mockConfig = {
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: './test-key.json',
      GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id'
    };

    mockAuthService = {
      initialize: jest.fn(),
      getAuthClient: jest.fn(),
      validateAuth: jest.fn(),
      getGoogleAuth: jest.fn(),
    } as any;

    mockSheetsService = {
      initialize: jest.fn(),
      listSpreadsheets: jest.fn(),
      getSpreadsheet: jest.fn(),
      getSpreadsheetMetadata: jest.fn().mockImplementation(() => {
        const mockResult = {
          isOk: () => true,
          isErr: () => false,
          value: {
          spreadsheetId: 'test-sheet-id',
          spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test-sheet-id',
          properties: {
            title: 'Test Spreadsheet',
            locale: 'en_US',
            timeZone: 'America/New_York'
          },
          sheets: [
            {
              properties: {
                title: 'Sheet1',
                index: 0,
                sheetId: 0
              }
            },
            {
              properties: {
                title: 'Sheet2',
                index: 1,
                sheetId: 123456
              }
            }
          ]
          }
        };
        return Promise.resolve(mockResult);
      }),
      readRange: jest.fn(),
      writeRange: jest.fn(),
      appendData: jest.fn(),
    } as any;

    sheetsResources = new SheetsResources(mockAuthService, mockSheetsService);
  });

  describe('constructor', () => {
    test('should create instance with required services', () => {
      expect(sheetsResources).toBeInstanceOf(SheetsResources);
    });
  });

  describe('getSpreadsheetSchema', () => {
    test('should return spreadsheet schema with tools and resources info', async () => {
      const uri = 'schema://spreadsheets';
      const expectedSchema = {
        uri,
        text: expect.stringContaining('tools'),
        mimeType: 'application/json'
      };

      const result = await sheetsResources.getSpreadsheetSchema(uri);
      expect(result).toEqual(expect.objectContaining(expectedSchema));
    });

    test('should include all 4 tool definitions in schema', async () => {
      const result = await sheetsResources.getSpreadsheetSchema('schema://spreadsheets');
      const parsedContent = JSON.parse(result.text || '{}');
      
      expect(parsedContent.tools).toHaveLength(4);
      expect(parsedContent.tools.map((t: any) => t.name)).toEqual(
        expect.arrayContaining(['sheets-list', 'sheets-read', 'sheets-write', 'sheets-append'])
      );
    });

    test('should include resource definitions in schema', async () => {
      const result = await sheetsResources.getSpreadsheetSchema('schema://spreadsheets');
      const parsedContent = JSON.parse(result.text || '{}');
      
      expect(parsedContent.resources).toHaveLength(1);
      expect(parsedContent.resources[0].name).toBe('spreadsheet-data');
    });

    test('should include version information', async () => {
      const result = await sheetsResources.getSpreadsheetSchema('schema://spreadsheets');
      const parsedContent = JSON.parse(result.text || '{}');
      
      expect(parsedContent.version).toBeDefined();
      expect(typeof parsedContent.version).toBe('string');
    });

    test('should handle invalid URI', async () => {
      await expect(sheetsResources.getSpreadsheetSchema(''))
        .rejects.toThrow();
    });
  });

  describe('getSpreadsheetData', () => {
    test('should return spreadsheet data for valid ID', async () => {
      const uri = 'spreadsheet://test-sheet-id';
      const spreadsheetId = 'test-sheet-id';
      const expectedData = {
        uri,
        text: expect.stringContaining('id'),
        mimeType: 'application/json'
      };

      const result = await sheetsResources.getSpreadsheetData(uri, spreadsheetId);
      expect(result).toEqual(expect.objectContaining(expectedData));
    });

    test('should include spreadsheet metadata', async () => {
      const uri = 'spreadsheet://test-sheet-id';
      const spreadsheetId = 'test-sheet-id';
      
      const result = await sheetsResources.getSpreadsheetData(uri, spreadsheetId);
      const parsedContent = JSON.parse(result.text || '{}');
      
      expect(parsedContent).toHaveProperty('id');
      expect(parsedContent).toHaveProperty('title');
      expect(parsedContent).toHaveProperty('url');
      expect(parsedContent).toHaveProperty('sheets');
      expect(parsedContent).toHaveProperty('properties');
    });

    test('should include sheet information', async () => {
      const result = await sheetsResources.getSpreadsheetData('spreadsheet://test-sheet-id', 'test-sheet-id');
      const parsedContent = JSON.parse(result.text || '{}');
      
      expect(Array.isArray(parsedContent.sheets)).toBe(true);
      if (parsedContent.sheets.length > 0) {
        expect(parsedContent.sheets[0]).toHaveProperty('title');
        expect(parsedContent.sheets[0]).toHaveProperty('index');
        expect(parsedContent.sheets[0]).toHaveProperty('sheetId');
      }
    });

    test('should handle invalid spreadsheet ID', async () => {
      mockSheetsService.getSpreadsheetMetadata.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Spreadsheet not found',
            toJSON: () => ({ message: 'Spreadsheet not found' })
          }
        });
      });
      await expect(sheetsResources.getSpreadsheetData('spreadsheet://invalid', 'invalid'))
        .rejects.toThrow();
    });

    test('should handle empty URI', async () => {
      await expect(sheetsResources.getSpreadsheetData('', 'test-id'))
        .rejects.toThrow();
    });

    test('should handle empty spreadsheet ID', async () => {
      await expect(sheetsResources.getSpreadsheetData('spreadsheet://test', ''))
        .rejects.toThrow();
    });
  });

  describe('extractSpreadsheetId', () => {
    test('should extract ID from valid spreadsheet URI', () => {
      const uri = 'spreadsheet://1a2b3c4d5e6f';
      const expected = '1a2b3c4d5e6f';
      
      const result = sheetsResources.extractSpreadsheetId(uri);
      expect(result).toBe(expected);
    });

    test('should handle URI with query parameters', () => {
      const uri = 'spreadsheet://1a2b3c4d5e6f?sheet=Sheet1';
      const expected = '1a2b3c4d5e6f';
      
      const result = sheetsResources.extractSpreadsheetId(uri);
      expect(result).toBe(expected);
    });

    test('should handle URI with hash fragment', () => {
      const uri = 'spreadsheet://1a2b3c4d5e6f#gid=0';
      const expected = '1a2b3c4d5e6f';
      
      const result = sheetsResources.extractSpreadsheetId(uri);
      expect(result).toBe(expected);
    });

    test('should throw error for invalid URI format', () => {
      const invalidUris = [
        'invalid-uri',
        'spreadsheet://',
        'http://example.com',
        '',
        'spreadsheet'
      ];

      invalidUris.forEach(uri => {
        expect(() => sheetsResources.extractSpreadsheetId(uri))
          .toThrow();
      });
    });

    test('should handle complex spreadsheet IDs', () => {
      const complexId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      const uri = `spreadsheet://${complexId}`;
      
      const result = sheetsResources.extractSpreadsheetId(uri);
      expect(result).toBe(complexId);
    });
  });

  describe('error handling', () => {
    test('should handle auth service errors', async () => {
      mockSheetsService.getSpreadsheetMetadata.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Authentication failed',
            toJSON: () => ({ message: 'Authentication failed' })
          }
        });
      });
      await expect(sheetsResources.getSpreadsheetData('spreadsheet://error-auth', 'error-auth'))
        .rejects.toThrow();
    });

    test('should handle sheets service errors', async () => {
      mockSheetsService.getSpreadsheetMetadata.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Sheets service error',
            toJSON: () => ({ message: 'Sheets service error' })
          }
        });
      });
      await expect(sheetsResources.getSpreadsheetData('spreadsheet://error-sheets', 'error-sheets'))
        .rejects.toThrow();
    });

    test('should handle network errors', async () => {
      mockSheetsService.getSpreadsheetMetadata.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Network error',
            toJSON: () => ({ message: 'Network error' })
          }
        });
      });
      await expect(sheetsResources.getSpreadsheetData('spreadsheet://network-error', 'network-error'))
        .rejects.toThrow();
    });
  });
});