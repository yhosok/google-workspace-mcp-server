/**
 * DriveQueryBuilder utility class for constructing Google Drive API queries
 *
 * Features:
 * - Automatic duplicate removal
 * - Query escaping and sanitization
 * - Field name and operator validation
 * - Structured filter conversion
 * - Default filter application
 */

/**
 * Configuration options for DriveQueryBuilder
 */
export interface DriveQueryBuilderOptions {
  includeTrashed?: boolean;
}

/**
 * Valid Google Drive API field names
 * Based on the official Google Drive API documentation for search queries
 * https://developers.google.com/drive/api/guides/search-files
 */
const VALID_FIELDS = [
  // Basic file metadata
  'name',
  'mimeType',
  'modifiedTime',
  'createdTime',
  'parents',
  'trashed',
  'fullText',
  // Permission-related fields
  'owners', // supports 'in' operator - find files owned by specific users
  'writers', // supports 'in' operator - users with write permissions
  'readers', // supports 'in' operator - users with read permissions
  // User interaction fields
  'starred', // supports '=', '!=' operators - whether file is starred
  'sharedWithMe', // supports '=', '!=' operators - files in "Shared with me"
  'viewedByMeTime', // supports date operators - when user last viewed file
  // Custom properties
  'properties', // supports 'has' operator - public custom properties
  'appProperties', // supports 'has' operator - private custom properties
  // File visibility and shortcuts
  'visibility', // supports '=', '!=' operators - file visibility level
  'shortcutDetails.targetId', // supports '=', '!=' operators - shortcut target ID
] as const;

/**
 * Valid Google Drive API operators
 */
const VALID_OPERATORS = [
  '=',
  '!=',
  'contains',
  'in',
  'has',
  '<',
  '>',
  '>=',
  '<=',
] as const;

/**
 * Utility class for building Google Drive API queries with validation and deduplication
 */
export class DriveQueryBuilder {
  private customQuery?: string;
  private nameContains?: string;
  private mimeType?: string;
  private parentIds: string[] = [];
  private fullText?: string;
  private modifiedAfter?: string;
  private modifiedBefore?: string;
  private createdAfter?: string;
  private createdBefore?: string;
  private trashedFilter?: boolean;
  private options: DriveQueryBuilderOptions;

  // Permission-based filters
  private owners: string[] = [];
  private writers: string[] = [];
  private readers: string[] = [];

  // User interaction filters
  private starred?: boolean;
  private sharedWithMe?: boolean;
  private viewedByMeTime?: string;

  // Custom properties filters
  private properties: string[] = [];
  private appProperties: string[] = [];

  // Visibility and shortcuts
  private visibility?: string;
  private shortcutTargetId?: string;

  constructor(options: DriveQueryBuilderOptions = {}) {
    this.options = options;
  }

  /**
   * Add a custom Drive API query string
   * @param query The raw Drive API query string
   * @returns this builder for chaining
   */
  public withCustomQuery(query: string): this {
    this.validateCustomQuery(query);
    this.customQuery = query;
    return this;
  }

  /**
   * Filter by name containing a string
   * @param nameContains The string that file names should contain
   * @returns this builder for chaining
   */
  public withNameContains(nameContains: string): this {
    this.nameContains = nameContains;
    return this;
  }

  /**
   * Filter by mime type
   * @param mimeType The exact mime type to match
   * @returns this builder for chaining
   */
  public withMimeType(mimeType: string): this {
    this.mimeType = mimeType;
    return this;
  }

  /**
   * Filter by single parent folder
   * @param parentId The folder ID that should be a parent
   * @returns this builder for chaining
   */
  public withParentIn(parentId: string): this {
    if (!parentId || parentId.trim() === '') {
      throw new Error('Invalid folder ID');
    }
    this.parentIds = [parentId];
    return this;
  }

  /**
   * Filter by multiple parent folders (OR logic)
   * @param parentIds Array of folder IDs
   * @returns this builder for chaining
   */
  public withParentsIn(parentIds: string[]): this {
    if (parentIds.some(id => !id || id.trim() === '')) {
      throw new Error('Invalid folder ID');
    }
    this.parentIds = parentIds;
    return this;
  }

  /**
   * Filter by full text search
   * @param fullText The text to search for in file content
   * @returns this builder for chaining
   */
  public withFullText(fullText: string): this {
    this.fullText = fullText;
    return this;
  }

