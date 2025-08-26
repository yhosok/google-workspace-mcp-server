/**
 * Test suite for validation utilities (TDD Red Phase)
 * 
 * This test file defines the specification for a common validation utility system
 * that eliminates duplication between input schema and runtime validation using Zod's safeParse.
 */

import { describe, it, expect } from '@jest/globals';
import { z } from 'zod';
import { Result } from 'neverthrow';
import { 
  validateToolInput, 
  convertZodErrorToGoogleSheetsError
} from './validation.utils.js';
import { 
  GoogleSheetsError,
  GoogleSheetsInvalidRangeError
} from '../errors/index.js';
import { SchemaFactory, SupportedTool } from '../tools/base/tool-schema.js';

/**
 * Test schemas for validation testing
 */
const testSchemas = {
  simple: z.object({
    name: z.string().min(1, 'Name must not be empty'),
    age: z.number().int().min(0, 'Age must be a non-negative integer'),
    active: z.boolean()
  }),
  
  spreadsheet: z.object({
    spreadsheetId: z.string()
      .min(1, 'Spreadsheet ID cannot be empty')
      .describe('The ID of the Google Spreadsheet'),
    range: z.string()
      .min(1, 'Range cannot be empty')
      .describe('The A1 notation range'),
    values: z.array(z.array(z.string()))
      .describe('2D array of string values')
  }),
  
  nested: z.object({
    user: z.object({
      email: z.string().email('Invalid email format'),
      profile: z.object({
        displayName: z.string().min(1, 'Display name required')
      })
    }),
    settings: z.object({
      notifications: z.boolean(),
      theme: z.enum(['light', 'dark'], {
        errorMap: () => ({ message: 'Theme must be light or dark' })
      })
    })
  }),
  
  constraints: z.object({
    title: z.string()
      .min(3, 'Title must be at least 3 characters')
      .max(50, 'Title must be at most 50 characters'),
    count: z.number()
      .min(1, 'Count must be at least 1')
      .max(100, 'Count must be at most 100'),
    url: z.string().url('Must be a valid URL'),
    optional: z.string().optional()
  })
};

