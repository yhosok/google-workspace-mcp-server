/**
 * Test suite for folder extraction utilities.
 * Validates folder ID extraction from complex parameter objects.
 */

import {
  extractFolderIds,
  getRequiredFolderIds,
  type FolderExtractionOptions,
} from './folder-extraction.utils.js';

describe('Folder Extraction Utils', () => {
  describe('extractFolderIds', () => {
    it('should return empty array for null/undefined params', () => {
      expect(extractFolderIds(null)).toEqual([]);
      expect(extractFolderIds(undefined)).toEqual([]);
      expect(extractFolderIds('string')).toEqual([]);
      expect(extractFolderIds(123)).toEqual([]);
    });

    it('should extract direct folder ID fields', () => {
      const params = {
        folderId: 'folder-123',
        parentFolderId: 'parent-456',
        targetFolderId: 'target-789',
        destinationFolderId: 'dest-abc',
        sourceFolderId: 'source-def',
      };

      const result = extractFolderIds(params);
      expect(result).toEqual([
        'folder-123',
        'parent-456',
        'target-789',
        'dest-abc',
        'source-def',
      ]);
    });

    it('should handle parents array (Drive API format)', () => {
      const params = {
        parents: ['parent1', 'parent2'],
        folderId: 'main-folder',
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['main-folder', 'parent1', 'parent2']);
    });

    it('should extract from nested objects in order', () => {
      const params = {
        options: {
          folderId: 'nested-folder-123',
        },
        metadata: {
          parentFolderId: 'nested-parent-456',
        },
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['nested-folder-123', 'nested-parent-456']);
    });

    it('should prevent infinite recursion', () => {
      const circular: Record<string, unknown> = { folderId: 'root' };
      circular.self = circular;

      const result = extractFolderIds(circular);
      expect(result).toEqual(['root']);
    });

    it('should eliminate duplicates', () => {
      const params = {
        folderId: 'duplicate',
        metadata: {
          folderId: 'duplicate', // Same ID
          parentFolderId: 'unique',
        },
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['duplicate', 'unique']);
    });

    it('should filter out empty, null, and undefined values', () => {
      const params = {
        folderId: 'valid-123',
        parentFolderId: '',
        targetFolderId: null,
        destinationFolderId: undefined,
        sourceFolderId: '   ', // whitespace only
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['valid-123']);
    });

    it('should handle complex nested structures', () => {
      const params = {
        folderId: 'root-folder',
        request: {
          params: {
            targetFolderId: 'deeply-nested',
            metadata: {
              parentFolderId: 'meta-parent',
            },
          },
        },
        context: {
          folderId: 'context-folder',
        },
      };

      const result = extractFolderIds(params);
      // Note: The original implementations only process known nested keys and shallow objects
      expect(result).toEqual([
        'root-folder',
        'deeply-nested',
        'context-folder',
      ]);
    });

    it('should respect custom options', () => {
      const params = {
        customFolder: 'custom-123',
        metadata: {
          parentFolderId: 'parent-456',
        },
      };

      const options: FolderExtractionOptions = {
        folderFieldNames: ['customFolder', 'parentFolderId'],
        maxDepth: 1,
      };

      const result = extractFolderIds(params, options);
      expect(result).toEqual(['custom-123', 'parent-456']);
    });

    it('should respect maxDepth configuration', () => {
      const params = {
        metadata: {
          // known nested key - will be processed
          folderId: 'level1-folder',
          options: {
            // known nested key - will be processed
            folderId: 'level2-folder',
            deeply: {
              // unknown nested key at depth 2 - will be ignored
              folderId: 'level3-folder',
            },
          },
        },
      };

      const options: FolderExtractionOptions = {
        maxDepth: 1,
      };

      const result = extractFolderIds(params, options);
      expect(result).toEqual(['level1-folder']);
    });

    it('should handle unknown nested objects with folder keys', () => {
      const params = {
        unknownObject: {
          someField: 'value',
          targetFolderId: 'should-be-found', // Standard folder field name will be found
        },
        anotherUnknown: {
          noFolderKeys: 'value', // Should be skipped
        },
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['should-be-found']);
    });

    it('should trim whitespace from folder IDs', () => {
      const params = {
        folderId: '  trimmed-123  ',
        parentFolderId: '\t\nwhitespace-456\t\n',
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['trimmed-123', 'whitespace-456']);
    });

    it('should handle arrays of non-string values gracefully', () => {
      const params = {
        parents: [123, null, undefined, 'valid-parent', ''],
        folderId: 'main-folder',
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['main-folder', 'valid-parent']);
    });
  });

  describe('getRequiredFolderIds', () => {
    it('should be a wrapper around extractFolderIds', () => {
      const params = {
        folderId: 'test-folder',
        metadata: {
          parentFolderId: 'parent-folder',
        },
      };

      const extractResult = extractFolderIds(params);
      const wrapperResult = getRequiredFolderIds(params);

      expect(wrapperResult).toEqual(extractResult);
      expect(wrapperResult).toEqual(['test-folder', 'parent-folder']);
    });

    it('should handle edge cases same as extractFolderIds', () => {
      expect(getRequiredFolderIds(null)).toEqual([]);
      expect(getRequiredFolderIds(undefined)).toEqual([]);
      expect(getRequiredFolderIds({})).toEqual([]);
    });
  });

  describe('Order preservation', () => {
    it('should maintain the order of nested object processing', () => {
      // This test ensures we maintain backward compatibility with existing tools
      const params = {
        options: {
          folderId: 'options-folder',
        },
        metadata: {
          parentFolderId: 'metadata-parent',
        },
        file: {
          targetFolderId: 'file-target',
        },
      };

      const result = extractFolderIds(params);
      // Order should match the Object.entries() iteration order
      expect(result).toEqual([
        'options-folder',
        'metadata-parent',
        'file-target',
      ]);
    });

    it('should process direct fields before nested objects', () => {
      const params = {
        folderId: 'direct-folder',
        metadata: {
          parentFolderId: 'nested-parent',
        },
      };

      const result = extractFolderIds(params);
      expect(result).toEqual(['direct-folder', 'nested-parent']);
    });
  });

  describe('Performance considerations', () => {
    it('should handle large objects efficiently', () => {
      const largeParams: Record<string, unknown> = {
        folderId: 'root-folder',
      };

      // Create a large nested structure
      for (let i = 0; i < 100; i++) {
        largeParams[`key${i}`] = {
          value: `value${i}`,
          nested: {
            more: `data${i}`,
          },
        };
      }

      largeParams.metadata = {
        parentFolderId: 'metadata-parent',
      };

      const startTime = Date.now();
      const result = extractFolderIds(largeParams);
      const endTime = Date.now();

      expect(result).toEqual(['root-folder', 'metadata-parent']);
      expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
    });
  });
});
