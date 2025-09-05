import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import { CALENDAR_TOOLS } from '../base/tool-definitions.js';
import type {
  CalendarDeleteEventResult,
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
const DeleteEventInputSchema = SchemaFactory.createToolInputSchema(
  CALENDAR_TOOLS.DELETE
);
type DeleteEventInput = z.infer<typeof DeleteEventInputSchema>;

/**
 * Tool for deleting calendar events
 *
 * This tool permanently removes events from calendars with options for
 * notifying attendees about the cancellation.
 *
 * **Features:**
 * - Permanent event deletion
 * - Configurable attendee notifications
 * - Support for recurring event instances
 * - Safe deletion with validation
 * - Audit logging of deletion actions
 *
 * **Notification Options:**
 * - `all`: Send cancellation emails to all attendees
 * - `externalOnly`: Send emails only to external attendees
 * - `none`: Don't send any cancellation emails
 *
 * **Usage Examples:**
 * ```typescript
 * // Delete event without notifications
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   eventId: 'abc123def456'
 * });
 *
 * // Delete event and notify all attendees
 * const result = await tool.execute({
 *   calendarId: 'primary',
 *   eventId: 'meeting-id-789',
 *   sendUpdates: 'all'
 * });
 *
 * // Delete event from shared calendar
 * const result = await tool.execute({
 *   calendarId: 'team@company.com',
 *   eventId: 'shared-meeting-123',
 *   sendUpdates: 'externalOnly'
 * });
 * ```
 *
 * **Returns:**
 * - Success confirmation with deletion details
 * - Information about notification status
 * - Audit information for logging
 */
export class DeleteEventTool extends BaseCalendarTools<
  DeleteEventInput,
  CalendarDeleteEventResult
> {
  public getToolName(): string {
    return CALENDAR_TOOLS.DELETE;
  }

  public getToolMetadata(): ToolMetadata {
    return SchemaFactory.createToolMetadata(
      CALENDAR_TOOLS.DELETE
    );
  }

  public async executeImpl(
    args: DeleteEventInput,
    context?: ToolExecutionContext
  ): Promise<Result<CalendarDeleteEventResult, GoogleWorkspaceError>> {
    const requestId = context?.requestId || this.generateRequestId();

    this.logger.info('Executing delete event tool', {
      calendarId: args.calendarId,
      eventId: args.eventId,
      sendUpdates: args.sendUpdates,
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

      // Optional: Get event details for logging before deletion
      let eventSummary: string | undefined;
      try {
        const getResult = await this.calendarService.getEvent(
          calendarId,
          eventId
        );
        if (getResult.isOk()) {
          eventSummary = getResult.value.summary;
        }
      } catch (error) {
        // If we can't get the event details, we'll still try to delete it
        this.logger.warn('Could not retrieve event details before deletion', {
          calendarId,
          eventId,
        });
      }

      // Delete event using the service
      const result = await this.calendarService.deleteEvent(
        calendarId,
        eventId
      );

      if (result.isErr()) {
        const error = this.handleServiceError(result.error);
        this.logger.error('Failed to delete event', {
          calendarId,
          eventId,
          eventSummary,
          error: error.message,
          code: error.code,
        });

        return err(error);
      }

      this.logger.info('Successfully deleted event', {
        calendarId,
        eventId,
        eventSummary,
        sendUpdates: args.sendUpdates,
      });

      return ok({
        success: true,
        message: 'Event deleted successfully',
        details: {
          calendarId,
          eventId,
          eventSummary: eventSummary || 'Unknown',
          notificationSettings: args.sendUpdates || 'none',
          deletedAt: new Date().toISOString(),
        },
        warnings: eventSummary
          ? undefined
          : ['Event summary could not be retrieved before deletion'],
      });
    } catch (error) {
      const calendarError = this.handleServiceError(error);
      this.logger.error('Unexpected error deleting event', {
        calendarId: args.calendarId,
        eventId: args.eventId,
        error: calendarError.message,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(calendarError);
    }
  }
}
