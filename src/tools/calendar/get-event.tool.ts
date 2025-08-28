import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import type { CalendarEventResult, MCPToolResult, ToolMetadata } from '../../types/index.js';
import type { ToolExecutionContext } from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Schema for get event input
 */
const GetEventInputSchema = z.object({
  calendarId: z.string().min(1).describe('The calendar ID containing the event'),
  eventId: z.string().min(1).describe('The unique identifier of the event to retrieve'),
}).describe('Get detailed information about a specific calendar event');

type GetEventInput = z.infer<typeof GetEventInputSchema>;

/**
 * Tool for retrieving detailed information about a specific calendar event
 *
 * This tool fetches complete event details including timing, attendees,
 * location, reminders, and conference information.
 *
 * **Features:**
 * - Retrieves complete event metadata
 * - Includes attendee information and response status
 * - Returns conference/meeting details if available
 * - Provides recurrence information for recurring events
 * - Shows reminder and notification settings
 *
 * **Usage Examples:**
 * ```typescript
 * // Get a specific event
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   eventId: 'abc123def456'
 * });
 *
 * // Get event from shared calendar
 * const result = await tool.execute({
 *   calendarId: 'team@company.com',
 *   eventId: 'meeting-id-789'
 * });
 * ```
 *
 * **Returns:**
 * - Complete event object with all metadata
 * - Timing information (start/end times, timezone)
 * - Attendee list with response status
 * - Location and conference details
 * - Reminder and recurrence settings
 */
export class GetEventTool extends BaseCalendarTools<
  GetEventInput,
  CalendarEventResult
> {
  public getToolName(): string {
    return 'google-workspace__calendar-get-event';
  }

  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Get Calendar Event',
      description: 'Retrieves detailed information about a specific calendar event',
      inputSchema: GetEventInputSchema.shape,
    };
  }

  public async executeImpl(
    args: GetEventInput,
    context?: ToolExecutionContext
  ): Promise<Result<CalendarEventResult, GoogleWorkspaceError>> {
    this.logger.info('Executing get event tool', { args });

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

      // Validate event ID
      const eventIdResult = this.validateEventId(args.eventId, args.calendarId);
      if (eventIdResult.isErr()) {
        const error = eventIdResult.error;
        this.logger.error('Invalid event ID', {
          calendarId: args.calendarId,
          eventId: args.eventId,
          error: error.message,
        });

        return err(error);
      }

      const calendarId = calendarIdResult.value;
      const eventId = eventIdResult.value;

      // Get event using the service
      const result = await this.calendarService.getEvent(calendarId, eventId);

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to get event', {
          calendarId,
          eventId,
          error: error.message,
          code: error.code,
        });

        return err(error);
      }

      const event = result.value;
      
      this.logger.info('Successfully retrieved event', {
        calendarId,
        eventId,
        summary: event.summary,
      });

      return ok({
        event: {
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
            comment: attendee.comment,
            additionalGuests: attendee.additionalGuests,
          })),
          reminders: event.reminders,
          recurrence: event.recurrence,
          htmlLink: event.htmlLink,
          transparency: event.transparency,
          visibility: event.visibility,
          sequence: event.sequence,
          iCalUID: event.iCalUID,
          conferenceData: event.conferenceData ? {
            entryPoints: event.conferenceData.entryPoints?.map(entry => ({
              entryPointType: entry.entryPointType,
              uri: entry.uri,
              label: entry.label,
              meetingCode: entry.meetingCode,
              accessCode: entry.accessCode,
            })),
            conferenceSolution: event.conferenceData.conferenceSolution,
            conferenceId: event.conferenceData.conferenceId,
          } : undefined,
          attachments: event.attachments?.map(attachment => ({
            fileUrl: attachment.fileUrl,
            title: attachment.title,
            mimeType: attachment.mimeType,
            fileId: attachment.fileId,
          })),
          anyoneCanAddSelf: event.anyoneCanAddSelf,
          guestsCanInviteOthers: event.guestsCanInviteOthers,
          guestsCanModify: event.guestsCanModify,
          guestsCanSeeOtherGuests: event.guestsCanSeeOtherGuests,
          privateCopy: event.privateCopy,
          locked: event.locked,
        },
        calendarId,
      });
    } catch (error) {
      const calendarError = this.handleServiceError(error);
      this.logger.error('Unexpected error getting event', {
        calendarId: args.calendarId,
        eventId: args.eventId,
        error: calendarError.message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(calendarError);
    }
  }
}