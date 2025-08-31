/**
 * Drive Service Module
 *
 * This module implements the ServiceModule interface for Google Drive functionality,
 * providing centralized management of Drive service, tools, and resources within
 * the MCP server architecture.
 *
 * Features:
 * - Drive service lifecycle management
 * - Tool registration and initialization (prepared for future tools)
 * - Health monitoring and status reporting
 * - Error handling and recovery
 * - Resource exposure for drive data (prepared for future resources)
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ServiceModule,
  ServiceModuleHealthStatus,
} from '../service-module.interface.js';
import type { AuthService } from '../../services/auth.service.js';
import { DriveService } from '../../services/drive.service.js';
import {
  ListFilesTool,
  GetFileTool,
  GetFileContentTool,
} from '../../tools/drive/index.js';
import type { ToolRegistry } from '../../tools/base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import {
  GoogleWorkspaceError,
  GoogleServiceError,
} from '../../errors/index.js';
import { Logger, createServiceLogger } from '../../utils/logger.js';

/**
 * Service module for Google Drive integration
 * Manages the lifecycle of Drive tools, resources, and services
 */
export class DriveServiceModule implements ServiceModule {
  public readonly name = 'drive';
  public readonly displayName = 'Google Drive';
  public readonly version = '1.0.0';

  private driveService?: DriveService;
  private tools: ToolRegistry[] = [];
  private logger: Logger;
  private initialized = false;
  private initializationStartTime?: number;
  private initializationTime?: number;

  constructor(logger?: Logger) {
    this.logger = logger || createServiceLogger('drive-service-module');
  }

  /**
   * Initialize the Drive service module
   */
  public async initialize(
    authService: AuthService
  ): Promise<Result<void, GoogleWorkspaceError>> {
    if (this.initialized) {
      return ok(undefined);
    }

    this.initializationStartTime = Date.now();

    try {
      this.logger.info('Initializing Drive service module');

      // Initialize Drive service
      this.driveService = new DriveService(authService);
      const initResult = await this.driveService.initialize();

      if (initResult.isErr()) {
        this.logger.error('Failed to initialize Drive service', {
          error: initResult.error.toJSON(),
        });
        return err(
          new GoogleServiceError(
            `Failed to initialize Drive service: ${initResult.error.message}`,
            this.name,
            'DRIVE_SERVICE_INIT_FAILED',
            500,
            { originalError: initResult.error }
          )
        );
      }

      // Create tool instances
      this.tools = [
        new ListFilesTool(this.driveService, authService, this.logger),
        new GetFileTool(this.driveService, authService, this.logger),
        new GetFileContentTool(this.driveService, authService, this.logger),
      ];

      this.initialized = true;
      this.initializationTime = Date.now() - this.initializationStartTime;

      this.logger.info('Drive service module initialized successfully', {
        initializationTime: this.initializationTime,
        toolsCreated: this.tools.length,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Drive service module initialization failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(
        new GoogleServiceError(
          `Drive service module initialization failed: ${errorMessage}`,
          this.name,
          'DRIVE_MODULE_INIT_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Register all Drive tools with the MCP server
   */
  public registerTools(server: McpServer): Result<void, GoogleWorkspaceError> {
    if (!this.initialized) {
      return err(
        new GoogleServiceError(
          'Drive service module not initialized. Call initialize() first.',
          this.name,
          'DRIVE_MODULE_NOT_INITIALIZED',
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

      this.logger.info('All Drive tools registered successfully', {
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
   * Register all Drive resources with the MCP server
   */
  public registerResources(
    server: McpServer
  ): Result<void, GoogleWorkspaceError> {
    if (!this.initialized) {
      return err(
        new GoogleServiceError(
          'Drive service module not initialized. Call initialize() first.',
          this.name,
          'DRIVE_MODULE_NOT_INITIALIZED',
          500,
          {}
        )
      );
    }

    try {
      // TODO: Implement Drive resources when needed
      // Resources could include:
      // - Drive file metadata resource
      // - Folder structure resource
      // - File content resource
      // - Sharing permissions resource

      this.logger.info('Drive resources registration completed', {
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
      this.logger.info('Cleaning up Drive service module');

      // Clear tools
      this.tools = [];

      // Reset services
      this.driveService = undefined;

      // Reset state
      this.initialized = false;
      this.initializationTime = undefined;

      this.logger.info('Drive service module cleanup completed successfully');
      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Drive service module cleanup failed', {
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
   * Get the Drive service instance (for testing purposes)
   */
  public getDriveService(): DriveService | undefined {
    return this.driveService;
  }

  /**
   * Get registered tools (for testing purposes)
   */
  public getTools(): ToolRegistry[] {
    return [...this.tools];
  }
}