  /**
   * Filter files modified after a specific date
   * @param date ISO 8601 date string
   * @returns this builder for chaining
   */
  public withModifiedAfter(date: string): this {
    this.validateDateFormat(date);
    this.modifiedAfter = date;
    return this;
  }

  /**
   * Filter files modified before a specific date
   * @param date ISO 8601 date string
   * @returns this builder for chaining
   */
  public withModifiedBefore(date: string): this {
    this.validateDateFormat(date);
    this.modifiedBefore = date;
    return this;
  }

  /**
   * Filter files created after a specific date
   * @param date ISO 8601 date string
   * @returns this builder for chaining
   */
  public withCreatedAfter(date: string): this {
    this.validateDateFormat(date);
    this.createdAfter = date;
    return this;
  }

  /**
   * Filter files created before a specific date
   * @param date ISO 8601 date string
   * @returns this builder for chaining
   */
  public withCreatedBefore(date: string): this {
    this.validateDateFormat(date);
    this.createdBefore = date;
    return this;
  }

  /**
   * Set trashed filter explicitly
   * @param trashed Whether to include only trashed files
   * @returns this builder for chaining
   */
  public withTrashed(trashed: boolean): this {
    this.trashedFilter = trashed;
    return this;
  }

  /**
   * Filter files by owners' email addresses
   * @param owners Array of email addresses of file owners
   * @returns this builder for chaining
   */
  public withOwners(owners: string[]): this {
    this.owners = owners.filter(owner => owner && owner.trim() !== '');
    return this;
  }

  /**
   * Filter files by writers' email addresses
   * @param writers Array of email addresses with write permissions
   * @returns this builder for chaining
   */
  public withWriters(writers: string[]): this {
    this.writers = writers.filter(writer => writer && writer.trim() !== '');
    return this;
  }

  /**
   * Filter files by readers' email addresses
   * @param readers Array of email addresses with read permissions
   * @returns this builder for chaining
   */
  public withReaders(readers: string[]): this {
    this.readers = readers.filter(reader => reader && reader.trim() !== '');
    return this;
  }

  /**
   * Filter files by starred status
   * @param starred Whether to include only starred files
   * @returns this builder for chaining
   */
  public withStarred(starred: boolean): this {
    this.starred = starred;
    return this;
  }

  /**
   * Filter files by shared with me status
   * @param sharedWithMe Whether to include only files shared with current user
   * @returns this builder for chaining
   */
  public withSharedWithMe(sharedWithMe: boolean): this {
    this.sharedWithMe = sharedWithMe;
    return this;
  }

  /**
   * Filter files by when they were last viewed by current user
   * @param viewedByMeTime ISO 8601 timestamp for when user last viewed file
   * @returns this builder for chaining
   */
  public withViewedByMeTime(viewedByMeTime: string): this {
    this.validateDateFormat(viewedByMeTime);
    this.viewedByMeTime = viewedByMeTime;
    return this;
  }

  /**
   * Filter files by custom property keys
   * @param properties Array of custom property keys to check
   * @returns this builder for chaining
   */
  public withProperties(properties: string[]): this {
    this.properties = properties.filter(prop => prop && prop.trim() !== '');
    return this;
  }

  /**
   * Filter files by app-specific property keys
   * @param appProperties Array of app-specific property keys
   * @returns this builder for chaining
   */
  public withAppProperties(appProperties: string[]): this {
    this.appProperties = appProperties.filter(
      prop => prop && prop.trim() !== ''
    );
    return this;
  }

  /**
   * Filter files by visibility level
   * @param visibility File visibility level
   * @returns this builder for chaining
   */
  public withVisibility(visibility: string): this {
    const validVisibilities = [
      'anyoneCanFind',
      'anyoneWithLink',
      'domainCanFind',
      'domainWithLink',
      'limited',
    ];
    if (!validVisibilities.includes(visibility)) {
      throw new Error(
        `Invalid visibility value. Must be one of: ${validVisibilities.join(', ')}`
      );
    }
    this.visibility = visibility;
    return this;
  }

  /**
   * Filter shortcuts by target ID
   * @param targetId The target file ID for shortcuts
   * @returns this builder for chaining
   */
  public withShortcutTargetId(targetId: string): this {
    if (!targetId || targetId.trim() === '') {
      throw new Error('Invalid target ID');
    }
    this.shortcutTargetId = targetId;
    return this;
  }

