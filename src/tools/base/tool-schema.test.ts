import { describe, it, expect } from '@jest/globals';
import { SchemaFactory } from './tool-schema.js';

describe('SchemaFactory', () => {
  describe('createSpreadsheetIdSchema', () => {
    it('should create a valid zod string schema for spreadsheet ID', () => {
      const schema = SchemaFactory.createSpreadsheetIdSchema();
      
      // Valid spreadsheet ID
      expect(() => schema.parse('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')).not.toThrow();
      
      // Invalid cases
      expect(() => schema.parse('')).toThrow();
      expect(() => schema.parse('   ')).toThrow();
      expect(() => schema.parse(null)).toThrow();
      expect(() => schema.parse(undefined)).toThrow();
      expect(() => schema.parse(123)).toThrow();
    });

    it('should have appropriate description', () => {
      const schema = SchemaFactory.createSpreadsheetIdSchema();
      expect(schema.description).toBe('The ID of the Google Spreadsheet');
    });
  });

  describe('createRangeSchema', () => {
    it('should create a valid zod string schema for range', () => {
      const schema = SchemaFactory.createRangeSchema();
      
      // Valid ranges
      expect(() => schema.parse('Sheet1!A1:B10')).not.toThrow();
      expect(() => schema.parse('A1:B10')).not.toThrow();
      expect(() => schema.parse('Sheet1!A1')).not.toThrow();
      expect(() => schema.parse('A1')).not.toThrow();
      
      // Invalid cases
      expect(() => schema.parse('')).toThrow();
      expect(() => schema.parse('   ')).toThrow();
      expect(() => schema.parse(null)).toThrow();
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should have appropriate description', () => {
      const schema = SchemaFactory.createRangeSchema();
      expect(schema.description).toBe('The A1 notation range (e.g., "Sheet1!A1:D10" or "A1:D10")');
    });
  });

  describe('createValuesSchema', () => {
    it('should create a valid zod array schema for values', () => {
      const schema = SchemaFactory.createValuesSchema();
      
      // Valid values
      expect(() => schema.parse([['A', 'B'], ['C', 'D']])).not.toThrow();
      expect(() => schema.parse([['Single row']])).not.toThrow();
      expect(() => schema.parse([[]])).not.toThrow(); // Empty row
      
      // Invalid cases
      expect(() => schema.parse('not an array')).toThrow();
      expect(() => schema.parse(['not 2D array'])).toThrow();
      expect(() => schema.parse([['valid'], 'invalid row'])).toThrow();
      expect(() => schema.parse(null)).toThrow();
      expect(() => schema.parse(undefined)).toThrow();
    });

    it('should have appropriate description', () => {
      const schema = SchemaFactory.createValuesSchema();
      expect(schema.description).toBe('2D array of string values to write/append');
    });
  });

  describe('createOptionalValuesSchema', () => {
    it('should create an optional values schema', () => {
      const schema = SchemaFactory.createOptionalValuesSchema();
      
      // Valid cases including undefined
      expect(() => schema.parse([['A', 'B']])).not.toThrow();
      expect(() => schema.parse(undefined)).not.toThrow();
      
      // Invalid cases
      expect(() => schema.parse('not an array')).toThrow();
      expect(() => schema.parse(null)).toThrow();
    });
  });

  describe('createToolInputSchema', () => {
    it('should create schema for sheets-list tool', () => {
      const schema = SchemaFactory.createToolInputSchema('sheets-list');
      
      expect(() => schema.parse({})).not.toThrow();
      expect(Object.keys(schema.shape)).toHaveLength(0);
    });

    it('should create schema for sheets-read tool', () => {
      const schema = SchemaFactory.createToolInputSchema('sheets-read');
      
      expect(() => schema.parse({
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Sheet1!A1:B10'
      })).not.toThrow();

      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({ spreadsheetId: 'test' })).toThrow();
      expect(() => schema.parse({ range: 'A1:B10' })).toThrow();
    });

    it('should create schema for sheets-write tool', () => {
      const schema = SchemaFactory.createToolInputSchema('sheets-write');
      
      expect(() => schema.parse({
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Sheet1!A1:B10',
        values: [['A', 'B'], ['C', 'D']]
      })).not.toThrow();

      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({
        spreadsheetId: 'test',
        range: 'A1:B10'
      })).toThrow();
    });

    it('should create schema for sheets-append tool', () => {
      const schema = SchemaFactory.createToolInputSchema('sheets-append');
      
      expect(() => schema.parse({
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Sheet1!A1',
        values: [['A', 'B'], ['C', 'D']]
      })).not.toThrow();

      expect(() => schema.parse({})).toThrow();
    });

    it('should throw error for unknown tool', () => {
      expect(() => SchemaFactory.createToolInputSchema('unknown-tool' as any))
        .toThrow('Unknown tool: unknown-tool');
    });
  });

  describe('createResponseSchema', () => {
    it('should create schema for sheets-list response', () => {
      const schema = SchemaFactory.createResponseSchema('sheets-list');
      
      expect(() => schema.parse({
        spreadsheets: [
          {
            id: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
            title: 'Test Spreadsheet',
            url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
            modifiedTime: '2023-01-01T00:00:00.000Z'
          }
        ]
      })).not.toThrow();

      expect(() => schema.parse({ spreadsheets: [] })).not.toThrow();
      expect(() => schema.parse({})).toThrow();
    });

    it('should create schema for sheets-read response', () => {
      const schema = SchemaFactory.createResponseSchema('sheets-read');
      
      expect(() => schema.parse({
        range: 'Sheet1!A1:B2',
        values: [['A', 'B'], ['C', 'D']],
        majorDimension: 'ROWS'
      })).not.toThrow();

      expect(() => schema.parse({
        range: 'Sheet1!A1:B2',
        values: [],
        majorDimension: 'COLUMNS'
      })).not.toThrow();

      expect(() => schema.parse({})).toThrow();
    });

    it('should create schema for sheets-write response', () => {
      const schema = SchemaFactory.createResponseSchema('sheets-write');
      
      expect(() => schema.parse({
        updatedCells: 4,
        updatedRows: 2,
        updatedColumns: 2
      })).not.toThrow();

      expect(() => schema.parse({})).toThrow();
    });

    it('should create schema for sheets-append response', () => {
      const schema = SchemaFactory.createResponseSchema('sheets-append');
      
      expect(() => schema.parse({
        updates: {
          updatedRows: 2,
          updatedCells: 4
        }
      })).not.toThrow();

      expect(() => schema.parse({})).toThrow();
    });

    it('should throw error for unknown response type', () => {
      expect(() => SchemaFactory.createResponseSchema('unknown-tool' as any))
        .toThrow('Unknown response schema: unknown-tool');
    });
  });

  describe('validateToolInput', () => {
    it('should validate sheets-list input successfully', () => {
      const result = SchemaFactory.validateToolInput('sheets-list', {});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({});
      }
    });

    it('should validate sheets-read input successfully', () => {
      const input = {
        spreadsheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
        range: 'Sheet1!A1:B10'
      };
      
      const result = SchemaFactory.validateToolInput('sheets-read', input);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it('should return validation error for invalid input', () => {
      const result = SchemaFactory.validateToolInput('sheets-read', {});
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
        expect(result.error.issues).toBeDefined();
      }
    });

    it('should handle unknown tool gracefully', () => {
      expect(() => SchemaFactory.validateToolInput('unknown-tool' as any, {}))
        .toThrow('Unknown tool: unknown-tool');
    });
  });

  describe('formatValidationError', () => {
    it('should format validation errors nicely', () => {
      const result = SchemaFactory.validateToolInput('sheets-read', {});
      
      if (!result.success) {
        const formatted = SchemaFactory.formatValidationError(result.error);
        expect(typeof formatted).toBe('string');
        expect(formatted).toContain('spreadsheetId');
        expect(formatted).toContain('range');
        expect(formatted).toContain('Required');
      }
    });

    it('should handle single validation error', () => {
      const result = SchemaFactory.validateToolInput('sheets-read', { 
        spreadsheetId: '',
        range: 'A1:B10'
      });
      
      if (!result.success) {
        const formatted = SchemaFactory.formatValidationError(result.error);
        expect(formatted).toContain('spreadsheetId');
        expect(formatted).not.toContain('range');
      }
    });
  });

  describe('Edge cases and type safety', () => {
    it('should handle empty arrays in values', () => {
      const schema = SchemaFactory.createValuesSchema();
      expect(() => schema.parse([])).not.toThrow();
    });

    it('should handle complex range formats', () => {
      const schema = SchemaFactory.createRangeSchema();
      expect(() => schema.parse('My Sheet!A1:Z100')).not.toThrow();
      expect(() => schema.parse("Sheet's Name!A1:B2")).not.toThrow();
    });

    it('should maintain type safety across schema operations', () => {
      const inputSchema = SchemaFactory.createToolInputSchema('sheets-write');
      const responseSchema = SchemaFactory.createResponseSchema('sheets-write');
      
      // This test ensures that our factory methods return properly typed schemas
      expect(inputSchema.shape).toBeDefined();
      expect(responseSchema.shape).toBeDefined();
    });
  });

  describe('Performance considerations', () => {
    it('should create schemas efficiently', () => {
      const start = Date.now();
      
      // Create multiple schemas
      for (let i = 0; i < 100; i++) {
        SchemaFactory.createSpreadsheetIdSchema();
        SchemaFactory.createRangeSchema();
        SchemaFactory.createValuesSchema();
      }
      
      const end = Date.now();
      const duration = end - start;
      
      // Should create schemas quickly (less than 100ms for 300 schemas)
      expect(duration).toBeLessThan(100);
    });
  });
});