describe('ValidationUtils', () => {
  describe('validateToolInput function', () => {
    describe('successful validation', () => {
      it('should successfully validate valid simple data', async () => {
        const validData = {
          name: 'John Doe',
          age: 30,
          active: true
        };
        
        const result = validateToolInput(testSchemas.simple, validData);
        
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual(validData);
        }
      });

      it('should successfully validate valid spreadsheet data', async () => {
        const validData = {
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          range: 'Sheet1!A1:B10',
          values: [['A', 'B'], ['C', 'D']]
        };
        
        const result = validateToolInput(testSchemas.spreadsheet, validData);
        
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual(validData);
        }
      });

      it('should successfully validate nested object data', async () => {
        const validData = {
          user: {
            email: 'john@example.com',
            profile: {
              displayName: 'John Doe'
            }
          },
          settings: {
            notifications: true,
            theme: 'dark'
          }
        };
        
        const result = validateToolInput(testSchemas.nested, validData);
        
        expect(result.isOk()).toBe(true);
        if (result.isOk()) {
          expect(result.value).toEqual(validData);
        }
      });

      it('should handle optional fields correctly', async () => {
        const dataWithOptional = {
          title: 'Test Title',
          count: 5,
          url: 'https://example.com',
          optional: 'present'
        };
        
        const dataWithoutOptional = {
          title: 'Test Title',
          count: 5,
          url: 'https://example.com'
        };
        
        const result1 = validateToolInput(testSchemas.constraints, dataWithOptional);
        const result2 = validateToolInput(testSchemas.constraints, dataWithoutOptional);
        
        expect(result1.isOk()).toBe(true);
        expect(result2.isOk()).toBe(true);
      });
    });

    describe('validation failures', () => {
      it('should handle invalid_type errors', async () => {
        const invalidData = {
          name: 123, // Should be string
          age: '30', // Should be number
          active: 'true' // Should be boolean
        };
        
        const result = validateToolInput(testSchemas.simple, invalidData);
        
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          const error = result.error;
          expect(error).toBeInstanceOf(GoogleSheetsError);
          expect(error.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
          expect(error.message).toContain('Invalid input data');
          expect(error.context).toHaveProperty('validationErrors');
          
          const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
          expect(validationErrors).toHaveLength(3);
          expect(validationErrors.some(e => (e.path as (string | number)[]).includes('name'))).toBe(true);
          expect(validationErrors.some(e => (e.path as (string | number)[]).includes('age'))).toBe(true);
          expect(validationErrors.some(e => (e.path as (string | number)[]).includes('active'))).toBe(true);
        }
      });

      it('should handle too_small/too_big constraint errors', async () => {
        const invalidData = {
          title: 'ab', // Too short (min 3)
          count: 150, // Too big (max 100)
          url: 'https://example.com'
        };
        
        const result = validateToolInput(testSchemas.constraints, invalidData);
        
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          const error = result.error;
          expect(error).toBeInstanceOf(GoogleSheetsError);
          expect(error.message).toContain('Invalid input data');
          expect(error.context?.validationErrors).toBeDefined();
          
          const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
          expect(validationErrors.some(e => 
            e.code === 'too_small' && (e.path as (string | number)[]).includes('title')
          )).toBe(true);
          expect(validationErrors.some(e => 
            e.code === 'too_big' && (e.path as (string | number)[]).includes('count')
          )).toBe(true);
        }
      });

      it('should handle invalid_string format errors', async () => {
        const invalidData = {
          user: {
            email: 'not-an-email', // Invalid email format
            profile: {
              displayName: 'John Doe'
            }
          },
          settings: {
            notifications: true,
            theme: 'invalid-theme' // Invalid enum value
          }
        };
        
        const result = validateToolInput(testSchemas.nested, invalidData);
        
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          const error = result.error;
          expect(error).toBeInstanceOf(GoogleSheetsError);
          expect(error.context?.validationErrors).toBeDefined();
          
          const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
          expect(validationErrors.some(e => 
            (e.path as (string | number)[]).includes('email')
          )).toBe(true);
          expect(validationErrors.some(e => 
            (e.path as (string | number)[]).includes('theme')
          )).toBe(true);
        }
      });

      it('should handle multiple validation errors', async () => {
        const invalidData = {
          name: '', // Too short
          age: -5, // Too small
          active: 'not-boolean' // Wrong type
        };
        
        const result = validateToolInput(testSchemas.simple, invalidData);
        
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          const error = result.error;
          expect(error.context?.validationErrors).toBeDefined();
          
          const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
          expect(validationErrors).toHaveLength(3);
        }
      });

      it('should handle nested object validation errors', async () => {
        const invalidData = {
          user: {
            email: 'invalid-email',
            profile: {
              displayName: '' // Empty display name
            }
          },
          settings: {
            notifications: 'not-boolean', // Wrong type
            theme: 'invalid'
          }
        };
        
        const result = validateToolInput(testSchemas.nested, invalidData);
        
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          const error = result.error;
          const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
          
          expect(validationErrors.some(e => 
            (e.path as (string | number)[]).includes('email')
          )).toBe(true);
          expect(validationErrors.some(e => 
            (e.path as (string | number)[]).includes('displayName')
          )).toBe(true);
          expect(validationErrors.some(e => 
            (e.path as (string | number)[]).includes('notifications')
          )).toBe(true);
          expect(validationErrors.some(e => 
            (e.path as (string | number)[]).includes('theme')
          )).toBe(true);
        }
      });

      it('should handle missing required fields', async () => {
        const incompleteData = {
          name: 'John' // Missing age and active fields
        };
        
        const result = validateToolInput(testSchemas.simple, incompleteData);
        
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
          const error = result.error;
          const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
          
          expect(validationErrors.some(e => 
            e.code === 'invalid_type' && (e.path as (string | number)[]).includes('age')
          )).toBe(true);
          expect(validationErrors.some(e => 
            e.code === 'invalid_type' && (e.path as (string | number)[]).includes('active')
          )).toBe(true);
        }
      });
    });

    describe('type safety', () => {
      it('should maintain type inference for successful validation', async () => {
        const validData = {
          name: 'John Doe',
          age: 30,
          active: true
        };
        
        const result = validateToolInput(testSchemas.simple, validData);
        
        if (result.isOk()) {
          // These should be type-safe accesses
          expect(typeof result.value.name).toBe('string');
          expect(typeof result.value.age).toBe('number');
          expect(typeof result.value.active).toBe('boolean');
        }
      });

      it('should work with generic schema types', async () => {
        const genericValidate = <T>(schema: z.ZodType<T>, data: unknown): ValidationResult<T> => {
          return validateToolInput(schema, data);
        };
        
        const result = genericValidate(testSchemas.simple, { name: 'John', age: 30, active: true });
        
        expect(result.isOk()).toBe(true);
      });
    });
  });

  describe('convertZodErrorToGoogleSheetsError function', () => {
    it('should convert ZodError with single issue', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number'
        }
      ]);
      
      const result = convertZodErrorToGoogleSheetsError(zodError);
      
      expect(result).toBeInstanceOf(GoogleSheetsError);
      expect(result.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
      expect(result.message).toBe('Expected string, received number'); // Single error uses specific message
      expect(result.statusCode).toBe(400);
      expect(result.context).toHaveProperty('validationErrors');
      
      const validationErrors = result.context?.validationErrors as any[];
      expect(Array.isArray(validationErrors)).toBe(true);
      expect(validationErrors).toHaveLength(1);
      expect(validationErrors[0]).toMatchObject({
        code: 'invalid_type',
        path: ['name'],
        message: 'Expected string, received number'
      });
    });

    it('should convert ZodError with multiple issues', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['name'],
          message: 'Expected string, received number'
        },
        {
          code: 'too_small',
          minimum: 0,
          type: 'number',
          inclusive: true,
          exact: false,
          path: ['age'],
          message: 'Number must be greater than or equal to 0'
        }
      ]);
      
      const result = convertZodErrorToGoogleSheetsError(zodError);
      
      expect(result.context?.validationErrors).toBeDefined();
      const validationErrors = result.context?.validationErrors as Array<Record<string, unknown>>;
      expect(validationErrors).toHaveLength(2);
    });

    it('should handle nested path errors correctly', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_string',
          validation: 'email',
          path: ['user', 'email'],
          message: 'Invalid email'
        }
      ]);
      
      const result = convertZodErrorToGoogleSheetsError(zodError);
      
      const validationErrors = result.context?.validationErrors as Array<Record<string, unknown>>;
      expect(validationErrors[0]).toHaveProperty('path', ['user', 'email']);
      expect(validationErrors[0]).toHaveProperty('message', 'Invalid email');
    });

    it('should map specific ZodIssueCodes to appropriate error details', async () => {
      const testCases = [
        {
          code: 'invalid_type' as const,
          expected: 'string' as const,
          received: 'number' as const,
          path: ['field'],
          message: 'Expected string, received number'
        },
        {
          code: 'too_small' as const,
          minimum: 5,
          type: 'string' as const,
          inclusive: true,
          exact: false,
          path: ['field'],
          message: 'String must contain at least 5 character(s)'
        },
        {
          code: 'too_big' as const,
          maximum: 10,
          type: 'string' as const,
          inclusive: true,
          exact: false,
          path: ['field'],
          message: 'String must contain at most 10 character(s)'
        },
        {
          code: 'invalid_string' as const,
          validation: 'email' as const,
          path: ['field'],
          message: 'Invalid email'
        },
        {
          code: 'custom' as const,
          path: ['field'],
          message: 'Custom validation failed'
        }
      ];

      for (const testCase of testCases) {
        const zodError = new z.ZodError([testCase]);
        const result = convertZodErrorToGoogleSheetsError(zodError);
        
        expect(result).toBeInstanceOf(GoogleSheetsError);
        expect(result.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
        
        const validationErrors = result.context?.validationErrors as Array<Record<string, unknown>>;
        expect(validationErrors[0]).toMatchObject({
          code: testCase.code,
          path: testCase.path,
          message: testCase.message
        });
      }
    });

    it('should preserve original error context', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['spreadsheetId'],
          message: 'Expected string, received number'
        }
      ]);
      
      const contextData = {
        operation: 'sheets-read',
        requestId: 'req-123'
      };
      
      const result = convertZodErrorToGoogleSheetsError(zodError, undefined, undefined, contextData);
      
      expect(result.context).toMatchObject({
        ...contextData,
        validationErrors: expect.any(Array)
      });
    });

    it('should handle empty ZodError issues array', async () => {
      const zodError = new z.ZodError([]);
      
      const result = convertZodErrorToGoogleSheetsError(zodError);
      
      expect(result).toBeInstanceOf(GoogleSheetsError);
      expect(result.context?.validationErrors).toEqual([]);
    });
  });

  describe('Integration with SchemaFactory', () => {
    it('should work with SchemaFactory generated schemas', async () => {
      const supportedTools: SupportedTool[] = [
        'sheets-list',
        'sheets-read', 
        'sheets-write',
        'sheets-append',
        'sheets-add-sheet',
        'sheets-create'
      ];

      for (const tool of supportedTools) {
        const schema = SchemaFactory.createToolInputSchema(tool);
        
        // Test with empty data (should fail for most tools except sheets-list)
        const result = validateToolInput(schema, {});
        
        if (tool === 'sheets-list') {
          expect(result.isOk()).toBe(true);
        } else {
          expect(result.isErr()).toBe(true);
          if (result.isErr()) {
            expect(result.error).toBeInstanceOf(GoogleSheetsError);
          }
        }
      }
    });

    it('should work with valid SchemaFactory data for sheets-read', async () => {
      const schema = SchemaFactory.createToolInputSchema('sheets-read');
      const validData = {
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Sheet1!A1:B10'
      };
      
      const result = validateToolInput(schema, validData);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(validData);
      }
    });

    it('should handle SchemaFactory validation errors appropriately', async () => {
      const schema = SchemaFactory.createToolInputSchema('sheets-write');
      const invalidData = {
        spreadsheetId: '', // Empty string
        range: 'A1:B10',
        values: 'not-an-array' // Should be array
      };
      
      const result = validateToolInput(schema, invalidData);
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        const error = result.error;
        // spreadsheetId errors in range-based tools are treated as GOOGLE_SHEETS_INVALID_RANGE
        expect(error.code).toBe('GOOGLE_SHEETS_INVALID_RANGE');
        
        const validationErrors = error.context?.validationErrors as Array<Record<string, unknown>>;
        expect(Array.isArray(validationErrors)).toBe(true);
        expect(validationErrors.some(e => (e.path as (string | number)[]).includes('spreadsheetId'))).toBe(true);
        expect(validationErrors.some(e => (e.path as (string | number)[]).includes('values'))).toBe(true);
      }
    });
  });

  describe('Error mapping and compatibility', () => {
    it('should create GoogleSheetsError with consistent error structure', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['spreadsheetId'],
          message: 'Expected string, received number'
        }
      ]);
      
      const spreadsheetId = 'test-sheet-id';
      const range = 'A1:B10';
      
      const result = convertZodErrorToGoogleSheetsError(zodError, spreadsheetId, range);
      
      expect(result).toBeInstanceOf(GoogleSheetsError);
      expect(result.spreadsheetId).toBe(spreadsheetId);
      expect(result.range).toBe(range);
      expect(result.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
      expect(result.statusCode).toBe(400);
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.isRetryable()).toBe(false); // Validation errors are not retryable
    });

    it('should be compatible with existing error handling flows', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_string',
          validation: 'url',
          path: ['webhookUrl'],
          message: 'Invalid url'
        }
      ]);
      
      const result = convertZodErrorToGoogleSheetsError(zodError);
      
      // Should be compatible with GoogleWorkspaceError methods
      expect(result.toJSON()).toMatchObject({
        name: 'GoogleSheetsError',
        code: 'GOOGLE_SHEETS_VALIDATION_ERROR',
        statusCode: 400,
        message: 'Invalid url', // Single error uses specific message
        context: expect.objectContaining({
          validationErrors: expect.any(Array)
        }),
        timestamp: expect.any(String)
      });
    });

    it('should integrate with existing error factory patterns', async () => {
      // Test that validation errors can be distinguished from other error types
      const validationError = convertZodErrorToGoogleSheetsError(
        new z.ZodError([
          {
            code: 'invalid_type',
            expected: 'string',
            received: 'number',
            path: ['test'],
            message: 'Invalid type'
          }
        ])
      );
      
      expect(validationError.code).toBe('GOOGLE_SHEETS_VALIDATION_ERROR');
      expect(validationError.statusCode).toBe(400);
      expect(validationError.isRetryable()).toBe(false);
      
      // Should be different from other Google Sheets errors
      const notFoundError = new GoogleSheetsInvalidRangeError('A1:B10');
      expect(validationError.code).not.toBe(notFoundError.code);
    });
  });

  describe('Performance considerations', () => {
    it('should handle large validation errors efficiently', async () => {
      // Create a large number of validation errors
      const issues = Array.from({ length: 100 }, (_, i) => ({
        code: 'invalid_type' as const,
        expected: 'string' as const,
        received: 'number' as const,
        path: [`field${i}`],
        message: `Field ${i} is invalid`
      }));
      
      const zodError = new z.ZodError(issues);
      
      const startTime = Date.now();
      const result = convertZodErrorToGoogleSheetsError(zodError);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
      expect(result.context?.validationErrors).toHaveLength(100);
    });

    it('should validate large objects efficiently', async () => {
      const largeSchema = z.object({
        ...Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [
            `field${i}`,
            z.string().min(1)
          ])
        )
      });
      
      const largeValidData = Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [`field${i}`, `value${i}`])
      );
      
      const startTime = Date.now();
      const result = validateToolInput(largeSchema, largeValidData);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeLessThan(50); // Should complete within 50ms
      expect(result.isOk()).toBe(true);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null and undefined inputs gracefully', async () => {
      const result1 = validateToolInput(testSchemas.simple, null);
      const result2 = validateToolInput(testSchemas.simple, undefined);
      
      expect(result1.isErr()).toBe(true);
      expect(result2.isErr()).toBe(true);
      
      if (result1.isErr()) {
        expect(result1.error).toBeInstanceOf(GoogleSheetsError);
      }
      if (result2.isErr()) {
        expect(result2.error).toBeInstanceOf(GoogleSheetsError);
      }
    });

    it('should handle malformed input data', async () => {
      const malformedInputs = [
        'string instead of object',
        123,
        [],
        true,
        Symbol('test')
      ];
      
      for (const input of malformedInputs) {
        const result = validateToolInput(testSchemas.simple, input);
        expect(result.isErr()).toBe(true);
      }
    });

    it('should preserve error stack traces', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['test'],
          message: 'Invalid'
        }
      ]);
      
      const result = convertZodErrorToGoogleSheetsError(zodError);
      
      expect(result.stack).toBeDefined();
      expect(result.stack).toContain('convertZodErrorToGoogleSheetsError');
    });
  });
});