  /**
   * Build the final query string
   * @returns The complete Drive API query string
   */
  public build(): string {
    const queryParts: string[] = [];

    // Handle trashed filter logic - add at beginning when no custom query has trashed conditions
    const shouldAddTrashedFilter = this.shouldAddTrashedFilter();
    if (shouldAddTrashedFilter) {
      const trashedValue =
        this.trashedFilter !== undefined ? this.trashedFilter : false;
      queryParts.push(`trashed = ${trashedValue}`);
    }

    // Process custom query, preserving its structure while cleaning up duplicates
    if (this.customQuery) {
      let customQueryToProcess = this.customQuery.trim();

      // If custom query has trashed conditions, clean up duplicates and preserve structure
      if (this.containsTrashedCondition(customQueryToProcess)) {
        customQueryToProcess =
          this.cleanCustomQueryPreservingFormat(customQueryToProcess);
      }

      // Only add non-empty cleaned query
      if (customQueryToProcess) {
        queryParts.push(customQueryToProcess);
      }
    }

    // Add structured filters
    if (this.nameContains !== undefined) {
      queryParts.push(`name contains '${this.escapeValue(this.nameContains)}'`);
    }

    if (this.mimeType) {
      queryParts.push(`mimeType = '${this.escapeValue(this.mimeType)}'`);
    }

    if (this.parentIds.length > 0) {
      if (this.parentIds.length === 1) {
        queryParts.push(`'${this.escapeValue(this.parentIds[0])}' in parents`);
      } else {
        const parentConditions = this.parentIds.map(
          id => `'${this.escapeValue(id)}' in parents`
        );
        queryParts.push(`(${parentConditions.join(' or ')})`);
      }
    }

    if (this.fullText) {
      queryParts.push(`fullText contains '${this.escapeValue(this.fullText)}'`);
    }

    if (this.modifiedAfter) {
      queryParts.push(`modifiedTime > '${this.modifiedAfter}'`);
    }

    if (this.modifiedBefore) {
      queryParts.push(`modifiedTime < '${this.modifiedBefore}'`);
    }

    if (this.createdAfter) {
      queryParts.push(`createdTime > '${this.createdAfter}'`);
    }

    if (this.createdBefore) {
      queryParts.push(`createdTime < '${this.createdBefore}'`);
    }

    // Permission-based filters
    if (this.owners.length > 0) {
      if (this.owners.length === 1) {
        queryParts.push(`'${this.escapeValue(this.owners[0])}' in owners`);
      } else {
        const ownerConditions = this.owners.map(
          owner => `'${this.escapeValue(owner)}' in owners`
        );
        queryParts.push(`(${ownerConditions.join(' or ')})`);
      }
    }

    if (this.writers.length > 0) {
      if (this.writers.length === 1) {
        queryParts.push(`'${this.escapeValue(this.writers[0])}' in writers`);
      } else {
        const writerConditions = this.writers.map(
          writer => `'${this.escapeValue(writer)}' in writers`
        );
        queryParts.push(`(${writerConditions.join(' or ')})`);
      }
    }

    if (this.readers.length > 0) {
      if (this.readers.length === 1) {
        queryParts.push(`'${this.escapeValue(this.readers[0])}' in readers`);
      } else {
        const readerConditions = this.readers.map(
          reader => `'${this.escapeValue(reader)}' in readers`
        );
        queryParts.push(`(${readerConditions.join(' or ')})`);
      }
    }

    // User interaction filters
    if (this.starred !== undefined) {
      queryParts.push(`starred = ${this.starred}`);
    }

    if (this.sharedWithMe !== undefined) {
      queryParts.push(`sharedWithMe = ${this.sharedWithMe}`);
    }

    if (this.viewedByMeTime) {
      queryParts.push(`viewedByMeTime > '${this.viewedByMeTime}'`);
    }

    // Custom properties filters
    if (this.properties.length > 0) {
      const propertyConditions = this.properties.map(
        prop => `properties has '${this.escapeValue(prop)}'`
      );
      queryParts.push(`(${propertyConditions.join(' or ')})`);
    }

    if (this.appProperties.length > 0) {
      const appPropertyConditions = this.appProperties.map(
        prop => `appProperties has '${this.escapeValue(prop)}'`
      );
      queryParts.push(`(${appPropertyConditions.join(' or ')})`);
    }

    // Visibility and shortcuts
    if (this.visibility) {
      queryParts.push(`visibility = '${this.escapeValue(this.visibility)}'`);
    }

    if (this.shortcutTargetId) {
      queryParts.push(
        `shortcutDetails.targetId = '${this.escapeValue(this.shortcutTargetId)}'`
      );
    }

    return queryParts.join(' and ');
  }

