/**
 * Centralized Tool Definitions for Google Workspace MCP Server
 *
 * This module provides a centralized registry of all tool definitions across the Google Workspace
 * MCP server. It maintains the hierarchical organization by service while providing a master
 * registry for type safety and easy reference.
 *
 * The tool naming convention follows: google-workspace__[service]__[operation]
 *
 * @module tool-definitions
 */

/**
 * Google Sheets tool definitions
 * Provides comprehensive spreadsheet management capabilities
 */
export const SHEETS_TOOLS = {
  LIST_SPREADSHEETS: 'google-workspace__sheets__list-spreadsheets',
  READ_RANGE: 'google-workspace__sheets__read-range',
  WRITE_RANGE: 'google-workspace__sheets__write-range',
  APPEND_ROWS: 'google-workspace__sheets__append-rows',
  ADD_SHEET: 'google-workspace__sheets__add-sheet',
  CREATE_SPREADSHEET: 'google-workspace__sheets__create-spreadsheet',
} as const;

/**
 * Google Drive tool definitions
 * Provides file and folder management operations
 */
export const DRIVE_TOOLS = {
  LIST_FILES: 'google-workspace__drive__list-files',
  GET_FILE: 'google-workspace__drive__get-file',
  GET_FILE_CONTENT: 'google-workspace__drive__get-file-content',
} as const;

/**
 * Google Calendar tool definitions
 * Provides comprehensive calendar and event management
 */
export const CALENDAR_TOOLS = {
  LIST_CALENDARS: 'google-workspace__calendar__list-calendars',
  LIST: 'google-workspace__calendar__list',
  GET: 'google-workspace__calendar__get',
  CREATE: 'google-workspace__calendar__create',
  QUICK_ADD: 'google-workspace__calendar__quick-add',
  DELETE: 'google-workspace__calendar__delete',
} as const;

/**
 * Google Docs tool definitions
 * Provides document creation, editing, and management operations
 */
export const DOCS_TOOLS = {
  GET: 'google-workspace__docs__get',
  CREATE: 'google-workspace__docs__create',
  UPDATE: 'google-workspace__docs__update',
  INSERT_TEXT: 'google-workspace__docs__insert-text',
  REPLACE_TEXT: 'google-workspace__docs__replace-text',
} as const;

/**
 * Master tool registry combining all service-specific tool definitions
 * This provides a single source of truth for all available tools
 */
export const ALL_TOOLS = {
  ...SHEETS_TOOLS,
  ...DRIVE_TOOLS,
  ...CALENDAR_TOOLS,
  ...DOCS_TOOLS,
} as const;

/**
 * Tool metadata definitions with titles and descriptions
 * Organized by service for easy maintenance and reference
 */
