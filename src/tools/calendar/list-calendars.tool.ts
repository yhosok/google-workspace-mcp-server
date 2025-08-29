import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import type {
  CalendarListResult,
  MCPToolResult,
  ToolMetadata,
} from '../../types/index.js';
import type { ToolExecutionContext } from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Schema for list calendars input (no parameters required)
 */
const ListCalendarsInputSchema = z
  .object({})
  .optional()
  .describe('List all accessible calendars');

type ListCalendarsInput = z.infer<typeof ListCalendarsInputSchema>;

/**
 * Tool for listing all accessible calendars
 *
 * This tool retrieves all calendars that the authenticated user has access to,
 * including primary calendar, shared calendars, and subscribed calendars.
 *
 * **Features:**
 * - Lists all accessible calendars
 * - Includes calendar metadata (name, access level, colors, etc.)
 * - Supports both personal and organizational calendars
 * - Automatically handles authentication and service initialization
 *
 * **Usage Examples:**
 * ```typescript
 * // List all calendars
 * const result = await tool.execute({});
 * ```
 *
 * **Returns:**
 * - Array of calendar entries with metadata
 * - Each entry includes ID, summary, access role, and display properties
 */
export class ListCalendarsTool extends BaseCalendarTools<
  ListCalendarsInput,
  CalendarListResult
> {
  public getToolName(): string {
    return 'google-workspace__calendar-list';
  }

  public getToolMetadata(): ToolMetadata {
    return {
      title: 'List Calendars',
      description: 'Lists all calendars accessible to the authenticated user',
      inputSchema: {},
    };
  }

  public async executeImpl(
    args: ListCalendarsInput,
    context?: ToolExecutionContext
  ): Promise<Result<CalendarListResult, GoogleWorkspaceError>> {
    this.logger.info('Executing list calendars tool', { args });

    try {
      // List calendars using the service
      const result = await this.calendarService.listCalendars();

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to list calendars', {
          error: error.message,
          code: error.code,
        });

        return err(error);
      }

      const calendars = result.value;

      this.logger.info('Successfully listed calendars', {
        count: calendars.length,
      });

      return ok({
        calendars: calendars.map(cal => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description,
          primary: cal.primary || false,
          accessRole: cal.accessRole,
          colorId: cal.colorId,
          backgroundColor: cal.backgroundColor,
          foregroundColor: cal.foregroundColor,
          timeZone: cal.timeZone,
          location: cal.location,
          selected: cal.selected,
          deleted: cal.deleted,
        })),
        total: calendars.length,
      });
    } catch (error) {
      const calendarError = this.handleServiceError(error);
      this.logger.error('Unexpected error listing calendars', {
        error: calendarError.message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(calendarError);
    }
  }
}
