import { SheetsAddSheetTool } from '../../../../src/tools/sheets/add-sheet.tool.js';
import { SheetsService } from '../../../../src/services/sheets.service.js';
import { AuthService } from '../../../../src/services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleSheetsError, GoogleSheetsInvalidRangeError, GoogleAuthError } from '../../../../src/errors/index.js';
import type { SheetsAddSheetResult, MCPToolResult } from '../../../../src/types/index.js';

describe('SheetsAddSheetTool', () => {
  let tool: SheetsAddSheetTool;
  let mockSheetsService: jest.Mocked<SheetsService>;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    mockAuthService = {
      initialize: jest.fn(),
      getAuthClient: jest.fn(),
      validateAuth: jest.fn().mockResolvedValue(ok(true)),
      getGoogleAuth: jest.fn()
    } as any;

    mockSheetsService = {
      initialize: jest.fn(),
      listSpreadsheets: jest.fn(),
      getSpreadsheet: jest.fn(),
      readRange: jest.fn(),
      writeRange: jest.fn(),
      appendData: jest.fn(),
      addSheet: jest.fn(),
      healthCheck: jest.fn()
    } as any;

    tool = new SheetsAddSheetTool(mockSheetsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('sheets-add-sheet');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Add Sheet to Spreadsheet');
      expect(metadata.description).toBe('Add a new sheet (tab) to an existing spreadsheet');
      expect(metadata.inputSchema).toHaveProperty('spreadsheetId');
      expect(metadata.inputSchema).toHaveProperty('title');
      
      // Check that the schema properties have the expected descriptions  
      expect(metadata.inputSchema.spreadsheetId.description).toBe('The ID of the Google Spreadsheet');
      expect(metadata.inputSchema.title.description).toBe('The title of the new sheet to add');
      expect(metadata.inputSchema.index.description).toBe('Zero-based index where the sheet should be inserted (optional)');
    });
  });

  describe('executeImpl', () => {
    const validParams = {
      spreadsheetId: 'test-spreadsheet-id',
      title: 'New Sheet'
    };

    const mockResult: SheetsAddSheetResult = {
      sheetId: 123456789,
      title: 'New Sheet',
      index: 1,
      spreadsheetId: 'test-spreadsheet-id'
    };

    describe('successful execution', () => {
      test('should add sheet with minimal parameters', async () => {
        mockSheetsService.addSheet.mockResolvedValue(ok(mockResult));

        const result = await tool.executeImpl(validParams);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const response = result.value;
          expect(response.content).toHaveLength(1);
          expect(response.content[0]).toEqual({
            type: 'text',
            text: JSON.stringify({
              sheetId: mockResult.sheetId,
              title: mockResult.title,
              index: mockResult.index,
              spreadsheetId: mockResult.spreadsheetId
            }, null, 2)
          });
        }

        expect(mockSheetsService.addSheet).toHaveBeenCalledWith(
          'test-spreadsheet-id',
          'New Sheet',
          undefined
        );
      });

      test('should add sheet with specific index', async () => {
        const paramsWithIndex = { ...validParams, index: 0 };
        mockSheetsService.addSheet.mockResolvedValue(ok({ ...mockResult, index: 0 }));

        const result = await tool.executeImpl(paramsWithIndex);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.addSheet).toHaveBeenCalledWith(
          'test-spreadsheet-id',
          'New Sheet',
          0
        );
      });

      test('should calculate statistics correctly', async () => {
        mockSheetsService.addSheet.mockResolvedValue(ok(mockResult));

        const result = await tool.executeImpl(validParams);

        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          const response = result.value;
          const responseText = response.content[0].text;
          const parsed = JSON.parse(responseText);
          expect(parsed).toHaveProperty('sheetId');
          expect(parsed).toHaveProperty('title');
          expect(parsed).toHaveProperty('index');
        }
      });
    });

    describe('parameter validation', () => {
      test('should fail with empty spreadsheetId', async () => {
        const invalidParams = { ...validParams, spreadsheetId: '' };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
          expect(result.error.message).toContain('Spreadsheet ID cannot be empty');
        }
        expect(mockSheetsService.addSheet).not.toHaveBeenCalled();
      });

      test('should fail with empty title', async () => {
        const invalidParams = { ...validParams, title: '' };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
          expect(result.error.message).toContain('Sheet title cannot be empty');
        }
        expect(mockSheetsService.addSheet).not.toHaveBeenCalled();
      });

      test('should fail with negative index', async () => {
        const invalidParams = { ...validParams, index: -1 };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
          expect(result.error.message).toContain('Sheet index cannot be negative');
        }
        expect(mockSheetsService.addSheet).not.toHaveBeenCalled();
      });

      test('should fail with whitespace-only title', async () => {
        const invalidParams = { ...validParams, title: '   ' };

        const result = await tool.executeImpl(invalidParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
          expect(result.error.message).toContain('Sheet title cannot be empty');
        }
        expect(mockSheetsService.addSheet).not.toHaveBeenCalled();
      });
    });

    describe('authentication validation', () => {
      test('should fail when authentication validation fails', async () => {
        const authError = new GoogleAuthError('Authentication failed', 'service-account', { requestId: 'test-request' });
        mockAuthService.validateAuth.mockResolvedValue(err(authError));

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBe(authError);
        }
        expect(mockSheetsService.addSheet).not.toHaveBeenCalled();
      });
    });

    describe('service errors', () => {
      test('should handle SheetsService errors', async () => {
        const serviceError = new GoogleSheetsError(
          'Sheet already exists',
          'GOOGLE_SHEETS_DUPLICATE_SHEET',
          400,
          'test-spreadsheet-id'
        );
        mockSheetsService.addSheet.mockResolvedValue(err(serviceError));

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBe(serviceError);
        }
      });

      test('should handle unexpected errors', async () => {
        mockSheetsService.addSheet.mockRejectedValue(new Error('Unexpected error'));

        const result = await tool.executeImpl(validParams);

        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          expect(result.error).toBeInstanceOf(GoogleSheetsError);
          expect(result.error.message).toContain('Unexpected error');
        }
      });
    });

    describe('edge cases', () => {
      test('should handle very long sheet titles', async () => {
        const longTitle = 'A'.repeat(100);
        const paramsWithLongTitle = { ...validParams, title: longTitle };
        const mockResultWithLongTitle = { ...mockResult, title: longTitle };
        
        mockSheetsService.addSheet.mockResolvedValue(ok(mockResultWithLongTitle));

        const result = await tool.executeImpl(paramsWithLongTitle);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.addSheet).toHaveBeenCalledWith(
          'test-spreadsheet-id',
          longTitle,
          undefined
        );
      });

      test('should handle special characters in sheet title', async () => {
        const specialTitle = 'Sheet #1 (新しいシート) - 2024年';
        const paramsWithSpecialTitle = { ...validParams, title: specialTitle };
        const mockResultWithSpecialTitle = { ...mockResult, title: specialTitle };
        
        mockSheetsService.addSheet.mockResolvedValue(ok(mockResultWithSpecialTitle));

        const result = await tool.executeImpl(paramsWithSpecialTitle);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.addSheet).toHaveBeenCalledWith(
          'test-spreadsheet-id',
          specialTitle,
          undefined
        );
      });

      test('should handle maximum index value', async () => {
        const maxIndex = 999;
        const paramsWithMaxIndex = { ...validParams, index: maxIndex };
        const mockResultWithMaxIndex = { ...mockResult, index: maxIndex };
        
        mockSheetsService.addSheet.mockResolvedValue(ok(mockResultWithMaxIndex));

        const result = await tool.executeImpl(paramsWithMaxIndex);

        expect(result.isOk()).toBe(true);
        expect(mockSheetsService.addSheet).toHaveBeenCalledWith(
          'test-spreadsheet-id',
          'New Sheet',
          maxIndex
        );
      });
    });
  });
});