  /**
   * Determine if we should add trashed filter based on current state
   */
  private shouldAddTrashedFilter(): boolean {
    // If trashed filter is explicitly set via withTrashed(), always respect it (highest priority)
    if (this.trashedFilter !== undefined) {
      return true;
    }

    // If includeTrashed option is true, don't add any trashed filter
    if (this.options.includeTrashed) {
      return false;
    }

    // If custom query already contains trashed condition, don't add default
    if (this.customQuery && this.containsTrashedCondition(this.customQuery)) {
      return false;
    }

    // Otherwise add default trashed = false
    return true;
  }

  /**
   * Check if a query string contains a trashed condition
   */
  private containsTrashedCondition(query: string): boolean {
    return /trashed\s*[=!]/i.test(query);
  }

  /**
   * Remove duplicate trashed conditions from custom query
   */
  private removeDuplicateTrashedConditions(query: string): string {
    let cleaned = query.trim();

    // Remove all trashed conditions, regardless of position
    cleaned = cleaned.replace(/trashed\s*=\s*(true|false)/gi, '');

    // Clean up orphaned 'and' connectors
    // Handle multiple consecutive 'and' patterns
    cleaned = cleaned.replace(/\s*and\s+and\s*/gi, ' and ');
    cleaned = cleaned.replace(/^\s*and\s+/gi, ''); // Remove leading 'and'
    cleaned = cleaned.replace(/\s+and\s*$/gi, ''); // Remove trailing 'and'

    // Clean up extra whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
  }

