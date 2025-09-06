import { z } from 'zod';
import {
  ALL_TOOLS,
  SHEETS_TOOLS,
  DRIVE_TOOLS,
  CALENDAR_TOOLS,
  DOCS_TOOLS,
  TOOL_METADATA,
  getToolMetadata,
  type SupportedToolId,
} from './tool-definitions.js';

/**
 * Cache for compiled schemas to improve performance
 */
const schemaCache = new Map<string, z.ZodType>();

/**
 * Supported tool types for schema generation
 * Now imported from centralized tool definitions
 */
export type SupportedTool = SupportedToolId;

/**
 * Factory class for creating standardized Zod schemas for Google Workspace MCP tools
 * Implements caching and performance optimizations for schema creation
 */
export class SchemaFactory {
  /**
   * Creates a schema for spreadsheet ID validation
   */
  public static createSpreadsheetIdSchema(): z.ZodString {
    return z
      .string()
      .trim()
      .min(1, 'Spreadsheet ID cannot be empty')
      .describe('The ID of the Google Spreadsheet');
  }

  /**
   * Creates a schema for range validation
   */
  public static createRangeSchema(): z.ZodEffects<z.ZodString, string, string> {
    return z
      .string()
      .trim()
      .min(1, 'Range cannot be empty')
      .refine(
        range => SchemaFactory.isValidA1Notation(range),
        'Invalid range format: must be valid A1 notation (e.g., "A1", "A1:B10", "Sheet1!A1:B10")'
      )
      .describe('The A1 notation range (e.g., "Sheet1!A1:D10" or "A1:D10")');
  }

  /**
   * Validates if a string is in valid A1 notation format
   */
  private static isValidA1Notation(range: string): boolean {
    if (!range || range.trim().length === 0) {
      return false;
    }

    // Handle sheet names with exclamation mark
    const parts = range.split('!');
    const rangeContent = parts.length > 1 ? parts[1] : parts[0];

    // A1 notation patterns:
    // Single cell: A1, B5, AA10, etc.
    // Range: A1:B10, C1:Z100, etc.
    const a1Pattern = /^[A-Z]+[1-9]\d*(?::[A-Z]+[1-9]\d*)?$/i;

    return a1Pattern.test(rangeContent.trim());
  }

  /**
   * Creates a schema for values (2D array of strings)
   */
  public static createValuesSchema(): z.ZodArray<z.ZodArray<z.ZodString>> {
    return z
      .array(z.array(z.string()))
      .describe('2D array of string values to write/append');
  }

  /**
   * Creates a schema for values specifically for append operations (cannot be empty)
   */
  public static createAppendValuesSchema(): z.ZodArray<
    z.ZodArray<z.ZodString>
  > {
    return z
      .array(z.array(z.string()), {
        required_error: 'Values must be an array',
        invalid_type_error: 'Values must be an array',
      })
      .min(1, 'Values cannot be empty for append operation')
      .describe('2D array of string values to append (must not be empty)');
  }

  /**
   * Creates an optional schema for values
   */
  public static createOptionalValuesSchema(): z.ZodOptional<
    z.ZodArray<z.ZodArray<z.ZodString>>
  > {
    return SchemaFactory.createValuesSchema().optional();
  }

  /**
   * Creates a schema for Google Drive file ID validation
   */
  public static createFileIdSchema(): z.ZodString {
    return z
      .string()
      .trim()
      .min(1, 'File ID cannot be empty')
      .max(100, 'File ID too long')
      .describe('The unique identifier of the Drive file');
  }

  /**
   * Creates a schema for Google Drive folder ID validation
   */
  public static createFolderIdSchema(): z.ZodOptional<z.ZodString> {
    return z
      .string()
      .trim()
      .min(1, 'Folder ID cannot be empty')
      .optional()
      .describe('List files within a specific folder');
  }

  /**
   * Creates a schema for calendar ID validation
   */
  public static createCalendarIdSchema(): z.ZodString {
    return z
      .string()
      .min(1, 'Calendar ID cannot be empty')
      .describe('The calendar ID');
  }

  /**
   * Creates a schema for event ID validation
   */
  public static createEventIdSchema(): z.ZodString {
    return z
      .string()
      .min(1, 'Event ID cannot be empty')
      .describe('The unique identifier of the event');
  }

