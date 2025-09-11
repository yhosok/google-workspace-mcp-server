import { SchemaFactory } from './tool-schema.js';
import { DRIVE_TOOLS } from './tool-definitions.js';
import { z } from 'zod';

/**
 * Schema Validation Tests for DriveFileListOptions.filters Fields
 * 
 * These tests verify that the Zod schema validation properly handles all
 * filter fields that DriveQueryBuilder supports.
 * 
 * Current state: Schema now supports all 17 filter fields that DriveQueryBuilder supports.
 * Supported fields: trashed, mimeType, nameContains, parentsIn, fullText, modifiedAfter,
 *                  modifiedBefore, createdAfter, createdBefore, owners, writers, readers,
 *                  starred, sharedWithMe, viewedByMeTime, properties, appProperties,
 *                  visibility, shortcutDetails
 * 
 * UPDATED: Schema validation has been implemented for all missing fields.
 */

describe('Drive Schema Validation - Complete Filter Fields Support', () => {
  let listFilesSchema: z.ZodType;

  beforeEach(() => {
    // Get the current list-files tool schema
    listFilesSchema = SchemaFactory.createToolInputSchema(DRIVE_TOOLS.LIST_FILES);
  });

  describe('Permission-based Filter Field Validation', () => {
    test('should accept owners filter field with valid email addresses', () => {
      // Arrange
      const inputWithOwners = {
        filters: {
          owners: ['owner@example.com', 'admin@example.com']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithOwners);

      // Assert - Should succeed because 'owners' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.owners).toEqual(['owner@example.com', 'admin@example.com']);
      }
    });

    test('should reject owners filter field with invalid email addresses', () => {
      // Arrange
      const inputWithInvalidOwners = {
        filters: {
          owners: ['invalid-email', 'not-an-email']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithInvalidOwners);

      // Assert - Should fail due to invalid email format
      expect(parseResult.success).toBe(false);
    });

    test('should accept writers filter field with valid email addresses', () => {
      // Arrange
      const inputWithWriters = {
        filters: {
          writers: ['editor@example.com']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithWriters);

      // Assert - Should succeed because 'writers' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.writers).toEqual(['editor@example.com']);
      }
    });

    test('should accept readers filter field with valid email addresses', () => {
      // Arrange
      const inputWithReaders = {
        filters: {
          readers: ['viewer@example.com', 'reader@example.com']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithReaders);

      // Assert - Should succeed because 'readers' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.readers).toEqual(['viewer@example.com', 'reader@example.com']);
      }
    });
  });

  describe('User Interaction Filter Field Validation', () => {
    test('should accept starred filter field with boolean values', () => {
      // Arrange
      const inputWithStarred = {
        filters: {
          starred: true
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithStarred);

      // Assert - Should succeed because 'starred' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.starred).toBe(true);
      }
    });

    test('should reject starred filter field with non-boolean values', () => {
      // Arrange
      const inputWithInvalidStarred = {
        filters: {
          starred: 'true' // Should be boolean, not string
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithInvalidStarred);

      // Assert - Should fail due to invalid type
      expect(parseResult.success).toBe(false);
    });

    test('should accept sharedWithMe filter field with boolean values', () => {
      // Arrange
      const inputWithSharedWithMe = {
        filters: {
          sharedWithMe: false
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithSharedWithMe);

      // Assert - Should succeed because 'sharedWithMe' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.sharedWithMe).toBe(false);
      }
    });

    test('should accept viewedByMeTime filter field with valid ISO datetime', () => {
      // Arrange
      const inputWithViewedByMeTime = {
        filters: {
          viewedByMeTime: '2024-01-01T00:00:00.000Z'
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithViewedByMeTime);

      // Assert - Should succeed because 'viewedByMeTime' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.viewedByMeTime).toBe('2024-01-01T00:00:00.000Z');
      }
    });

    test('should reject viewedByMeTime filter field with invalid datetime format', () => {
      // Arrange
      const inputWithInvalidDateTime = {
        filters: {
          viewedByMeTime: 'invalid-date'
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithInvalidDateTime);

      // Assert - Should fail due to invalid datetime format
      expect(parseResult.success).toBe(false);
    });
  });

  describe('Custom Properties Filter Field Validation', () => {
    test('should accept properties filter field with string arrays', () => {
      // Arrange
      const inputWithProperties = {
        filters: {
          properties: ['key1', 'key2', 'projectType']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithProperties);

      // Assert - Should succeed because 'properties' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.properties).toEqual(['key1', 'key2', 'projectType']);
      }
    });

    test('should reject properties filter field with empty strings', () => {
      // Arrange
      const inputWithEmptyProperties = {
        filters: {
          properties: ['', 'valid-key']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithEmptyProperties);

      // Assert - Should fail due to empty property key
      expect(parseResult.success).toBe(false);
    });

    test('should accept appProperties filter field with string arrays', () => {
      // Arrange
      const inputWithAppProperties = {
        filters: {
          appProperties: ['appKey1', 'appKey2']
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithAppProperties);

      // Assert - Should succeed because 'appProperties' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.appProperties).toEqual(['appKey1', 'appKey2']);
      }
    });
  });

  describe('File Visibility and Shortcut Filter Field Validation', () => {
    test('should accept visibility filter field with valid enum values', () => {
      // Arrange
      const validVisibilityValues = [
        'anyoneCanFind',
        'anyoneWithLink', 
        'domainCanFind',
        'domainWithLink',
        'limited'
      ];

      // Act & Assert
      validVisibilityValues.forEach(visibility => {
        const input = {
          filters: { visibility }
        };
        
        const parseResult = listFilesSchema.safeParse(input);
        expect(parseResult.success).toBe(true);
        if (parseResult.success) {
          expect(parseResult.data.filters.visibility).toBe(visibility);
        }
      });
    });

    test('should reject visibility filter field with invalid enum values', () => {
      // Arrange
      const inputWithInvalidVisibility = {
        filters: {
          visibility: 'invalidVisibility'
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithInvalidVisibility);

      // Assert - Should fail due to invalid enum value
      expect(parseResult.success).toBe(false);
    });

    test('should accept shortcutDetails filter field with proper structure', () => {
      // Arrange
      const inputWithShortcutDetails = {
        filters: {
          shortcutDetails: { targetId: 'target123' }
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithShortcutDetails);

      // Assert - Should succeed because 'shortcutDetails' is now supported in the schema
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.shortcutDetails.targetId).toBe('target123');
      }
    });

    test('should accept shortcutDetails filter field with optional targetId', () => {
      // Arrange
      const inputWithEmptyShortcutDetails = {
        filters: {
          shortcutDetails: {}
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithEmptyShortcutDetails);

      // Assert - Should succeed because targetId is optional
      expect(parseResult.success).toBe(true);
    });

    test('should reject shortcutDetails filter field with empty targetId', () => {
      // Arrange
      const inputWithEmptyTargetId = {
        filters: {
          shortcutDetails: { targetId: '' }
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithEmptyTargetId);

      // Assert - Should fail due to empty targetId
      expect(parseResult.success).toBe(false);
    });
  });

  describe('Multiple Missing Fields Validation', () => {
    test('should accept input with multiple filter fields simultaneously', () => {
      // Arrange
      const inputWithMultipleFields = {
        filters: {
          // Previously supported fields
          trashed: false,
          mimeType: 'application/vnd.google-apps.document',
          nameContains: 'Complex',
          
          // Newly supported fields
          owners: ['owner@example.com'],
          writers: ['editor@example.com'],
          starred: true,
          sharedWithMe: false,
          properties: ['projectType'],
          visibility: 'limited'
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithMultipleFields);

      // Assert - Should succeed because all fields are now supported
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters.owners).toEqual(['owner@example.com']);
        expect(parseResult.data.filters.writers).toEqual(['editor@example.com']);
        expect(parseResult.data.filters.starred).toBe(true);
        expect(parseResult.data.filters.sharedWithMe).toBe(false);
        expect(parseResult.data.filters.properties).toEqual(['projectType']);
        expect(parseResult.data.filters.visibility).toBe('limited');
      }
    });

    test('should accept input with only currently supported filter fields', () => {
      // Arrange
      const inputWithSupportedFields = {
        filters: {
          trashed: false,
          mimeType: 'application/vnd.google-apps.document',
          nameContains: 'Document',
          parentsIn: ['folder123'],
          fullText: 'important',
          modifiedAfter: '2023-01-01T00:00:00.000Z',
          createdBefore: '2023-12-31T23:59:59.999Z'
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithSupportedFields);

      // Assert - Should continue to work (backward compatibility)
      expect(parseResult.success).toBe(true);
      if (parseResult.success) {
        expect(parseResult.data.filters).toEqual(inputWithSupportedFields.filters);
      }
    });
  });

  describe('Schema Strictness Validation', () => {
    test('should reject input with unknown filter fields', () => {
      // Arrange
      const inputWithUnknownField = {
        filters: {
          trashed: false,
          unknownField: 'should-not-be-allowed'
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithUnknownField);

      // Assert - Should fail due to strict schema validation
      expect(parseResult.success).toBe(false);
    });

    test('should validate that schema supports all required filter fields', () => {
      // Arrange
      const inputWithAllSupportedFields = {
        filters: {
          // All 17 fields that should be supported
          trashed: false,
          mimeType: 'application/vnd.google-apps.document',
          nameContains: 'test',
          parentsIn: ['folder1'],
          fullText: 'search text',
          modifiedAfter: '2023-01-01T00:00:00.000Z',
          modifiedBefore: '2023-12-31T23:59:59.999Z',
          createdAfter: '2023-01-01T00:00:00.000Z',
          createdBefore: '2023-12-31T23:59:59.999Z',
          owners: ['owner@example.com'],
          writers: ['editor@example.com'],
          readers: ['reader@example.com'],
          starred: true,
          sharedWithMe: false,
          viewedByMeTime: '2024-01-01T00:00:00.000Z',
          properties: ['key1'],
          appProperties: ['appKey1'],
          visibility: 'limited',
          shortcutDetails: { targetId: 'target123' }
        }
      };

      // Act
      const parseResult = listFilesSchema.safeParse(inputWithAllSupportedFields);

      // Assert - Should succeed because all 17 fields are now supported
      expect(parseResult.success).toBe(true);
    });
  });
});