describe('ValidationUtils class (if implemented)', () => {
  describe('static utility methods', () => {
    it('should provide static validation method', async () => {
      // This test defines the interface for a potential ValidationUtils class
      // Implementation should provide these static methods
      
      const mockValidate = (schema: z.ZodType, data: unknown): ValidationResult<unknown> => {
        return validateToolInput(schema, data);
      };
      
      const result = mockValidate(testSchemas.simple, { name: 'test', age: 25, active: true });
      expect(result.isOk()).toBe(true);
    });

    it('should provide schema validation helpers', async () => {
      // Test for potential helper methods that could be added
      const isValidSpreadsheetId = (id: string): boolean => {
        const schema = SchemaFactory.createSpreadsheetIdSchema();
        const result = schema.safeParse(id);
        return result.success;
      };
      
      expect(isValidSpreadsheetId('valid-id')).toBe(true);
      expect(isValidSpreadsheetId('')).toBe(false);
    });

    it('should provide error formatting utilities', async () => {
      const zodError = new z.ZodError([
        {
          code: 'invalid_type',
          expected: 'string',
          received: 'number',
          path: ['field'],
          message: 'Expected string'
        }
      ]);
      
      const formatted = convertZodErrorToGoogleSheetsError(zodError);
      expect(formatted.message).toBe('Expected string'); // Single error uses specific message
    });
  });
});

