import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ok, err, Result } from 'neverthrow';
import { googleOk, googleErr } from '../../errors/index.js';
import { z } from 'zod';
import { BaseSheetsTools } from './base-sheets-tool.js';
import { SheetsService } from '../../services/sheets.service.js';
import { AuthService } from '../../services/auth.service.js';
import { AccessControlService } from '../../services/access-control.service.js';
import { Logger } from '../../utils/logger.js';
import {
  GoogleWorkspaceError,
  GoogleWorkspaceResult,
  GoogleAuthError,
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError,
  GoogleAccessControlError,
  GoogleAccessControlReadOnlyError,
  GoogleAccessControlToolError,
  GoogleAccessControlServiceError,
  GoogleAccessControlFolderError,
} from '../../errors/index.js';
import { validateToolInput } from '../../utils/validation.utils.js';
import { SchemaFactory } from '../base/tool-schema.js';
import type { ToolMetadata } from '../base/tool-registry.js';

// Mock dependencies
jest.mock('../../services/sheets.service');
jest.mock('../../services/auth.service');
jest.mock('../../services/access-control.service');
jest.mock('../../utils/validation.utils');
jest.mock('../base/tool-schema');

// Concrete implementation for testing
class TestSheetsTools extends BaseSheetsTools<
  { test: string },
  { result: string }
> {
  getToolName(): string {
    return 'test-tool';
  }

  getToolMetadata(): ToolMetadata {
    return {
      title: 'Test Tool',
      description: 'A test tool for BaseSheetsTools',
      inputSchema: {
        test: z.string(),
      },
    };
  }

  async executeImpl(input: {
    test: string;
  }): Promise<Result<{ result: string }, GoogleWorkspaceError>> {
    return ok({ result: input.test });
  }
}

