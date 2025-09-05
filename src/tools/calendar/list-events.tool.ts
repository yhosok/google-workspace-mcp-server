import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import type { CalendarEventsResult, MCPToolResult } from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';
import { SchemaFactory } from '../base/tool-schema.js';

// Define the type from the tool schema
const ListEventsInputSchema = SchemaFactory.createToolInputSchema(
  'google-workspace__calendar__list'
);
type ListEventsInput = z.infer<typeof ListEventsInputSchema>;

/**
 * Tool for listing events from a specific calendar
 *
 * This tool retrieves events from a calendar with comprehensive filtering options,
 * supporting time ranges, search queries, and result ordering.
 *
 * **Features:**
 * - Time-based filtering (timeMin, timeMax)
 * - Text search across event details
 * - Configurable result limits and ordering
 * - Support for recurring event expansion
 * - Option to include/exclude deleted events
 *
 * **Usage Examples:**
 * ```typescript
 * // List all events from primary calendar
 * const result = await tool.execute({ calendarId: 'primary' });
 *
 * // List upcoming events with time filter
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   timeMin: '2023-12-01T00:00:00Z',
 *   timeMax: '2023-12-31T23:59:59Z',
 *   maxResults: 10,
 *   orderBy: 'startTime'
 * });
 *
 * // Search for specific events
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   q: 'team meeting',
 *   singleEvents: true
 * });
 * ```
 *
 * **Returns:**
 * - Array of calendar events with full metadata
 * - Each event includes timing, attendees, location, and other details
 */
export class ListEventsTool extends BaseCalendarTools<
  ListEventsInput,
  CalendarEventsResult
> {
  public getToolName(): string {
    return 'google-workspace__calendar__list';
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata('google-workspace__calendar__list');
  }

  public async executeImpl(
    args: ListEventsInput,
    context?: ToolExecutionContext
  ): Promise<Result<any, GoogleWorkspaceError>> {
    this.logger.info('Executing list events tool', { args });

    try {
      // Validate calendar ID
      const calendarIdResult = this.validateCalendarId(args.calendarId);
      if (calendarIdResult.isErr()) {
        const error = calendarIdResult.error;
        this.logger.error('Invalid calendar ID', {
          calendarId: args.calendarId,
          error: error.message,
        });

        return err(error);
      }

      const calendarId = calendarIdResult.value;

      // Prepare query options
      const options = {
        timeMin: args.timeMin,
        timeMax: args.timeMax,
        maxResults: args.maxResults,
        singleEvents: args.singleEvents,
        orderBy: args.orderBy,
        q: args.q,
        showDeleted: args.showDeleted,
      };

      // List events using the service
      const result = await this.calendarService.listEvents(calendarId, options);

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to list events', {
          calendarId,
          error: error.message,
          code: error.code,
        });

        return err(error);
      }

      const events = result.value;

      this.logger.info('Successfully listed events', {
        calendarId,
        count: events.length,
        options,
      });

      return ok({
        events: events.map(event => ({
          id: event.id,
          summary: event.summary,
          description: event.description,
          location: event.location,
          start: event.start,
          end: event.end,
          status: event.status,
          created: event.created,
          updated: event.updated,
          creator: event.creator,
          organizer: event.organizer,
          attendees: event.attendees?.map(attendee => ({
            email: attendee.email,
            displayName: attendee.displayName,
            responseStatus: attendee.responseStatus,
            optional: attendee.optional,
          })),
          reminders: event.reminders,
          recurrence: event.recurrence,
          htmlLink: event.htmlLink,
          transparency: event.transparency,
          visibility: event.visibility,
          conferenceData: event.conferenceData,
        })),
        calendarId,
        total: events.length,
        filters: options,
      });
    } catch (error) {
      const calendarError = this.handleServiceError(error);
      this.logger.error('Unexpected error listing events', {
        calendarId: args.calendarId,
        error: calendarError.message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(calendarError);
    }
  }
}