  /**
   * Creates a schema for document ID validation
   */
  public static createDocumentIdSchema(): z.ZodString {
    return z
      .string({
        required_error: 'Document ID is required',
        invalid_type_error: 'Document ID must be a string',
      })
      .min(1, 'Document ID cannot be empty')
      .max(100, 'Document ID too long')
      .describe('The unique identifier of the Google Docs document');
  }

  /**
   * Creates a schema for document title validation
   */
  public static createDocumentTitleSchema(): z.ZodString {
    return z
      .string({
        required_error: 'Title is required',
        invalid_type_error: 'Title must be a string',
      })
      .min(1, 'Title cannot be empty')
      .max(255, 'Title too long')
      .describe('The title of the document');
  }

  /**
   * Creates a schema for Drive API query string validation
   */
  public static createQuerySchema(): z.ZodOptional<z.ZodString> {
    return z
      .string({
        description: 'Drive API query string for searching files',
      })
      .max(2048, 'Query string too long')
      .optional();
  }

  /**
   * Creates a schema for Drive API export format validation
   */
  public static createExportFormatSchema(): z.ZodOptional<
    z.ZodEnum<['pdf', 'docx', 'xlsx', 'csv', 'txt', 'html', 'odt', 'rtf']>
  > {
    return z
      .enum(['pdf', 'docx', 'xlsx', 'csv', 'txt', 'html', 'odt', 'rtf'])
      .optional()
      .describe('Export format for Google Workspace files');
  }

  /**
   * Creates a schema for Calendar event time information
   */
  public static createEventTimeSchema(): z.ZodEffects<z.ZodObject<any>, any> {
    return z
      .object({
        dateTime: z
          .string()
          .optional()
          .describe('ISO 8601 date-time string with timezone'),
        date: z
          .string()
          .optional()
          .describe('ISO 8601 date string for all-day events'),
        timeZone: z
          .string()
          .optional()
          .describe('Time zone identifier (e.g., "America/New_York")'),
      })
      .refine(data => !!(data.dateTime || data.date), {
        message: 'Either dateTime or date must be provided',
      });
  }

  /**
   * Creates a schema for Calendar event attendee information
   */
  public static createAttendeeSchema(): z.ZodObject<any> {
    return z.object({
      email: z.string().email().describe('Email address of the attendee'),
      displayName: z
        .string()
        .optional()
        .describe('Display name of the attendee'),
      optional: z
        .boolean()
        .optional()
        .describe('Whether attendance is optional'),
      responseStatus: z
        .enum(['needsAction', 'declined', 'tentative', 'accepted'])
        .optional(),
      comment: z.string().optional().describe('Comment from the attendee'),
      additionalGuests: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Number of additional guests'),
    });
  }

  /**
   * Creates a schema for Calendar reminder settings
   */
  public static createReminderSchema(): z.ZodObject<any> {
    return z.object({
      useDefault: z
        .boolean()
        .optional()
        .describe('Whether to use default reminders'),
      overrides: z
        .array(
          z.object({
            method: z
              .enum(['email', 'popup'])
              .describe('Reminder delivery method'),
            minutes: z
              .number()
              .int()
              .min(0)
              .describe('Minutes before event to send reminder'),
          })
        )
        .optional()
        .describe('Custom reminder settings'),
    });
  }

  /**
   * Creates input schema for specific tools with caching
   */
  public static createToolInputSchema(
    tool: SupportedTool
  ): z.ZodObject<Record<string, z.ZodType>> {
    const cacheKey = `input-${tool}`;
    const cached = schemaCache.get(cacheKey);

    if (cached) {
      return cached as z.ZodObject<Record<string, z.ZodType>>;
    }

    let schema: z.ZodObject<Record<string, z.ZodType>>;

    switch (tool) {
      case SHEETS_TOOLS.LIST_SPREADSHEETS:
        schema = z.object({});
        break;

      case SHEETS_TOOLS.READ_RANGE:
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          range: SchemaFactory.createRangeSchema(),
        });
        break;