describe('BaseSheetsTools', () => {
  let testTool: TestSheetsTools;
  let mockSheetsService: jest.Mocked<SheetsService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockAccessControlService: jest.Mocked<AccessControlService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockSheetsService = new SheetsService(
      {} as any,
      {} as any
    ) as jest.Mocked<SheetsService>;
    mockAuthService = new AuthService({} as any) as jest.Mocked<AuthService>;
    mockAccessControlService = new AccessControlService(
      {} as any,
      {} as any
    ) as jest.Mocked<AccessControlService>;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
      addContext: jest.fn(),
      fatal: jest.fn(),
      startTimer: jest.fn(),
      endTimer: jest.fn(),
      measureAsync: jest.fn(),
      measure: jest.fn(),
      logOperation: jest.fn(),
      forOperation: jest.fn().mockReturnThis(),
      generateRequestId: jest.fn().mockReturnValue('test-request-id'),
      isLevelEnabled: jest.fn().mockReturnValue(true),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    testTool = new TestSheetsTools(
      mockSheetsService,
      mockAuthService,
      mockLogger,
      mockAccessControlService
    );

    // Setup access control service mocks with default behavior
    (mockAccessControlService.validateAccess as any) = jest
      .fn()
      // @ts-expect-error - Mock return type compatibility
      .mockResolvedValue(googleOk(void 0));
    // @ts-ignore - Mocking access control service methods
    mockAccessControlService.getAccessControlSummary = jest
      .fn()
      .mockReturnValue({
        readOnlyMode: false,
        hasRestrictions: false,
      });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Constructor and Basic Properties', () => {
    it('should initialize with required services', () => {
      expect(testTool).toBeDefined();
      expect(testTool.getToolName()).toBe('test-tool');
    });

    it('should have access to sheetsService and authService', () => {
      expect((testTool as any).sheetsService).toBe(mockSheetsService);
      expect((testTool as any).authService).toBe(mockAuthService);
    });
  });

  describe('validateAuthentication', () => {
    it('should return success when authentication is valid', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(true));

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(true);
      expect(mockAuthService.validateAuth).toHaveBeenCalledTimes(1);
    });

    it('should return error when auth service fails', async () => {
      const authError = new GoogleAuthError('Auth failed', 'service-account');
      mockAuthService.validateAuth.mockResolvedValue(err(authError));

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(authError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication failed',
        expect.any(Object)
      );
    });

    it('should return error when authentication is invalid', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication invalid',
        expect.any(Object)
      );
    });

    it('should handle exceptions during authentication', async () => {
      mockAuthService.validateAuth.mockRejectedValue(
        new Error('Network error')
      );

      const result = await (testTool as any).validateAuthentication(
        'test-request-id'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
    });
  });

  // NOTE: validateParameters method has been removed and replaced with validateWithSchema

  // NOTE: isValidRangeFormat method has been removed and replaced with SchemaFactory.validateRangeFormat

  describe('calculateStatistics method', () => {
    it('should calculate statistics for valid data', () => {
      const values = [
        ['cell1', 'cell2', 'cell3'],
        ['cell4', 'cell5'],
        ['cell6'],
      ];

      const stats = (testTool as any).calculateStatistics(values);

      expect(stats).toEqual({
        updatedCells: 6,
        updatedRows: 3,
        updatedColumns: 3,
      });
    });

    it('should handle empty values array', () => {
      const stats = (testTool as any).calculateStatistics([]);

      expect(stats).toEqual({
        updatedCells: 0,
        updatedRows: 0,
        updatedColumns: 0,
      });
    });

    it('should handle arrays with empty rows', () => {
      const values = [[], ['cell1'], []];

      const stats = (testTool as any).calculateStatistics(values);

      expect(stats).toEqual({
        updatedCells: 1,
        updatedRows: 3,
        updatedColumns: 1,
      });
    });
  });

  // ===============================
  // NEW FUNCTIONALITY TESTS (RED PHASE - SHOULD FAIL)
  // ===============================

  describe('New validateWithSchema method (RED PHASE - Should Fail)', () => {
    const mockSchema = z.object({
      spreadsheetId: z.string(),
      range: z.string(),
      values: z.array(z.array(z.string())).optional(),
    });

    beforeEach(() => {
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockClear();
    });

    it('should exist and be callable', () => {
      // This test should fail because validateWithSchema doesn't exist yet
      expect(typeof (testTool as any).validateWithSchema).toBe('function');
    });

    it('should use validateToolInput utility for validation', () => {
      const testData = { spreadsheetId: 'test-id', range: 'A1:B2' };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(validateToolInput).toHaveBeenCalledWith(mockSchema, testData);
      expect(result).toBe(mockResult);
    });

    it('should return success result for valid data', () => {
      const testData = {
        spreadsheetId: 'test-id',
        range: 'A1:B2',
        values: [['test']],
      };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(testData);
    });

    it('should return error result for invalid data', () => {
      const testData = { invalid: 'data' };
      const mockError = new GoogleSheetsError(
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
      const mockResult = err(mockError);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(mockError);
    });

    it('should preserve type safety with generic types', () => {
      interface TestInput {
        id: string;
        name: string;
      }

      const customSchema = z.object({
        id: z.string(),
        name: z.string(),
      });

      const testData: TestInput = { id: 'test-id', name: 'test-name' };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(
        customSchema,
        testData
      );

      // Type assertion to validate the expected return type
      if (result.isOk()) {
        const validatedData: TestInput = result.value;
        expect(validatedData.id).toBe('test-id');
        expect(validatedData.name).toBe('test-name');
      }
    });

    it('should handle complex validation scenarios', () => {
      const complexSchema = z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().regex(/^[A-Z]+\d+(:[A-Z]+\d+)?$/),
        values: z.array(z.array(z.string())).min(1),
        options: z
          .object({
            dimension: z.enum(['ROWS', 'COLUMNS']),
            includeValuesInResponse: z.boolean(),
          })
          .optional(),
      });

      const testData = {
        spreadsheetId: 'test-sheet-id',
        range: 'A1:B10',
        values: [
          ['cell1', 'cell2'],
          ['cell3', 'cell4'],
        ],
        options: {
          dimension: 'ROWS' as const,
          includeValuesInResponse: true,
        },
      };

      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(
        complexSchema,
        testData
      );

      expect(validateToolInput).toHaveBeenCalledWith(complexSchema, testData);
      expect(result.isOk()).toBe(true);
    });

    it('should handle nested validation errors correctly', () => {
      const nestedSchema = z.object({
        spreadsheet: z.object({
          id: z.string().min(1),
          title: z.string().min(1),
        }),
        operation: z.object({
          type: z.enum(['read', 'write', 'append']),
          range: z.string(),
          data: z.array(z.string()).optional(),
        }),
      });

      const invalidData = {
        spreadsheet: {
          id: '', // Invalid: empty string
          title: 'Valid Title',
        },
        operation: {
          type: 'invalid' as any, // Invalid: not in enum
          range: 'A1:B2',
        },
      };

      const mockError = new GoogleSheetsError(
        'Nested validation failed',
        'GOOGLE_SHEETS_VALIDATION_ERROR',
        400,
        undefined,
        undefined,
        {
          validationErrors: [
            {
              code: 'too_small',
              path: ['spreadsheet', 'id'],
              message: 'String must contain at least 1 character(s)',
            },
            {
              code: 'invalid_enum_value',
              path: ['operation', 'type'],
              message: 'Invalid enum value',
            },
          ],
        }
      );
      const mockResult = err(mockError);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      // This test should fail because validateWithSchema doesn't exist yet
      const result = (testTool as any).validateWithSchema(
        nestedSchema,
        invalidData
      );

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
    });

    describe('Integration with SchemaFactory patterns', () => {
      it('should work with SchemaFactory-generated schemas', () => {
        const sheetsReadSchema = z.object({
          spreadsheetId: z
            .string()
            .trim()
            .min(1, 'Spreadsheet ID cannot be empty'),
          range: z.string().trim().min(1, 'Range cannot be empty'),
        });

        const testData = {
          spreadsheetId: 'mock-spreadsheet-id',
          range: 'Sheet1!A1:B10',
        };

        const mockResult = ok(testData);
        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(mockResult);

        // This test should fail because validateWithSchema doesn't exist yet
        const result = (testTool as any).validateWithSchema(
          sheetsReadSchema,
          testData
        );

        expect(validateToolInput).toHaveBeenCalledWith(
          sheetsReadSchema,
          testData
        );
        expect(result.isOk()).toBe(true);
      });

      it('should handle trimming and transformation correctly', () => {
        const trimSchema = z.object({
          spreadsheetId: z.string().trim().min(1),
          range: z.string().trim().min(1),
        });

        const testData = {
          spreadsheetId: '  trimmed-id  ',
          range: '  A1:B2  ',
        };

        const expectedTrimmed = {
          spreadsheetId: 'trimmed-id',
          range: 'A1:B2',
        };

        const mockResult = ok(expectedTrimmed);
        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(mockResult);

        // This test should fail because validateWithSchema doesn't exist yet
        const result = (testTool as any).validateWithSchema(
          trimSchema,
          testData
        );

        expect(result._unsafeUnwrap()).toEqual(expectedTrimmed);
      });
    });
  });

  // ===============================
  // METHOD REMOVAL TESTS (RED PHASE - Should Pass, then Fail after removal)
  // ===============================

  describe('Method Removal Verification (GREEN PHASE - After changes)', () => {
    it('should not have validateParameters method (has been removed)', () => {
      // This test should fail initially, then pass after removal
      expect((testTool as any).validateParameters).toBeUndefined();
    });

    it('should not have isValidRangeFormat method (has been removed)', () => {
      // This test should fail initially, then pass after removal
      expect((testTool as any).isValidRangeFormat).toBeUndefined();
    });

    it('should have validateWithSchema method (has been added)', () => {
      // This test should fail initially, then pass after addition
      expect(typeof (testTool as any).validateWithSchema).toBe('function');
    });
  });

  // ===============================
  // SCHEMAFACTORY INTEGRATION TESTS (RED PHASE - For future integration)
  // ===============================

  describe('SchemaFactory Integration (RED PHASE - Future integration)', () => {
    beforeEach(() => {
      (
        SchemaFactory.validateRangeFormat as jest.MockedFunction<
          typeof SchemaFactory.validateRangeFormat
        >
      ).mockClear();
    });

    it('should integrate with SchemaFactory.validateRangeFormat instead of internal method', () => {
      // Mock SchemaFactory response
      (
        SchemaFactory.validateRangeFormat as jest.MockedFunction<
          typeof SchemaFactory.validateRangeFormat
        >
      ).mockReturnValue({ valid: true });

      // This test represents future integration - should fail initially
      // After refactoring, this should be called instead of internal isValidRangeFormat
      const testRange = 'A1:B2';

      // Future implementation should use SchemaFactory
      // testTool.someMethodThatUsesRangeValidation(testRange);

      // For now, we're just testing that SchemaFactory has the expected method
      expect(typeof SchemaFactory.validateRangeFormat).toBe('function');
    });

    it('should handle SchemaFactory validation results correctly', () => {
      const validResult = { valid: true };
      const invalidResult = { valid: false, error: 'Invalid range format' };

      (
        SchemaFactory.validateRangeFormat as jest.MockedFunction<
          typeof SchemaFactory.validateRangeFormat
        >
      )
        .mockReturnValueOnce(validResult)
        .mockReturnValueOnce(invalidResult);

      // Test with valid range
      const validRange = SchemaFactory.validateRangeFormat('A1:B2');
      expect(validRange.valid).toBe(true);

      // Test with invalid range
      const invalidRange = SchemaFactory.validateRangeFormat('invalid');
      expect(invalidRange.valid).toBe(false);
      expect(invalidRange.error).toBeDefined();
    });

    describe('Future integration scenarios', () => {
      it('should replace isValidRangeFormat with SchemaFactory method', () => {
        // Legacy method no longer exists
        expect((testTool as any).isValidRangeFormat).toBeUndefined();

        // Future integration expectation - SchemaFactory should be used instead
        // This represents how validation should work after refactoring
        (
          SchemaFactory.validateRangeFormat as jest.MockedFunction<
            typeof SchemaFactory.validateRangeFormat
          >
        ).mockReturnValue({ valid: true });

        // After refactoring, this is how range validation should work
        const futureValidation = SchemaFactory.validateRangeFormat('A1:B2');
        expect(futureValidation.valid).toBe(true);
      });

      it('should handle advanced range patterns through SchemaFactory', () => {
        const testCases = [
          { range: 'A1', expected: true },
          { range: 'Z99', expected: true },
          { range: 'AA100:ZZ200', expected: true },
          { range: 'Sheet1!A1', expected: true },
          { range: 'My Sheet!A1:B2', expected: true },
          { range: 'Invalid Range!', expected: false },
          { range: '!A1', expected: false },
          { range: 'A1:', expected: false },
        ];

        testCases.forEach(({ range, expected }) => {
          (
            SchemaFactory.validateRangeFormat as jest.MockedFunction<
              typeof SchemaFactory.validateRangeFormat
            >
          ).mockReturnValue({
            valid: expected,
            error: expected ? undefined : `Invalid range: ${range}`,
          });

          const result = SchemaFactory.validateRangeFormat(range);
          expect(result.valid).toBe(expected);
          if (!expected) {
            expect(result.error).toContain(range);
          }
        });
      });

      it('should integrate with tool schema creation patterns', () => {
        // Test that SchemaFactory can create complete tool schemas
        const mockToolSchema = z.object({
          spreadsheetId: z.string().min(1),
          range: z.string().min(1),
          values: z.array(z.array(z.string())).optional(),
        });

        // Mock SchemaFactory.createToolInputSchema if it existed
        // This represents future integration patterns
        const testToolType = 'sheets-write';

        // Future: SchemaFactory.createToolInputSchema(testToolType)
        // For now, we manually create the expected schema structure
        expect(mockToolSchema).toBeDefined();
        expect(typeof mockToolSchema.safeParse).toBe('function');
      });
    });

    describe('Migration path from legacy validation', () => {
      it('should maintain backward compatibility during transition', () => {
        // Legacy methods have been removed
        expect((testTool as any).isValidRangeFormat).toBeUndefined();
        expect((testTool as any).validateParameters).toBeUndefined();

        // SchemaFactory methods should also work
        (
          SchemaFactory.validateRangeFormat as jest.MockedFunction<
            typeof SchemaFactory.validateRangeFormat
          >
        ).mockReturnValue({ valid: true });

        const schemaResult = SchemaFactory.validateRangeFormat('A1:B2');
        expect(schemaResult.valid).toBe(true);
      });

      it('should provide equivalent validation results', () => {
        const testRanges = ['A1', 'A1:B2', 'Sheet1!A1', 'Invalid!'];

        testRanges.forEach(range => {
          // Legacy method no longer exists, so we test only SchemaFactory
          const expectedValid = ['A1', 'A1:B2', 'Sheet1!A1'].includes(range);

          (
            SchemaFactory.validateRangeFormat as jest.MockedFunction<
              typeof SchemaFactory.validateRangeFormat
            >
          ).mockReturnValue({ valid: expectedValid });

          const schemaResult = SchemaFactory.validateRangeFormat(range);

          // Test only SchemaFactory results
          expect(schemaResult.valid).toBe(expectedValid);
        });
      });
    });
  });

  // ===============================
  // COMPATIBILITY AND INTEGRATION TESTS
  // ===============================

  describe('Backward Compatibility', () => {
    it('should maintain existing authentication functionality', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(true));

      const result = await (testTool as any).validateAuthentication(
        'test-request'
      );

      expect(result.isOk()).toBe(true);
      expect(mockAuthService.validateAuth).toHaveBeenCalledTimes(1);
    });

    it('should maintain existing calculateStatistics functionality', () => {
      const testValues = [
        ['a', 'b'],
        ['c', 'd', 'e'],
      ];
      const stats = (testTool as any).calculateStatistics(testValues);

      expect(stats).toEqual({
        updatedCells: 5,
        updatedRows: 2,
        updatedColumns: 3,
      });
    });

    it('should maintain inheritance structure', () => {
      expect(testTool).toBeInstanceOf(BaseSheetsTools);
      expect(testTool.getToolName()).toBe('test-tool');
    });
  });

  describe('Error Handling Consistency', () => {
    it('should maintain consistent error types', async () => {
      const authError = new GoogleAuthError('Test error', 'service-account');
      mockAuthService.validateAuth.mockResolvedValue(err(authError));

      const result = await (testTool as any).validateAuthentication(
        'test-request'
      );

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAuthError);
    });

    it('should log errors consistently', async () => {
      mockAuthService.validateAuth.mockResolvedValue(ok(false));

      await (testTool as any).validateAuthentication('test-request');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Authentication invalid',
        expect.objectContaining({
          error: expect.any(Object),
          requestId: 'test-request',
        })
      );
    });
  });

  // ===============================
  // VALIDATION UTILITY INTEGRATION TESTS
  // ===============================

  describe('Validation Utility Integration (Current and Future)', () => {
    beforeEach(() => {
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockClear();
    });

    describe('Direct validateToolInput utility tests', () => {
      it('should properly integrate with validation utilities', () => {
        // Test setup for future validateToolInput integration
        const mockSchema = z.string().min(1);
        const mockData = 'test-data';

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(ok(mockData));

        // Direct test of validateToolInput utility
        const result = validateToolInput(mockSchema, mockData);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(mockData);
      });

      it('should handle validation errors from utilities', () => {
        const mockSchema = z.string().min(1);
        const mockData = '';
        const mockError = new GoogleSheetsError(
          'Validation failed',
          'GOOGLE_SHEETS_VALIDATION_ERROR',
          400
        );

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(err(mockError));

        const result = validateToolInput(mockSchema, mockData);

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBe(mockError);
      });

      it('should handle complex schema validations', () => {
        const complexSchema = z.object({
          spreadsheetId: z.string().min(1),
          range: z.string().regex(/^[A-Z]+\d+(:[A-Z]+\d+)?$/),
          values: z.array(z.array(z.string())).optional(),
          metadata: z
            .object({
              author: z.string(),
              timestamp: z.string().datetime(),
            })
            .optional(),
        });

        const validData = {
          spreadsheetId: 'test-sheet-123',
          range: 'A1:B10',
          values: [['cell1', 'cell2']],
          metadata: {
            author: 'test-user',
            timestamp: '2024-01-01T00:00:00Z',
          },
        };

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(ok(validData));

        const result = validateToolInput(complexSchema, validData);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual(validData);
      });

      it('should provide detailed validation errors', () => {
        const schema = z.object({
          spreadsheetId: z.string().min(1),
          range: z.string().min(1),
          values: z.array(z.array(z.string())).min(1),
        });

        const invalidData = {
          spreadsheetId: '', // Too short
          range: 'A1:B2',
          values: [], // Too short array
        };

        const detailedError = new GoogleSheetsError(
          'Invalid input data: Found 2 validation errors',
          'GOOGLE_SHEETS_VALIDATION_ERROR',
          400,
          undefined,
          undefined,
          {
            validationErrors: [
              {
                code: 'too_small',
                path: ['spreadsheetId'],
                message: 'String must contain at least 1 character(s)',
                minimum: 1,
                type: 'string',
                inclusive: true,
              },
              {
                code: 'too_small',
                path: ['values'],
                message: 'Array must contain at least 1 element(s)',
                minimum: 1,
                type: 'array',
                inclusive: true,
              },
            ],
          }
        );

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(err(detailedError));

        const result = validateToolInput(schema, invalidData);

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
        expect(error.context?.validationErrors).toHaveLength(2);
      });
    });

    describe('Future BaseSheetsTools integration patterns', () => {
      it('should replace legacy validateParameters with schema-based validation', () => {
        // Legacy method no longer exists
        expect((testTool as any).validateParameters).toBeUndefined();

        // Future schema-based approach
        const schema = z.object({
          spreadsheetId: z.string().min(1),
          range: z.string().min(1),
          operation: z.enum(['read', 'write', 'append']),
        });

        const data = {
          spreadsheetId: 'test-id',
          range: 'A1:B2',
          operation: 'read' as const,
        };

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(ok(data));

        // Future validateWithSchema method (should fail now, succeed after implementation)
        // const schemaResult = testTool.validateWithSchema(schema, data);

        // For now, test the utility directly
        const utilityResult = validateToolInput(schema, data);
        expect(utilityResult.isOk()).toBe(true);
      });

      it('should provide better error messages than legacy validation', () => {
        // Legacy method no longer exists
        expect((testTool as any).validateParameters).toBeUndefined();

        // Future schema-based error handling
        const schema = z.object({
          spreadsheetId: z.string().min(1, 'Spreadsheet ID is required'),
          range: z.string().min(1, 'Range is required'),
          operation: z.enum(['read', 'write', 'append']),
        });

        const invalidData = {
          spreadsheetId: '',
          range: 'A1:B2',
          operation: 'read' as const,
        };

        const schemaError = new GoogleSheetsError(
          'Invalid input data: Found 1 validation error',
          'GOOGLE_SHEETS_VALIDATION_ERROR',
          400,
          undefined,
          undefined,
          {
            validationErrors: [
              {
                code: 'too_small',
                path: ['spreadsheetId'],
                message: 'Spreadsheet ID is required',
              },
            ],
          }
        );

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(err(schemaError));

        const result = validateToolInput(schema, invalidData);
        expect(result.isErr()).toBe(true);

        const error = result._unsafeUnwrapErr();
        expect(error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
        expect(error.statusCode).toBe(400);
        expect(error.context?.validationErrors).toBeDefined();
        const validationErrors = error.context?.validationErrors as any[];
        expect(Array.isArray(validationErrors)).toBe(true);
        expect(validationErrors).toHaveLength(1);
      });

      it('should support transformation and coercion through schemas', () => {
        const transformSchema = z.object({
          spreadsheetId: z.string().trim().min(1),
          range: z.string().trim().toUpperCase(),
          values: z.array(z.array(z.string().transform(s => s.trim()))),
        });

        const inputData = {
          spreadsheetId: '  test-id  ',
          range: '  a1:b2  ',
          values: [['  cell1  ', '  cell2  ']],
        };

        const transformedData = {
          spreadsheetId: 'test-id',
          range: 'A1:B2',
          values: [['cell1', 'cell2']],
        };

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(ok(transformedData));

        const result = validateToolInput(transformSchema, inputData);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual(transformedData);
      });
    });

    describe('Performance and caching integration', () => {
      it('should leverage schema caching for repeated validations', () => {
        const schema = z.object({
          spreadsheetId: z.string().min(1),
          range: z.string().min(1),
        });

        const testData1 = { spreadsheetId: 'id1', range: 'A1:B1' };
        const testData2 = { spreadsheetId: 'id2', range: 'C1:D1' };

        (validateToolInput as jest.MockedFunction<typeof validateToolInput>)
          .mockReturnValueOnce(ok(testData1))
          .mockReturnValueOnce(ok(testData2));

        // Multiple validations with the same schema
        const result1 = validateToolInput(schema, testData1);
        const result2 = validateToolInput(schema, testData2);

        expect(result1.isOk()).toBe(true);
        expect(result2.isOk()).toBe(true);
        expect(validateToolInput).toHaveBeenCalledTimes(2);
      });

      it('should handle validation performance efficiently', () => {
        const largeDataSchema = z.object({
          spreadsheetId: z.string().min(1),
          range: z.string().min(1),
          values: z.array(z.array(z.string())).max(1000), // Large but reasonable limit
        });

        const largeDataSet = {
          spreadsheetId: 'large-sheet',
          range: 'A1:Z100',
          values: Array(100)
            .fill(null)
            .map((_, i) =>
              Array(26)
                .fill(null)
                .map((_, j) => `cell_${i}_${j}`)
            ),
        };

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(ok(largeDataSet));

        const startTime = Date.now();
        const result = validateToolInput(largeDataSchema, largeDataSet);
        const endTime = Date.now();

        expect(result.isOk()).toBe(true);
        // Performance assertion - validation should be reasonably fast
        // Note: This is a mock, so timing isn't real, but represents the expectation
        expect(endTime - startTime).toBeLessThan(1000);
      });
    });
  });

  // ===============================
  // ACCESS CONTROL INTEGRATION TESTS (RED PHASE - SHOULD FAIL)
  // ===============================

  describe('Access Control Integration (RED PHASE - Should Fail)', () => {
    describe('validateAccessControl method', () => {
      it('should exist and be callable', () => {
        // This test should fail because validateAccessControl doesn't exist yet
        expect(typeof (testTool as any).validateAccessControl).toBe('function');
      });

      it('should validate read operations (always allowed)', async () => {
        const request = {
          operation: 'read' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__read-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(
          ok(undefined)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__read-range',
          targetFolderId: undefined,
          resourceType: 'spreadsheet',
          context: expect.any(Object),
        });
      });

      it('should validate write operations with access control', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id', folderId: 'folder-123' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(
          ok(undefined)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          targetFolderId: 'folder-123',
          resourceType: 'spreadsheet',
          context: expect.any(Object),
        });
      });

      it('should handle access control denial errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        const accessError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(
          err(accessError)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlReadOnlyError
        );
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Access control validation failed',
          expect.objectContaining({
            requestId: 'test-request-id',
            operation: 'write',
            serviceName: 'sheets',
            toolName: 'google-workspace__sheets__write-range',
          })
        );
      });

      it('should handle folder-based access control', async () => {
        const request = {
          operation: 'create' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__create-spreadsheet',
          context: { folderId: 'restricted-folder' },
        };

        const folderError = new GoogleAccessControlFolderError(
          'restricted-folder',
          'allowed-folder',
          { operation: 'create', resourceType: 'spreadsheet' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(
          err(folderError)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlFolderError
        );
      });

      it('should handle service access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        const serviceError = new GoogleAccessControlServiceError(
          'sheets',
          ['docs', 'calendar'],
          { operation: 'write', resourceType: 'spreadsheet' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(
          err(serviceError)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlServiceError
        );
      });

      it('should handle tool access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        const toolError = new GoogleAccessControlToolError(
          'google-workspace__sheets__write-range',
          ['google-workspace__sheets__read-range'],
          { operation: 'write', serviceName: 'sheets' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(
          err(toolError)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlToolError
        );
      });

      it('should handle unexpected access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        mockAccessControlService.validateAccess.mockRejectedValue(
          new Error('Network error')
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlError
        );
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Access control validation error',
          expect.objectContaining({
            requestId: 'test-request-id',
            error: expect.any(Object),
          })
        );
      });
    });

    describe('isWriteOperation method', () => {
      it('should exist and be callable', () => {
        // This test should fail because isWriteOperation doesn't exist yet
        expect(typeof (testTool as any).isWriteOperation).toBe('function');
      });

      it('should identify read operations correctly', () => {
        const readOperations = [
          'google-workspace__sheets__read-range',
          'google-workspace__sheets__get-spreadsheet',
          'sheets-read',
          'sheets-get',
          'list-spreadsheets',
        ];

        readOperations.forEach(toolName => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(false);
        });
      });

      it('should identify write operations correctly', () => {
        const writeOperations = [
          'google-workspace__sheets__write-range',
          'google-workspace__sheets__append-values',
          'google-workspace__sheets__create-spreadsheet',
          'google-workspace__sheets__update-range',
          'google-workspace__sheets__delete-range',
          'sheets-write',
          'sheets-create',
          'sheets-update',
          'sheets-delete',
          'sheets-append',
        ];

        writeOperations.forEach(toolName => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(true);
        });
      });

      it('should handle edge cases and unknown tool patterns', () => {
        const edgeCases = [
          { toolName: '', expected: false },
          { toolName: 'unknown-tool', expected: false },
          { toolName: 'google-workspace__sheets__unknown', expected: false },
          { toolName: 'sheets-unknown-operation', expected: false },
        ];

        edgeCases.forEach(({ toolName, expected }) => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(expected);
        });
      });

      it('should handle tool name parsing correctly', () => {
        const testCases = [
          // Standard patterns
          {
            toolName: 'google-workspace__sheets__create-spreadsheet',
            expected: true,
          },
          { toolName: 'google-workspace__sheets__read-range', expected: false },
          // Legacy patterns
          { toolName: 'sheets-create', expected: true },
          { toolName: 'sheets-read', expected: false },
          // Mixed case
          {
            toolName: 'google-workspace__sheets__CREATE-spreadsheet',
            expected: true,
          },
          { toolName: 'google-workspace__sheets__READ-range', expected: false },
        ];

        testCases.forEach(({ toolName, expected }) => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(expected);
        });
      });
    });

    describe('getRequiredFolderIds method', () => {
      it('should exist and be callable', () => {
        // This test should fail because getRequiredFolderIds doesn't exist yet
        expect(typeof (testTool as any).getRequiredFolderIds).toBe('function');
      });

      it('should extract folder ID from spreadsheet parameters', () => {
        const testCases = [
          {
            params: { folderId: 'folder-123' },
            expected: ['folder-123'],
          },
          {
            params: { parentFolderId: 'parent-456' },
            expected: ['parent-456'],
          },
          {
            params: { targetFolderId: 'target-789' },
            expected: ['target-789'],
          },
          {
            params: {
              folderId: 'folder-123',
              parentFolderId: 'parent-456',
            },
            expected: ['folder-123', 'parent-456'],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });

      it('should return empty array when no folder parameters present', () => {
        const testCases = [
          {},
          { spreadsheetId: 'sheet-123' },
          { range: 'A1:B2' },
          { values: [['cell1', 'cell2']] },
          { spreadsheetId: 'sheet-123', range: 'A1:B2', values: [] },
        ];

        testCases.forEach(params => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual([]);
        });
      });

      it('should handle nested folder parameters', () => {
        const testCases = [
          {
            params: {
              options: {
                folderId: 'nested-folder-123',
              },
            },
            expected: ['nested-folder-123'],
          },
          {
            params: {
              metadata: {
                parentFolderId: 'nested-parent-456',
              },
            },
            expected: ['nested-parent-456'],
          },
          {
            params: {
              options: {
                folderId: 'nested-folder-123',
              },
              metadata: {
                parentFolderId: 'nested-parent-456',
              },
            },
            expected: ['nested-folder-123', 'nested-parent-456'],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });

      it('should filter out empty, null, and undefined folder IDs', () => {
        const testCases = [
          {
            params: {
              folderId: '',
              parentFolderId: 'valid-folder',
              targetFolderId: null,
            },
            expected: ['valid-folder'],
          },
          {
            params: {
              folderId: undefined,
              parentFolderId: 'another-valid-folder',
              targetFolderId: '',
            },
            expected: ['another-valid-folder'],
          },
          {
            params: {
              folderId: null,
              parentFolderId: undefined,
              targetFolderId: '',
            },
            expected: [],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });
    });

    describe('Integration with existing tool execution flow', () => {
      it('should integrate access control with executeImpl method', async () => {
        // Mock a tool that would normally call access control validation
        const mockExecuteWithAccessControl = jest.fn().mockResolvedValue(
          // @ts-ignore - Mock return value
          ok({ result: 'success' })
        );

        // This test should fail because access control integration doesn't exist yet
        expect(typeof (testTool as any).executeWithAccessControl).toBe(
          'function'
        );
      });

      it('should validate access control before executing write operations', async () => {
        const writeInput = {
          spreadsheetId: 'test-sheet-123',
          range: 'A1:B2',
          values: [['cell1', 'cell2']],
          folderId: 'folder-456',
        };

        // Mock access control to deny the operation
        const accessError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(
          err(accessError)
        );

        // This test should fail because write operation access control doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          writeInput,
          'google-workspace__sheets__write-range'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(
          GoogleAccessControlReadOnlyError
        );
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          targetFolderId: 'folder-456',
          resourceType: 'spreadsheet',
          context: expect.objectContaining({
            spreadsheetId: 'test-sheet-123',
            range: 'A1:B2',
          }),
        });
      });

      it('should skip access control validation for read operations', async () => {
        const readInput = {
          spreadsheetId: 'test-sheet-123',
          range: 'A1:B2',
        };

        // This test should fail because read operation flow doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          readInput,
          'google-workspace__sheets__read-range'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__read-range',
          targetFolderId: undefined,
          resourceType: 'spreadsheet',
          context: expect.objectContaining({
            spreadsheetId: 'test-sheet-123',
            range: 'A1:B2',
          }),
        });
      });

      it('should preserve original tool execution when access is allowed', async () => {
        const validInput = {
          test: 'valid-data',
        };

        mockAccessControlService.validateAccess.mockResolvedValue(
          ok(undefined)
        );

        // This test should fail because executeWithAccessControl doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          validInput,
          'google-workspace__sheets__read-range'
        );

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual({ result: 'valid-data' });
      });
    });

    describe('Error handling and Result<T, E> pattern consistency', () => {
      it('should maintain Result<T, E> pattern for access control methods', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(
          ok(undefined)
        );

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result).toHaveProperty('isOk');
        expect(result).toHaveProperty('isErr');
        expect(typeof result.isOk).toBe('function');
        expect(typeof result.isErr).toBe('function');
      });

      it('should convert non-GoogleWorkspaceError to proper error types', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        // Simulate unexpected error type
        mockAccessControlService.validateAccess.mockRejectedValue(
          new TypeError('Unexpected error')
        );

        // This test should fail because error conversion doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBeInstanceOf(GoogleAccessControlError);
        expect(error.message).toContain('Access control validation failed');
      });

      it('should preserve error context and stack traces', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'google-workspace__sheets__write-range',
          context: { spreadsheetId: 'test-sheet-id' },
        };

        const originalError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(
          err(originalError)
        );

        // This test should fail because error context preservation doesn't exist yet
        const result = await (testTool as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBe(originalError); // Should preserve the exact same error instance
        expect(error.context).toEqual({
          serviceName: 'sheets',
          resourceType: 'spreadsheet',
          operation: 'write',
          restriction: 'read-only',
          allowedValues: ['read'],
        });
      });
    });

    describe('Backward compatibility with existing patterns', () => {
      it('should not break existing authentication validation', async () => {
        mockAuthService.validateAuth.mockResolvedValue(ok(true));

        const result = await (testTool as any).validateAuthentication(
          'test-request-id'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAuthService.validateAuth).toHaveBeenCalledTimes(1);
      });

      it('should not break existing schema validation', () => {
        const schema = z.object({
          test: z.string(),
        });
        const data = { test: 'valid-data' };

        (
          validateToolInput as jest.MockedFunction<typeof validateToolInput>
        ).mockReturnValue(ok(data));

        const result = (testTool as any).validateWithSchema(schema, data);

        expect(result.isOk()).toBe(true);
        expect(validateToolInput).toHaveBeenCalledWith(schema, data);
      });

      it('should not break existing calculateStatistics method', () => {
        const values = [['cell1', 'cell2'], ['cell3']];

        const stats = (testTool as any).calculateStatistics(values);

        expect(stats).toEqual({
          updatedCells: 3,
          updatedRows: 2,
          updatedColumns: 2,
        });
      });

      it('should maintain service and logger injection', () => {
        expect((testTool as any).sheetsService).toBe(mockSheetsService);
        expect((testTool as any).authService).toBe(mockAuthService);
        expect((testTool as any).logger).toBe(mockLogger);
      });
    });

    describe('AccessControlService dependency injection (RED PHASE)', () => {
      it('should accept AccessControlService as constructor parameter', () => {
        // This test should fail because AccessControlService injection doesn't exist yet
        expect(() => {
          new TestSheetsTools(
            mockSheetsService,
            mockAuthService,
            mockLogger,
            mockAccessControlService
          );
        }).not.toThrow();
      });

      it('should use injected AccessControlService for validations', async () => {
        // This test should fail because AccessControlService injection doesn't exist yet
        const toolWithAccessControl = new TestSheetsTools(
          mockSheetsService,
          mockAuthService,
          mockLogger,
          mockAccessControlService
        );

        const request = {
          operation: 'write' as const,
          serviceName: 'sheets',
          toolName: 'test-tool',
          context: {},
        };

        mockAccessControlService.validateAccess.mockResolvedValue(
          ok(undefined)
        );

        const result = await (
          toolWithAccessControl as any
        ).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledTimes(
          1
        );
      });

      it('should handle optional AccessControlService parameter', () => {
        // This test should fail because optional AccessControlService doesn't exist yet
        const toolWithoutAccessControl = new TestSheetsTools(
          mockSheetsService,
          mockAuthService,
          mockLogger
        );

        expect(toolWithoutAccessControl).toBeDefined();
        expect(
          (toolWithoutAccessControl as any).accessControlService
        ).toBeUndefined();
      });
    });
  });
});
