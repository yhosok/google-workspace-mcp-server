/**
 * Tests for DriveQueryBuilder utility class
 *
 * This test suite covers:
 * - Duplicate removal functionality
 * - Query escaping and sanitization
 * - Field name and operator validation
 * - Structured filter conversion
 * - Default filter application
 */

import { describe, it, expect } from '@jest/globals';
import { DriveQueryBuilder } from './drive-query-builder.js';

describe('DriveQueryBuilder', () => {
  describe('Duplicate Removal', () => {
    it('should remove duplicate trashed = false conditions', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withCustomQuery("trashed = false and name contains 'Report'")
        .build();

      expect(query).toBe("trashed = false and name contains 'Report'");
      expect(query).not.toContain('trashed = false and trashed = false');
    });

    it('should not add default trashed filter when already present', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withCustomQuery("name contains 'Test' and trashed = false")
        .build();

      expect(query).toBe("name contains 'Test' and trashed = false");
    });

    it('should add default trashed filter when not present', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withCustomQuery("name contains 'Test'").build();

      expect(query).toBe("trashed = false and name contains 'Test'");
    });

    it('should handle trashed = true explicitly', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withCustomQuery('trashed = true').build();

      expect(query).toBe('trashed = true');
    });
  });

  describe('Query Escaping', () => {
    it('should escape single quotes in values', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withNameContains("John's Report").build();

      expect(query).toBe("trashed = false and name contains 'John\\'s Report'");
    });

    it('should escape backslashes in values', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withNameContains('Test\\File').build();

      expect(query).toBe("trashed = false and name contains 'Test\\\\File'");
    });

    it('should handle empty strings correctly', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withNameContains('').build();

      expect(query).toBe("trashed = false and name contains ''");
    });
  });

  describe('Field Validation', () => {
    it('should reject invalid field names in custom queries', () => {
      const builder = new DriveQueryBuilder();

      expect(() => {
        builder.withCustomQuery("invalidField = 'value'").build();
      }).toThrow('Invalid field name: invalidField');
    });

    it('should accept valid basic field names', () => {
      const builder = new DriveQueryBuilder();
      const validFields = [
        'name',
        'mimeType',
        'modifiedTime',
        'createdTime',
        'parents',
        'trashed',
        'fullText',
      ];

      for (const field of validFields) {
        expect(() => {
          builder.withCustomQuery(`${field} = 'value'`).build();
        }).not.toThrow();
      }
    });

    it('should accept permission-related field names', () => {
      const builder = new DriveQueryBuilder();
      const permissionFields = ['owners', 'writers', 'readers'];

      for (const field of permissionFields) {
        expect(() => {
          builder.withCustomQuery(`'user@example.com' in ${field}`).build();
        }).not.toThrow();
      }
    });

    it('should accept user interaction field names', () => {
      const builder = new DriveQueryBuilder();
      const userInteractionFields = [
        'starred',
        'sharedWithMe',
        'viewedByMeTime',
      ];

      for (const field of userInteractionFields) {
        expect(() => {
          builder.withCustomQuery(`${field} = true`).build();
        }).not.toThrow();
      }
    });

    it('should accept custom properties field names', () => {
      const builder = new DriveQueryBuilder();
      const customPropertyFields = ['properties', 'appProperties'];

      for (const field of customPropertyFields) {
        expect(() => {
          builder.withCustomQuery(`${field} has 'customKey'`).build();
        }).not.toThrow();
      }
    });

    it('should accept visibility and shortcut field names', () => {
      const builder = new DriveQueryBuilder();
      const advancedFields = ['visibility', 'shortcutDetails.targetId'];

      for (const field of advancedFields) {
        expect(() => {
          builder.withCustomQuery(`${field} = 'value'`).build();
        }).not.toThrow();
      }
    });

    it('should accept field names in different cases', () => {
      const builder = new DriveQueryBuilder();
      const fieldsWithDifferentCases = [
        'NAME',
        'MimeType',
        'OWNERS',
        'sharedwithme',
        'STARRED',
      ];

      for (const field of fieldsWithDifferentCases) {
        expect(() => {
          builder.withCustomQuery(`${field} = 'value'`).build();
        }).not.toThrow();
      }
    });

    it('should support the user specific case: owners field with in operator', () => {
      const builder = new DriveQueryBuilder();

      expect(() => {
        builder.withCustomQuery("'hosokawa@openlogi.com' in owners").build();
      }).not.toThrow();

      const query = builder
        .withCustomQuery("'hosokawa@openlogi.com' in owners")
        .build();
      expect(query).toBe(
        "trashed = false and 'hosokawa@openlogi.com' in owners"
      );
    });

    it('should reject invalid operators', () => {
      const builder = new DriveQueryBuilder();

      expect(() => {
        builder.withCustomQuery("name like 'value'").build();
      }).toThrow('Invalid operator: like');
    });

    it('should accept valid operators', () => {
      const builder = new DriveQueryBuilder();
      const validOperators = [
        '=',
        '!=',
        'contains',
        'in',
        '<',
        '>',
        '>=',
        '<=',
      ];

      for (const operator of validOperators) {
        expect(() => {
          builder.withCustomQuery(`name ${operator} 'value'`).build();
        }).not.toThrow();
      }
    });
  });

  describe('Field-Operator Compatibility', () => {
    it('should support in operator with permission fields', () => {
      const builder = new DriveQueryBuilder();
      const permissionFieldQueries = [
        "'user@example.com' in owners",
        "'user@example.com' in writers",
        "'user@example.com' in readers",
      ];

      for (const query of permissionFieldQueries) {
        expect(() => {
          builder.withCustomQuery(query).build();
        }).not.toThrow();
      }
    });

    it('should support equality operators with boolean fields', () => {
      const builder = new DriveQueryBuilder();
      const booleanFieldQueries = [
        'starred = true',
        'starred != false',
        'sharedWithMe = true',
        'sharedWithMe != false',
      ];

      for (const query of booleanFieldQueries) {
        expect(() => {
          builder.withCustomQuery(query).build();
        }).not.toThrow();
      }
    });

    it('should support date operators with viewedByMeTime field', () => {
      const builder = new DriveQueryBuilder();
      const dateFieldQueries = [
        "viewedByMeTime > '2023-01-01T00:00:00'",
        "viewedByMeTime < '2023-12-31T23:59:59'",
        "viewedByMeTime >= '2023-01-01T00:00:00'",
        "viewedByMeTime <= '2023-12-31T23:59:59'",
      ];

      for (const query of dateFieldQueries) {
        expect(() => {
          builder.withCustomQuery(query).build();
        }).not.toThrow();
      }
    });

    it('should support has operator with custom properties fields', () => {
      const builder = new DriveQueryBuilder();
      const customPropertyQueries = [
        "properties has 'customKey'",
        "appProperties has 'privateKey'",
      ];

      for (const query of customPropertyQueries) {
        expect(() => {
          builder.withCustomQuery(query).build();
        }).not.toThrow();
      }
    });

    it('should support equality operators with visibility field', () => {
      const builder = new DriveQueryBuilder();
      const visibilityQueries = [
        "visibility = 'anyoneCanFind'",
        "visibility != 'limited'",
      ];

      for (const query of visibilityQueries) {
        expect(() => {
          builder.withCustomQuery(query).build();
        }).not.toThrow();
      }
    });

    it('should support equality operators with shortcut target ID', () => {
      const builder = new DriveQueryBuilder();
      const shortcutQueries = [
        "shortcutDetails.targetId = '1234567890'",
        "shortcutDetails.targetId != 'abcdefghij'",
      ];

      for (const query of shortcutQueries) {
        expect(() => {
          builder.withCustomQuery(query).build();
        }).not.toThrow();
      }
    });
  });

  describe('Complex Query Scenarios', () => {
    it('should handle multiple new fields in complex queries', () => {
      const builder = new DriveQueryBuilder();
      const complexQuery =
        "'user@example.com' in owners and starred = true and visibility = 'anyoneCanFind'";

      expect(() => {
        builder.withCustomQuery(complexQuery).build();
      }).not.toThrow();

      const result = builder.withCustomQuery(complexQuery).build();
      expect(result).toBe(
        "trashed = false and 'user@example.com' in owners and starred = true and visibility = 'anyoneCanFind'"
      );
    });

    it('should combine new fields with existing structured filters', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withCustomQuery("'user@example.com' in owners and starred = true")
        .withNameContains('Report')
        .withMimeType('application/pdf')
        .build();

      expect(query).toBe(
        "trashed = false and 'user@example.com' in owners and starred = true and name contains 'Report' and mimeType = 'application/pdf'"
      );
    });

    it('should handle properties field with complex syntax', () => {
      const builder = new DriveQueryBuilder();
      const complexPropertyQuery =
        "properties has 'department' and appProperties has 'status'";

      expect(() => {
        builder.withCustomQuery(complexPropertyQuery).build();
      }).not.toThrow();

      const result = builder.withCustomQuery(complexPropertyQuery).build();
      expect(result).toBe(
        "trashed = false and properties has 'department' and appProperties has 'status'"
      );
    });

    it('should handle viewedByMeTime with date range filtering', () => {
      const builder = new DriveQueryBuilder();
      const dateRangeQuery =
        "viewedByMeTime > '2023-01-01T00:00:00' and viewedByMeTime < '2023-12-31T23:59:59'";

      expect(() => {
        builder.withCustomQuery(dateRangeQuery).build();
      }).not.toThrow();

      const result = builder.withCustomQuery(dateRangeQuery).build();
      expect(result).toBe(
        "trashed = false and viewedByMeTime > '2023-01-01T00:00:00' and viewedByMeTime < '2023-12-31T23:59:59'"
      );
    });
  });

  describe('Structured Filters', () => {
    it('should convert name contains filter', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withNameContains('Report').build();

      expect(query).toBe("trashed = false and name contains 'Report'");
    });

    it('should convert mime type filter', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withMimeType('application/pdf').build();

      expect(query).toBe("trashed = false and mimeType = 'application/pdf'");
    });

    it('should convert parent folder filter', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withParentIn('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms')
        .build();

      expect(query).toBe(
        "trashed = false and '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' in parents"
      );
    });

    it('should convert multiple parent folders filter', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withParentsIn(['folder1', 'folder2']).build();

      expect(query).toBe(
        "trashed = false and ('folder1' in parents or 'folder2' in parents)"
      );
    });

    it('should convert fullText filter', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withFullText('important document').build();

      expect(query).toBe(
        "trashed = false and fullText contains 'important document'"
      );
    });

    it('should convert date range filters', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withModifiedAfter('2023-01-01T00:00:00')
        .withModifiedBefore('2023-12-31T23:59:59')
        .build();

      expect(query).toBe(
        "trashed = false and modifiedTime > '2023-01-01T00:00:00' and modifiedTime < '2023-12-31T23:59:59'"
      );
    });

    it('should convert created date range filters', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withCreatedAfter('2023-01-01T00:00:00')
        .withCreatedBefore('2023-12-31T23:59:59')
        .build();

      expect(query).toBe(
        "trashed = false and createdTime > '2023-01-01T00:00:00' and createdTime < '2023-12-31T23:59:59'"
      );
    });

    it('should combine modified and created date filters', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withModifiedAfter('2023-01-01T00:00:00')
        .withCreatedBefore('2023-12-31T23:59:59')
        .build();

      expect(query).toBe(
        "trashed = false and modifiedTime > '2023-01-01T00:00:00' and createdTime < '2023-12-31T23:59:59'"
      );
    });

    it('should combine multiple structured filters', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withNameContains('Report')
        .withMimeType('application/pdf')
        .withParentIn('folder123')
        .build();

      expect(query).toBe(
        "trashed = false and name contains 'Report' and mimeType = 'application/pdf' and 'folder123' in parents"
      );
    });
  });

  describe('Trashed Filter Control', () => {
    it('should exclude trashed files by default', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withNameContains('Test').build();

      expect(query).toBe("trashed = false and name contains 'Test'");
    });

    it('should include trashed files when explicitly requested', () => {
      const builder = new DriveQueryBuilder({ includeTrashed: true });
      const query = builder.withNameContains('Test').build();

      expect(query).toBe("name contains 'Test'");
    });

    it('should filter only trashed files when requested', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.withTrashed(true).withNameContains('Test').build();

      expect(query).toBe("trashed = true and name contains 'Test'");
    });
  });

  describe('Query Combination', () => {
    it('should combine custom query with structured filters', () => {
      const builder = new DriveQueryBuilder();
      const query = builder
        .withCustomQuery("createdTime > '2023-01-01'")
        .withNameContains('Report')
        .build();

      expect(query).toBe(
        "trashed = false and createdTime > '2023-01-01' and name contains 'Report'"
      );
    });

    it('should handle empty builder', () => {
      const builder = new DriveQueryBuilder();
      const query = builder.build();

      expect(query).toBe('trashed = false');
    });

    it('should handle builder with only trashed filter disabled', () => {
      const builder = new DriveQueryBuilder({ includeTrashed: true });
      const query = builder.build();

      expect(query).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed custom queries gracefully', () => {
      const builder = new DriveQueryBuilder();

      expect(() => {
        builder.withCustomQuery('invalid query structure').build();
      }).toThrow('Invalid query syntax');
    });

    it('should validate date format in date filters', () => {
      const builder = new DriveQueryBuilder();

      expect(() => {
        builder.withModifiedAfter('invalid-date').build();
      }).toThrow('Invalid date format');
    });

    it('should validate folder ID format', () => {
      const builder = new DriveQueryBuilder();

      expect(() => {
        builder.withParentIn('').build();
      }).toThrow('Invalid folder ID');
    });
  });
});
