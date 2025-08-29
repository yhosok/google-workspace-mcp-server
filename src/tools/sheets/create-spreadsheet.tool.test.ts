import { SheetsCreateSpreadsheetTool } from '../../tools/sheets/create-spreadsheet.tool.js';
import { SheetsService } from '../../services/sheets.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleSheetsError, GoogleAuthError } from '../../errors/index.js';
import type {
  SheetsCreateSpreadsheetResult,
  MCPToolResult,
} from '../../types/index.js';

describe('SheetsCreateSpreadsheetTool', () => {
  let tool: SheetsCreateSpreadsheetTool;
  let mockSheetsService: jest.Mocked<SheetsService>;
  let mockAuthService: jest.Mocked<AuthService>;

  // Mock environment variable
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id' };

    mockAuthService = {
      initialize: jest.fn(),
      getAuthClient: jest.fn(),
      validateAuth: jest.fn().mockResolvedValue(ok(true)),
      getGoogleAuth: jest.fn(),
    } as any;

    mockSheetsService = {
      initialize: jest.fn(),
      listSpreadsheets: jest.fn(),
      getSpreadsheet: jest.fn(),
      readRange: jest.fn(),
      writeRange: jest.fn(),
      appendData: jest.fn(),
      addSheet: jest.fn(),
      createSpreadsheet: jest.fn(),
      healthCheck: jest.fn(),
    } as any;

    tool = new SheetsCreateSpreadsheetTool(mockSheetsService, mockAuthService);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('sheets-create');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Create New Spreadsheet');
      expect(metadata.description).toBe(
        'Create a new spreadsheet in the configured Google Drive folder'
      );
      expect(metadata.inputSchema).toHaveProperty('title');
      expect(metadata.inputSchema).toHaveProperty('sheetTitles');

      // Check that the schema properties have the expected descriptions
      expect(metadata.inputSchema.title.description).toBe(
        'The title of the new spreadsheet'
      );
      expect(metadata.inputSchema.sheetTitles.description).toBe(
        'Optional array of titles for initial sheets. If not provided, a single "Sheet1" will be created'
      );
    });
  });

  describe('executeImpl', () => {
    const validParams = {
      title: 'My New Spreadsheet',
    };

    const mockResult: SheetsCreateSpreadsheetResult = {
      spreadsheetId: 'new-spreadsheet-id',
      spreadsheetUrl:
        'https://docs.google.com/spreadsheets/d/new-spreadsheet-id',
      title: 'My New Spreadsheet',
      sheets: [
        {
          sheetId: 0,
          title: 'Sheet1',
          index: 0,
        },
      ],
    };

    describe('successful execution', () => {
      test('should create spreadsheet with minimal parameters', async () => {
        mockSheetsService.createSpreadsheet.mockResolvedValue(ok(mockResult));

        const result = await tool.executeImpl(validParams);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const response = result.value;
          expect(response.content).toHaveLength(1);
          expect(response.content[0]).toEqual({
            type: 'text',
            text: JSON.stringify(
              {
                spreadsheetId: mockResult.spreadsheetId,
                spreadsheetUrl: mockResult.spreadsheetUrl,
                title: mockResult.title,
                sheets: mockResult.sheets,
              },
              null,
              2
            ),
          });
        }

        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          'My New Spreadsheet',
          undefined
        );
      });

      test('should create spreadsheet with custom sheet titles', async () => {
        const paramsWithSheets = {
          ...validParams,
          sheetTitles: ['Data', 'Analysis', 'Summary'],
        };
        const mockResultWithSheets = {
          ...mockResult,
          sheets: [
            { sheetId: 0, title: 'Data', index: 0 },
            { sheetId: 1, title: 'Analysis', index: 1 },
            { sheetId: 2, title: 'Summary', index: 2 },
          ],
        };

        mockSheetsService.createSpreadsheet.mockResolvedValue(
          ok(mockResultWithSheets)
        );

        const result = await tool.executeImpl(paramsWithSheets);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const response = result.value;
          const responseText = response.content[0].text;
          expect(responseText).toBeDefined();
          const parsed = JSON.parse(responseText!);
          expect(parsed.sheets).toHaveLength(3);
          expect(parsed.sheets[0].title).toBe('Data');
          expect(parsed.sheets[1].title).toBe('Analysis');
          expect(parsed.sheets[2].title).toBe('Summary');
        }

        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          'My New Spreadsheet',
          ['Data', 'Analysis', 'Summary']
        );
      });

      test('should calculate statistics correctly', async () => {
        mockSheetsService.createSpreadsheet.mockResolvedValue(ok(mockResult));

        const result = await tool.executeImpl(validParams);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const response = result.value;
          const responseText = response.content[0].text;
          expect(responseText).toBeDefined();
          const parsed = JSON.parse(responseText!);
          expect(parsed).toHaveProperty('spreadsheetId');
          expect(parsed).toHaveProperty('spreadsheetUrl');
          expect(parsed).toHaveProperty('title');
          expect(parsed).toHaveProperty('sheets');
          expect(Array.isArray(parsed.sheets)).toBe(true);
        }
      });
    });

    describe('parameter validation', () => {
      test('should fail with empty title', async () => {
        const invalidParams = { ...validParams, title: '' };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
          expect(result.error.statusCode).toBe(400);

          // Check validation errors structure
          expect(result.error.context).toHaveProperty('validationErrors');
          const validationErrors = result.error.context
            ?.validationErrors as any[];
          expect(Array.isArray(validationErrors)).toBe(true);
          expect(validationErrors).toHaveLength(1);
          expect(validationErrors[0]).toMatchObject({
            code: 'too_small',
            path: ['title'],
          });
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });

      test('should fail with whitespace-only title', async () => {
        const invalidParams = { ...validParams, title: '   ' };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
          expect(result.error.statusCode).toBe(400);

          // Check validation errors structure
          expect(result.error.context).toHaveProperty('validationErrors');
          const validationErrors = result.error.context
            ?.validationErrors as any[];
          expect(Array.isArray(validationErrors)).toBe(true);
          expect(validationErrors).toHaveLength(1);
          expect(validationErrors[0]).toMatchObject({
            code: 'too_small',
            path: ['title'],
          });
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });

      test('should fail with empty sheet titles array', async () => {
        const invalidParams = { ...validParams, sheetTitles: [] };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
          expect(result.error.statusCode).toBe(400);

          // Check validation errors structure
          expect(result.error.context).toHaveProperty('validationErrors');
          const validationErrors = result.error.context
            ?.validationErrors as any[];
          expect(Array.isArray(validationErrors)).toBe(true);
          expect(validationErrors).toHaveLength(1);
          expect(validationErrors[0]).toMatchObject({
            code: 'too_small',
            path: ['sheetTitles'],
          });
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });

      test('should fail with empty sheet title in array', async () => {
        const invalidParams = {
          ...validParams,
          sheetTitles: ['Sheet1', '', 'Sheet3'],
        };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
          expect(result.error.statusCode).toBe(400);

          // Check validation errors structure
          expect(result.error.context).toHaveProperty('validationErrors');
          const validationErrors = result.error.context
            ?.validationErrors as any[];
          expect(Array.isArray(validationErrors)).toBe(true);
          expect(validationErrors).toHaveLength(1);
          expect(validationErrors[0]).toMatchObject({
            code: 'too_small',
            path: ['sheetTitles', 1], // Index 1 corresponds to the empty string in the array
          });
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });

      test('should fail with duplicate sheet titles', async () => {
        const invalidParams = {
          ...validParams,
          sheetTitles: ['Sheet1', 'Sheet2', 'Sheet1'],
        };

        // Mock the service to return the duplicate error since validation is now at service level
        const serviceError = new GoogleSheetsError(
          'Sheet titles must be unique',
          'GOOGLE_SHEETS_INVALID_RANGE_ERROR',
          400
        );
        mockSheetsService.createSpreadsheet.mockResolvedValue(
          err(serviceError)
        );

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.message).toContain('Sheet titles must be unique');
        }
        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalled();
      });
    });

    describe('environment validation', () => {
      test('should fail when GOOGLE_DRIVE_FOLDER_ID is not set', async () => {
        delete process.env.GOOGLE_DRIVE_FOLDER_ID;

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.message).toContain(
            'GOOGLE_DRIVE_FOLDER_ID environment variable is required'
          );
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });

      test('should fail when GOOGLE_DRIVE_FOLDER_ID is empty', async () => {
        process.env.GOOGLE_DRIVE_FOLDER_ID = '';

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.message).toContain(
            'GOOGLE_DRIVE_FOLDER_ID environment variable is required'
          );
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });

      test('should fail when GOOGLE_DRIVE_FOLDER_ID is whitespace only', async () => {
        process.env.GOOGLE_DRIVE_FOLDER_ID = '   ';

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.message).toContain(
            'GOOGLE_DRIVE_FOLDER_ID environment variable is required'
          );
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });
    });

    describe('authentication validation', () => {
      test('should fail when authentication validation fails', async () => {
        const authError = new GoogleAuthError(
          'Authentication failed',
          'service-account',
          { requestId: 'test-request' }
        );
        mockAuthService.validateAuth.mockResolvedValue(err(authError));

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBe(authError);
        }
        expect(mockSheetsService.createSpreadsheet).not.toHaveBeenCalled();
      });
    });

    describe('service errors', () => {
      test('should handle SheetsService errors', async () => {
        const serviceError = new GoogleSheetsError(
          'Insufficient Drive API permissions',
          'GOOGLE_DRIVE_PERMISSION_ERROR',
          403
        );
        mockSheetsService.createSpreadsheet.mockResolvedValue(
          err(serviceError)
        );

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBe(serviceError);
        }
      });

      test('should handle Drive API folder access errors', async () => {
        const driveError = new GoogleSheetsError(
          'Folder not found or inaccessible',
          'GOOGLE_DRIVE_FOLDER_NOT_FOUND',
          404
        );
        mockSheetsService.createSpreadsheet.mockResolvedValue(err(driveError));

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBe(driveError);
        }
      });

      test('should handle unexpected errors', async () => {
        mockSheetsService.createSpreadsheet.mockRejectedValue(
          new Error('Network timeout')
        );

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.message).toContain('Network timeout');
        }
      });
    });

    describe('edge cases', () => {
      test('should handle very long spreadsheet titles', async () => {
        const longTitle = 'A'.repeat(200);
        const paramsWithLongTitle = { ...validParams, title: longTitle };
        const mockResultWithLongTitle = { ...mockResult, title: longTitle };

        mockSheetsService.createSpreadsheet.mockResolvedValue(
          ok(mockResultWithLongTitle)
        );

        const result = await tool.executeImpl(paramsWithLongTitle);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          longTitle,
          undefined
        );
      });

      test('should handle special characters in spreadsheet title', async () => {
        const specialTitle = '財務報告 2024年 (Q1-Q4) - 売上分析 & 利益計算';
        const paramsWithSpecialTitle = { ...validParams, title: specialTitle };
        const mockResultWithSpecialTitle = {
          ...mockResult,
          title: specialTitle,
        };

        mockSheetsService.createSpreadsheet.mockResolvedValue(
          ok(mockResultWithSpecialTitle)
        );

        const result = await tool.executeImpl(paramsWithSpecialTitle);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          specialTitle,
          undefined
        );
      });

      test('should handle maximum number of initial sheets', async () => {
        const maxSheetTitles = Array.from(
          { length: 100 },
          (_, i) => `Sheet${i + 1}`
        );
        const paramsWithMaxSheets = {
          ...validParams,
          sheetTitles: maxSheetTitles,
        };
        const mockResultWithMaxSheets = {
          ...mockResult,
          sheets: maxSheetTitles.map((title, index) => ({
            sheetId: index,
            title,
            index,
          })),
        };

        mockSheetsService.createSpreadsheet.mockResolvedValue(
          ok(mockResultWithMaxSheets)
        );

        const result = await tool.executeImpl(paramsWithMaxSheets);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          'My New Spreadsheet',
          maxSheetTitles
        );
      });

      test('should handle special characters in sheet titles', async () => {
        const specialSheetTitles = [
          'データ',
          '分析',
          '集計 & まとめ',
          'English Sheet',
        ];
        const paramsWithSpecialSheets = {
          ...validParams,
          sheetTitles: specialSheetTitles,
        };
        const mockResultWithSpecialSheets = {
          ...mockResult,
          sheets: specialSheetTitles.map((title, index) => ({
            sheetId: index,
            title,
            index,
          })),
        };

        mockSheetsService.createSpreadsheet.mockResolvedValue(
          ok(mockResultWithSpecialSheets)
        );

        const result = await tool.executeImpl(paramsWithSpecialSheets);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          'My New Spreadsheet',
          specialSheetTitles
        );
      });

      test('should handle long sheet titles', async () => {
        const longSheetTitles = [
          'A very long sheet title that contains lots of information about what this sheet contains',
          'Another extremely long sheet title with detailed description of its purpose and content',
        ];
        const paramsWithLongSheets = {
          ...validParams,
          sheetTitles: longSheetTitles,
        };
        const mockResultWithLongSheets = {
          ...mockResult,
          sheets: longSheetTitles.map((title, index) => ({
            sheetId: index,
            title,
            index,
          })),
        };

        mockSheetsService.createSpreadsheet.mockResolvedValue(
          ok(mockResultWithLongSheets)
        );

        const result = await tool.executeImpl(paramsWithLongSheets);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.createSpreadsheet).toHaveBeenCalledWith(
          'My New Spreadsheet',
          longSheetTitles
        );
      });
    });
  });
});
