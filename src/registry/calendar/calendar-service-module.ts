/**
 * Calendar Service Module
 * 
 * This module implements the ServiceModule interface for Google Calendar functionality,
 * providing centralized management of Calendar service, tools, and resources within
 * the MCP server architecture.
 * 
 * Features:
 * - Calendar service lifecycle management
 * - Tool registration and initialization
 * - Health monitoring and status reporting
 * - Error handling and recovery
 * - Resource exposure for calendar data
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ServiceModule,
  ServiceModuleHealthStatus,
} from '../service-module.interface.js';
import type { AuthService } from '../../services/auth.service.js';
import { CalendarService } from '../../services/calendar.service.js';
import {
  ListCalendarsTool,
  ListEventsTool,
  GetEventTool,
  CreateEventTool,
  QuickAddTool,
  DeleteEventTool,
} from '../../tools/calendar/index.js';
import type { ToolRegistry } from '../../tools/base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import {
  GoogleWorkspaceError,
  GoogleServiceError,
} from '../../errors/index.js';
import { Logger, createServiceLogger } from '../../utils/logger.js';


/**
 * Service module for Google Calendar integration
 * Manages the lifecycle of Calendar tools, resources, and services
 */
export class CalendarServiceModule implements ServiceModule {
  public readonly name = 'calendar';
  public readonly displayName = 'Google Calendar';
  public readonly version = '1.0.0';

  private calendarService?: CalendarService;
  private tools: ToolRegistry[] = [];
  private logger: Logger;
  private initialized = false;
  private initializationStartTime?: number;
  private initializationTime?: number;

  constructor(logger?: Logger) {
    this.logger = logger || createServiceLogger('calendar-service-module');
  }


  /**
   * Initialize the Calendar service module
   */
  public async initialize(
    authService: AuthService
  ): Promise<Result<void, GoogleWorkspaceError>> {
    if (this.initialized) {
      return ok(undefined);
    }

    this.initializationStartTime = Date.now();

    try {
      this.logger.info('Initializing Calendar service module');

      // Initialize Calendar service
      this.calendarService = new CalendarService(authService);
      const initResult = await this.calendarService.initialize();

      if (initResult.isErr()) {
        this.logger.error('Failed to initialize Calendar service', {
          error: initResult.error.toJSON(),
        });
        return err(
          new GoogleServiceError(
            `Failed to initialize Calendar service: ${initResult.error.message}`,
            this.name,
            'CALENDAR_SERVICE_INIT_FAILED',
            500,
            { originalError: initResult.error }
          )
        );
      }

      // Create tool instances
      this.tools = [
        new ListCalendarsTool(this.calendarService, authService),
        new ListEventsTool(this.calendarService, authService),
        new GetEventTool(this.calendarService, authService),
        new CreateEventTool(this.calendarService, authService),
        new QuickAddTool(this.calendarService, authService),
        new DeleteEventTool(this.calendarService, authService),
      ];

      this.initialized = true;
      this.initializationTime = Date.now() - this.initializationStartTime;

      this.logger.info('Calendar service module initialized successfully', {
        initializationTime: this.initializationTime,
        toolsCreated: this.tools.length,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Calendar service module initialization failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(
        new GoogleServiceError(
          `Calendar service module initialization failed: ${errorMessage}`,
          this.name,
          'CALENDAR_MODULE_INIT_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Register all Calendar tools with the MCP server
   */
  public registerTools(server: McpServer): Result<void, GoogleWorkspaceError> {
    if (!this.initialized || !this.tools.length) {
      return err(
        new GoogleServiceError(
          'Calendar service module not initialized. Call initialize() first.',
          this.name,
          'CALENDAR_MODULE_NOT_INITIALIZED',
          500,
          {}
        )
      );
    }

    try {
      let registeredCount = 0;

      for (const tool of this.tools) {
        try {
          tool.registerTool(server);
          registeredCount++;

          this.logger.debug('Tool registered successfully', {
            toolName: tool.getToolName(),
            moduleName: this.name,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          this.logger.error('Tool registration failed', {
            toolName: tool.getToolName(),
            error: errorMessage,
            moduleName: this.name,
          });

          return err(
            new GoogleServiceError(
              `Failed to register tool ${tool.getToolName()}: ${errorMessage}`,
              this.name,
              'TOOL_REGISTRATION_FAILED',
              500,
              { toolName: tool.getToolName(), error: errorMessage }
            )
          );
        }
      }

      this.logger.info('All Calendar tools registered successfully', {
        registeredCount,
        moduleName: this.name,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Tool registration process failed', {
        error: errorMessage,
        moduleName: this.name,
      });

      return err(
        new GoogleServiceError(
          `Tool registration process failed: ${errorMessage}`,
          this.name,
          'TOOL_REGISTRATION_PROCESS_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Register all Calendar resources with the MCP server
   */
  public registerResources(
    server: McpServer
  ): Result<void, GoogleWorkspaceError> {
    if (!this.initialized) {
      return err(
        new GoogleServiceError(
          'Calendar service module not initialized. Call initialize() first.',
          this.name,
          'CALENDAR_MODULE_NOT_INITIALIZED',
          500,
          {}
        )
      );
    }

    try {
      // TODO: Implement Calendar resources when needed
      // Resources could include:
      // - Calendar list resource
      // - Event list resources by calendar
      // - Upcoming events resource

      this.logger.info('Calendar resources registration completed', {
        registeredCount: 0,
        moduleName: this.name,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Resource registration process failed', {
        error: errorMessage,
        moduleName: this.name,
      });

      return err(
        new GoogleServiceError(
          `Resource registration process failed: ${errorMessage}`,
          this.name,
          'RESOURCE_REGISTRATION_PROCESS_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<Result<void, GoogleWorkspaceError>> {
    try {
      this.logger.info('Cleaning up Calendar service module');

      // Clear tools
      this.tools = [];

      // Reset services
      this.calendarService = undefined;

      // Reset state
      this.initialized = false;
      this.initializationTime = undefined;

      this.logger.info('Calendar service module cleanup completed successfully');
      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Calendar service module cleanup failed', {
        error: errorMessage,
      });

      return err(
        new GoogleServiceError(
          `Cleanup failed: ${errorMessage}`,
          this.name,
          'CLEANUP_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Check if the service module is properly initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service module health status
   */
  public getHealthStatus(): ServiceModuleHealthStatus {
    const status = this.initialized ? 'healthy' : 'unhealthy';

    return {
      status,
      lastChecked: new Date(),
      message: this.initialized ? undefined : 'Service module not initialized',
      metrics: {
        toolsRegistered: this.tools.length,
        resourcesRegistered: 0, // No resources implemented yet
        initializationTime: this.initializationTime,
      },
    };
  }

  /**
   * Get the Calendar service instance (for testing purposes)
   */
  public getCalendarService(): CalendarService | undefined {
    return this.calendarService;
  }

  /**
   * Get registered tools (for testing purposes)
   */
  public getTools(): ToolRegistry[] {
    return [...this.tools];
  }
}