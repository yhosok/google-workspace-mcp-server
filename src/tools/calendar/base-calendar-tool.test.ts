import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { ok, err, Result } from 'neverthrow';
import { googleOk, googleErr } from '../../errors/index.js';
import { z } from 'zod';
import { BaseCalendarTools } from './base-calendar-tool.js';
import { CalendarService } from '../../services/calendar.service.js';
import { AuthService } from '../../services/auth.service.js';
import { AccessControlService } from '../../services/access-control.service.js';
import { Logger } from '../../utils/logger.js';
import {
  GoogleWorkspaceError,
  GoogleAuthError,
  GoogleCalendarError,
  GoogleCalendarInvalidOperationError,
  GoogleAccessControlError,
  GoogleAccessControlReadOnlyError,
  GoogleAccessControlToolError,
  GoogleAccessControlServiceError,
  GoogleAccessControlFolderError,
} from '../../errors/index.js';
import { validateToolInput } from '../../utils/validation.utils.js';
import type { ToolMetadata } from '../base/tool-registry.js';

// Mock dependencies
jest.mock('../../services/calendar.service');
jest.mock('../../services/auth.service');
jest.mock('../../services/access-control.service');
jest.mock('../../utils/validation.utils');

// Concrete implementation for testing
class TestCalendarTools extends BaseCalendarTools<
  { test: string },
  { result: string }
> {
  getToolName(): string {
    return 'test-calendar-tool';
  }

  getToolMetadata(): ToolMetadata {
    return {
      title: 'Test Calendar Tool',
      description: 'A test tool for BaseCalendarTools',
      inputSchema: {
        test: z.string(),
      },
    };
  }

  async executeImpl(input: {
    test: string;
  }): Promise<Result<{ result: string }, GoogleWorkspaceError>> {
    return ok({ result: input.test });
  }
}

