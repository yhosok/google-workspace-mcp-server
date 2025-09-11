import { DriveFileListOptions } from './index.js';

/**
 * Type Safety Tests for DriveFileListOptions.filters Interface
 *
 * These tests verify that the DriveFileListOptions.filters interface supports
 * all fields that are supported by DriveQueryBuilder VALID_FIELDS.
 *
 * The DriveFileListOptions.filters interface now supports all 17 fields
 * that are available in DriveQueryBuilder VALID_FIELDS.
 *
 * These tests validate proper type safety and field accessibility.
 */

describe('DriveFileListOptions.filters Type Safety', () => {
  describe('Supported Fields - Type Safety Validation', () => {
    it('should support owners field for permission-based filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with owners filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          owners: ['user1@example.com', 'user2@example.com'],
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.owners).toEqual([
        'user1@example.com',
        'user2@example.com',
      ]);
    });

    it('should support writers field for write permission filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with writers filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          writers: ['editor@example.com'],
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.writers).toEqual(['editor@example.com']);
    });

    it('should support readers field for read permission filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with readers filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          readers: ['viewer@example.com', 'reader@example.com'],
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.readers).toEqual([
        'viewer@example.com',
        'reader@example.com',
      ]);
    });

    it('should support starred field for starred file filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with starred filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          starred: true,
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.starred).toBe(true);
    });

    it('should support sharedWithMe field for shared files filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with sharedWithMe filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          sharedWithMe: true,
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.sharedWithMe).toBe(true);
    });

    it('should support viewedByMeTime field for view time filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with viewedByMeTime filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          viewedByMeTime: '2024-01-01T00:00:00.000Z',
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.viewedByMeTime).toBe('2024-01-01T00:00:00.000Z');
    });

    it('should support properties field for custom properties filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with properties filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          properties: ['customKey1', 'customKey2'],
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.properties).toEqual(['customKey1', 'customKey2']);
    });

    it('should support appProperties field for app-specific properties filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with appProperties filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          appProperties: ['appKey1'],
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.appProperties).toEqual(['appKey1']);
    });

    it('should support visibility field for visibility level filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with visibility filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          visibility: 'anyoneCanFind',
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.visibility).toBe('anyoneCanFind');
    });

    it('should support shortcutDetails field for shortcut target filtering', () => {
      // Arrange & Act: Create a valid DriveFileListOptions with shortcutDetails filter
      const options: DriveFileListOptions = {
        filters: {
          // Field is supported in the interface
          shortcutDetails: {
            targetId: 'target123',
          },
        },
      };

      // Assert: This compiles without TypeScript errors
      expect(options.filters?.shortcutDetails?.targetId).toBe('target123');
    });
  });

  describe('Complete Field Support Verification', () => {
    it('should support all 17 DriveQueryBuilder VALID_FIELDS in filters interface', () => {
      // Arrange & Act: Try to create DriveFileListOptions with all supported fields
      const optionsWithAllFields: DriveFileListOptions = {
        filters: {
          // Currently supported fields (9)
          trashed: false,
          mimeType: 'application/pdf',
          nameContains: 'document',
          parentsIn: ['folder123'],
          fullText: 'search text',
          modifiedAfter: '2024-01-01T00:00:00.000Z',
          modifiedBefore: '2024-12-31T23:59:59.999Z',
          createdAfter: '2024-01-01T00:00:00.000Z',
          createdBefore: '2024-12-31T23:59:59.999Z',

          // Fields now supported after implementation
          owners: ['owner@example.com'],
          writers: ['writer@example.com'],
          readers: ['reader@example.com'],
          starred: true,
          sharedWithMe: false,
          viewedByMeTime: '2024-06-01T12:00:00.000Z',
          properties: ['key1', 'key2'],
          appProperties: ['appKey1'],
          visibility: 'limited',
          shortcutDetails: { targetId: 'shortcut123' },
        },
      };

      // Assert: Verify that all fields are properly typed and accessible
      expect(optionsWithAllFields.filters).toBeDefined();

      // Verify all fields are properly typed and accessible
      // Basic query fields
      expect(optionsWithAllFields.filters?.trashed).toBe(false);
      expect(optionsWithAllFields.filters?.mimeType).toBe('application/pdf');
      expect(optionsWithAllFields.filters?.nameContains).toBe('document');
      expect(optionsWithAllFields.filters?.parentsIn).toEqual(['folder123']);
      expect(optionsWithAllFields.filters?.fullText).toBe('search text');
      expect(optionsWithAllFields.filters?.modifiedAfter).toBe(
        '2024-01-01T00:00:00.000Z'
      );
      expect(optionsWithAllFields.filters?.modifiedBefore).toBe(
        '2024-12-31T23:59:59.999Z'
      );
      expect(optionsWithAllFields.filters?.createdAfter).toBe(
        '2024-01-01T00:00:00.000Z'
      );
      expect(optionsWithAllFields.filters?.createdBefore).toBe(
        '2024-12-31T23:59:59.999Z'
      );

      // Permission and user interaction fields
      expect(optionsWithAllFields.filters?.owners).toEqual([
        'owner@example.com',
      ]);
      expect(optionsWithAllFields.filters?.writers).toEqual([
        'writer@example.com',
      ]);
      expect(optionsWithAllFields.filters?.readers).toEqual([
        'reader@example.com',
      ]);
      expect(optionsWithAllFields.filters?.starred).toBe(true);
      expect(optionsWithAllFields.filters?.sharedWithMe).toBe(false);
      expect(optionsWithAllFields.filters?.viewedByMeTime).toBe(
        '2024-06-01T12:00:00.000Z'
      );
      expect(optionsWithAllFields.filters?.properties).toEqual([
        'key1',
        'key2',
      ]);
      expect(optionsWithAllFields.filters?.appProperties).toEqual(['appKey1']);
      expect(optionsWithAllFields.filters?.visibility).toBe('limited');
      expect(optionsWithAllFields.filters?.shortcutDetails?.targetId).toBe(
        'shortcut123'
      );
    });
  });

  describe('Field Type Validation', () => {
    it('should support correct types for permission fields (string arrays)', () => {
      // Test that permission fields accept proper string array types
      const options: DriveFileListOptions = {
        filters: {
          owners: ['user@example.com'],
          writers: ['editor@example.com'],
          readers: ['viewer@example.com'],
        },
      };

      expect(options.filters?.owners).toEqual(['user@example.com']);
      expect(options.filters?.writers).toEqual(['editor@example.com']);
      expect(options.filters?.readers).toEqual(['viewer@example.com']);
    });

    it('should support correct types for boolean fields', () => {
      // Test that boolean fields accept proper boolean values
      const options: DriveFileListOptions = {
        filters: {
          starred: true,
          sharedWithMe: false,
          trashed: true,
        },
      };

      expect(options.filters?.starred).toBe(true);
      expect(options.filters?.sharedWithMe).toBe(false);
      expect(options.filters?.trashed).toBe(true);
    });

    it('should support correct types for date/time fields', () => {
      // Test that date fields accept proper ISO string values
      const isoDate = '2024-01-01T00:00:00.000Z';
      const options: DriveFileListOptions = {
        filters: {
          viewedByMeTime: isoDate,
          modifiedAfter: isoDate,
          modifiedBefore: isoDate,
          createdAfter: isoDate,
          createdBefore: isoDate,
        },
      };

      expect(options.filters?.viewedByMeTime).toBe(isoDate);
      expect(options.filters?.modifiedAfter).toBe(isoDate);
      expect(options.filters?.modifiedBefore).toBe(isoDate);
      expect(options.filters?.createdAfter).toBe(isoDate);
      expect(options.filters?.createdBefore).toBe(isoDate);
    });

    it('should support correct types for visibility field', () => {
      // Test that visibility field accepts specific string literal types
      const validVisibilityValues: Array<DriveFileListOptions['filters']> = [
        { visibility: 'anyoneCanFind' },
        { visibility: 'anyoneWithLink' },
        { visibility: 'domainCanFind' },
        { visibility: 'domainWithLink' },
        { visibility: 'limited' },
      ];

      validVisibilityValues.forEach(filter => {
        const options: DriveFileListOptions = { filters: filter };
        expect(options.filters?.visibility).toBeDefined();
      });
    });
  });
});