export const TOOL_METADATA = {
  // Sheets tool metadata
  [SHEETS_TOOLS.LIST_SPREADSHEETS]: {
    title: 'List Spreadsheets',
    description: 'List all spreadsheets in the configured Drive folder',
  },
  [SHEETS_TOOLS.READ_RANGE]: {
    title: 'Read Spreadsheet Range',
    description: 'Read data from a specific spreadsheet range',
  },
  [SHEETS_TOOLS.WRITE_RANGE]: {
    title: 'Write to Spreadsheet Range',
    description: 'Write data to a specific spreadsheet range',
  },
  [SHEETS_TOOLS.APPEND_ROWS]: {
    title: 'Append to Spreadsheet',
    description: 'Append data to a spreadsheet',
  },
  [SHEETS_TOOLS.ADD_SHEET]: {
    title: 'Add Sheet to Spreadsheet',
    description: 'Add a new sheet (tab) to an existing spreadsheet',
  },
  [SHEETS_TOOLS.CREATE_SPREADSHEET]: {
    title: 'Create New Spreadsheet',
    description:
      'Create a new spreadsheet. If GOOGLE_DRIVE_FOLDER_ID is configured, the spreadsheet will be created in that folder; otherwise it will be created in the default location',
  },

  // Drive tool metadata
  [DRIVE_TOOLS.LIST_FILES]: {
    title: 'List Drive Files',
    description: `List files in Google Drive with advanced search capabilities using multiple parameter types for flexible filtering.

PARAMETERS:
1. query (optional): Raw Drive API query string for custom searches
2. folderId (optional): List files within a specific folder only  
3. maxResults (optional): Limit results (1-1000, default: all)
4. pageToken (optional): For pagination through large result sets
5. orderBy (optional): Sort order for results
6. includeTrashed (optional): Include trashed files (overrides default trashed=false filter)
7. filters (optional): Structured filter object with individual fields

DRIVE API QUERY SYNTAX (for 'query' parameter):
• Basic format: <field> <operator> <value>
• Available fields: 
  - Basic file metadata: name, mimeType, modifiedTime, createdTime, parents, trashed, fullText
  - Permission-related fields: owners, writers, readers
  - User interaction fields: starred, sharedWithMe, viewedByMeTime
  - Custom properties: properties, appProperties
  - File visibility and shortcuts: visibility, shortcutDetails.targetId
• Operators: = (equals), != (not equals), contains, in, has, < > >= <= (for dates/times)
• Logic operators: and, or, parentheses () for grouping
• String values: Use single quotes around values

COMMON QUERY EXAMPLES:
• name contains 'Report'
• mimeType = 'application/pdf'
• mimeType = 'application/vnd.google-apps.spreadsheet'
• mimeType = 'application/vnd.google-apps.document'
• mimeType = 'application/vnd.google-apps.folder'
• '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms' in parents
• modifiedTime > '2023-01-01T00:00:00'
• createdTime >= '2024-01-01T00:00:00Z'
• fullText contains 'important document'
• trashed = true (to find deleted files)
• (name contains 'Report' or name contains 'Summary') and mimeType = 'application/pdf'
• name contains 'budget' and modifiedTime > '2024-01-01T00:00:00' and trashed = false
• 'user@example.com' in owners (files owned by specific user)
• starred = true (starred files)
• 'user@example.com' in writers (files user can edit)
• sharedWithMe = true (files shared with current user)
• properties has 'myKey' (files with custom property)
• shortcutDetails.targetId = 'file-id' (shortcuts to specific file)
• viewedByMeTime > '2024-01-01T00:00:00' (recently viewed files)
• visibility = 'limited' (files with restricted visibility)

STRUCTURED FILTERS (alternative to raw query):
Use the 'filters' parameter object with individual fields:
• trashed: boolean - Include only trashed files
• mimeType: string - Filter by exact mime type  
• nameContains: string - Filter by name containing string
• parentsIn: string[] - Filter by parent folder IDs
• fullText: string - Full text search in file content
• modifiedAfter/Before: ISO 8601 date strings
• createdAfter/Before: ISO 8601 date strings

IMPORTANT BEHAVIOR:
• Default: 'trashed = false' is automatically added unless 'includeTrashed = true' is set or trashed is explicitly specified in query
• Date format: ISO 8601 (e.g., '2023-01-01T00:00:00' or '2023-01-01T00:00:00Z')
• Use 'folderId' parameter for simple folder searches instead of complex parent queries
• Combine parameters: You can use 'query' with 'folderId' and other parameters
• Pagination: Use 'maxResults' and 'pageToken' for handling large result sets

MIME TYPES FOR GOOGLE WORKSPACE:
• Documents: 'application/vnd.google-apps.document'
• Spreadsheets: 'application/vnd.google-apps.spreadsheet'  
• Presentations: 'application/vnd.google-apps.presentation'
• Folders: 'application/vnd.google-apps.folder'
• PDFs: 'application/pdf'
• Images: 'image/jpeg', 'image/png', etc.`,
  },
  [DRIVE_TOOLS.GET_FILE]: {
    title: 'Get Drive File Metadata',
    description: 'Gets metadata and details for a specific Google Drive file',
  },
  [DRIVE_TOOLS.GET_FILE_CONTENT]: {
    title: 'Get Drive File Content',
    description: 'Downloads and retrieves content from a Google Drive file',
  },

  // Calendar tool metadata
  [CALENDAR_TOOLS.LIST_CALENDARS]: {
    title: 'List Calendars',
    description: 'Lists all calendars accessible to the authenticated user',
  },
  [CALENDAR_TOOLS.LIST]: {
    title: 'List Calendar Events',
    description:
      'Lists events from a specific calendar with optional filtering and pagination',
  },
  [CALENDAR_TOOLS.GET]: {
    title: 'Get Calendar Event',
    description:
      'Retrieves detailed information about a specific calendar event',
  },
  [CALENDAR_TOOLS.CREATE]: {
    title: 'Create Calendar Event',
    description:
      'Creates a new calendar event with comprehensive options for attendees, reminders, and recurrence',
  },
  [CALENDAR_TOOLS.QUICK_ADD]: {
    title: 'Quick Add Calendar Event',
    description:
      'Creates a calendar event using natural language parsing for quick event creation',
  },
  [CALENDAR_TOOLS.DELETE]: {
    title: 'Delete Calendar Event',
    description:
      'Permanently deletes a calendar event with options for attendee notifications',
  },

  // Docs tool metadata
  [DOCS_TOOLS.GET]: {
    title: 'Get Google Document',
    description:
      'Retrieves a Google Document with its metadata and optional content. Supports markdown (default) and JSON output formats.',
  },
  [DOCS_TOOLS.CREATE]: {
    title: 'Create Google Document',
    description:
      'Creates a new Google Document with the specified title and optional folder location',
  },
  [DOCS_TOOLS.UPDATE]: {
    title: 'Update Google Document',
    description:
      'Performs batch updates on a Google Document using the batchUpdate API',
  },
  [DOCS_TOOLS.INSERT_TEXT]: {
    title: 'Insert Text into Document',
    description: 'Inserts text at a specific position in a Google Document',
  },
  [DOCS_TOOLS.REPLACE_TEXT]: {
    title: 'Replace Text in Document',
    description:
      'Replaces all occurrences of specified text in a Google Document',
  },
} as const;

