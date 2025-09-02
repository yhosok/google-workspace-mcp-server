import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
  ServiceModule,
  ServiceModuleHealthStatus,
} from '../service-module.interface.js';
import type { AuthService } from '../../services/auth.service.js';
import { SheetsService } from '../../services/sheets.service.js';
import { DriveService } from '../../services/drive.service.js';
import { AccessControlService } from '../../services/access-control.service.js';
import { SheetsResources } from '../../resources/sheets-resources.js';
import {
  SheetsListTool,
  SheetsReadTool,
  SheetsWriteTool,
  SheetsAppendTool,
  SheetsAddSheetTool,
  SheetsCreateSpreadsheetTool,
} from '../../tools/sheets/index.js';
import type { ToolRegistry } from '../../tools/base/tool-registry.js';
import { Result, ok, err } from 'neverthrow';
import {
  GoogleWorkspaceError,
  GoogleServiceError,
} from '../../errors/index.js';
import { Logger, createServiceLogger } from '../../utils/logger.js';
import type { EnvironmentConfig } from '../../types/index.js';

/**
 * Service module for Google Sheets integration
 * Manages the lifecycle of Sheets tools, resources, and services
 */
export class SheetsServiceModule implements ServiceModule {
  public readonly name = 'sheets';
  public readonly displayName = 'Google Sheets';
  public readonly version = '1.0.0';

  private sheetsService?: SheetsService;
  private driveService?: DriveService;
  private accessControlService?: AccessControlService;
  private sheetsResources?: SheetsResources;
  private tools: ToolRegistry[] = [];
  private logger: Logger;
  private initialized = false;
  private initializationStartTime?: number;
  private initializationTime?: number;

  constructor(
    private readonly config?: EnvironmentConfig,
    logger?: Logger
  ) {
    this.logger = logger || createServiceLogger('sheets-service-module');
  }

