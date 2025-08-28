/**
 * Google Calendar API Service Implementation
 *
 * This service provides comprehensive Google Calendar API functionality following TDD principles.
 * It extends the GoogleService base class to inherit retry/backoff, timeout handling,
 * and error management capabilities.
 *
 * Features:
 * - Complete Calendar API operations (list, get, create, update, delete events)
 * - Concurrent initialization prevention with fast path optimization
 * - Comprehensive error handling with Calendar-specific error types
 * - Retry logic for transient failures
 * - Health checks and service statistics
 * - Full TypeScript support with detailed interfaces
 *
 * Architecture:
 * - Extends GoogleService for common Google API patterns
 * - Uses Result<T, E> pattern with neverthrow for error handling
 * - Implements concurrent-safe initialization with Promise sharing
 * - Provides both individual and batch operations
 */

import { calendar_v3, google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import type { Logger } from '../utils/logger.js';
import { createServiceLogger } from '../utils/logger.js';
import {
  GoogleService,
  type GoogleServiceRetryConfig,
} from './base/google-service.js';
import { AuthService } from './auth.service.js';
import {
  GoogleCalendarError,
  GoogleCalendarResult,
  GoogleErrorFactory,
  GoogleWorkspaceResult,
  calendarErr,
  calendarOk,
  googleErr,
  googleOk,
} from '../errors/index.js';
import type {
  CalendarInfo,
  CalendarListEntry,
  CalendarEvent,
  EventListOptions,
} from '../types/index.js';

/**
 * Google Calendar Service
 *
 * Provides comprehensive access to Google Calendar API with enterprise-grade
 * error handling, retry logic, and concurrent operation safety.
 */
export class CalendarService extends GoogleService {
  private authService: AuthService;
  private calendarApi?: calendar_v3.Calendar;

  /** Internal flag indicating whether the service has been successfully initialized */
  private isInitialized: boolean = false;

  /**
   * Promise tracking ongoing initialization to prevent concurrent initialization attempts.
   * This ensures that multiple simultaneous calls to initialize() or ensureInitialized()
   * will only result in a single actual initialization process.
   */
  private initializingPromise: Promise<GoogleWorkspaceResult<void>> | null =
    null;

  /**
   * Creates a new CalendarService instance.
   *
   * @param authService - The authentication service for Google API credentials
   * @param logger - Optional custom logger instance. If not provided, creates a service-specific logger
   * @param retryConfig - Optional retry configuration. If not provided, uses default retry settings
   *
   * @example
   * ```typescript
   * // Basic usage
   * const service = new CalendarService(authService);
   *
   * // With custom logger and retry config
   * const service = new CalendarService(authService, customLogger, {
   *   maxAttempts: 3,
   *   baseDelay: 1000,
   *   maxDelay: 30000
   * });
   * ```
   */
  constructor(
    authService: AuthService,
    logger?: Logger,
    retryConfig?: GoogleServiceRetryConfig
  ) {
    const serviceLogger = logger || createServiceLogger('calendar-service');
    super(new OAuth2Client(), serviceLogger, retryConfig); // Temporary client, will be replaced
    this.authService = authService;
  }

  public getServiceName(): string {
    return 'CalendarService';
  }

  public getServiceVersion(): string {
    return 'v3';
  }

  /**
   * Initializes the Calendar service with Google API client.
   *
   * This method handles concurrent initialization attempts safely. Multiple simultaneous
   * calls will result in only one actual initialization process, with all callers
   * receiving the same result.
   *
   * **Concurrency Safety**: Uses initializingPromise to prevent race conditions during
   * initialization. If already initialized, returns immediately with success.
   *
   * **Performance**: Fast path execution for already initialized instances (< 1ms).
   *
   * @returns Promise resolving to success or error result
   *
   * @example
   * ```typescript
   * // Safe to call multiple times
   * const results = await Promise.all([
   *   service.initialize(),
   *   service.initialize(),
   *   service.initialize()
   * ]);
   * // Only one actual initialization occurs
   * ```
   */
  public async initialize(): Promise<GoogleWorkspaceResult<void>> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.calendarApi) {
      return googleOk(undefined);
    }

    // Wait for existing initialization if in progress
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    // Start new initialization process
    const context = this.createContext('initialize');

    this.initializingPromise = this.executeWithRetry(async () => {
      try {
        // Get authenticated client from AuthService
        const authResult = await this.authService.getAuthClient();
        if (authResult.isErr()) {
          throw authResult.error;
        }

        const authClient = authResult.value;
        if (!authClient) {
          throw new Error('AuthService returned null/undefined auth client');
        }

        // Replace the temporary auth client in base class
        (this.auth as OAuth2Client) = authClient;

        // Create Google Calendar API instance with error handling
        try {
          this.calendarApi = google.calendar({
            version: 'v3',
            auth: authClient,
          });
        } catch (apiError) {
          throw new Error(
            `Failed to create Google Calendar API client: ${apiError instanceof Error ? apiError.message : String(apiError)}`
          );
        }

        // Validate API client was created successfully
        if (!this.calendarApi) {
          throw new Error(
            'Failed to initialize Google Calendar API client - client is null'
          );
        }

        this.isInitialized = true;

        this.logger.info('Calendar service initialized successfully', {
          service: this.getServiceName(),
          version: this.getServiceVersion(),
        });
      } catch (error) {
        // Reset initialization state on any error
        this.isInitialized = false;
        this.calendarApi = undefined;
        throw error;
      }
    }, context);

    try {
      return await this.initializingPromise;
    } catch (error) {
      // Clear the promise on error to allow retry
      this.initializingPromise = null;
      throw error;
    } finally {
      // Clear the promise on success
      this.initializingPromise = null;
    }
  }

  /**
   * Performs a health check to verify the Calendar service is operational.
   *
   * This method tests basic API connectivity by attempting to list calendar entries.
   * It ensures the service is properly initialized and can communicate with Google APIs.
   *
   * @returns Promise resolving to true if healthy, or an error result
   *
   * @example
   * ```typescript
   * const healthResult = await service.healthCheck();
   * if (healthResult.isOk()) {
   *   console.log('Service is healthy');
   * } else {
   *   console.error('Service health check failed:', healthResult.error);
   * }
   * ```
   */
  public async healthCheck(): Promise<GoogleWorkspaceResult<boolean>> {
    const context = this.createContext('healthCheck');

    try {
      // Ensure service is initialized
      await this.ensureInitialized();

      // Test basic operation - list calendar entries to verify API access
      if (!this.calendarApi) {
        return googleErr(
          new GoogleCalendarError(
            'Calendar API not available',
            'GOOGLE_CALENDAR_API_UNAVAILABLE',
            500
          )
        );
      }

      await this.calendarApi.calendarList.list({
        maxResults: 1,
      });

      this.logger.info('Calendar health check passed', {
        service: this.getServiceName(),
        requestId: context.requestId,
      });

      return googleOk(true);
    } catch (error) {
      const calendarError = this.convertToCalendarError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Calendar health check failed', {
        error: calendarError.toJSON(),
        requestId: context.requestId,
      });

      return googleErr(calendarError);
    }
  }

  /**
   * Ensures the service is initialized before API operations.
   *
   * This is a critical performance optimization method that:
   * 1. **Fast Path**: Returns immediately if already initialized (< 1ms execution)
   * 2. **Concurrency Protection**: Reuses existing initialization promise if in progress
   * 3. **Lazy Initialization**: Starts new initialization only when needed
   *
   * **Thread Safety**: Multiple concurrent calls are safe and efficient.
   * Only one initialization will occur regardless of the number of concurrent calls.
   *
   * **Error Handling**: Throws the underlying error if initialization fails,
   * allowing callers to handle the error appropriately.
   *
   * @throws {GoogleCalendarError} When initialization fails
   *
   * @example
   * ```typescript
   * // Called internally by all public methods
   * // Multiple concurrent calls are safe:
   * await Promise.all([
   *   service.listCalendars(),    // triggers ensureInitialized
   *   service.listEvents(...),   // reuses same initialization
   *   service.getCalendar(...)   // waits for same initialization
   * ]);
   * ```
   */
  private async ensureInitialized(): Promise<void> {
    // Fast path: return immediately if already initialized
    if (this.isInitialized && this.calendarApi) {
      return;
    }

    // Wait for existing initialization if in progress
    if (this.initializingPromise) {
      const result = await this.initializingPromise;
      if (result.isErr()) {
        const error = result.error;
        this.logger.error('Initialization failed in ensureInitialized', {
          error: error.message,
          code: error.code,
        });
        throw result.error;
      }
      return;
    }

    // Start new initialization
    this.initializingPromise = this.initialize();
    try {
      const result = await this.initializingPromise;
      if (result.isErr()) {
        const error = result.error;
        this.logger.error('Direct initialization failed in ensureInitialized', {
          error: error.message,
          code: error.code,
        });
        throw result.error;
      }
    } catch (error) {
      // Clear initialization promise on any error
      this.initializingPromise = null;
      throw error;
    } finally {
      // Clear initialization promise on success
      this.initializingPromise = null;
    }
  }

  /**
   * Lists all calendars accessible to the authenticated user.
   *
   * This method queries the Google Calendar API to find all calendar entries
   * and returns basic information about each one.
   *
   * **Auto-initialization**: Automatically initializes the service if needed.
   *
   * @returns Promise resolving to array of calendar information or error
   *
   * @example
   * ```typescript
   * const result = await service.listCalendars();
   * if (result.isOk()) {
   *   result.value.forEach(cal => {
   *     console.log(`${cal.summary}: ${cal.id}`);
   *   });
   * }
   * ```
   */
  public async listCalendars(): Promise<
    GoogleCalendarResult<CalendarListEntry[]>
  > {
    const context = this.createContext('listCalendars');

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500
        );
      }

      const response = await this.calendarApi.calendarList.list();

      const calendars: CalendarListEntry[] =
        response.data.items?.map(
          (item): CalendarListEntry => ({
            id: item.id || '',
            summary: item.summary || '',
            description: item.description || undefined,
            location: item.location || undefined,
            timeZone: item.timeZone || undefined,
            primary: item.primary || false,
            accessRole: item.accessRole || undefined,
            colorId: item.colorId || undefined,
            backgroundColor: item.backgroundColor || undefined,
            foregroundColor: item.foregroundColor || undefined,
            selected: item.selected || undefined,
            deleted: item.deleted || undefined,
          })
        ) || [];

      this.logger.debug(`Listed ${calendars.length} calendars`, {
        count: calendars.length,
        requestId: context.requestId,
      });

      return calendars;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Retrieves detailed information about a specific calendar.
   *
   * @param calendarId - The unique identifier of the calendar
   * @returns Promise resolving to calendar information or error
   *
   * @example
   * ```typescript
   * const result = await service.getCalendar('primary');
   * if (result.isOk()) {
   *   console.log(`Calendar: ${result.value.summary}`);
   * }
   * ```
   */
  public async getCalendar(
    calendarId: string
  ): Promise<GoogleCalendarResult<CalendarInfo>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    const context = this.createContext('getCalendar', { calendarId });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId
        );
      }

      const response = await this.calendarApi.calendars.get({
        calendarId,
      });

      const info: CalendarInfo = {
        id: response.data.id || calendarId,
        summary: response.data.summary || 'Unknown',
        description: response.data.description || undefined,
        location: response.data.location || undefined,
        timeZone: response.data.timeZone || undefined,
        kind: response.data.kind || undefined,
        etag: response.data.etag || undefined,
        conferenceProperties: response.data.conferenceProperties
          ? {
              allowedConferenceSolutionTypes:
                response.data.conferenceProperties
                  .allowedConferenceSolutionTypes || undefined,
            }
          : undefined,
      };

      this.logger.debug('Retrieved calendar info', {
        calendarId,
        summary: info.summary,
        requestId: context.requestId,
      });

      return info;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Lists events from a specific calendar.
   *
   * **Event Filtering**: Supports comprehensive query parameters for filtering events.
   * **Auto-initialization**: Automatically initializes the service if needed.
   *
   * @param calendarId - The unique identifier of the calendar
   * @param options - Optional query parameters for filtering events
   * @returns Promise resolving to array of events or error
   *
   * @example
   * ```typescript
   * const result = await service.listEvents('primary', {
   *   timeMin: '2023-12-01T00:00:00Z',
   *   maxResults: 10,
   *   singleEvents: true,
   *   orderBy: 'startTime'
   * });
   * if (result.isOk()) {
   *   result.value.forEach(event => {
   *     console.log(`${event.summary}: ${event.start?.dateTime || event.start?.date}`);
   *   });
   * }
   * ```
   */
  public async listEvents(
    calendarId: string,
    options?: EventListOptions
  ): Promise<GoogleCalendarResult<CalendarEvent[]>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    const context = this.createContext('listEvents', { calendarId, options });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId
        );
      }

      const requestParams: any = {
        calendarId,
        ...options,
      };

      const response = await this.calendarApi.events.list(requestParams);

      const events: CalendarEvent[] = (response.data.items ||
        []) as CalendarEvent[];

      this.logger.debug(`Listed ${events.length} events`, {
        calendarId,
        count: events.length,
        requestId: context.requestId,
      });

      return events;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Retrieves a specific event from a calendar.
   *
   * @param calendarId - The unique identifier of the calendar
   * @param eventId - The unique identifier of the event
   * @returns Promise resolving to event details or error
   *
   * @example
   * ```typescript
   * const result = await service.getEvent('primary', 'event123');
   * if (result.isOk()) {
   *   console.log(`Event: ${result.value.summary}`);
   * }
   * ```
   */
  public async getEvent(
    calendarId: string,
    eventId: string
  ): Promise<GoogleCalendarResult<CalendarEvent>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    if (!eventId || eventId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Event ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_EVENT_ID',
          400,
          calendarId,
          eventId
        )
      );
    }

    const context = this.createContext('getEvent', { calendarId, eventId });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId,
          eventId
        );
      }

      const response = await this.calendarApi.events.get({
        calendarId,
        eventId,
      });

      const event = response.data as CalendarEvent;

      this.logger.debug('Retrieved event', {
        calendarId,
        eventId,
        summary: event.summary,
        requestId: context.requestId,
      });

      return event;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Creates a new event in the specified calendar.
   *
   * **Event Validation**: Validates event data before creation.
   * **Auto-initialization**: Automatically initializes the service if needed.
   *
   * @param calendarId - The unique identifier of the calendar
   * @param eventData - Event data to create
   * @returns Promise resolving to created event or error
   *
   * @example
   * ```typescript
   * const result = await service.createEvent('primary', {
   *   summary: 'Team Meeting',
   *   start: { dateTime: '2023-12-15T10:00:00-05:00' },
   *   end: { dateTime: '2023-12-15T11:00:00-05:00' },
   *   attendees: [{ email: 'colleague@example.com' }]
   * });
   * if (result.isOk()) {
   *   console.log(`Created event: ${result.value.htmlLink}`);
   * }
   * ```
   */
  public async createEvent(
    calendarId: string,
    eventData: Partial<CalendarEvent>
  ): Promise<GoogleCalendarResult<CalendarEvent>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    if (!eventData || Object.keys(eventData).length === 0) {
      return calendarErr(
        new GoogleCalendarError(
          'Event data cannot be empty',
          'GOOGLE_CALENDAR_INVALID_EVENT_DATA',
          400,
          calendarId
        )
      );
    }

    const context = this.createContext('createEvent', {
      calendarId,
      eventData,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId
        );
      }

      const response = await this.calendarApi.events.insert({
        calendarId,
        requestBody: eventData,
      });

      const createdEvent = response.data as CalendarEvent;

      this.logger.info('Successfully created event', {
        calendarId,
        eventId: createdEvent.id,
        summary: createdEvent.summary,
        requestId: context.requestId,
      });

      return createdEvent;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Updates an existing event in the specified calendar.
   *
   * @param calendarId - The unique identifier of the calendar
   * @param eventId - The unique identifier of the event to update
   * @param eventData - Updated event data
   * @returns Promise resolving to updated event or error
   *
   * @example
   * ```typescript
   * const result = await service.updateEvent('primary', 'event123', {
   *   summary: 'Updated Meeting Title',
   *   location: 'New Conference Room'
   * });
   * if (result.isOk()) {
   *   console.log(`Updated event: ${result.value.summary}`);
   * }
   * ```
   */
  public async updateEvent(
    calendarId: string,
    eventId: string,
    eventData: Partial<CalendarEvent>
  ): Promise<GoogleCalendarResult<CalendarEvent>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    if (!eventId || eventId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Event ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_EVENT_ID',
          400,
          calendarId,
          eventId
        )
      );
    }

    const context = this.createContext('updateEvent', {
      calendarId,
      eventId,
      eventData,
    });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId,
          eventId
        );
      }

      const response = await this.calendarApi.events.update({
        calendarId,
        eventId,
        requestBody: eventData,
      });

      const updatedEvent = response.data as CalendarEvent;

      this.logger.info('Successfully updated event', {
        calendarId,
        eventId,
        summary: updatedEvent.summary,
        requestId: context.requestId,
      });

      return updatedEvent;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Deletes an event from the specified calendar.
   *
   * @param calendarId - The unique identifier of the calendar
   * @param eventId - The unique identifier of the event to delete
   * @returns Promise resolving to success or error
   *
   * @example
   * ```typescript
   * const result = await service.deleteEvent('primary', 'event123');
   * if (result.isOk()) {
   *   console.log('Event deleted successfully');
   * }
   * ```
   */
  public async deleteEvent(
    calendarId: string,
    eventId: string
  ): Promise<GoogleCalendarResult<void>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    if (!eventId || eventId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Event ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_EVENT_ID',
          400,
          calendarId,
          eventId
        )
      );
    }

    const context = this.createContext('deleteEvent', { calendarId, eventId });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId,
          eventId
        );
      }

      await this.calendarApi.events.delete({
        calendarId,
        eventId,
      });

      this.logger.info('Successfully deleted event', {
        calendarId,
        eventId,
        requestId: context.requestId,
      });
    }, context).andThen(() => calendarOk(undefined));
  }

  /**
   * Creates an event using natural language text (Quick Add).
   *
   * This method uses Google's intelligent parsing to create events from
   * natural language descriptions.
   *
   * @param calendarId - The unique identifier of the calendar
   * @param text - Natural language description of the event
   * @returns Promise resolving to created event or error
   *
   * @example
   * ```typescript
   * const result = await service.quickAdd('primary', 'Meeting tomorrow at 2pm with John');
   * if (result.isOk()) {
   *   console.log(`Created event: ${result.value.summary}`);
   * }
   * ```
   */
  public async quickAdd(
    calendarId: string,
    text: string
  ): Promise<GoogleCalendarResult<CalendarEvent>> {
    // Input validation
    if (!calendarId || calendarId.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Calendar ID cannot be empty',
          'GOOGLE_CALENDAR_INVALID_ID',
          400,
          calendarId
        )
      );
    }

    if (!text || text.trim() === '') {
      return calendarErr(
        new GoogleCalendarError(
          'Quick add text cannot be empty',
          'GOOGLE_CALENDAR_INVALID_QUICK_ADD_TEXT',
          400,
          calendarId
        )
      );
    }

    const context = this.createContext('quickAdd', { calendarId, text });

    return this.executeAsyncWithRetry(async () => {
      await this.ensureInitialized();

      if (!this.calendarApi) {
        throw new GoogleCalendarError(
          'Calendar API not initialized',
          'GOOGLE_CALENDAR_NOT_INITIALIZED',
          500,
          calendarId
        );
      }

      const response = await this.calendarApi.events.quickAdd({
        calendarId,
        text,
      });

      const createdEvent = response.data as CalendarEvent;

      this.logger.info('Successfully created event via Quick Add', {
        calendarId,
        eventId: createdEvent.id,
        summary: createdEvent.summary,
        quickAddText: text,
        requestId: context.requestId,
      });

      return createdEvent;
    }, context).andThen(result => calendarOk(result));
  }

  /**
   * Converts generic errors to Google Calendar-specific error types.
   *
   * This method is called by the base class retry mechanism to transform
   * generic errors into domain-specific error types with appropriate
   * error codes and context information.
   *
   * @param error - The generic error to convert
   * @param context - Additional context including calendar ID and event ID
   * @returns Converted GoogleCalendarError or null if not convertible
   *
   * @internal
   */
  protected convertServiceSpecificError(
    error: Error,
    context: { data?: { calendarId?: string; eventId?: string } }
  ): GoogleCalendarError | null {
    return this.convertToCalendarError(
      error,
      context.data?.calendarId,
      context.data?.eventId
    );
  }

  /**
   * Converts a generic error to a GoogleCalendarError with context.
   *
   * This helper method uses the GoogleErrorFactory to create appropriate
   * error types based on the error characteristics and provided context.
   *
   * @param error - The error to convert
   * @param calendarId - Optional calendar ID for context
   * @param eventId - Optional event ID for context
   * @returns GoogleCalendarError with appropriate type and context
   *
   * @internal
   */
  private convertToCalendarError(
    error: Error,
    calendarId?: string,
    eventId?: string
  ): GoogleCalendarError {
    return GoogleErrorFactory.createCalendarError(error, calendarId, eventId);
  }

  /**
   * Retrieves current service statistics and status information.
   *
   * Provides diagnostic information about the service state including:
   * - Initialization status
   * - API version information
   * - Authentication status
   *
   * **Use Case**: Primarily for monitoring, debugging, and health checks.
   *
   * @returns Promise resolving to service statistics or error
   *
   * @example
   * ```typescript
   * const result = await service.getServiceStats();
   * if (result.isOk()) {
   *   console.log(`Initialized: ${result.value.initialized}`);
   *   console.log(`Auth OK: ${result.value.authStatus}`);
   * }
   * ```
   */
  public async getServiceStats(): Promise<
    GoogleCalendarResult<{
      initialized: boolean;
      apiVersions: {
        calendar: string;
      };
      authStatus: boolean;
    }>
  > {
    const context = this.createContext('getServiceStats');

    try {
      const authStatus = await this.validateAuthentication();

      return calendarOk({
        initialized: this.isInitialized,
        apiVersions: {
          calendar: this.getServiceVersion(),
        },
        authStatus: authStatus.isOk(),
      });
    } catch (error) {
      const calendarError = this.convertToCalendarError(
        error instanceof Error ? error : new Error(String(error))
      );

      this.logger.error('Failed to get service stats', {
        error: calendarError.toJSON(),
        requestId: context.requestId,
      });

      return calendarErr(calendarError);
    }
  }
}