      case SHEETS_TOOLS.WRITE_RANGE:
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          range: SchemaFactory.createRangeSchema(),
          values: SchemaFactory.createValuesSchema(),
        });
        break;

      case SHEETS_TOOLS.APPEND_ROWS:
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          range: SchemaFactory.createRangeSchema(),
          values: SchemaFactory.createAppendValuesSchema(),
        });
        break;

      case SHEETS_TOOLS.ADD_SHEET:
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          title: z
            .string()
            .trim()
            .min(1, 'Sheet title cannot be empty')
            .describe('The title of the new sheet to add'),
          index: z
            .number()
            .int()
            .min(0, 'Sheet index must be non-negative')
            .optional()
            .describe(
              'Zero-based index where the sheet should be inserted (optional)'
            ),
        });
        break;

      case SHEETS_TOOLS.CREATE_SPREADSHEET:
        schema = z.object({
          title: z
            .string()
            .trim()
            .min(1, 'Spreadsheet title cannot be empty')
            .describe('The title of the new spreadsheet'),
          sheetTitles: z
            .array(z.string().trim().min(1, 'Sheet title cannot be empty'))
            .min(1, 'Sheet titles array cannot be empty when provided')
            .optional()
            .describe(
              'Optional array of titles for initial sheets. If not provided, a single "Sheet1" will be created'
            ),
        });
        break;

      case DRIVE_TOOLS.LIST_FILES:
        schema = z.object({
          query: SchemaFactory.createQuerySchema(),
          maxResults: z
            .number({
              description: 'Maximum number of results to return (1-1000)',
            })
            .min(1, 'maxResults must be at least 1')
            .max(1000, 'maxResults cannot exceed 1000')
            .optional(),
          pageToken: z
            .string({
              description: 'Token to specify which page of results to return',
            })
            .optional(),
          orderBy: z
            .string({
              description: 'How to order the files in the result set',
            })
            .optional(),
          folderId: SchemaFactory.createFolderIdSchema(),
        });
        break;

      case DRIVE_TOOLS.GET_FILE:
        schema = z.object({
          fileId: SchemaFactory.createFileIdSchema(),
          fields: z
            .array(z.string())
            .optional()
            .describe('Array of fields to include in the response'),
          includePermissions: z
            .boolean()
            .optional()
            .describe('Whether to include file permissions in the response'),
        });
        break;

      case DRIVE_TOOLS.GET_FILE_CONTENT:
        schema = z.object({
          fileId: SchemaFactory.createFileIdSchema(),
          exportFormat: SchemaFactory.createExportFormatSchema(),
          maxFileSize: z
            .number({
              description: 'Maximum file size in bytes for download operations',
            })
            .min(1, 'Maximum file size must be positive')
            .max(1024 * 1024 * 1024, 'Maximum file size too large (max 1GB)')
            .optional(),
        });
        break;

      // Calendar tools
      case CALENDAR_TOOLS.LIST_CALENDARS:
        schema = z.object({});
        break;

      case CALENDAR_TOOLS.LIST:
        schema = z.object({
          calendarId: SchemaFactory.createCalendarIdSchema(),
          timeMin: z
            .string()
            .optional()
            .describe('Lower bound (exclusive) for events to list'),
          timeMax: z
            .string()
            .optional()
            .describe('Upper bound (exclusive) for events to list'),
          maxResults: z
            .number()
            .int()
            .min(1)
            .max(2500)
            .optional()
            .describe('Maximum number of events to return'),
          orderBy: z
            .enum(['startTime', 'updated'])
            .optional()
            .describe('How to order the events'),
          singleEvents: z
            .boolean()
            .optional()
            .describe('Expand recurring events into instances'),
          showDeleted: z
            .boolean()
            .optional()
            .describe('Include deleted events'),
          showHiddenInvitations: z
            .boolean()
            .optional()
            .describe('Include hidden invitations'),
          q: z.string().optional().describe('Free text search terms'),
        });
        break;

      case CALENDAR_TOOLS.GET as SupportedTool:
        schema = z.object({
          calendarId: SchemaFactory.createCalendarIdSchema(),
          eventId: SchemaFactory.createEventIdSchema(),
        });
        break;

      case CALENDAR_TOOLS.CREATE as SupportedTool:
        schema = z.object({
          calendarId: SchemaFactory.createCalendarIdSchema(),
          summary: z
            .string()
            .min(1)
            .max(1024)
            .describe('The title/summary of the event'),
          description: z
            .string()
            .max(8192)
            .optional()
            .describe('Detailed description of the event'),
          location: z
            .string()
            .max(1024)
            .optional()
            .describe('Location of the event'),
          start: SchemaFactory.createEventTimeSchema().describe(
            'Start date/time of the event'
          ),
          end: SchemaFactory.createEventTimeSchema().describe(
            'End date/time of the event'
          ),
          attendees: z
            .array(SchemaFactory.createAttendeeSchema())
            .optional()
            .describe('List of event attendees'),
          reminders: SchemaFactory.createReminderSchema()
            .optional()
            .describe('Reminder settings for the event'),
          recurrence: z
            .array(z.string())
            .optional()
            .describe('RRULE recurrence patterns'),
          transparency: z
            .enum(['opaque', 'transparent'])
            .optional()
            .describe('Event transparency'),
          visibility: z
            .enum(['default', 'public', 'private', 'confidential'])
            .optional(),
          anyoneCanAddSelf: z
            .boolean()
            .optional()
            .describe('Whether anyone can add themselves'),
          guestsCanInviteOthers: z
            .boolean()
            .optional()
            .describe('Whether guests can invite others'),
          guestsCanModify: z
            .boolean()
            .optional()
            .describe('Whether guests can modify event'),
          guestsCanSeeOtherGuests: z
            .boolean()
            .optional()
            .describe('Whether guests can see other guests'),
        });
        break;

      case CALENDAR_TOOLS.QUICK_ADD:
        schema = z.object({
          calendarId: SchemaFactory.createCalendarIdSchema(),
          text: z
            .string()
            .min(1)
            .max(1024)
            .describe('Natural language description of the event to create'),
        });
        break;

      case CALENDAR_TOOLS.DELETE as SupportedTool:
        schema = z.object({
          calendarId: SchemaFactory.createCalendarIdSchema(),
          eventId: SchemaFactory.createEventIdSchema(),
          sendUpdates: z
            .enum(['all', 'externalOnly', 'none'])
            .optional()
            .describe('Whether to send cancellation emails to attendees'),
        });
        break;

      // Docs tools
      case DOCS_TOOLS.GET as SupportedTool:
        schema = z.object({
          documentId: SchemaFactory.createDocumentIdSchema(),
          includeContent: z
            .boolean()
            .optional()
            .describe(
              'Whether to include the document body content in the response'
            ),
          format: z
            .string()
            .transform(val => val.toLowerCase() as 'markdown' | 'json')
            .refine(val => ['markdown', 'json'].includes(val), {
              message: 'Format must be either "markdown" or "json"',
            })
            .default('markdown')
            .optional()
            .describe(
              'Output format: markdown for plain text markdown or json for structured document data'
            ),
        });
        break;

      case DOCS_TOOLS.CREATE as SupportedTool:
        schema = z.object({
          title: SchemaFactory.createDocumentTitleSchema(),
          folderId: z
            .string()
            .optional()
            .describe(
              'Optional folder ID where the document should be created'
            ),
        });
        break;

      case DOCS_TOOLS.UPDATE as SupportedTool:
        schema = z.object({
          documentId: SchemaFactory.createDocumentIdSchema(),
          requests: z
            .array(z.any(), {
              required_error: 'Requests array is required',
              invalid_type_error: 'Requests must be an array',
            })
            .describe(
              'Array of batch update requests to apply to the document'
            ),
        });
        break;

      case DOCS_TOOLS.INSERT_TEXT:
        schema = z.object({
          documentId: SchemaFactory.createDocumentIdSchema(),
          text: z
            .string({
              required_error: 'Text is required',
              invalid_type_error: 'Text cannot be null',
            })
            .describe('The text to insert into the document'),
          index: z
            .number({
              invalid_type_error: 'Index must be a number',
            })
            .int('Index must be an integer')
            .min(0, 'Index must be non-negative')
            .optional()
            .describe(
              'The position where text should be inserted (0-based index)'
            ),
        });
        break;

      case DOCS_TOOLS.REPLACE_TEXT:
        schema = z.object({
          documentId: SchemaFactory.createDocumentIdSchema(),
          searchText: z
            .string({
              required_error: 'Search text is required',
              invalid_type_error: 'Text cannot be null',
            })
            .describe('The text to search for and replace'),
          replaceText: z
            .string({
              required_error: 'Replace text is required',
              invalid_type_error: 'Text cannot be null',
            })
            .describe('The replacement text (can be empty for deletion)'),
          matchCase: z
            .boolean()
            .optional()
            .describe('Whether to match case when searching for text'),
        });
        break;

      default:
        throw new Error(`Unknown tool: ${tool}`);
    }

    schemaCache.set(cacheKey, schema);
    return schema;
  }

  /**
   * Creates response schema for specific tools
   */
  public static createResponseSchema(
    tool: SupportedTool
  ): z.ZodObject<Record<string, z.ZodType>> {
    switch (tool) {
      case SHEETS_TOOLS.LIST_SPREADSHEETS:
        return z.object({
          spreadsheets: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              url: z.string(),
              modifiedTime: z.string(),
            })
          ),
        });

      case SHEETS_TOOLS.READ_RANGE:
        return z.object({
          range: z.string(),
          values: z.array(z.array(z.string())),
          majorDimension: z.enum(['ROWS', 'COLUMNS']),
        });

      case SHEETS_TOOLS.WRITE_RANGE:
        return z.object({
          updatedCells: z.number(),
          updatedRows: z.number(),
          updatedColumns: z.number(),
        });

      case SHEETS_TOOLS.APPEND_ROWS:
        return z.object({
          updates: z.object({
            updatedRows: z.number(),
            updatedCells: z.number(),
          }),
        });

      case SHEETS_TOOLS.ADD_SHEET:
        return z.object({
          sheetId: z.number(),
          title: z.string(),
          index: z.number(),
          spreadsheetId: z.string(),
        });

      case SHEETS_TOOLS.CREATE_SPREADSHEET:
        return z.object({
          spreadsheetId: z.string(),
          spreadsheetUrl: z.string(),
          title: z.string(),
          sheets: z.array(
            z.object({
              sheetId: z.number(),
              title: z.string(),
              index: z.number(),
            })
          ),
        });

      default:
        throw new Error(`Unknown response schema: ${tool}`);
    }
  }

  /**
   * Validates tool input using the appropriate schema
   */
  public static validateToolInput(
    tool: SupportedTool,
    input: unknown
  ): z.SafeParseReturnType<Record<string, unknown>, Record<string, unknown>> {
    const schema = SchemaFactory.createToolInputSchema(tool);
    return schema.safeParse(input);
  }

  /**
   * Formats validation errors into a readable string
   */
  public static formatValidationError(error: z.ZodError): string {
    const issues = error.issues.map(issue => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root';
      return `${path}: ${issue.message}`;
    });

    return `Validation failed: ${issues.join(', ')}`;
  }

  /**
   * Creates a complete tool metadata object with schema
   * Now uses centralized tool definitions and metadata
   */
  public static createToolMetadata(tool: SupportedTool): {
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodType>;
  } {
    const inputSchema = SchemaFactory.createToolInputSchema(tool);
    const metadata = getToolMetadata(tool);

    return {
      ...metadata,
      inputSchema: inputSchema.shape,
    };
  }

  /**
   * Clears the schema cache (useful for testing)
   */
  public static clearCache(): void {
    schemaCache.clear();
  }

  /**
   * Gets cache statistics for monitoring
   */
  public static getCacheStats(): { size: number; keys: string[] } {
    return {
      size: schemaCache.size,
      keys: Array.from(schemaCache.keys()),
    };
  }

  /**
   * Advanced range validation with pattern matching
   */
  public static validateRangeFormat(range: string): {
    valid: boolean;
    error?: string;
  } {
    const patterns = [
      /^[A-Z]+\d+$/, // Single cell: A1
      /^[A-Z]+\d+:[A-Z]+\d+$/, // Range: A1:B10
      /^[^!]+![A-Z]+\d+$/, // Sheet with single cell: Sheet1!A1
      /^[^!]+![A-Z]+\d+:[A-Z]+\d+$/, // Sheet with range: Sheet1!A1:B10
      /^[^!]+!$/, // Just sheet name: Sheet1!
    ];

    const valid = patterns.some(pattern => pattern.test(range));

    if (!valid) {
      return {
        valid: false,
        error: `Invalid range format: "${range}". Expected formats: A1, A1:B10, Sheet1!A1, Sheet1!A1:B10`,
      };
    }

    return { valid: true };
  }
}
