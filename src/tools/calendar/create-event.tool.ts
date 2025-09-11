import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import { CALENDAR_TOOLS } from '../base/tool-definitions.js';
import type {
  CalendarCreateEventResult,
  CalendarEvent,
  MCPToolResult,
} from '../../types/index.js';
import type {
  ToolExecutionContext,
  ToolMetadata,
} from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';
import { SchemaFactory } from '../base/tool-schema.js';

// Define the type from the tool schema
const CreateEventInputSchema = SchemaFactory.createToolInputSchema(
  CALENDAR_TOOLS.CREATE as any
);
type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

/**
 * Tool for creating new calendar events
 *
 * This tool creates comprehensive calendar events with support for attendees,
 * reminders, recurrence patterns, and various meeting settings.
 *
 * **Features:**
 * - Create timed or all-day events
 * - Add multiple attendees with response tracking
 * - Configure custom reminders and notifications
 * - Set up recurring events with RRULE patterns
 * - Control guest permissions and visibility
 * - Support for various time zones
 *
 * **Usage Examples:**
 * ```typescript
 * // Create a simple meeting
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   summary: 'Team Meeting',
 *   start: { dateTime: '2023-12-15T10:00:00-05:00' },
 *   end: { dateTime: '2023-12-15T11:00:00-05:00' },
 *   location: 'Conference Room A'
 * });
 *
 * // Create event with attendees and reminders
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   summary: 'Project Review',
 *   description: 'Quarterly project status review',
 *   start: { dateTime: '2023-12-20T14:00:00-05:00' },
 *   end: { dateTime: '2023-12-20T15:30:00-05:00' },
 *   attendees: [
 *     { email: 'colleague1@company.com', optional: false },
 *     { email: 'colleague2@company.com', optional: true }
 *   ],
 *   reminders: {
 *     useDefault: false,
 *     overrides: [
 *       { method: 'email', minutes: 60 },
 *       { method: 'popup', minutes: 10 }
 *     ]
 *   }
 * });
 *
 * // Create all-day event
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   summary: 'Holiday',
 *   start: { date: '2023-12-25' },
 *   end: { date: '2023-12-26' }
 * });
 * ```
 *
 * **Returns:**
 * - Complete created event object with assigned ID
 * - Event URL for sharing or direct access
 * - All event metadata and settings
 */
export class CreateEventTool extends BaseCalendarTools<
  CreateEventInput,
  CalendarCreateEventResult
> {
  public getToolName(): string {
    return CALENDAR_TOOLS.CREATE;
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata(CALENDAR_TOOLS.CREATE as any);
  }

  public async executeImpl(
    args: CreateEventInput,
    context?: ToolExecutionContext
  ): Promise<Result<any, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info('Executing create event tool', {
      calendarId: args.calendarId,
      summary: args.summary,
      hasAttendees: !!args.attendees?.length,
      requestId,
    });

    try {
      // Validate access control for write operations
      const accessResult = await this.validateAccessControl(args, requestId);
      if (accessResult.isErr()) {
        return err(accessResult.error);
      }
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

      // Prepare event data
      const eventData: Partial<CalendarEvent> = {
        summary: args.summary,
        description: args.description,
        location: args.location,
        start: args.start,
        end: args.end,
        attendees: args.attendees,
        reminders: args.reminders,
        recurrence: args.recurrence,
        transparency: args.transparency,
        visibility: args.visibility,
        anyoneCanAddSelf: args.anyoneCanAddSelf,
        guestsCanInviteOthers: args.guestsCanInviteOthers,
        guestsCanModify: args.guestsCanModify,
        guestsCanSeeOtherGuests: args.guestsCanSeeOtherGuests,
      };

      // Create event using the service
      const result = await this.calendarService.createEvent(
        calendarId,
        eventData
      );

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to create event', {
          calendarId,
          summary: args.summary,
          error: error.message,
          code: error.code,
        });

        return err(error);
      }

      const createdEvent = result.value;

      this.logger.info('Successfully created event', {
        calendarId,
        eventId: createdEvent.id,
        summary: createdEvent.summary,
        attendeesCount: createdEvent.attendees?.length || 0,
      });

      return ok({
        event: {
          id: createdEvent.id,
          summary: createdEvent.summary,
          description: createdEvent.description,
          location: createdEvent.location,
          start: createdEvent.start,
          end: createdEvent.end,
          status: createdEvent.status,
          created: createdEvent.created,
          updated: createdEvent.updated,
          creator: createdEvent.creator,
          organizer: createdEvent.organizer,
          attendees: createdEvent.attendees?.map(attendee => ({
            email: attendee.email,
            displayName: attendee.displayName,
            responseStatus: attendee.responseStatus,
            optional: attendee.optional,
          })),
          reminders: createdEvent.reminders,
          recurrence: createdEvent.recurrence,
          htmlLink: createdEvent.htmlLink,
          transparency: createdEvent.transparency,
          visibility: createdEvent.visibility,
        },
        calendarId,
        success: true,
        message: 'Event created successfully',
      });
    } catch (error) {
      const calendarError = this.handleServiceError(error);
      this.logger.error('Unexpected error creating event', {
        calendarId: args.calendarId,
        summary: args.summary,
        error: calendarError.message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(calendarError);
    }
  }
}