  /**
   * Initialize the Sheets service module
   */
  public async initialize(
    authService: AuthService
  ): Promise<Result<void, GoogleWorkspaceError>> {
    if (this.initialized) {
      return ok(undefined);
    }

    this.initializationStartTime = Date.now();

    try {
      this.logger.info('Initializing Sheets service module');

      // Initialize Drive service (for folder operations)
      this.driveService = new DriveService(authService);
      const driveInitResult = await this.driveService.initialize();

      if (driveInitResult.isErr()) {
        this.logger.warn(
          'Failed to initialize Drive service for Sheets module',
          {
            error: driveInitResult.error.toJSON(),
          }
        );
        // Continue without DriveService - this maintains backward compatibility
        this.driveService = undefined;
      }

      // Initialize AccessControlService if configuration is provided
      if (this.config) {
        const authClient = await authService.getAuthClient();
        if (authClient.isOk()) {
          this.accessControlService = new AccessControlService(
            this.config,
            authClient.value,
            this.logger
          );
          
          const accessControlInitResult = await this.accessControlService.initialize();
          if (accessControlInitResult.isErr()) {
            this.logger.warn('Failed to initialize AccessControlService', {
              error: accessControlInitResult.error.toJSON(),
            });
            // Continue without AccessControlService - this maintains backward compatibility
            this.accessControlService = undefined;
          }
        } else {
          this.logger.warn('Failed to get auth client for AccessControlService');
        }
      }

      // Initialize Sheets service (with optional DriveService)
      this.sheetsService = new SheetsService(authService, this.driveService);
      const initResult = await this.sheetsService.initialize();

      if (initResult.isErr()) {
        this.logger.error('Failed to initialize Sheets service', {
          error: initResult.error.toJSON(),
        });
        return err(
          new GoogleServiceError(
            `Failed to initialize Sheets service: ${initResult.error.message}`,
            this.name,
            'SHEETS_SERVICE_INIT_FAILED',
            500,
            { originalError: initResult.error }
          )
        );
      }

      // Initialize resources
      this.sheetsResources = new SheetsResources(
        authService,
        this.sheetsService
      );

      // Create tool instances with optional AccessControlService
      this.tools = [
        new SheetsListTool(this.sheetsService, authService, undefined, this.accessControlService),
        new SheetsReadTool(this.sheetsService, authService, undefined, this.accessControlService),
        new SheetsWriteTool(this.sheetsService, authService, undefined, this.accessControlService),
        new SheetsAppendTool(this.sheetsService, authService, undefined, this.accessControlService),
        new SheetsAddSheetTool(this.sheetsService, authService, undefined, this.accessControlService),
        new SheetsCreateSpreadsheetTool(this.sheetsService, authService, undefined, this.accessControlService),
      ];

      this.initialized = true;
      this.initializationTime = Date.now() - this.initializationStartTime;

      this.logger.info('Sheets service module initialized successfully', {
        initializationTime: this.initializationTime,
        toolsCreated: this.tools.length,
        accessControlEnabled: !!this.accessControlService,
      });

      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Sheets service module initialization failed', {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      return err(
        new GoogleServiceError(
          `Sheets service module initialization failed: ${errorMessage}`,
          this.name,
          'SHEETS_MODULE_INIT_FAILED',
          500,
          { error: errorMessage }
        )
      );
    }
  }

  /**
   * Register all Sheets tools with the MCP server
   */
  public registerTools(server: McpServer): Result<void, GoogleWorkspaceError> {
    if (!this.initialized || !this.tools.length) {
      return err(
        new GoogleServiceError(
          'Sheets service module not initialized. Call initialize() first.',
          this.name,
          'SHEETS_MODULE_NOT_INITIALIZED',
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

      this.logger.info('All Sheets tools registered successfully', {
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
   * Register all Sheets resources with the MCP server
   */
  public registerResources(
    server: McpServer
  ): Result<void, GoogleWorkspaceError> {
    if (!this.initialized || !this.sheetsResources) {
      return err(
        new GoogleServiceError(
          'Sheets service module not initialized. Call initialize() first.',
          this.name,
          'SHEETS_MODULE_NOT_INITIALIZED',
          500,
          {}
        )
      );
    }

    try {
      let registeredCount = 0;

      // Register spreadsheet-schema resource
      server.registerResource(
        'spreadsheet-schema',
        'schema://spreadsheets',
        {
          title: 'Spreadsheet Schema',
          description:
            'Schema information for Google Sheets tools and resources',
          mimeType: 'application/json',
        },
        async uri => {
          const result = await this.sheetsResources!.getSpreadsheetSchema(
            uri.href
          );
          return {
            contents: [result],
          } as any;
        }
      );
      registeredCount++;

      this.logger.debug('Resource registered successfully', {
        resourceName: 'spreadsheet-schema',
        moduleName: this.name,
      });

      // Register spreadsheet-data resource (dynamic URI)
      server.registerResource(
        'spreadsheet-data',
        new ResourceTemplate('spreadsheet://{spreadsheetId}', {
          list: undefined,
        }),
        {
          title: 'Spreadsheet Data',
          description:
            'Metadata and structure information for a specific spreadsheet',
          mimeType: 'application/json',
        },
        async (uri, { spreadsheetId }) => {
          const result = await this.sheetsResources!.getSpreadsheetData(
            uri.href,
            spreadsheetId as string
          );
          return {
            contents: [result],
          } as any;
        }
      );
      registeredCount++;

      this.logger.debug('Resource registered successfully', {
        resourceName: 'spreadsheet-data',
        moduleName: this.name,
      });

      this.logger.info('All Sheets resources registered successfully', {
        registeredCount,
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
      this.logger.info('Cleaning up Sheets service module');

      // Clear tools
      this.tools = [];

      // Reset services
      this.sheetsService = undefined;
      this.driveService = undefined;
      this.accessControlService = undefined;
      this.sheetsResources = undefined;

      // Reset state
      this.initialized = false;
      this.initializationTime = undefined;

      this.logger.info('Sheets service module cleanup completed successfully');
      return ok(undefined);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error('Sheets service module cleanup failed', {
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
        resourcesRegistered: 2, // spreadsheet-schema and spreadsheet-data
        initializationTime: this.initializationTime,
        accessControlEnabled: !!this.accessControlService,
      },
    };
  }

  /**
   * Get the Sheets service instance (for testing purposes)
   */
  public getSheetsService(): SheetsService | undefined {
    return this.sheetsService;
  }

  /**
   * Get the Sheets resources instance (for testing purposes)
   */
  public getSheetsResources(): SheetsResources | undefined {
    return this.sheetsResources;
  }

  /**
   * Get registered tools (for testing purposes)
   */
  public getTools(): ToolRegistry[] {
    return [...this.tools];
  }

  /**
   * Get the AccessControlService instance (for testing purposes)
   */
  public getAccessControlService(): AccessControlService | undefined {
    return this.accessControlService;
  }
}
