import { CalendarService } from '../../src/services/calendar.service.js';
import { AuthService } from '../../src/services/auth.service.js';
import type { EnvironmentConfig } from '../../src/types/index.js';
import { google } from 'googleapis';
import { TEST_RETRY_CONFIG } from '../test-config.js';
import { GoogleAuthError } from '../../src/errors/index.js';
import { err, ok } from 'neverthrow';
import type { OAuth2Client } from 'google-auth-library';

// googleapis のモック
jest.mock('googleapis');
const mockGoogle = google as jest.Mocked<typeof google>;

/**
 * Test suite for CalendarService class.
 * 
 * This comprehensive test suite validates:
 * - Service initialization and lifecycle management
 * - All CRUD operations for calendars and events
 * - Error handling for various failure scenarios  
 * - Concurrent initialization prevention and fast path optimization
 * - Integration with AuthService and Google APIs
 * 
 * Test Configuration:
 * - Uses fast retry config (TEST_RETRY_CONFIG) for faster execution
 * - Mocks all external dependencies (Google APIs, AuthService)
 * - 10-second timeout for potentially slow operations
 */
describe('CalendarService', () => {
  let calendarService: CalendarService;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockConfig: EnvironmentConfig;
  let mockCalendarApi: any;
  let mockAuth: any;

  // Extended timeout for tests that might be slow (especially concurrent tests)
  jest.setTimeout(10000);

  beforeEach(() => {
    mockConfig = {
      GOOGLE_SERVICE_ACCOUNT_KEY_PATH: './test-key.json',
      GOOGLE_DRIVE_FOLDER_ID: 'test-folder-id'
    };

    // Google APIs のモック作成
    mockAuth = { /* mock auth object */ };
    mockCalendarApi = {
      calendarList: {
        list: jest.fn(),
        get: jest.fn(),
        insert: jest.fn(),
        delete: jest.fn(),
      },
      calendars: {
        get: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        clear: jest.fn(),
      },
      events: {
        list: jest.fn(),
        get: jest.fn(),
        insert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        quickAdd: jest.fn(),
        move: jest.fn(),
        instances: jest.fn(),
      }
    };

    // googleapis モックの設定
    mockGoogle.calendar = jest.fn().mockReturnValue(mockCalendarApi);

    // AuthService のモック作成 - Result型を返すように修正
    mockAuthService = {
      initialize: jest.fn().mockResolvedValue(ok(undefined)),
      getAuthClient: jest.fn().mockResolvedValue(ok(mockAuth)),
      validateAuth: jest.fn().mockResolvedValue(ok(true)),
      getGoogleAuth: jest.fn().mockResolvedValue(ok(mockAuth)),
    } as any;

    // Use fast retry config for testing to minimize execution time
    calendarService = new CalendarService(mockAuthService, undefined, TEST_RETRY_CONFIG);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    /**
     * Validates basic service instantiation.
     * Ensures the service is properly initialized with required dependencies.
     */
    test('should create instance with AuthService', () => {
      expect(calendarService).toBeInstanceOf(CalendarService);
      expect(calendarService['authService']).toBe(mockAuthService);
    });
  });

  describe('Service Initialization', () => {
    /**
     * Tests the core initialization process.
     * Verifies that Google Calendar API client is properly created with authentication.
     */
    test('should initialize Calendar API', async () => {
      const result = await calendarService.initialize();
      
      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalled();
      expect(mockGoogle.calendar).toHaveBeenCalledWith({ version: 'v3', auth: mockAuth });
    });

    /**
     * Validates that initialization properly sets up internal API client.
     */
    test('should set up calendarApi property', async () => {
      await calendarService.initialize();
      
      expect(calendarService['calendarApi']).toBeDefined();
    });

    /**
     * Tests authentication error handling during initialization.
     */
    test('should handle authentication errors during initialization', async () => {
      const authError = new GoogleAuthError('Invalid credentials', 'service-account');
      mockAuthService.getAuthClient.mockResolvedValue(err(authError));

      const result = await calendarService.initialize();
      
      expect(result.isErr()).toBe(true);
    });

    /**
     * Tests concurrent initialization prevention.
     * Multiple simultaneous calls should result in single initialization.
     */
    test('should prevent concurrent initialization', async () => {
      const promises = [
        calendarService.initialize(),
        calendarService.initialize(),
        calendarService.initialize(),
      ];

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => expect(result.isOk()).toBe(true));
      
      // But auth client should only be called once
      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(1);
    });
  });

  describe('Calendar List Operations', () => {
    /**
     * Tests successful calendar list retrieval.
     */
    test('should return list of calendars', async () => {
      const mockCalendars = {
        items: [
          {
            id: 'calendar1@example.com',
            summary: 'Primary Calendar',
            primary: true,
            accessRole: 'owner',
            colorId: '1',
            backgroundColor: '#ac725e',
            foregroundColor: '#1d1d1d'
          },
          {
            id: 'calendar2@example.com', 
            summary: 'Work Calendar',
            accessRole: 'writer',
            colorId: '2',
            backgroundColor: '#d06b64',
            foregroundColor: '#1d1d1d'
          }
        ]
      };

      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: mockCalendars
      });

      const result = await calendarService.listCalendars();
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([
          {
            id: 'calendar1@example.com',
            summary: 'Primary Calendar',
            primary: true,
            accessRole: 'owner',
            colorId: '1',
            backgroundColor: '#ac725e',
            foregroundColor: '#1d1d1d'
          },
          {
            id: 'calendar2@example.com',
            summary: 'Work Calendar',
            primary: false,
            accessRole: 'writer',
            colorId: '2',
            backgroundColor: '#d06b64',
            foregroundColor: '#1d1d1d'
          }
        ]);
      }
    });

    /**
     * Tests handling of empty calendar list.
     */
    test('should handle empty calendar list', async () => {
      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: { items: [] }
      });
      
      const result = await calendarService.listCalendars();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    /**
     * Tests auto-initialization when accessing calendar list.
     */
    test('should auto-initialize when not initialized', async () => {
      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: { items: [] }
      });
      
      const result = await calendarService.listCalendars();
      expect(result.isOk()).toBe(true);
      expect(mockAuthService.getAuthClient).toHaveBeenCalled();
    });

    /**
     * Tests error handling for calendar list operations.
     */
    test('should handle API errors when listing calendars', async () => {
      const error = new Error('API Error') as Error & { code: number };
      error.code = 403;
      mockCalendarApi.calendarList.list.mockRejectedValue(error);
      
      const result = await calendarService.listCalendars();
      expect(result.isErr()).toBe(true);
    });
  });

  describe('Calendar Information Retrieval', () => {
    /**
     * Tests successful calendar information retrieval.
     */
    test('should return calendar info for valid ID', async () => {
      const calendarId = 'calendar@example.com';
      const mockResponse = {
        data: {
          kind: 'calendar#calendar',
          etag: 'etag-value',
          id: calendarId,
          summary: 'Test Calendar',
          description: 'A test calendar',
          location: 'New York',
          timeZone: 'America/New_York',
          conferenceProperties: {
            allowedConferenceSolutionTypes: ['hangoutsMeet']
          }
        }
      };

      mockCalendarApi.calendars.get.mockResolvedValue(mockResponse);

      const result = await calendarService.getCalendar(calendarId);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          id: calendarId,
          summary: 'Test Calendar',
          description: 'A test calendar',
          location: 'New York',
          timeZone: 'America/New_York',
          kind: 'calendar#calendar',
          etag: 'etag-value',
          conferenceProperties: {
            allowedConferenceSolutionTypes: ['hangoutsMeet']
          }
        });
      }
    });

    /**
     * Tests error handling for invalid calendar ID.
     */
    test('should return error for invalid calendar ID', async () => {
      const invalidId = 'invalid@example.com';
      const error = new Error('Calendar not found') as Error & { code: number };
      error.code = 404;
      mockCalendarApi.calendars.get.mockRejectedValue(error);
      
      const result = await calendarService.getCalendar(invalidId);
      expect(result.isErr()).toBe(true);
    });

    /**
     * Tests validation for empty calendar ID.
     */
    test('should return error for empty calendar ID', async () => {
      const result = await calendarService.getCalendar('');
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toMatch(/Calendar ID cannot be empty/);
      }
    });
  });

  describe('Event List Operations', () => {
    /**
     * Tests successful event list retrieval.
     */
    test('should return list of events for calendar', async () => {
      const calendarId = 'calendar@example.com';
      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'Team Meeting',
            description: 'Weekly team sync',
            start: { dateTime: '2023-12-01T10:00:00-05:00' },
            end: { dateTime: '2023-12-01T11:00:00-05:00' },
            location: 'Conference Room A',
            attendees: [
              { email: 'user1@example.com', responseStatus: 'accepted' },
              { email: 'user2@example.com', responseStatus: 'tentative' }
            ],
            creator: { email: 'organizer@example.com' },
            organizer: { email: 'organizer@example.com' }
          },
          {
            id: 'event2',
            summary: 'Project Review',
            start: { date: '2023-12-02' },
            end: { date: '2023-12-02' }
          }
        ]
      };

      mockCalendarApi.events.list.mockResolvedValue({
        data: mockEvents
      });

      const result = await calendarService.listEvents(calendarId);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([
          {
            id: 'event1',
            summary: 'Team Meeting',
            description: 'Weekly team sync',
            start: { dateTime: '2023-12-01T10:00:00-05:00' },
            end: { dateTime: '2023-12-01T11:00:00-05:00' },
            location: 'Conference Room A',
            attendees: [
              { email: 'user1@example.com', responseStatus: 'accepted' },
              { email: 'user2@example.com', responseStatus: 'tentative' }
            ],
            creator: { email: 'organizer@example.com' },
            organizer: { email: 'organizer@example.com' }
          },
          {
            id: 'event2',
            summary: 'Project Review',
            start: { date: '2023-12-02' },
            end: { date: '2023-12-02' }
          }
        ]);
      }
    });

    /**
     * Tests event list with query parameters.
     */
    test('should support query parameters for event list', async () => {
      const calendarId = 'calendar@example.com';
      const queryParams = {
        timeMin: '2023-12-01T00:00:00Z',
        timeMax: '2023-12-31T23:59:59Z',
        maxResults: 10,
        singleEvents: true,
        orderBy: 'startTime' as const
      };

      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      });

      const result = await calendarService.listEvents(calendarId, queryParams);
      
      expect(result.isOk()).toBe(true);
      expect(mockCalendarApi.events.list).toHaveBeenCalledWith({
        calendarId,
        ...queryParams
      });
    });

    /**
     * Tests handling of empty event list.
     */
    test('should handle empty event list', async () => {
      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      });
      
      const result = await calendarService.listEvents('calendar@example.com');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });
  });

  describe('Event Retrieval Operations', () => {
    /**
     * Tests successful event retrieval.
     */
    test('should return event for valid ID', async () => {
      const calendarId = 'calendar@example.com';
      const eventId = 'event123';
      const mockEvent = {
        id: eventId,
        summary: 'Important Meeting',
        description: 'Quarterly business review',
        start: { dateTime: '2023-12-01T14:00:00-05:00', timeZone: 'America/New_York' },
        end: { dateTime: '2023-12-01T15:30:00-05:00', timeZone: 'America/New_York' },
        location: 'Board Room',
        status: 'confirmed',
        created: '2023-11-01T10:00:00Z',
        updated: '2023-11-15T10:00:00Z',
        creator: { email: 'creator@example.com', displayName: 'John Doe' },
        organizer: { email: 'organizer@example.com', displayName: 'Jane Smith' },
        attendees: [
          { email: 'attendee1@example.com', responseStatus: 'accepted' },
          { email: 'attendee2@example.com', responseStatus: 'needsAction' }
        ],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 60 },
            { method: 'popup', minutes: 10 }
          ]
        }
      };

      mockCalendarApi.events.get.mockResolvedValue({
        data: mockEvent
      });

      const result = await calendarService.getEvent(calendarId, eventId);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(mockEvent);
      }
    });

    /**
     * Tests error handling for invalid event ID.
     */
    test('should return error for invalid event ID', async () => {
      const calendarId = 'calendar@example.com';
      const invalidEventId = 'invalid-event';
      const error = new Error('Event not found') as Error & { code: number };
      error.code = 404;
      mockCalendarApi.events.get.mockRejectedValue(error);
      
      const result = await calendarService.getEvent(calendarId, invalidEventId);
      expect(result.isErr()).toBe(true);
    });

    /**
     * Tests validation for empty parameters.
     */
    test('should return error for empty calendar or event ID', async () => {
      const result1 = await calendarService.getEvent('', 'event-id');
      expect(result1.isErr()).toBe(true);
      
      const result2 = await calendarService.getEvent('calendar-id', '');
      expect(result2.isErr()).toBe(true);
    });
  });

  describe('Event Creation Operations', () => {
    /**
     * Tests successful event creation.
     */
    test('should create new event', async () => {
      const calendarId = 'calendar@example.com';
      const eventData = {
        summary: 'New Meeting',
        description: 'Project kickoff meeting',
        start: { dateTime: '2023-12-15T10:00:00-05:00', timeZone: 'America/New_York' },
        end: { dateTime: '2023-12-15T11:00:00-05:00', timeZone: 'America/New_York' },
        location: 'Conference Room B',
        attendees: [
          { email: 'participant1@example.com' },
          { email: 'participant2@example.com' }
        ]
      };

      const createdEvent = {
        ...eventData,
        id: 'created-event-id',
        status: 'confirmed',
        created: '2023-12-01T10:00:00Z',
        updated: '2023-12-01T10:00:00Z',
        creator: { email: 'creator@example.com' },
        organizer: { email: 'creator@example.com' },
        htmlLink: 'https://calendar.google.com/event?eid=...'
      };

      mockCalendarApi.events.insert.mockResolvedValue({
        data: createdEvent
      });

      const result = await calendarService.createEvent(calendarId, eventData);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(createdEvent);
      }
      
      expect(mockCalendarApi.events.insert).toHaveBeenCalledWith({
        calendarId,
        requestBody: eventData
      });
    });

    /**
     * Tests event creation with minimal data.
     */
    test('should create event with minimal required data', async () => {
      const calendarId = 'calendar@example.com';
      const minimalEvent = {
        summary: 'Quick Meeting',
        start: { dateTime: '2023-12-15T14:00:00-05:00' },
        end: { dateTime: '2023-12-15T14:30:00-05:00' }
      };

      const createdEvent = {
        ...minimalEvent,
        id: 'minimal-event-id',
        status: 'confirmed'
      };

      mockCalendarApi.events.insert.mockResolvedValue({
        data: createdEvent
      });

      const result = await calendarService.createEvent(calendarId, minimalEvent);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.id).toBe('minimal-event-id');
        expect(result.value.summary).toBe('Quick Meeting');
      }
    });

    /**
     * Tests validation for event creation parameters.
     */
    test('should validate event creation parameters', async () => {
      const result1 = await calendarService.createEvent('', { summary: 'Test' });
      expect(result1.isErr()).toBe(true);
      
      const result2 = await calendarService.createEvent('calendar@example.com', {} as any);
      expect(result2.isErr()).toBe(true);
    });
  });

  describe('Event Update Operations', () => {
    /**
     * Tests successful event update.
     */
    test('should update existing event', async () => {
      const calendarId = 'calendar@example.com';
      const eventId = 'event-to-update';
      const updateData = {
        summary: 'Updated Meeting Title',
        description: 'Updated meeting description',
        location: 'New Location'
      };

      const updatedEvent = {
        id: eventId,
        summary: 'Updated Meeting Title',
        description: 'Updated meeting description',
        location: 'New Location',
        start: { dateTime: '2023-12-15T10:00:00-05:00' },
        end: { dateTime: '2023-12-15T11:00:00-05:00' },
        updated: '2023-12-01T15:00:00Z'
      };

      mockCalendarApi.events.update.mockResolvedValue({
        data: updatedEvent
      });

      const result = await calendarService.updateEvent(calendarId, eventId, updateData);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(updatedEvent);
      }
      
      expect(mockCalendarApi.events.update).toHaveBeenCalledWith({
        calendarId,
        eventId,
        requestBody: updateData
      });
    });

    /**
     * Tests validation for event update parameters.
     */
    test('should validate event update parameters', async () => {
      const result1 = await calendarService.updateEvent('', 'event-id', {});
      expect(result1.isErr()).toBe(true);
      
      const result2 = await calendarService.updateEvent('calendar-id', '', {});
      expect(result2.isErr()).toBe(true);
    });
  });

  describe('Event Deletion Operations', () => {
    /**
     * Tests successful event deletion.
     */
    test('should delete event', async () => {
      const calendarId = 'calendar@example.com';
      const eventId = 'event-to-delete';

      mockCalendarApi.events.delete.mockResolvedValue({
        data: {} // Delete typically returns empty response
      });

      const result = await calendarService.deleteEvent(calendarId, eventId);
      
      expect(result.isOk()).toBe(true);
      expect(mockCalendarApi.events.delete).toHaveBeenCalledWith({
        calendarId,
        eventId
      });
    });

    /**
     * Tests validation for event deletion parameters.
     */
    test('should validate event deletion parameters', async () => {
      const result1 = await calendarService.deleteEvent('', 'event-id');
      expect(result1.isErr()).toBe(true);
      
      const result2 = await calendarService.deleteEvent('calendar-id', '');
      expect(result2.isErr()).toBe(true);
    });

    /**
     * Tests error handling for non-existent event deletion.
     */
    test('should handle deletion of non-existent event', async () => {
      const error = new Error('Event not found') as Error & { code: number };
      error.code = 404;
      mockCalendarApi.events.delete.mockRejectedValue(error);
      
      const result = await calendarService.deleteEvent('calendar@example.com', 'non-existent-event');
      expect(result.isErr()).toBe(true);
    });
  });

  describe('Quick Add Operations', () => {
    /**
     * Tests successful quick add operation.
     */
    test('should create event via quick add', async () => {
      const calendarId = 'calendar@example.com';
      const text = 'Meeting tomorrow at 2pm with John';

      const createdEvent = {
        id: 'quick-add-event-id',
        summary: 'Meeting with John',
        start: { dateTime: '2023-12-02T14:00:00-05:00' },
        end: { dateTime: '2023-12-02T15:00:00-05:00' },
        status: 'confirmed'
      };

      mockCalendarApi.events.quickAdd.mockResolvedValue({
        data: createdEvent
      });

      const result = await calendarService.quickAdd(calendarId, text);
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(createdEvent);
      }
      
      expect(mockCalendarApi.events.quickAdd).toHaveBeenCalledWith({
        calendarId,
        text
      });
    });

    /**
     * Tests validation for quick add parameters.
     */
    test('should validate quick add parameters', async () => {
      const result1 = await calendarService.quickAdd('', 'text');
      expect(result1.isErr()).toBe(true);
      
      const result2 = await calendarService.quickAdd('calendar-id', '');
      expect(result2.isErr()).toBe(true);
    });
  });

  describe('Health Check Operations', () => {
    /**
     * Tests successful health check.
     */
    test('should pass health check when API is accessible', async () => {
      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: { items: [] }
      });

      const result = await calendarService.healthCheck();
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toBe(true);
      }
    });

    /**
     * Tests health check failure when API is not accessible.
     */
    test('should fail health check when API is not accessible', async () => {
      const error = new Error('Service unavailable') as Error & { code: number };
      error.code = 503;
      mockCalendarApi.calendarList.list.mockRejectedValue(error);

      const result = await calendarService.healthCheck();
      
      expect(result.isErr()).toBe(true);
    });
  });

  describe('Service Statistics', () => {
    /**
     * Tests service statistics retrieval.
     */
    test('should return service statistics', async () => {
      const result = await calendarService.getServiceStats();
      
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual({
          initialized: expect.any(Boolean),
          apiVersions: {
            calendar: 'v3'
          },
          authStatus: expect.any(Boolean)
        });
      }
    });
  });

  describe('Error Handling', () => {
    /**
     * Tests generic API error handling.
     */
    test('should handle generic API errors', async () => {
      const error = new Error('Generic API Error');
      mockCalendarApi.calendarList.list.mockRejectedValue(error);

      const result = await calendarService.listCalendars();
      
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('Generic API Error');
      }
    });

    /**
     * Tests rate limit error handling.
     */
    test('should handle rate limit errors with retry', async () => {
      const rateLimitError = new Error('Rate limit exceeded') as Error & { code: number };
      rateLimitError.code = 429;
      
      mockCalendarApi.calendarList.list
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({ data: { items: [] } });

      const result = await calendarService.listCalendars();
      
      expect(result.isOk()).toBe(true);
      expect(mockCalendarApi.calendarList.list).toHaveBeenCalledTimes(2);
    });

    /**
     * Tests quota exceeded error handling.
     */
    test('should handle quota exceeded errors', async () => {
      const quotaError = new Error('Quota exceeded') as Error & { code: number };
      quotaError.code = 403;
      mockCalendarApi.calendarList.list.mockRejectedValue(quotaError);

      const result = await calendarService.listCalendars();
      
      expect(result.isErr()).toBe(true);
    });
  });

  describe('Concurrent Operations', () => {
    /**
     * Tests concurrent access to service methods.
     */
    test('should handle concurrent operations safely', async () => {
      mockCalendarApi.calendarList.list.mockResolvedValue({
        data: { items: [] }
      });
      mockCalendarApi.events.list.mockResolvedValue({
        data: { items: [] }
      });

      const promises = [
        calendarService.listCalendars(),
        calendarService.listEvents('calendar@example.com'),
        calendarService.listCalendars(),
      ];

      const results = await Promise.all(promises);

      results.forEach(result => expect(result.isOk()).toBe(true));
      
      // Should only initialize once despite multiple concurrent calls
      expect(mockAuthService.getAuthClient).toHaveBeenCalledTimes(1);
    });
  });
});