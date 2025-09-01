/**
 * Google Docs Service Module for MCP Server
 *
 * This module provides integration between the Google Docs service and the MCP server.
 * It manages the lifecycle of the DocsService, registers all Docs-related tools,
 * and provides health monitoring capabilities.
 *
 * The module follows the established service registry pattern with:
 * - Proper initialization with AuthService dependency
 * - Optional DriveService integration for folder operations
 * - Tool registration and management
 * - Resource management (future extension point)
 * - Health status monitoring
 * - Clean resource cleanup
 *
 * @module DocsServiceModule
 */

import { Result, ok, err } from 'neverthrow';
import type {
  ServiceModule,
  ServiceModuleHealthStatus,
} from '../service-module.interface.js';
import type { AuthService } from '../../services/auth.service.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolRegistry } from '../../tools/base/tool-registry.js';
import { DocsService } from '../../services/docs.service.js';
import { DriveService } from '../../services/drive.service.js';
import {
  GoogleServiceError,
  GoogleWorkspaceError,
} from '../../errors/index.js';
import { createServiceLogger, type Logger } from '../../utils/logger.js';

// Import all Docs tools
import {
  CreateDocumentTool,
  GetDocumentTool,
  UpdateDocumentTool,
  InsertTextTool,
  ReplaceTextTool,
} from '../../tools/docs/index.js';

/**
 * Tool name constants following the established naming pattern
 */
export const CREATE_DOCUMENT_TOOL_NAME = 'google-workspace__docs__create';
export const GET_DOCUMENT_TOOL_NAME = 'google-workspace__docs__get';
export const UPDATE_DOCUMENT_TOOL_NAME = 'google-workspace__docs__update';
export const INSERT_TEXT_TOOL_NAME = 'google-workspace__docs__insert-text';
export const REPLACE_TEXT_TOOL_NAME = 'google-workspace__docs__replace-text';

/**
 * Google Docs Service Module
 *
 * Manages the Google Docs service integration with the MCP server.
 * Provides comprehensive document management capabilities including creation,
 * content retrieval, batch updates, and text manipulation operations.
 */
export class DocsServiceModule implements ServiceModule {
  public readonly name = 'docs';
  public readonly displayName = 'Google Docs';
  public readonly version = '1.0.0';

  private docsService?: DocsService;
  private driveService?: DriveService;
  private tools: ToolRegistry[] = [];
  private logger: Logger;
  private initialized = false;
  private initializationStartTime?: number;
  private initializationTime?: number;

  constructor(logger?: Logger) {
    this.logger = logger || createServiceLogger('docs-service-module');
  }

  /**
   * Initialize the Docs service module
   */
  public async initialize(
    authService: AuthService
  ): Promise<Result<void, GoogleWorkspaceError>> {
    if (this.initialized) {
      return ok(undefined);
    }

    this.initializationStartTime = Date.now();

    try {
      this.logger.info('Initializing Docs service module');

      // Initialize Drive service (for folder operations) - optional
      this.driveService = new DriveService(authService);
      const driveInitResult = await this.driveService.initialize();

      if (driveInitResult.isErr()) {
        this.logger.warn('Failed to initialize Drive service for Docs module', {
          error: driveInitResult.error.toJSON(),
        });
        // Continue without DriveService - this maintains backward compatibility
        this.driveService = undefined;
      }

      // Initialize Docs service (with optional DriveService)
      this.docsService = new DocsService(authService, this.driveService);
      const initResult = await this.docsService.initialize();

      if (initResult.isErr()) {
        this.logger.error('Failed to initialize Docs service', {
          error: initResult.error.toJSON(),
        });
        return err(
          new GoogleServiceError(
            `Failed to initialize Docs service: ${initResult.error.message}`,
            this.name,
            'DOCS_SERVICE_INIT_FAILED',
            500,
            { originalError: initResult.error }
          )
        );
      }

      // Create tool instances
      this.tools = [
        new CreateDocumentTool(this.docsService, authService),
        new GetDocumentTool(this.docsService, authService),
        new UpdateDocumentTool(this.docsService, authService),
        new InsertTextTool(this.docsService, authService),
        new ReplaceTextTool(this.docsService, authService),
      ];

      this.initialized = true;
      this.initializationTime = Date.now() - this.initializationStartTime;

      this.logger.info('Docs service module initialized successfully', {
        initializationTime: this.initializationTime,
        toolsCreated: this.tools.length,
        driveServiceAvailable: !!this.driveService,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Docs service module initialization failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(
        new GoogleServiceError(
          `Docs service module initialization failed: ${errorMessage}`,
          this.name,
          'DOCS_MODULE_INIT_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Register all Docs tools with the MCP server
   */
  public registerTools(server: McpServer): Result<void, GoogleWorkspaceError> {
    if (!this.initialized || !this.tools.length) {
      return err(
        new GoogleServiceError(
          'Docs service module not initialized. Call initialize() first.',
          this.name,
          'DOCS_MODULE_NOT_INITIALIZED',
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

      this.logger.info('All Docs tools registered successfully', {
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
   * Register all Docs resources with the MCP server
   */
  public registerResources(
    server: McpServer
  ): Result<void, GoogleWorkspaceError> {
    if (!this.initialized) {
      return err(
        new GoogleServiceError(
          'Docs service module not initialized. Call initialize() first.',
          this.name,
          'DOCS_MODULE_NOT_INITIALIZED',
          500,
          {}
        )
      );
    }

    try {
      // TODO: Implement Docs resources when needed
      // Resources could include:
      // - Document structure resource
      // - Document content resource
      // - Document revision history resource
      // - Document permissions resource

      this.logger.info('Docs resources registration completed', {
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
      this.logger.info('Cleaning up Docs service module');

      // Clear tools
      this.tools = [];

      // Reset services
      this.docsService = undefined;
      this.driveService = undefined;

      // Reset state
      this.initialized = false;
      this.initializationTime = undefined;

      this.logger.info('Docs service module cleanup completed successfully');
      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Docs service module cleanup failed', {
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
   * Get the Docs service instance (for testing purposes)
   */
  public getDocsService(): DocsService | undefined {
    return this.docsService;
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
