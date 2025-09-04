/**
 * Folder extraction utilities for extracting folder IDs from complex parameter objects.
 * Used by base tool classes to identify required folder IDs for access control validation.
 */

/**
 * Configuration options for folder extraction behavior.
 */
export interface FolderExtractionOptions {
  /** Maximum recursion depth to prevent infinite loops (default: 2) */
  maxDepth?: number;
  /** Additional nested object keys to always process (default: common keys) */
  knownNestedKeys?: string[];
  /** Custom folder field names to extract (default: standard field names) */
  folderFieldNames?: string[];
}

/**
 * Default configuration for folder extraction.
 */
const DEFAULT_OPTIONS: Required<FolderExtractionOptions> = {
  maxDepth: 2,
  knownNestedKeys: [
    'metadata',
    'options',
    'file',
    'document',
    'context',
    'request',
    'params',
  ],
  folderFieldNames: [
    'folderId',
    'parentFolderId',
    'targetFolderId',
    'destinationFolderId',
    'sourceFolderId',
  ],
};

/**
 * Extracts folder IDs from a complex parameter object using recursive traversal.
 *
 * This utility function implements a comprehensive folder ID extraction strategy that:
 * - Searches for direct folder ID fields in standard field names
 * - Handles Google Drive API 'parents' arrays
 * - Recursively processes known nested object keys
 * - Intelligently detects objects that might contain folder references
 * - Prevents infinite recursion with configurable depth limits
 * - Eliminates duplicates using a Set-based approach
 *
 * @param params - The parameter object to analyze
 * @param options - Configuration options for extraction behavior
 * @returns Array of unique folder IDs found in the parameter object
 *
 * @example
 * ```typescript
 * const params = {
 *   folderId: '123',
 *   metadata: {
 *     parentFolderId: '456'
 *   },
 *   parents: ['789']
 * };
 *
 * const folderIds = extractFolderIds(params);
 * // Returns: ['123', '456', '789']
 * ```
 */
export function extractFolderIds(
  params: unknown,
  options: FolderExtractionOptions = {}
): string[] {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const folderIds: string[] = [];
  const seen = new Set<string>(); // Avoid duplicates

  if (!params || typeof params !== 'object') {
    return folderIds;
  }

  const paramsObj = params as Record<string, unknown>;

  /**
   * Helper function to add folder ID if valid and not already seen.
   */
  const addFolderId = (value: unknown): void => {
    if (typeof value === 'string' && value.trim() && !seen.has(value.trim())) {
      seen.add(value.trim());
      folderIds.push(value.trim());
    }
  };

  /**
   * Recursively extracts folder IDs from an object structure.
   *
   * @param obj - The object to extract folder IDs from
   * @param depth - Current recursion depth (used to prevent infinite loops)
   */
  const extractFromObject = (obj: Record<string, unknown>, depth = 0): void => {
    if (depth > config.maxDepth) return; // Prevent infinite recursion

    // Extract direct folder ID fields
    config.folderFieldNames.forEach(fieldName => {
      addFolderId(obj[fieldName]);
    });

    // Check for parents array (Drive API format)
    if (Array.isArray(obj.parents)) {
      obj.parents.forEach(addFolderId);
    }

    // Process nested objects in the order they appear in the object
    Object.entries(obj).forEach(([key, value]) => {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const valueObj = value as Record<string, unknown>;

        // Only recurse for known nested object keys or objects that contain folder-related keys
        const isKnownNested = config.knownNestedKeys.includes(key);
        const hasFolderKeys = Object.keys(valueObj).some(
          k =>
            k.toLowerCase().includes('folder') ||
            k.toLowerCase().includes('parent') ||
            k.toLowerCase().includes('target') ||
            k.toLowerCase().includes('destination')
        );

        if (isKnownNested || (hasFolderKeys && depth < 1)) {
          extractFromObject(valueObj, depth + 1);
        }
      }
    });
  };

  // Extract folder IDs from the main parameters object
  extractFromObject(paramsObj);

  return folderIds;
}

/**
 * Type-safe wrapper for extractFolderIds that can be used as a drop-in replacement
 * for the getRequiredFolderIds method in base tool classes.
 *
 * @param params - The tool parameters to analyze
 * @returns Array of folder IDs that require access validation
 */
export function getRequiredFolderIds(params: unknown): string[] {
  return extractFolderIds(params);
}