describe('BaseCalendarTools', () => {
  let testTool: TestCalendarTools;
  let mockCalendarService: jest.Mocked<CalendarService>;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockAccessControlService: jest.Mocked<AccessControlService>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    mockCalendarService = new CalendarService(
      {} as any,
      {} as any
    ) as jest.Mocked<CalendarService>;
    mockAuthService = new AuthService({} as any) as jest.Mocked<AuthService>;
    mockAccessControlService = new AccessControlService(
      {} as any,
      {} as any
    ) as jest.Mocked<AccessControlService>;
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
      addContext: jest.fn(),
      fatal: jest.fn(),
      startTimer: jest.fn(),
      endTimer: jest.fn(),
      measureAsync: jest.fn(),
      measure: jest.fn(),
      logOperation: jest.fn(),
      forOperation: jest.fn().mockReturnThis(),
      generateRequestId: jest.fn().mockReturnValue('test-request-id'),
      isLevelEnabled: jest.fn().mockReturnValue(true),
      getConfig: jest.fn(),
      updateConfig: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    testTool = new TestCalendarTools(mockCalendarService, mockAuthService, mockLogger);

    // Setup access control service mocks with default behavior
    // @ts-ignore - Mocking access control service methods
    mockAccessControlService.validateAccess = jest.fn().mockResolvedValue(googleOk(undefined));
    // @ts-ignore - Mocking access control service methods
    mockAccessControlService.getAccessControlSummary = jest.fn().mockReturnValue({
      readOnlyMode: false,
      hasRestrictions: false,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Constructor and Basic Properties', () => {
    it('should initialize with required services', () => {
      expect(testTool).toBeDefined();
      expect(testTool.getToolName()).toBe('test-calendar-tool');
    });

    it('should have access to calendarService and authService', () => {
      expect((testTool as any).calendarService).toBe(mockCalendarService);
      expect((testTool as any).authService).toBe(mockAuthService);
    });
  });

  describe('validateWithSchema', () => {
    const mockSchema = z.object({
      calendarId: z.string(),
      eventId: z.string(),
      summary: z.string().optional(),
    });

    beforeEach(() => {
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockClear();
    });

    it('should exist and be callable', () => {
      expect(typeof (testTool as any).validateWithSchema).toBe('function');
    });

    it('should use validateToolInput utility for validation', () => {
      const testData = { calendarId: 'cal123', eventId: 'event456' };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(validateToolInput).toHaveBeenCalledWith(mockSchema, testData);
      expect(result).toBe(mockResult);
    });

    it('should return success result for valid data', () => {
      const testData = {
        calendarId: 'cal123',
        eventId: 'event456',
        summary: 'Test Event',
      };
      const mockResult = ok(testData);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual(testData);
    });

    it('should return error result for invalid data', () => {
      const testData = { invalid: 'data' };
      const mockError = new GoogleCalendarError(
        'Validation failed',
        'VALIDATION_ERROR',
        400
      );
      const mockResult = err(mockError);
      (
        validateToolInput as jest.MockedFunction<typeof validateToolInput>
      ).mockReturnValue(mockResult);

      const result = (testTool as any).validateWithSchema(mockSchema, testData);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toBe(mockError);
    });
  });

  describe('handleServiceError', () => {
    it('should exist and be callable', () => {
      expect(typeof (testTool as any).handleServiceError).toBe('function');
    });

    it('should pass through GoogleCalendarError unchanged', () => {
      const calendarError = new GoogleCalendarError(
        'Test error',
        'GOOGLE_CALENDAR_TEST_ERROR',
        400,
        'cal123',
        'event456'
      );

      const result = (testTool as any).handleServiceError(calendarError);

      expect(result).toBe(calendarError);
    });

    it('should convert GoogleAuthError to GoogleCalendarError', () => {
      const authError = new GoogleAuthError('Auth failed', 'oauth2');

      const result = (testTool as any).handleServiceError(authError);

      expect(result).toBeInstanceOf(GoogleCalendarError);
      expect(result.message).toContain('Auth failed');
      expect(result.errorCode).toBe('GOOGLE_CALENDAR_AUTH_ERROR');
      expect(result.context?.originalError).toBe(authError);
    });

    it('should convert GoogleWorkspaceError to GoogleCalendarError', () => {
      const workspaceError = new GoogleCalendarError(
        'Workspace error',
        'GOOGLE_CALENDAR_SERVICE_ERROR',
        500
      );

      const result = (testTool as any).handleServiceError(workspaceError);

      expect(result).toBeInstanceOf(GoogleCalendarError);
      expect(result.message).toContain('Workspace error');
      expect(result.errorCode).toBe('GOOGLE_CALENDAR_SERVICE_ERROR');
      expect(result.context?.originalError).toBe(workspaceError);
    });

    it('should convert generic Error to GoogleCalendarError', () => {
      const genericError = new Error('Generic error');

      const result = (testTool as any).handleServiceError(genericError);

      expect(result).toBeInstanceOf(GoogleCalendarError);
      expect(result.message).toContain('Generic error');
      expect(result.errorCode).toBe('GOOGLE_CALENDAR_UNKNOWN_ERROR');
    });
  });

  describe('validateCalendarId', () => {
    it('should exist and be callable', () => {
      expect(typeof (testTool as any).validateCalendarId).toBe('function');
    });

    it('should validate correct calendar ID', () => {
      const validCalendarId = 'user@example.com';

      const result = (testTool as any).validateCalendarId(validCalendarId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validCalendarId);
    });

    it('should reject empty calendar ID', () => {
      const result = (testTool as any).validateCalendarId('');

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleCalendarInvalidOperationError);
      expect(error.message).toContain('Calendar ID cannot be empty');
    });

    it('should trim valid calendar ID', () => {
      const calendarId = '  user@example.com  ';

      const result = (testTool as any).validateCalendarId(calendarId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('user@example.com');
    });
  });

  describe('validateEventId', () => {
    it('should exist and be callable', () => {
      expect(typeof (testTool as any).validateEventId).toBe('function');
    });

    it('should validate correct event ID', () => {
      const validEventId = 'event123';
      const calendarId = 'user@example.com';

      const result = (testTool as any).validateEventId(validEventId, calendarId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(validEventId);
    });

    it('should reject empty event ID', () => {
      const calendarId = 'user@example.com';
      
      const result = (testTool as any).validateEventId('', calendarId);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error).toBeInstanceOf(GoogleCalendarInvalidOperationError);
      expect(error.message).toContain('Event ID cannot be empty');
    });

    it('should trim valid event ID', () => {
      const eventId = '  event123  ';
      const calendarId = 'user@example.com';

      const result = (testTool as any).validateEventId(eventId, calendarId);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe('event123');
    });
  });

  describe('createCommonSchemas', () => {
    it('should exist and return schemas object', () => {
      const schemas = BaseCalendarTools.createCommonSchemas();

      expect(schemas).toBeDefined();
      expect(schemas.calendarId).toBeDefined();
      expect(schemas.eventId).toBeDefined();
      expect(schemas.eventSummary).toBeDefined();
      expect(schemas.dateTime).toBeDefined();
    });

    it('should create valid schemas for calendar operations', () => {
      const schemas = BaseCalendarTools.createCommonSchemas();

      // Test calendarId schema
      const calendarIdResult = schemas.calendarId.safeParse('user@example.com');
      expect(calendarIdResult.success).toBe(true);

      // Test eventId schema
      const eventIdResult = schemas.eventId.safeParse('event123');
      expect(eventIdResult.success).toBe(true);

      // Test eventSummary schema
      const summaryResult = schemas.eventSummary.safeParse('Test Event');
      expect(summaryResult.success).toBe(true);

      // Test dateTime schema
      const dateTimeResult = schemas.dateTime.safeParse('2024-01-01T10:00:00Z');
      expect(dateTimeResult.success).toBe(true);
    });

    it('should reject invalid data', () => {
      const schemas = BaseCalendarTools.createCommonSchemas();

      // Test empty calendarId
      const calendarIdResult = schemas.calendarId.safeParse('');
      expect(calendarIdResult.success).toBe(false);

      // Test empty eventId
      const eventIdResult = schemas.eventId.safeParse('');
      expect(eventIdResult.success).toBe(false);

      // Test empty eventSummary
      const summaryResult = schemas.eventSummary.safeParse('');
      expect(summaryResult.success).toBe(false);
    });
  });

  // ===============================
  // ACCESS CONTROL INTEGRATION TESTS (RED PHASE - SHOULD FAIL)
  // ===============================

  describe('Access Control Integration (RED PHASE - Should Fail)', () => {
    describe('validateAccessControl method', () => {
      it('should exist and be callable', () => {
        // This test should fail because validateAccessControl doesn't exist yet
        expect(typeof (testTool as any).validateAccessControl).toBe('function');
      });

      it('should validate read operations (always allowed)', async () => {
        const request = {
          operation: 'read' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__list-events',
          context: { calendarId: 'user@example.com' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__list-events',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.any(Object),
        });
      });

      it('should validate write operations with access control', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com', summary: 'New Event' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.any(Object),
        });
      });

      it('should validate delete operations with access control', async () => {
        const request = {
          operation: 'delete' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__delete-event',
          context: { calendarId: 'user@example.com', eventId: 'event123' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'delete',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__delete-event',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.any(Object),
        });
      });

      it('should handle access control denial errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        const accessError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'calendar',
          resourceType: 'calendar_event',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(err(accessError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlReadOnlyError);
        expect(mockLogger.warn).toHaveBeenCalledWith(
          'Access control validation failed',
          expect.objectContaining({
            requestId: 'test-request-id',
            operation: 'write',
            serviceName: 'calendar',
            toolName: 'google-workspace__calendar__create-event',
          })
        );
      });

      it('should handle service access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        const serviceError = new GoogleAccessControlServiceError(
          'calendar',
          ['sheets', 'docs'],
          { operation: 'write', resourceType: 'calendar_event' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(err(serviceError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlServiceError);
      });

      it('should handle tool access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        const toolError = new GoogleAccessControlToolError(
          'google-workspace__calendar__create-event',
          ['google-workspace__calendar__list-events'],
          { operation: 'write', serviceName: 'calendar' }
        );
        mockAccessControlService.validateAccess.mockResolvedValue(err(toolError));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlToolError);
      });

      it('should handle unexpected access control errors', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        mockAccessControlService.validateAccess.mockRejectedValue(new Error('Network error'));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlError);
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Access control validation error',
          expect.objectContaining({
            requestId: 'test-request-id',
            error: expect.any(Object),
          })
        );
      });
    });

    describe('isWriteOperation method', () => {
      it('should exist and be callable', () => {
        // This test should fail because isWriteOperation doesn't exist yet
        expect(typeof (testTool as any).isWriteOperation).toBe('function');
      });

      it('should identify read operations correctly', () => {
        const readOperations = [
          'google-workspace__calendar__list-calendars',
          'google-workspace__calendar__list-events',
          'google-workspace__calendar__get-event',
          'calendar-list',
          'calendar-get',
          'list-events',
        ];

        readOperations.forEach(toolName => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(false);
        });
      });

      it('should identify write operations correctly', () => {
        const writeOperations = [
          'google-workspace__calendar__create-event',
          'google-workspace__calendar__update-event',
          'google-workspace__calendar__delete-event',
          'google-workspace__calendar__quick-add',
          'calendar-create',
          'calendar-update',
          'calendar-delete',
          'calendar-add',
        ];

        writeOperations.forEach(toolName => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(true);
        });
      });

      it('should handle edge cases and unknown tool patterns', () => {
        const edgeCases = [
          { toolName: '', expected: false },
          { toolName: 'unknown-tool', expected: false },
          { toolName: 'google-workspace__calendar__unknown', expected: false },
          { toolName: 'calendar-unknown-operation', expected: false },
        ];

        edgeCases.forEach(({ toolName, expected }) => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(expected);
        });
      });

      it('should handle tool name parsing correctly', () => {
        const testCases = [
          // Standard patterns
          { toolName: 'google-workspace__calendar__create-event', expected: true },
          { toolName: 'google-workspace__calendar__list-events', expected: false },
          // Legacy patterns
          { toolName: 'calendar-create', expected: true },
          { toolName: 'calendar-list', expected: false },
          // Mixed case
          { toolName: 'google-workspace__calendar__CREATE-event', expected: true },
          { toolName: 'google-workspace__calendar__LIST-events', expected: false },
        ];

        testCases.forEach(({ toolName, expected }) => {
          // This test should fail because isWriteOperation doesn't exist yet
          const result = (testTool as any).isWriteOperation(toolName);
          expect(result).toBe(expected);
        });
      });
    });

    describe('getRequiredFolderIds method', () => {
      it('should exist and be callable', () => {
        // This test should fail because getRequiredFolderIds doesn't exist yet
        expect(typeof (testTool as any).getRequiredFolderIds).toBe('function');
      });

      it('should return empty array for calendar operations (no folder concept)', () => {
        const testCases = [
          { calendarId: 'user@example.com' },
          { calendarId: 'user@example.com', eventId: 'event123' },
          { calendarId: 'user@example.com', summary: 'New Event' },
          { eventId: 'event456', summary: 'Test Event' },
          {},
        ];

        testCases.forEach(params => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual([]);
        });
      });

      it('should handle nested parameters (still no folder concept)', () => {
        const testCases = [
          {
            params: {
              event: {
                calendarId: 'user@example.com',
                summary: 'Nested Event',
              },
            },
            expected: [],
          },
          {
            params: {
              options: {
                maxResults: 10,
              },
              calendar: {
                id: 'user@example.com',
              },
            },
            expected: [],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });

      it('should filter out any folder-like parameters (conceptual test)', () => {
        const testCases = [
          {
            params: {
              calendarId: 'user@example.com',
              folderId: 'folder-123', // Not applicable to calendar
              parentFolderId: 'parent-456', // Not applicable to calendar
            },
            expected: [],
          },
          {
            params: {
              eventId: 'event789',
              targetFolderId: 'target-folder', // Not applicable to calendar
            },
            expected: [],
          },
        ];

        testCases.forEach(({ params, expected }) => {
          // This test should fail because getRequiredFolderIds doesn't exist yet
          const result = (testTool as any).getRequiredFolderIds(params);
          expect(result).toEqual(expected);
        });
      });
    });

    describe('Integration with existing tool execution flow', () => {
      it('should integrate access control with executeImpl method', async () => {
        // Mock a tool that would normally call access control validation
        const mockExecuteWithAccessControl = jest.fn().mockResolvedValue(
          // @ts-ignore - Mock return value
          ok({ result: 'success' })
        );
        
        // This test should fail because access control integration doesn't exist yet
        expect(typeof (testTool as any).executeWithAccessControl).toBe('function');
      });

      it('should validate access control before executing write operations', async () => {
        const writeInput = {
          calendarId: 'user@example.com',
          summary: 'New Event',
          start: { dateTime: '2024-01-01T10:00:00Z' },
          end: { dateTime: '2024-01-01T11:00:00Z' },
        };

        // Mock access control to deny the operation
        const accessError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'calendar',
          resourceType: 'calendar_event',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(err(accessError));

        // This test should fail because write operation access control doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          writeInput,
          'google-workspace__calendar__create-event'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toBeInstanceOf(GoogleAccessControlReadOnlyError);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'write',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.objectContaining({
            calendarId: 'user@example.com',
            summary: 'New Event',
          }),
        });
      });

      it('should skip access control validation for read operations', async () => {
        const readInput = {
          calendarId: 'user@example.com',
          maxResults: 10,
        };

        // This test should fail because read operation flow doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          readInput,
          'google-workspace__calendar__list-events'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'read',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__list-events',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.objectContaining({
            calendarId: 'user@example.com',
            maxResults: 10,
          }),
        });
      });

      it('should preserve original tool execution when access is allowed', async () => {
        const validInput = {
          test: 'valid-data',
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because executeWithAccessControl doesn't exist yet
        const result = await (testTool as any).executeWithAccessControl(
          validInput,
          'google-workspace__calendar__list-events'
        );

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual({ result: 'valid-data' });
      });
    });

    describe('Error handling and Result<T, E> pattern consistency', () => {
      it('should maintain Result<T, E> pattern for access control methods', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result).toHaveProperty('isOk');
        expect(result).toHaveProperty('isErr');
        expect(typeof result.isOk).toBe('function');
        expect(typeof result.isErr).toBe('function');
      });

      it('should convert non-GoogleWorkspaceError to proper error types', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        // Simulate unexpected error type
        mockAccessControlService.validateAccess.mockRejectedValue(new TypeError('Unexpected error'));

        // This test should fail because error conversion doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBeInstanceOf(GoogleAccessControlError);
        expect(error.message).toContain('Access control validation failed');
      });

      it('should preserve error context and stack traces', async () => {
        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { calendarId: 'user@example.com' },
        };

        const originalError = new GoogleAccessControlReadOnlyError('write', {
          serviceName: 'calendar',
          resourceType: 'calendar_event',
        });
        mockAccessControlService.validateAccess.mockResolvedValue(err(originalError));

        // This test should fail because error context preservation doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isErr()).toBe(true);
        const error = result._unsafeUnwrapErr();
        expect(error).toBe(originalError); // Should preserve the exact same error instance
        expect(error.context).toEqual({
          serviceName: 'calendar',
          resourceType: 'calendar_event',
        });
      });
    });

    describe('Backward compatibility with existing patterns', () => {
      it('should not break existing schema validation', () => {
        const schema = z.object({
          test: z.string(),
        });
        const data = { test: 'valid-data' };

        (validateToolInput as jest.MockedFunction<typeof validateToolInput>)
          .mockReturnValue(ok(data));

        const result = (testTool as any).validateWithSchema(schema, data);

        expect(result.isOk()).toBe(true);
        expect(validateToolInput).toHaveBeenCalledWith(schema, data);
      });

      it('should not break existing calendar validation methods', () => {
        const validCalendarId = 'user@example.com';
        
        const result = (testTool as any).validateCalendarId(validCalendarId);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(validCalendarId);
      });

      it('should not break existing event validation methods', () => {
        const validEventId = 'event123';
        const calendarId = 'user@example.com';
        
        const result = (testTool as any).validateEventId(validEventId, calendarId);

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBe(validEventId);
      });

      it('should maintain service and logger injection', () => {
        expect((testTool as any).calendarService).toBe(mockCalendarService);
        expect((testTool as any).authService).toBe(mockAuthService);
        expect((testTool as any).logger).toBe(mockLogger);
      });

      it('should maintain existing common schemas functionality', () => {
        const schemas = BaseCalendarTools.createCommonSchemas();

        expect(schemas).toBeDefined();
        expect(schemas.calendarId).toBeDefined();
        expect(schemas.eventId).toBeDefined();
        expect(schemas.eventSummary).toBeDefined();
      });
    });

    describe('AccessControlService dependency injection (RED PHASE)', () => {
      it('should accept AccessControlService as constructor parameter', () => {
        // This test should fail because AccessControlService injection doesn't exist yet
        expect(() => {
          new TestCalendarTools(
            mockCalendarService,
            mockAuthService,
            mockLogger,
            mockAccessControlService
          );
        }).not.toThrow();
      });

      it('should use injected AccessControlService for validations', async () => {
        // This test should fail because AccessControlService injection doesn't exist yet
        const toolWithAccessControl = new TestCalendarTools(
          mockCalendarService,
          mockAuthService,
          mockLogger,
          mockAccessControlService
        );

        const request = {
          operation: 'write' as const,
          serviceName: 'calendar',
          toolName: 'test-calendar-tool',
          context: {},
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        const result = await (toolWithAccessControl as any).validateAccessControl(
          request,
          'test-request-id'
        );

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledTimes(1);
      });

      it('should handle optional AccessControlService parameter', () => {
        // This test should fail because optional AccessControlService doesn't exist yet
        const toolWithoutAccessControl = new TestCalendarTools(
          mockCalendarService,
          mockAuthService,
          mockLogger
        );

        expect(toolWithoutAccessControl).toBeDefined();
        expect((toolWithoutAccessControl as any).accessControlService).toBeUndefined();
      });
    });

    describe('Calendar-specific access control patterns', () => {
      it('should validate access for calendar event creation', async () => {
        const request = {
          operation: 'create' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          context: { 
            calendarId: 'user@example.com',
            summary: 'New Meeting',
            start: { dateTime: '2024-01-01T10:00:00Z' },
            end: { dateTime: '2024-01-01T11:00:00Z' },
          },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'create',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__create-event',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.objectContaining({
            calendarId: 'user@example.com',
            summary: 'New Meeting',
          }),
        });
      });

      it('should validate access for calendar event deletion', async () => {
        const request = {
          operation: 'delete' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__delete-event',
          context: { 
            calendarId: 'user@example.com',
            eventId: 'event123',
          },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'delete',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__delete-event',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.objectContaining({
            calendarId: 'user@example.com',
            eventId: 'event123',
          }),
        });
      });

      it('should validate access for quick-add operations', async () => {
        const request = {
          operation: 'create' as const,
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__quick-add',
          context: { 
            calendarId: 'user@example.com',
            text: 'Meeting with John tomorrow at 3pm',
          },
        };

        mockAccessControlService.validateAccess.mockResolvedValue(ok(undefined));

        // This test should fail because validateAccessControl doesn't exist yet
        const result = await (testTool as any).validateAccessControl(request, 'test-request-id');

        expect(result.isOk()).toBe(true);
        expect(mockAccessControlService.validateAccess).toHaveBeenCalledWith({
          operation: 'create',
          serviceName: 'calendar',
          toolName: 'google-workspace__calendar__quick-add',
          targetFolderId: undefined,
          resourceType: 'calendar_event',
          context: expect.objectContaining({
            calendarId: 'user@example.com',
            text: 'Meeting with John tomorrow at 3pm',
          }),
        });
      });
    });
  });

  describe('Backward Compatibility', () => {
    it('should maintain inheritance structure', () => {
      expect(testTool).toBeInstanceOf(BaseCalendarTools);
      expect(testTool.getToolName()).toBe('test-calendar-tool');
    });

    it('should maintain existing error handling functionality', () => {
      const calendarError = new GoogleCalendarError(
        'Test error',
        'GOOGLE_CALENDAR_TEST_ERROR',
        400
      );

      const result = (testTool as any).handleServiceError(calendarError);

      expect(result).toBe(calendarError);
    });
  });
});