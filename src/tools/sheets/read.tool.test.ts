import { SheetsReadTool } from '../../tools/sheets/read.tool.js';
import { SheetsService } from '../../services/sheets.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import {
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
} from '../../errors/index.js';
import type { SheetsReadResult, MCPToolResult } from '../../types/index.js';

describe('SheetsReadTool', () => {
  let tool: SheetsReadTool;
  let mockSheetsService: jest.Mocked<SheetsService>;
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
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
      healthCheck: jest.fn(),
    } as any;

    tool = new SheetsReadTool(mockSheetsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__sheets__read-range');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Read Spreadsheet Range');
      expect(metadata.description).toBe(
        'Read data from a specific spreadsheet range'
      );
      expect(metadata.inputSchema).toHaveProperty('spreadsheetId');
      expect(metadata.inputSchema).toHaveProperty('range');
    });
  });

  describe('executeImpl', () => {
    test('should read data from spreadsheet range successfully', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
      };

      const mockSheetData = {
        range: 'Sheet1!A1:B2',
        values: [
          ['A1', 'B1'],
          ['A2', 'B2'],
        ],
        majorDimension: 'ROWS' as const,
      };

      mockSheetsService.readRange.mockResolvedValue(ok(mockSheetData));

      const result = await tool.executeImpl(params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as SheetsReadResult;
        expect(resultData.range).toBe(mockSheetData.range);
        expect(resultData.values).toEqual(mockSheetData.values);
        expect(resultData.majorDimension).toBe(mockSheetData.majorDimension);
      }
    });

    test('should handle empty range', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:A1',
      };

      const mockSheetData = {
        range: 'Sheet1!A1:A1',
        values: [],
        majorDimension: 'ROWS' as const,
      };

      mockSheetsService.readRange.mockResolvedValue(ok(mockSheetData));

      const result = await tool.executeImpl(params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as SheetsReadResult;
        expect(resultData.values).toEqual([]);
      }
    });

    test('should validate empty spreadsheet ID', async () => {
      const params = {
        spreadsheetId: '',
        range: 'Sheet1!A1:B2',
      };

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
        expect(result.error.message).toContain(
          'Spreadsheet ID cannot be empty'
        );
      }
    });

    test('should validate empty range', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: '',
      };

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
        expect(result.error.message).toContain('Range cannot be empty');
      }
    });

    test('should validate invalid range format', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'invalid-range',
      };

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
        expect(result.error.message).toContain('Invalid range format');
      }
    });

    test('should handle service error', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
      };

      const serviceError = new GoogleSheetsError(
        'Spreadsheet not found',
        'GOOGLE_SHEETS_NOT_FOUND',
        404
      );
      mockSheetsService.readRange.mockResolvedValue(err(serviceError));

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(serviceError);
      }
    });

    test('should handle authentication failure', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
      };

      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain(
          'Authentication validation failed'
        );
      }
    });
  });

  describe('error handling', () => {
    test('should handle unexpected errors', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
      };

      mockSheetsService.readRange.mockRejectedValue(
        new Error('Unexpected error')
      );

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected error');
      }
    });
  });
});