/**
 * Type-safe union of all supported tool identifiers
 * Generated from the ALL_TOOLS constant for compile-time type checking
 */
export type SupportedToolId = (typeof ALL_TOOLS)[keyof typeof ALL_TOOLS];

/**
 * Service-specific tool type definitions for granular type safety
 */
export type SheetsToolId = (typeof SHEETS_TOOLS)[keyof typeof SHEETS_TOOLS];
export type DriveToolId = (typeof DRIVE_TOOLS)[keyof typeof DRIVE_TOOLS];
export type CalendarToolId =
  (typeof CALENDAR_TOOLS)[keyof typeof CALENDAR_TOOLS];
export type DocsToolId = (typeof DOCS_TOOLS)[keyof typeof DOCS_TOOLS];

/**
 * Tool categorization by service for organizational purposes
 * Useful for service-specific tool filtering and management
 */
export const TOOLS_BY_SERVICE = {
  sheets: Object.values(SHEETS_TOOLS),
  drive: Object.values(DRIVE_TOOLS),
  calendar: Object.values(CALENDAR_TOOLS),
  docs: Object.values(DOCS_TOOLS),
} as const;

/**
 * Helper function to get tool metadata by tool ID
 * Provides type-safe access to tool titles and descriptions
 *
 * @param toolId - The tool identifier
 * @returns Tool metadata object with title and description
 */
export function getToolMetadata(toolId: SupportedToolId): {
  title: string;
  description: string;
} {
  const metadata = TOOL_METADATA[toolId];
  if (!metadata) {
    throw new Error(`Unknown tool ID: ${toolId}`);
  }
  return metadata;
}

/**
 * Helper function to check if a tool ID belongs to a specific service
 *
 * @param toolId - The tool identifier to check
 * @param service - The service name to check against
 * @returns True if the tool belongs to the specified service
 */
export function isToolFromService(
  toolId: string,
  service: keyof typeof TOOLS_BY_SERVICE
): boolean {
  return (TOOLS_BY_SERVICE[service] as readonly string[]).includes(toolId);
}

/**
 * Helper function to get all tools for a specific service
 *
 * @param service - The service name
 * @returns Array of tool IDs for the specified service
 */
export function getToolsForService(
  service: keyof typeof TOOLS_BY_SERVICE
): readonly string[] {
  return TOOLS_BY_SERVICE[service];
}

/**
 * Validation helper to ensure a string is a valid tool ID
 *
 * @param toolId - The string to validate
 * @returns True if the string is a valid tool ID
 */
export function isValidToolId(toolId: string): toolId is SupportedToolId {
  return Object.values(ALL_TOOLS).includes(toolId as SupportedToolId);
}