/**
 * Type definitions for the validation utility system
 * These types should be implemented in the actual validation.utils.ts file
 */


// Result type that should be used
type ValidationResult<T> = Result<T, GoogleSheetsError>;

/**
 * Integration test scenarios that validate the complete flow
 */
describe('Integration scenarios', () => {
  it('should handle complete validation workflow for sheets operations', async () => {
    const scenarios = [
      {
        tool: 'sheets-read' as SupportedTool,
        validData: {
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          range: 'Sheet1!A1:B10'
        },
        invalidData: {
          spreadsheetId: '',
          range: 123
        }
      },
      {
        tool: 'sheets-write' as SupportedTool,
        validData: {
          spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          range: 'Sheet1!A1:B10',
          values: [['A', 'B'], ['C', 'D']]
        },
        invalidData: {
          spreadsheetId: null,
          range: 'A1:B10',
          values: 'not-array'
        }
      }
    ];

    for (const scenario of scenarios) {
      const schema = SchemaFactory.createToolInputSchema(scenario.tool);
      
      // Test valid data
      const validResult = validateToolInput(schema, scenario.validData);
      expect(validResult.isOk()).toBe(true);
      
      // Test invalid data
      const invalidResult = validateToolInput(schema, scenario.invalidData);
      expect(invalidResult.isErr()).toBe(true);
      
      if (invalidResult.isErr()) {
        expect(invalidResult.error).toBeInstanceOf(GoogleSheetsError);
        // spreadsheetId errors in range-based tools are treated as GOOGLE_SHEETS_INVALID_RANGE
        expect(invalidResult.error.code).toBe('GOOGLE_SHEETS_INVALID_RANGE');
      }
    }
  });

  it('should demonstrate elimination of validation duplication', async () => {
    // This test demonstrates how the validation utils eliminate the need
    // for separate input validation and schema validation
    
    const schema = SchemaFactory.createToolInputSchema('sheets-append');
    const inputData = {
      spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
      range: 'Sheet1!A1',
      values: [['New', 'Data']]
    };
    
    // Single validation call handles both schema validation and error conversion
    const result = validateToolInput(schema, inputData);
    
    expect(result.isOk()).toBe(true);
    
    // No need for separate validation steps - this replaces:
    // 1. Manual input checking
    // 2. Schema validation
    // 3. Error conversion
    // 4. Result wrapping
  });
});