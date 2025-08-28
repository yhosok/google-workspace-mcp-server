import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import type { CalendarCreateEventResult, CalendarEvent, MCPToolResult, ToolMetadata } from '../../types/index.js';
import type { ToolExecutionContext } from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Schema for event date/time information
 */
const EventTimeSchema = z.object({
  dateTime: z.string().optional().describe('ISO 8601 date-time string with timezone'),
  date: z.string().optional().describe('ISO 8601 date string for all-day events'),
  timeZone: z.string().optional().describe('Time zone identifier (e.g., "America/New_York")'),
}).refine(
  (data) => !!(data.dateTime || data.date),
  { message: 'Either dateTime or date must be provided' }
);

/**
 * Schema for event attendee information
 */
const AttendeeSchema = z.object({
  email: z.string().email().describe('Email address of the attendee'),
  displayName: z.string().optional().describe('Display name of the attendee'),
  optional: z.boolean().optional().describe('Whether attendance is optional'),
  responseStatus: z.enum(['needsAction', 'declined', 'tentative', 'accepted']).optional(),
  comment: z.string().optional().describe('Comment from the attendee'),
  additionalGuests: z.number().int().min(0).optional().describe('Number of additional guests'),
});

/**
 * Schema for reminder settings
 */
const ReminderSchema = z.object({
  useDefault: z.boolean().optional().describe('Whether to use default reminders'),
  overrides: z.array(z.object({
    method: z.enum(['email', 'popup']).describe('Reminder delivery method'),
    minutes: z.number().int().min(0).describe('Minutes before event to send reminder'),
  })).optional().describe('Custom reminder settings'),
});

/**
 * Schema for create event input
 */
const CreateEventInputSchema = z.object({
  calendarId: z.string().min(1).describe('The calendar ID to create the event in'),
  summary: z.string().min(1).max(1024).describe('The title/summary of the event'),
  description: z.string().max(8192).optional().describe('Detailed description of the event'),
  location: z.string().max(1024).optional().describe('Location of the event'),
  start: EventTimeSchema.describe('Start date/time of the event'),
  end: EventTimeSchema.describe('End date/time of the event'),
  attendees: z.array(AttendeeSchema).optional().describe('List of event attendees'),
  reminders: ReminderSchema.optional().describe('Reminder settings for the event'),
  recurrence: z.array(z.string()).optional().describe('RRULE recurrence patterns'),
  transparency: z.enum(['opaque', 'transparent']).optional().describe('Event transparency'),
  visibility: z.enum(['default', 'public', 'private', 'confidential']).optional(),
  anyoneCanAddSelf: z.boolean().optional().describe('Whether anyone can add themselves'),
  guestsCanInviteOthers: z.boolean().optional().describe('Whether guests can invite others'),
  guestsCanModify: z.boolean().optional().describe('Whether guests can modify event'),
  guestsCanSeeOtherGuests: z.boolean().optional().describe('Whether guests can see other guests'),
}).describe('Create a new calendar event');

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
    return 'google-workspace__calendar-create-event';
  }

  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Creates a new calendar event with comprehensive options for attendees, reminders, and recurrence',
      description: 'Creates a new calendar event with comprehensive options for attendees, reminders, and recurrence',
      inputSchema: CreateEventInputSchema.shape,
    };
  }

  public async executeImpl(
    args: CreateEventInput,
    context?: ToolExecutionContext
  ): Promise<Result<any, GoogleWorkspaceError>> {
    this.logger.info('Executing create event tool', { 
      calendarId: args.calendarId,
      summary: args.summary,
      hasAttendees: !!args.attendees?.length,
    });

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
      const result = await this.calendarService.createEvent(calendarId, eventData);

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