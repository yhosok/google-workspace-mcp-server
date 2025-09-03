import { z } from 'zod';

/**
 * Cache for compiled schemas to improve performance
 */
const schemaCache = new Map<string, z.ZodType>();

/**
 * Supported tool types for schema generation
 */
export type SupportedTool =
  // PDR-style naming for sheets tools
  | 'google-workspace__sheets__list-spreadsheets'
  | 'google-workspace__sheets__read-range'
  | 'google-workspace__sheets__write-range'
  | 'google-workspace__sheets__append-rows'
  | 'google-workspace__sheets__add-sheet'
  | 'google-workspace__sheets__create-spreadsheet';

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
      case 'google-workspace__sheets__list-spreadsheets':
        schema = z.object({});
        break;

      case 'google-workspace__sheets__read-range':
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          range: SchemaFactory.createRangeSchema(),
        });
        break;

      case 'google-workspace__sheets__write-range':
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          range: SchemaFactory.createRangeSchema(),
          values: SchemaFactory.createValuesSchema(),
        });
        break;

      case 'google-workspace__sheets__append-rows':
        schema = z.object({
          spreadsheetId: SchemaFactory.createSpreadsheetIdSchema(),
          range: SchemaFactory.createRangeSchema(),
          values: SchemaFactory.createAppendValuesSchema(),
        });
        break;

      case 'google-workspace__sheets__add-sheet':
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

      case 'google-workspace__sheets__create-spreadsheet':
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
      case 'google-workspace__sheets__list-spreadsheets':
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

      case 'google-workspace__sheets__read-range':
        return z.object({
          range: z.string(),
          values: z.array(z.array(z.string())),
          majorDimension: z.enum(['ROWS', 'COLUMNS']),
        });

      case 'google-workspace__sheets__write-range':
        return z.object({
          updatedCells: z.number(),
          updatedRows: z.number(),
          updatedColumns: z.number(),
        });

      case 'google-workspace__sheets__append-rows':
        return z.object({
          updates: z.object({
            updatedRows: z.number(),
            updatedCells: z.number(),
          }),
        });

      case 'google-workspace__sheets__add-sheet':
        return z.object({
          sheetId: z.number(),
          title: z.string(),
          index: z.number(),
          spreadsheetId: z.string(),
        });

      case 'google-workspace__sheets__create-spreadsheet':
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
   */
  public static createToolMetadata(tool: SupportedTool): {
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodType>;
  } {
    const inputSchema = SchemaFactory.createToolInputSchema(tool);

    const metadata = {
      'google-workspace__sheets__list-spreadsheets': {
        title: 'List Spreadsheets',
        description: 'List all spreadsheets in the configured Drive folder',
      },
      'google-workspace__sheets__read-range': {
        title: 'Read Spreadsheet Range',
        description: 'Read data from a specific spreadsheet range',
      },
      'google-workspace__sheets__write-range': {
        title: 'Write to Spreadsheet Range',
        description: 'Write data to a specific spreadsheet range',
      },
      'google-workspace__sheets__append-rows': {
        title: 'Append to Spreadsheet',
        description: 'Append data to a spreadsheet',
      },
      'google-workspace__sheets__add-sheet': {
        title: 'Add Sheet to Spreadsheet',
        description: 'Add a new sheet (tab) to an existing spreadsheet',
      },
      'google-workspace__sheets__create-spreadsheet': {
        title: 'Create New Spreadsheet',
        description:
          'Create a new spreadsheet. If GOOGLE_DRIVE_FOLDER_ID is configured, the spreadsheet will be created in that folder; otherwise it will be created in the default location',
      },
    };

    return {
      ...metadata[tool],
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
