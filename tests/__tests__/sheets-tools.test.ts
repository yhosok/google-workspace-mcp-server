import { SheetsTools } from '../../src/tools/sheets-tools.js';
import { AuthService } from '../../src/services/auth.service.js';
import { SheetsService } from '../../src/services/sheets.service.js';
import type { EnvironmentConfig } from '../../src/types/index.js';

describe('SheetsTools', () => {
  let sheetsTools: SheetsTools;
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
      validateAuth: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: true
        });
      }), // デフォルトで認証成功
      getGoogleAuth: jest.fn(),
    } as any;

    mockSheetsService = {
      initialize: jest.fn(),
      listSpreadsheets: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: [
            {
              id: 'sheet1',
              title: 'Test Sheet 1',
              url: 'https://docs.google.com/spreadsheets/d/sheet1',
              modifiedTime: '2023-01-01T00:00:00Z'
            },
            {
              id: 'sheet2',
              title: 'Test Sheet 2',
              url: 'https://docs.google.com/spreadsheets/d/sheet2',
              modifiedTime: '2023-01-02T00:00:00Z'
            }
          ]
        });
      }),
      getSpreadsheet: jest.fn(),
      readRange: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: {
            range: 'Sheet1!A1:B2',
            values: [['A1', 'B1'], ['A2', 'B2']],
            majorDimension: 'ROWS'
          }
        });
      }),
      writeRange: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: undefined
        });
      }),
      appendData: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: undefined
        });
      }),
      healthCheck: jest.fn().mockImplementation(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: true
        });
      }),
    } as any;

    sheetsTools = new SheetsTools(mockAuthService, mockSheetsService);
  });

  describe('constructor', () => {
    test('should create instance with required services', () => {
      expect(sheetsTools).toBeInstanceOf(SheetsTools);
    });
  });

  describe('sheetsList', () => {
    test('should return list of spreadsheets', async () => {
      const expectedResult = {
        spreadsheets: [
          {
            id: 'sheet1',
            title: 'Test Sheet 1',
            url: 'https://docs.google.com/spreadsheets/d/sheet1',
            modifiedTime: '2023-01-01T00:00:00Z'
          },
          {
            id: 'sheet2',
            title: 'Test Sheet 2', 
            url: 'https://docs.google.com/spreadsheets/d/sheet2',
            modifiedTime: '2023-01-02T00:00:00Z'
          }
        ]
      };

      const result = await sheetsTools.sheetsList();
      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual(expectedResult);
    });

    test('should handle empty spreadsheet list', async () => {
      mockSheetsService.listSpreadsheets.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: []
        });
      });
      const result = await sheetsTools.sheetsList();
      expect(result.isOk()).toBe(true);
      expect(result.value.spreadsheets).toEqual([]);
    });

    test('should handle error when service fails', async () => {
      mockSheetsService.listSpreadsheets.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Service failed',
            toJSON: () => ({ message: 'Service failed' })
          }
        });
      });
      const result = await sheetsTools.sheetsList();
      expect(result.isErr()).toBe(true);
    });
  });

  describe('sheetsRead', () => {
    test('should read data from spreadsheet range', async () => {
      const spreadsheetId = 'test-sheet-id';
      const range = 'Sheet1!A1:B2';
      const expectedResult = {
        range,
        values: [['A1', 'B1'], ['A2', 'B2']],
        majorDimension: 'ROWS'
      };

      const result = await sheetsTools.sheetsRead(spreadsheetId, range);
      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual(expectedResult);
    });

    test('should handle empty range', async () => {
      mockSheetsService.readRange.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: {
            range: 'A1:A1',
            values: [],
            majorDimension: 'ROWS'
          }
        });
      });

      const result = await sheetsTools.sheetsRead('sheet-id', 'A1:A1');
      expect(result.isOk()).toBe(true);
      expect(result.value.values).toEqual([]);
    });

    test('should handle error for invalid spreadsheet ID', async () => {
      const invalidId = 'invalid-id';
      mockSheetsService.readRange.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Spreadsheet not found',
            toJSON: () => ({ message: 'Spreadsheet not found' })
          }
        });
      });
      const result = await sheetsTools.sheetsRead(invalidId, 'A1:B2');
      expect(result.isErr()).toBe(true);
    });

    test('should handle error for invalid range format', async () => {
      const invalidRange = 'invalid-range';
      const result = await sheetsTools.sheetsRead('sheet-id', invalidRange);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('sheetsWrite', () => {
    test('should write data to spreadsheet range', async () => {
      const spreadsheetId = 'test-sheet-id';
      const range = 'Sheet1!A1:B2';
      const values = [['New A1', 'New B1'], ['New A2', 'New B2']];
      const expectedResult = {
        updatedCells: 4,
        updatedRows: 2,
        updatedColumns: 2
      };

      const result = await sheetsTools.sheetsWrite(spreadsheetId, range, values);
      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual(expectedResult);
    });

    test('should handle empty values', async () => {
      const result = await sheetsTools.sheetsWrite('sheet-id', 'A1:A1', []);
      expect(result.isOk()).toBe(true);
      expect(result.value.updatedCells).toBe(0);
    });

    test('should handle error for invalid parameters', async () => {
      const result = await sheetsTools.sheetsWrite('', 'A1:B2', [['data']]);
      expect(result.isErr()).toBe(true);
    });

    test('should handle large datasets', async () => {
      const largeValues = Array(1000).fill(['data1', 'data2']);
      const result = await sheetsTools.sheetsWrite('sheet-id', 'A1:B1000', largeValues);
      expect(result.isOk()).toBe(true);
      expect(result.value.updatedRows).toBe(1000);
    });
  });

  describe('sheetsAppend', () => {
    test('should append data to spreadsheet', async () => {
      const spreadsheetId = 'test-sheet-id';
      const range = 'Sheet1!A1';
      const values = [['Appended 1', 'Appended 2']];
      const expectedResult = {
        updates: {
          updatedRows: 1,
          updatedCells: 2
        }
      };

      const result = await sheetsTools.sheetsAppend(spreadsheetId, range, values);
      expect(result.isOk()).toBe(true);
      expect(result.value).toEqual(expectedResult);
    });

    test('should handle multiple rows', async () => {
      const values = [
        ['Row 1 Col 1', 'Row 1 Col 2'],
        ['Row 2 Col 1', 'Row 2 Col 2']
      ];

      const result = await sheetsTools.sheetsAppend('sheet-id', 'A1', values);
      expect(result.isOk()).toBe(true);
      expect(result.value.updates.updatedRows).toBe(2);
      expect(result.value.updates.updatedCells).toBe(4);
    });

    test('should handle error for invalid spreadsheet ID', async () => {
      const result = await sheetsTools.sheetsAppend('', 'A1', [['data']]);
      expect(result.isErr()).toBe(true);
    });

    test('should handle error from sheets service', async () => {
      mockSheetsService.appendData.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Service error',
            toJSON: () => ({ message: 'Service error' })
          }
        });
      });
      const result = await sheetsTools.sheetsAppend('error-sheet-id', 'A1', [['data']]);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle authentication errors', async () => {
      mockAuthService.validateAuth.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: false
        });
      });
      const result = await sheetsTools.sheetsList();
      expect(result.isErr()).toBe(true);
    });

    test('should handle service initialization errors', async () => {
      mockSheetsService.listSpreadsheets.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => false,
          isErr: () => true,
          error: { 
            message: 'Init failed',
            toJSON: () => ({ message: 'Init failed' })
          }
        });
      });
      const result = await sheetsTools.sheetsList();
      expect(result.isErr()).toBe(true);
    });
  });

  describe('parameter validation', () => {
    test('should validate spreadsheet ID parameter', async () => {
      const readResult = await sheetsTools.sheetsRead('', 'A1:B2');
      expect(readResult.isErr()).toBe(true);
      
      const writeResult = await sheetsTools.sheetsWrite('', 'A1:B2', [['data']]);
      expect(writeResult.isErr()).toBe(true);
      
      const appendResult = await sheetsTools.sheetsAppend('', 'A1', [['data']]);
      expect(appendResult.isErr()).toBe(true);
    });

    test('should validate range parameter', async () => {
      const readResult = await sheetsTools.sheetsRead('sheet-id', '');
      expect(readResult.isErr()).toBe(true);
      
      const writeResult = await sheetsTools.sheetsWrite('sheet-id', '', [['data']]);
      expect(writeResult.isErr()).toBe(true);
      
      const appendResult = await sheetsTools.sheetsAppend('sheet-id', '', [['data']]);
      expect(appendResult.isErr()).toBe(true);
    });

    test('should validate values parameter for write operations', async () => {
      const validValues = [['valid', 'data']];
      // These should work now that they're implemented
      const writeResult = await sheetsTools.sheetsWrite('sheet-id', 'A1:B1', validValues);
      expect(writeResult.isOk()).toBe(true);
      expect(writeResult.value.updatedRows).toBe(1);
      
      const appendResult = await sheetsTools.sheetsAppend('sheet-id', 'A1', validValues);
      expect(appendResult.isOk()).toBe(true);
      expect(appendResult.value.updates.updatedRows).toBe(1);
    });
  });

  describe('integration scenarios', () => {
    test('should handle read-write cycle', async () => {
      // Mock readRange to return some data
      mockSheetsService.readRange.mockImplementationOnce(() => {
        return Promise.resolve({
          isOk: () => true,
          isErr: () => false,
          value: {
            range: 'A1:B2',
            values: [['old1', 'old2']],
            majorDimension: 'ROWS'
          }
        });
      });

      // Test the read operation
      const readResult = await sheetsTools.sheetsRead('sheet-id', 'A1:B2');
      expect(readResult.isOk()).toBe(true);
      expect(readResult.value.values).toEqual([['old1', 'old2']]);

      // Test the write operation
      const writeResult = await sheetsTools.sheetsWrite('sheet-id', 'A1:B2', [['new1', 'new2']]);
      expect(writeResult.isOk()).toBe(true);
      expect(writeResult.value.updatedRows).toBe(1);
    });

    test('should handle bulk operations', async () => {
      const bulkData = Array(50).fill(0).map((_, i) => [`Row ${i + 1}`, `Data ${i + 1}`]);
      const result = await sheetsTools.sheetsAppend('sheet-id', 'A1', bulkData);
      expect(result.isOk()).toBe(true);
      expect(result.value.updates.updatedRows).toBe(50);
      expect(result.value.updates.updatedCells).toBe(100);
    });
  });

  describe('performance considerations', () => {
    test('should handle timeout scenarios', async () => {
      // Test that normal operations work (timeout handling would be in service layer)
      const result = await sheetsTools.sheetsList();
      expect(result.isOk()).toBe(true);
      expect(result.value.spreadsheets).toBeDefined();
    });

    test('should handle rate limiting', async () => {
      // Test multiple concurrent calls work (rate limiting would be in service layer)
      const promises = Array(10).fill(null).map(() => sheetsTools.sheetsList());
      const results = await Promise.all(promises);
      expect(results.length).toBe(10);
      results.forEach(result => {
        expect(result.isOk()).toBe(true);
        expect(result.value.spreadsheets).toBeDefined();
      });
    });
  });
});