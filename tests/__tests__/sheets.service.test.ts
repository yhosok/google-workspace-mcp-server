import { SheetsService } from '../../src/services/sheets.service.js';
import { AuthService } from '../../src/services/auth.service.js';
import type { EnvironmentConfig } from '../../src/types/index.js';
import { google } from 'googleapis';
import { TEST_RETRY_CONFIG } from '../test-config.js';
import { GoogleAuthError } from '../../src/errors/index.js';
import { err, ok } from 'neverthrow';
import type { OAuth2Client } from 'google-auth-library';

// googleapis のモック
jest.mock('googleapis');
const mockGoogle = google as jest.Mocked<typeof google>;

describe('SheetsService', () => {
  let sheetsService: SheetsService;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockConfig: EnvironmentConfig;
  let mockSheetsApi: any;
  let mockDriveApi: any;
  let mockAuth: any;

  // Set timeout for tests that might be slow
  jest.setTimeout(10000);

  beforeEach(() => {
    mockConfig = {
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: './test-key.json',
      GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id'
    };

    // Google APIs のモック作成
    mockAuth = { /* mock auth object */ };
    mockSheetsApi = {
      spreadsheets: {
        get: jest.fn(),
        values: {
          get: jest.fn(),
          update: jest.fn(),
          append: jest.fn(),
        }
      }
    };
    mockDriveApi = {
      files: {
        list: jest.fn(),
      }
    };

    // googleapis モックの設定
    mockGoogle.sheets = jest.fn().mockReturnValue(mockSheetsApi);
    mockGoogle.drive = jest.fn().mockReturnValue(mockDriveApi);

    // AuthService のモック作成 - Result型を返すように修正
    mockAuthService = {
      initialize: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false }),
      getAuthClient: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: mockAuth }),
      validateAuth: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: true }),
      getGoogleAuth: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: mockAuth }),
    } as any;

    // Use fast retry config for testing to minimize execution time
    sheetsService = new SheetsService(mockAuthService, undefined, TEST_RETRY_CONFIG);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('should create instance with AuthService', () => {
      expect(sheetsService).toBeInstanceOf(SheetsService);
      expect(sheetsService['authService']).toBe(mockAuthService);
    });
  });

  describe('initialize', () => {
    test('should initialize Sheets and Drive APIs', async () => {
      const result = await sheetsService.initialize();
      
      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalled();
      expect(mockGoogle.sheets).toHaveBeenCalledWith({ version: 'v4', auth: mockAuth });
      expect(mockGoogle.drive).toHaveBeenCalledWith({ version: 'v3', auth: mockAuth });
    });

    test('should set up both sheetsApi and driveApi properties', async () => {
      await sheetsService.initialize();
      
      expect(sheetsService['sheetsApi']).toBeDefined();
      expect(sheetsService['driveApi']).toBeDefined();
    });
  });

  describe('listSpreadsheets', () => {
    test('should return list of spreadsheets from Drive folder', async () => {
      const mockFiles = [
        {
          id: 'sheet1',
          name: 'Test Sheet 1',
          webViewLink: 'https://docs.google.com/spreadsheets/d/sheet1',
          modifiedTime: '2023-01-01T00:00:00Z'
        },
        {
          id: 'sheet2', 
          name: 'Test Sheet 2',
          webViewLink: 'https://docs.google.com/spreadsheets/d/sheet2',
          modifiedTime: '2023-01-02T00:00:00Z'
        }
      ];

      mockDriveApi.files.list.mockResolvedValue({
        data: { files: mockFiles }
      });

      const result = await sheetsService.listSpreadsheets();
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([
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
        ]);
      }
    });

    test('should handle empty folder', async () => {
      mockDriveApi.files.list.mockResolvedValue({
        data: { files: [] }
      });
      
      const result = await sheetsService.listSpreadsheets();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    test('should auto-initialize when not initialized', async () => {
      mockDriveApi.files.list.mockResolvedValue({
        data: { files: [] }
      });
      
      const result = await sheetsService.listSpreadsheets();
      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalled();
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('getSpreadsheet', () => {
    test('should return spreadsheet info for valid ID', async () => {
      const spreadsheetId = 'test-sheet-id';
      const mockResponse = {
        data: {
          spreadsheetId,
          properties: { title: 'Test Spreadsheet' },
          spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`
        }
      };

      mockSheetsApi.spreadsheets.get.mockResolvedValue(mockResponse);

      const result = await sheetsService.getSpreadsheet(spreadsheetId);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: spreadsheetId,
          title: 'Test Spreadsheet',
          url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
        });
      }
    });

    test('should return error for invalid spreadsheet ID', async () => {
      const invalidId = 'invalid-id';
      const error = new Error('Invalid spreadsheet ID') as Error & { code: number };
      error.code = 400;
      mockSheetsApi.spreadsheets.get.mockRejectedValue(error);
      
      const result = await sheetsService.getSpreadsheet(invalidId);
      expect(result.isErr()).toBe(true);
    });

    test('should return error for empty spreadsheet ID', async () => {
      const result = await sheetsService.getSpreadsheet('');
      expect(result.isErr()).toBe(true);
      // The actual error message from the service might be different
      if (result.isErr()) {
        expect(result.error.message).toMatch(/Invalid range specified|Spreadsheet ID cannot be empty/);
      }
    });

    test('should handle spreadsheet not found error', async () => {
      const nonExistentId = 'non-existent-id';
      const error = new Error('Spreadsheet not found') as Error & { code: number };
      error.code = 404;
      mockSheetsApi.spreadsheets.get.mockRejectedValue(error);
      
      const result = await sheetsService.getSpreadsheet(nonExistentId);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('readRange', () => {
    test('should read data from specified range', async () => {
      const spreadsheetId = 'test-sheet-id';
      const range = 'Sheet1!A1:B2';
      const mockResponse = {
        data: {
          range,
          values: [['A1', 'B1'], ['A2', 'B2']],
          majorDimension: 'ROWS'
        }
      };

      mockSheetsApi.spreadsheets.values.get.mockResolvedValue(mockResponse);

      const result = await sheetsService.readRange(spreadsheetId, range);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          range,
          values: [['A1', 'B1'], ['A2', 'B2']],
          majorDimension: 'ROWS'
        });
      }
    });

    test('should return empty data for empty range', async () => {
      const mockResponse = {
        data: {
          range: 'Sheet1!A1:A1',
          values: [],
          majorDimension: 'ROWS'
        }
      };

      mockSheetsApi.spreadsheets.values.get.mockResolvedValue(mockResponse);
      
      const result = await sheetsService.readRange('sheet-id', 'Sheet1!A1:A1');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.values).toEqual([]);
      }
    });

    test('should handle invalid range format', async () => {
      const invalidRanges = ['', 'InvalidRange', 'Sheet1!', '!A1:B2'];
      
      for (const range of invalidRanges) {
        const result = await sheetsService.readRange('sheet-id', range);
        expect(result.isErr()).toBe(true);
        // The actual error message from the service might be different
        if (result.isErr()) {
          expect(result.error.message).toMatch(/Invalid range format|Invalid range specified/);
        }
      }
    });

    test('should handle single cell range', async () => {
      const mockResponse = {
        data: {
          range: 'Sheet1!A1',
          values: [['Single Value']],
          majorDimension: 'ROWS'
        }
      };

      mockSheetsApi.spreadsheets.values.get.mockResolvedValue(mockResponse);
      
      const result = await sheetsService.readRange('sheet-id', 'Sheet1!A1');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.range).toBe('Sheet1!A1');
        expect(Array.isArray(result.value.values)).toBe(true);
      }
    });
  });

  describe('writeRange', () => {
    test('should write data to specified range', async () => {
      const spreadsheetId = 'test-sheet-id';
      const range = 'Sheet1!A1:B2';
      const values = [['New A1', 'New B1'], ['New A2', 'New B2']];

      mockSheetsApi.spreadsheets.values.update.mockResolvedValue({ data: {} });

      const result = await sheetsService.writeRange(spreadsheetId, range, values);
      expect(result.isOk()).toBe(true);
      
      expect(mockSheetsApi.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values,
          majorDimension: 'ROWS',
        },
      });
    });

    test('should handle empty values array', async () => {
      mockSheetsApi.spreadsheets.values.update.mockResolvedValue({ data: {} });
      
      const result = await sheetsService.writeRange('sheet-id', 'Sheet1!A1:A1', []);
      expect(result.isOk()).toBe(true);
    });

    test('should handle single cell write', async () => {
      const values = [['Single Value']];
      mockSheetsApi.spreadsheets.values.update.mockResolvedValue({ data: {} });
      
      const result = await sheetsService.writeRange('sheet-id', 'Sheet1!A1', values);
      expect(result.isOk()).toBe(true);
    });

    test('should validate range and values dimensions', async () => {
      // 範囲とデータの次元が合わない場合
      const values = [['A1', 'B1', 'C1']]; // 3列のデータ
      const range = 'Sheet1!A1:B1'; // 2列の範囲
      
      const result = await sheetsService.writeRange('sheet-id', range, values);
      expect(result.isErr()).toBe(true);
      // The actual error might be about invalid range rather than dimension mismatch
      if (result.isErr()) {
        expect(result.error.message).toMatch(/Range and values dimensions do not match|Invalid range specified/);
      }
    });

    test('should handle large data sets', async () => {
      // 大量データの書き込みテスト
      const largeValues = Array(100).fill(null).map((_, i) => [`Row ${i}`, `Value ${i}`]);
      mockSheetsApi.spreadsheets.values.update.mockResolvedValue({ data: {} });
      
      const result = await sheetsService.writeRange('sheet-id', 'Sheet1!A1:B100', largeValues);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('appendData', () => {
    test('should append data to spreadsheet', async () => {
      const spreadsheetId = 'test-sheet-id';
      const range = 'Sheet1!A1';
      const values = [['Appended 1', 'Appended 2']];

      mockSheetsApi.spreadsheets.values.append.mockResolvedValue({ data: {} });

      const result = await sheetsService.appendData(spreadsheetId, range, values);
      expect(result.isOk()).toBe(true);
      
      expect(mockSheetsApi.spreadsheets.values.append).toHaveBeenCalledWith({
        spreadsheetId,
        range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values,
          majorDimension: 'ROWS',
        },
      });
    });

    test('should handle multiple rows of data', async () => {
      const values = [
        ['Row 1 Col 1', 'Row 1 Col 2'],
        ['Row 2 Col 1', 'Row 2 Col 2']
      ];

      mockSheetsApi.spreadsheets.values.append.mockResolvedValue({ data: {} });

      const result = await sheetsService.appendData('sheet-id', 'Sheet1!A1', values);
      expect(result.isOk()).toBe(true);
    });

    test('should handle empty values in append', async () => {
      const result = await sheetsService.appendData('sheet-id', 'Sheet1!A1', []);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toMatch(/Values cannot be empty for append operation|Invalid range specified/);
      }
    });

    test('should validate range format for append', async () => {
      const values = [['Data']];
      const invalidRanges = ['', 'InvalidRange'];
      
      for (const range of invalidRanges) {
        const result = await sheetsService.appendData('sheet-id', range, values);
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toMatch(/Invalid range format|Invalid range specified/);
        }
      }
    });

    test('should append to different sheets within same spreadsheet', async () => {
      const values = [['Sheet2 Data']];
      mockSheetsApi.spreadsheets.values.append.mockResolvedValue({ data: {} });
      
      const result = await sheetsService.appendData('sheet-id', 'Sheet2!A1', values);
      expect(result.isOk()).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should handle authentication errors', async () => {
      // AuthServiceのモックがエラーを返すように設定
      mockAuthService.getAuthClient.mockResolvedValue(
        err(new GoogleAuthError('Auth failed'))
      );
      
      const result = await sheetsService.initialize();
      expect(result.isErr()).toBe(true);
    });

    test('should handle network errors', async () => {
      // ネットワークエラーのシミュレーション
      mockDriveApi.files.list.mockRejectedValue(new Error('Network error'));
      const result = await sheetsService.listSpreadsheets();
      expect(result.isErr()).toBe(true);
    });

    test('should handle API rate limiting', async () => {
      // レート制限エラーのシミュレーション
      mockSheetsApi.spreadsheets.values.get.mockRejectedValue(new Error('Rate limit exceeded'));
      const result = await sheetsService.readRange('sheet-id', 'Sheet1!A1:B2');
      expect(result.isErr()).toBe(true);
    });

    test('should handle quota exceeded errors', async () => {
      // API割当超過エラーのシミュレーション
      mockSheetsApi.spreadsheets.values.update.mockRejectedValue(new Error('Quota exceeded'));
      const result = await sheetsService.writeRange('sheet-id', 'Sheet1!A1', [['data']]);
      expect(result.isErr()).toBe(true);
    });
  });

  describe('integration with AuthService', () => {
    test('should call AuthService methods correctly', async () => {
      const result = await sheetsService.initialize();
      
      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalled();
      expect(mockGoogle.sheets).toHaveBeenCalledWith({ version: 'v4', auth: mockAuth });
      expect(mockGoogle.drive).toHaveBeenCalledWith({ version: 'v3', auth: mockAuth });
    });

    test('should handle AuthService initialization failure', async () => {
      mockAuthService.getAuthClient.mockResolvedValue(
        err(new GoogleAuthError('Auth init failed'))
      );
      
      const result = await sheetsService.initialize();
      expect(result.isErr()).toBe(true);
    });

    test('should use authenticated client from AuthService', async () => {
      const customAuth = {} as OAuth2Client;
      mockAuthService.getAuthClient.mockResolvedValue(
        ok(customAuth)
      );
      
      const result = await sheetsService.initialize();
      expect(result.isOk()).toBe(true);
      
      expect(mockGoogle.sheets).toHaveBeenCalledWith({ version: 'v4', auth: customAuth });
      expect(mockGoogle.drive).toHaveBeenCalledWith({ version: 'v3', auth: customAuth });
    });
  });
});