  /**
   * Clean custom query with trashed conditions, preserving structure and removing duplicates
   */
  private cleanCustomQueryWithTrashed(query: string): string {
    let cleaned = query.trim();

    // Find all trashed conditions and extract the value from the first one
    const trashedMatches = cleaned.match(/trashed\s*=\s*(true|false)/gi);
    if (!trashedMatches || trashedMatches.length === 0) {
      return cleaned;
    }

    // Extract the value from the first trashed condition (preserving user intent)
    const firstTrashedMatch = trashedMatches[0];
    const trashedValue =
      /trashed\s*=\s*(true|false)/gi.exec(firstTrashedMatch)?.[1] || 'false';

    // Remove all trashed conditions
    cleaned = cleaned.replace(/trashed\s*=\s*(true|false)/gi, '');

    // Clean up orphaned 'and' connectors
    cleaned = cleaned.replace(/\s*and\s+and\s*/gi, ' and ');
    cleaned = cleaned.replace(/^\s*and\s+/gi, '');
    cleaned = cleaned.replace(/\s+and\s*$/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Add back single trashed condition at the end (preserving user's value)
    if (cleaned) {
      return `${cleaned} and trashed = ${trashedValue}`;
    } else {
      return `trashed = ${trashedValue}`;
    }
  }

  /**
   * Clean custom query preserving original format, case, and position of trashed conditions
   */
  private cleanCustomQueryPreservingFormat(query: string): string {
    let cleaned = query.trim();

    // Find all trashed conditions with their exact formats
    const trashedRegex = /trashed\s*[=!]\s*(?:true|false)/gi;
    const trashedMatches = [...cleaned.matchAll(trashedRegex)];

    if (trashedMatches.length === 0) {
      return cleaned;
    }

    if (trashedMatches.length === 1) {
      // Single trashed condition, keep as-is
      return cleaned;
    }

    // Multiple trashed conditions - keep the first one and remove the rest
    const firstMatch = trashedMatches[0];
    const firstMatchText = firstMatch[0];

    // Remove ALL trashed conditions
    cleaned = cleaned.replace(trashedRegex, '');

    // Clean up orphaned 'and' connectors
    cleaned = cleaned.replace(/\s*and\s+and\s*/gi, ' and ');
    cleaned = cleaned.replace(/^\s*and\s+/gi, '');
    cleaned = cleaned.replace(/\s+and\s*$/gi, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Re-add the first trashed condition at the end for consistency
    if (cleaned) {
      return `${cleaned} and ${firstMatchText}`;
    } else {
      // Only trashed conditions existed
      return firstMatchText;
    }
  }

  /**
   * Remove duplicate conditions from custom query
   */
  private removeDuplicateConditions(
    customQuery: string,
    existingConditions: string[]
  ): string {
    let cleaned = customQuery.trim();

    // Check if custom query contains trashed condition that duplicates what we're adding
    for (const condition of existingConditions) {
      if (
        condition.startsWith('trashed = ') &&
        this.containsTrashedCondition(cleaned)
      ) {
        // Remove ALL trashed conditions from custom query since we're adding our own
        // This handles multiple trashed conditions comprehensively

        // Remove all trashed conditions, regardless of position
        cleaned = cleaned.replace(/trashed\s*=\s*(true|false)/gi, '');

        // Clean up 'and' connectors that are now orphaned
        // Handle multiple 'and' patterns
        cleaned = cleaned.replace(/\s*and\s+and\s*/gi, ' and ');
        cleaned = cleaned.replace(/^\s*and\s+/gi, '');
        cleaned = cleaned.replace(/\s+and\s*$/gi, '');

        // Clean up multiple spaces
        cleaned = cleaned.replace(/\s+/g, ' ');
      }
    }

    return cleaned.trim();
  }

  /**
   * Validate custom query syntax and content
   */
  private validateCustomQuery(query: string): void {
    if (!query || query.trim() === '') {
      return;
    }

    // Enhanced pattern to handle:
    // 1. Dot notation in field names (shortcutDetails.targetId)
    // 2. Value-first syntax ('value' in field)
    // 3. All valid operators including 'has'
    const patterns = [
      // Standard field operator patterns: field = 'value', field contains 'value', etc.
      /([\w.]+)\s*(!?=|contains|in|has|like|[<>]=?)\s/g,
      // Value-first with 'in': 'value' in field
      /'[^']*'\s+in\s+([\w.]+)/g,
    ];

    let foundMatches = false;
    const fieldsToValidate = new Set<string>();
    const operatorsToValidate = new Set<string>();

    // Check all patterns
    for (const pattern of patterns) {
      const matches = [...query.matchAll(pattern)];
      if (matches.length > 0) {
        foundMatches = true;
        for (const match of matches) {
          const field = match[1];
          const operator = match[2];

          fieldsToValidate.add(field);
          if (operator) {
            operatorsToValidate.add(operator);
          } else if (pattern.source.includes('in')) {
            // For 'value' in field pattern, add 'in' operator
            operatorsToValidate.add('in');
          }
        }
      }
    }

    // Fallback: if no patterns matched, try a simpler approach
    if (!foundMatches) {
      // Look for basic field-operator combinations at word boundaries
      const simplePattern = /\b([\w.]+)\s*(!?=|contains|in|has|like|[<>]=?)/g;
      const simpleMatches = [...query.matchAll(simplePattern)];

      if (simpleMatches.length > 0) {
        foundMatches = true;
        for (const match of simpleMatches) {
          fieldsToValidate.add(match[1]);
          operatorsToValidate.add(match[2]);
        }
      }
    }

    if (!foundMatches || fieldsToValidate.size === 0) {
      throw new Error('Invalid query syntax');
    }

    // Validate each field and operator
    for (const field of fieldsToValidate) {
      // Case-insensitive field validation
      const fieldLowerCase = field.toLowerCase();
      const validFieldsLowerCase = VALID_FIELDS.map(f => f.toLowerCase());
      if (!validFieldsLowerCase.includes(fieldLowerCase)) {
        throw new Error(`Invalid field name: ${field}`);
      }
    }

    for (const operator of operatorsToValidate) {
      if (
        !VALID_OPERATORS.includes(operator as (typeof VALID_OPERATORS)[number])
      ) {
        throw new Error(`Invalid operator: ${operator}`);
      }
    }
  }

  /**
   * Validate date format (basic ISO 8601 check)
   */
  private validateDateFormat(date: string): void {
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    const simpleDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

    if (!isoDatePattern.test(date) && !simpleDatePattern.test(date)) {
      throw new Error('Invalid date format');
    }
  }

  /**
   * Escape special characters in query values
   */
  private escapeValue(value: string): string {
    return value
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/'/g, "\\'"); // Escape single quotes
  }
}
