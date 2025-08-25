import { SheetsAppendTool } from '../../../../src/tools/sheets/append.tool.js';
import { SheetsService } from '../../../../src/services/sheets.service.js';
import { AuthService } from '../../../../src/services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleSheetsError, GoogleSheetsInvalidRangeError } from '../../../../src/errors/index.js';
import type { SheetsAppendResult, MCPToolResult } from '../../../../src/types/index.js';

describe('SheetsAppendTool', () => {
  let tool: SheetsAppendTool;
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
      healthCheck: jest.fn()
    } as any;

    tool = new SheetsAppendTool(mockSheetsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('sheets-append');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('Append to Spreadsheet');
      expect(metadata.description).toBe('Append data to a spreadsheet');
      expect(metadata.inputSchema).toHaveProperty('spreadsheetId');
      expect(metadata.inputSchema).toHaveProperty('range');
      expect(metadata.inputSchema).toHaveProperty('values');
    });
  });

  describe('executeImpl', () => {
    test('should append data to spreadsheet successfully', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: [['Appended 1', 'Appended 2']]
      };

      mockSheetsService.appendData.mockResolvedValue(ok(undefined));

      const result = await tool.executeImpl(params);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const resultData = JSON.parse(mcpResult.content[0].text) as SheetsAppendResult;
        expect(resultData.updates.updatedRows).toBe(1);
        expect(resultData.updates.updatedCells).toBe(2);
      }
      expect(mockSheetsService.appendData).toHaveBeenCalledWith(
        params.spreadsheetId, 
        params.range, 
        params.values
      );
    });

    test('should handle multiple rows', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: [
          ['Row 1 Col 1', 'Row 1 Col 2'],
          ['Row 2 Col 1', 'Row 2 Col 2']
        ]
      };

      mockSheetsService.appendData.mockResolvedValue(ok(undefined));

      const result = await tool.executeImpl(params);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const resultData = JSON.parse(mcpResult.content[0].text) as SheetsAppendResult;
        expect(resultData.updates.updatedRows).toBe(2);
        expect(resultData.updates.updatedCells).toBe(4);
      }
    });

    test('should handle large batch append', async () => {
      const bulkData = Array(50).fill(0).map((_, i) => [`Row ${i + 1}`, `Data ${i + 1}`]);
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: bulkData
      };

      mockSheetsService.appendData.mockResolvedValue(ok(undefined));

      const result = await tool.executeImpl(params);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const resultData = JSON.parse(mcpResult.content[0].text) as SheetsAppendResult;
        expect(resultData.updates.updatedRows).toBe(50);
        expect(resultData.updates.updatedCells).toBe(100);
      }
    });

    test('should validate empty spreadsheet ID', async () => {
      const params = {
        spreadsheetId: '',
        range: 'Sheet1!A1',
        values: [['data']]
      };

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
        expect(result.error.message).toContain('Spreadsheet ID cannot be empty');
      }
    });

    test('should validate empty range', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: '',
        values: [['data']]
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
        values: [['data']]
      };

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsInvalidRangeError);
        expect(result.error.message).toContain('Invalid range format');
      }
    });

    test('should validate empty values for append', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: []
      };

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsError);
        expect(result.error.message).toContain('Values cannot be empty for append operation');
      }
    });

    test('should validate values parameter type', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: 'invalid-values' as any
      };

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(GoogleSheetsError);
        expect(result.error.message).toContain('Values must be an array');
      }
    });

    test('should handle service error', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: [['data']]
      };
      
      const serviceError = new GoogleSheetsError('Append failed', 'GOOGLE_SHEETS_APPEND_ERROR', 400);
      mockSheetsService.appendData.mockResolvedValue(err(serviceError));

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(serviceError);
      }
    });

    test('should handle authentication failure', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: [['data']]
      };
      
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Authentication validation failed');
      }
    });
  });

  describe('error handling', () => {
    test('should handle unexpected errors', async () => {
      const params = {
        spreadsheetId: 'test-sheet-id',
        range: 'Sheet1!A1',
        values: [['data']]
      };
      
      mockSheetsService.appendData.mockRejectedValue(new Error('Unexpected error'));

      const result = await tool.executeImpl(params);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected error');
      }
    });
  });
});