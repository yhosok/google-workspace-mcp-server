import { SheetsListTool } from '../../../../src/tools/sheets/list.tool.js';
import { SheetsService } from '../../../../src/services/sheets.service.js';
import { AuthService } from '../../../../src/services/auth.service.js';
import { ok, err } from 'neverthrow';
import { GoogleSheetsError } from '../../../../src/errors/index.js';
import type { SheetsListResult, MCPToolResult } from '../../../../src/types/index.js';

describe('SheetsListTool', () => {
  let tool: SheetsListTool;
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

    tool = new SheetsListTool(mockSheetsService, mockAuthService);
  });

  describe('getToolName', () => {
    test('should return correct tool name', () => {
      expect(tool.getToolName()).toBe('sheets-list');
    });
  });

  describe('getToolMetadata', () => {
    test('should return correct metadata', () => {
      const metadata = tool.getToolMetadata();
      expect(metadata.title).toBe('List Spreadsheets');
      expect(metadata.description).toBe('List all spreadsheets in the configured Drive folder');
      expect(metadata.inputSchema).toEqual({});
    });
  });

  describe('executeImpl', () => {
    test('should return list of spreadsheets on success', async () => {
      const mockSpreadsheets = [
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
      ];

      mockSheetsService.listSpreadsheets.mockResolvedValue(ok(mockSpreadsheets));

      const result = await tool.executeImpl({});
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const resultData = JSON.parse(mcpResult.content[0].text) as SheetsListResult;
        expect(resultData.spreadsheets).toEqual(mockSpreadsheets.map(sheet => ({
          id: sheet.id,
          title: sheet.title,
          url: sheet.url,
          modifiedTime: sheet.modifiedTime
        })));
      }
    });

    test('should handle authentication failure', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await tool.executeImpl({});
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Authentication validation failed');
      }
    });

    test('should handle service error', async () => {
      const serviceError = new GoogleSheetsError('Service failed', 'GOOGLE_SHEETS_API_ERROR', 500);
      mockSheetsService.listSpreadsheets.mockResolvedValue(err(serviceError));

      const result = await tool.executeImpl({});
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBe(serviceError);
      }
    });

    test('should handle empty spreadsheet list', async () => {
      mockSheetsService.listSpreadsheets.mockResolvedValue(ok([]));

      const result = await tool.executeImpl({});
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const mcpResult = result.value as MCPToolResult;
        const resultData = JSON.parse(mcpResult.content[0].text) as SheetsListResult;
        expect(resultData.spreadsheets).toEqual([]);
      }
    });
  });

  describe('error handling', () => {
    test('should handle unexpected errors', async () => {
      mockSheetsService.listSpreadsheets.mockRejectedValue(new Error('Unexpected error'));

      const result = await tool.executeImpl({});
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Unexpected error');
      }
    });
  });
});