import { SheetsWriteTool } from '../../tools/sheets/write.tool.js';
import { SheetsService } from '../../services/sheets.service.js';
import { AuthService } from '../../services/auth.service.js';
import { ok, err } from 'neverthrow';
import {
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
} from '../../errors/index.js';
import type { SheetsWriteResult, MCPToolResult } from '../../types/index.js';

describe('SheetsWriteTool', () => {
  let tool: SheetsWriteTool;
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

    tool = new SheetsWriteTool(mockSheetsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('google-workspace__sheets__write-range');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Write to Spreadsheet Range');
      expect(metadata.description).toBe(
        'Write data to a specific spreadsheet range'
      );
      expect(metadata.inputSchema).toHaveProperty('spreadsheetId');
      expect(metadata.inputSchema).toHaveProperty('range');
      expect(metadata.inputSchema).toHaveProperty('values');
    });
  });

  describe('executeImpl', () => {
    test('should write data to spreadsheet successfully', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
        values: [
          ['New A1', 'New B1'],
          ['New A2', 'New B2'],
        ],
      };

      mockSheetsService.writeRange.mockResolvedValue(ok(undefined));

      const result = await tool.executeImpl(params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as SheetsWriteResult;
        expect(resultData.updatedCells).toBe(4);
        expect(resultData.updatedRows).toBe(2);
        expect(resultData.updatedColumns).toBe(2);
      }
      expect(mockSheetsService.writeRange).toHaveBeenCalledWith(
        params.spreadsheetId,
        params.range,
        params.values
      );
    });

    test('should handle empty values', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:A1',
        values: [],
      };

      mockSheetsService.writeRange.mockResolvedValue(ok(undefined));

      const result = await tool.executeImpl(params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as SheetsWriteResult;
        expect(resultData.updatedCells).toBe(0);
        expect(resultData.updatedRows).toBe(0);
        expect(resultData.updatedColumns).toBe(0);
      }
    });

    test('should handle large datasets', async () => {
      const largeValues = Array(1000).fill(['data1', 'data2']);
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B1000',
        values: largeValues,
      };

      mockSheetsService.writeRange.mockResolvedValue(ok(undefined));

      const result = await tool.executeImpl(params);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const text = mcpResult.content[0].text;
        expect(text).toBeDefined();
        const resultData = JSON.parse(text!) as SheetsWriteResult;
        expect(resultData.updatedRows).toBe(1000);
        expect(resultData.updatedCells).toBe(2000);
        expect(resultData.updatedColumns).toBe(2);
      }
    });

    test('should validate empty spreadsheet ID', async () => {
      const params = {
        spreadsheetId: '',
        range: 'Sheet1!A1:B2',
        values: [['data']],
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
        values: [['data']],
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
        values: [['data']],
      };

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
        expect(result.error.message).toContain('Invalid range format');
      }
    });

    test('should validate values parameter', async () => {
      // This will be caught by Zod schema validation in real implementation
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
        values: 'invalid-values' as any,
      };

      const result = await tool.executeImpl(params);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsError);
        expect(result.error.message).toContain(
          'Expected array, received string'
        );
      }
    });

    test('should handle service error', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1:B2',
        values: [['data']],
      };

      const serviceError = new GoogleSheetsError(
        'Write failed',
        'GOOGLE_SHEETS_WRITE_ERROR',
        400
      );
      mockSheetsService.writeRange.mockResolvedValue(err(serviceError));

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
        values: [['data']],
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
        values: [['data']],
      };

      mockSheetsService.writeRange.mockRejectedValue(
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
