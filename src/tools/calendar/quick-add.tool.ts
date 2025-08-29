import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import type {
  CalendarQuickAddResult,
  MCPToolResult,
} from '../../types/index.js';
import type { ToolExecutionContext, ToolMetadata } from '../base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';

/**
 * Schema for quick add input
 */
const QuickAddInputSchema = z
  .object({
    calendarId: z
      .string()
      .min(1)
      .describe('The calendar ID to create the event in'),
    text: z
      .string()
      .min(1)
      .max(1024)
      .describe('Natural language description of the event to create'),
  })
  .describe('Create a calendar event using natural language text');

type QuickAddInput = z.infer<typeof QuickAddInputSchema>;

/**
 * Tool for creating calendar events using natural language
 *
 * This tool leverages Google's intelligent parsing to create events from
 * natural language descriptions, automatically extracting dates, times,
 * locations, and other event details.
 *
 * **Features:**
 * - Natural language event creation
 * - Automatic date and time parsing
 * - Location and participant extraction
 * - Intelligent event duration estimation
 * - Support for relative dates ("tomorrow", "next Friday")
 * - Time zone awareness based on calendar settings
 *
 * **Supported Patterns:**
 * - "Meeting tomorrow at 2pm"
 * - "Lunch with John next Friday at 12:30"
 * - "Project review Dec 15 from 10am to 11:30am in Conference Room A"
 * - "Team standup every weekday at 9am"
 * - "Birthday party Saturday 7pm at 123 Main St"
 *
 * **Usage Examples:**
 * ```typescript
 * // Simple meeting
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   text: 'Team meeting tomorrow at 2pm'
 * });
 *
 * // Meeting with location
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   text: 'Client presentation Friday 3pm in Conference Room A'
 * });
 *
 * // Event with duration
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   text: 'Workshop next Tuesday from 10am to 3pm'
 * });
 *
 * // Meeting with participants
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   text: 'Lunch with John and Sarah tomorrow at noon'
 * });
 * ```
 *
 * **Returns:**
 * - Created event object with parsed details
 * - Automatically generated event title
 * - Extracted timing and location information
 * - Event URL for sharing or editing
 */
export class QuickAddTool extends BaseCalendarTools<
  QuickAddInput,
  CalendarQuickAddResult
> {
  public getToolName(): string {
    return 'google-workspace__calendar-quick-add';
  }

  public getToolMetadata(): ToolMetadata {
    return {
      title: 'Quick Add Calendar Event',
      description:
        'Creates a calendar event using natural language text with intelligent parsing of dates, times, and locations',
      inputSchema: QuickAddInputSchema.shape,
    };
  }

  public async executeImpl(
    args: QuickAddInput,
    context?: ToolExecutionContext
  ): Promise<Result<CalendarQuickAddResult, GoogleWorkspaceError>> {
    this.logger.info('Executing quick add tool', {
      calendarId: args.calendarId,
      text: args.text,
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

      // Validate quick add text
      if (!args.text || args.text.trim() === '') {
        this.logger.error('Invalid quick add text', {
          calendarId,
          text: args.text,
        });

        return err(
          this.handleServiceError(new Error('Quick add text cannot be empty'))
        );
      }

      const text = args.text.trim();

      // Create event using quick add
      const result = await this.calendarService.quickAdd(calendarId, text);

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to create event via quick add', {
          calendarId,
          text,
          error: error.message,
          code: error.code,
        });

        return err(error);
      }

      const createdEvent = result.value;

      this.logger.info('Successfully created event via quick add', {
        calendarId,
        eventId: createdEvent.id,
        summary: createdEvent.summary,
        originalText: text,
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
          })),
          htmlLink: createdEvent.htmlLink,
        },
        calendarId,
        originalText: text,
        success: true,
        message: 'Event created successfully using natural language parsing',
        parsing: {
          extractedTitle: createdEvent.summary,
          extractedLocation: createdEvent.location,
          extractedTiming: {
            start: createdEvent.start,
            end: createdEvent.end,
          },
        },
      });
    } catch (error) {
      const calendarError = this.handleServiceError(error);
      this.logger.error('Unexpected error in quick add', {
        calendarId: args.calendarId,
        text: args.text,
        error: calendarError.message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(calendarError);
    }
  }
}
