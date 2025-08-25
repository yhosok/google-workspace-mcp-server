import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ServiceModule, ServiceModuleHealthStatus } from './service-module.interface.js';
import type { AuthService } from '../services/auth.service.js';
import { Result, ok, err } from 'neverthrow';
import { GoogleWorkspaceError, GoogleServiceError } from '../errors/index.js';
import { Logger, createServiceLogger } from '../utils/logger.js';

/**
 * Registry for managing multiple service modules in the MCP server
 * Provides centralized lifecycle management and error handling for all services
 */
export class ServiceRegistry {
  private modules: Map<string, ServiceModule> = new Map();
  private initializationOrder: string[] = [];
  private logger: Logger;
  private isInitialized = false;
  private authService?: AuthService;

  constructor(logger?: Logger) {
    this.logger = logger || createServiceLogger('service-registry');
  }

  /**
   * Register a service module
   * @param module - The service module to register
   */
  public registerModule(module: ServiceModule): Result<void, GoogleWorkspaceError> {
    if (this.modules.has(module.name)) {
      return err(new GoogleServiceError(
        `Service module '${module.name}' is already registered`,
        'service-registry',
        'MODULE_ALREADY_REGISTERED',
        500,
        { moduleName: module.name }
      ));
    }

    this.modules.set(module.name, module);
    this.logger.info('Service module registered', {
      moduleName: module.name,
      displayName: module.displayName,
      version: module.version
    });

    return ok(undefined);
  }

  /**
   * Unregister a service module
   * @param moduleName - Name of the module to unregister
   */
  public async unregisterModule(moduleName: string): Promise<Result<void, GoogleWorkspaceError>> {
    const module = this.modules.get(moduleName);
    if (!module) {
      return err(new GoogleServiceError(
        `Service module '${moduleName}' not found`,
        'service-registry',
        'MODULE_NOT_FOUND',
        404,
        { moduleName }
      ));
    }

    // Cleanup if method exists
    if (module.cleanup) {
      const cleanupResult = await module.cleanup();
      if (cleanupResult.isErr()) {
        this.logger.error('Module cleanup failed', {
          moduleName,
          error: cleanupResult.error.toJSON()
        });
        return err(cleanupResult.error);
      }
    }

    this.modules.delete(moduleName);
    this.initializationOrder = this.initializationOrder.filter(name => name !== moduleName);
    
    this.logger.info('Service module unregistered', { moduleName });
    return ok(undefined);
  }

  /**
   * Initialize all registered service modules
   * @param authService - The authentication service instance
   */
  public async initializeAll(authService: AuthService): Promise<Result<void, GoogleWorkspaceError>> {
    if (this.isInitialized) {
      return ok(undefined);
    }

    this.authService = authService;
    const startTime = Date.now();
    const failedModules: string[] = [];

    this.logger.info('Starting service module initialization', {
      moduleCount: this.modules.size,
      modules: Array.from(this.modules.keys())
    });

    // Initialize modules in registration order
    for (const [moduleName, module] of this.modules) {
      try {
        this.logger.debug('Initializing module', { moduleName });
        
        const result = await module.initialize(authService);
        
        if (result.isErr()) {
          failedModules.push(moduleName);
          this.logger.error('Module initialization failed', {
            moduleName,
            error: result.error.toJSON()
          });
          
          // Return early on first failure for fail-fast behavior
          return err(new GoogleServiceError(
            `Failed to initialize service module '${moduleName}': ${result.error.message}`,
            'service-registry',
            'MODULE_INIT_FAILED',
            500,
            { 
              moduleName,
              failedModules,
              originalError: result.error
            }
          ));
        }
        
        this.initializationOrder.push(moduleName);
        this.logger.info('Module initialized successfully', { moduleName });
        
      } catch (error) {
        failedModules.push(moduleName);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.logger.error('Module initialization threw exception', {
          moduleName,
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined
        });
        
        return err(new GoogleServiceError(
          `Failed to initialize service module '${moduleName}': ${errorMessage}`,
          'service-registry',
          'MODULE_INIT_EXCEPTION',
          500,
          { moduleName, failedModules }
        ));
      }
    }

    this.isInitialized = true;
    const initializationTime = Date.now() - startTime;
    
    this.logger.info('All service modules initialized successfully', {
      moduleCount: this.modules.size,
      initializationTime,
      initializationOrder: this.initializationOrder
    });

    return ok(undefined);
  }

  /**
   * Register all tools from all initialized modules
   * @param server - The MCP server instance
   */
  public registerAllTools(server: McpServer): Result<void, GoogleWorkspaceError> {
    if (!this.isInitialized) {
      return err(new GoogleServiceError(
        'Service registry not initialized. Call initializeAll() first.',
        'service-registry',
        'REGISTRY_NOT_INITIALIZED',
        500,
        {}
      ));
    }

    let totalToolsRegistered = 0;
    const failedModules: string[] = [];

    for (const moduleName of this.initializationOrder) {
      const module = this.modules.get(moduleName);
      if (!module) continue;

      try {
        const result = module.registerTools(server);
        
        if (result.isErr()) {
          failedModules.push(moduleName);
          this.logger.error('Tool registration failed', {
            moduleName,
            error: result.error.toJSON()
          });
          
          return err(new GoogleServiceError(
            `Failed to register tools for module '${moduleName}': ${result.error.message}`,
            'service-registry',
            'TOOL_REGISTRATION_FAILED',
            500,
            { moduleName, failedModules, originalError: result.error }
          ));
        }
        
        // Get metrics if available
        const healthStatus = module.getHealthStatus();
        const toolsCount = healthStatus.metrics?.toolsRegistered || 0;
        totalToolsRegistered += toolsCount;
        
        this.logger.info('Tools registered for module', {
          moduleName,
          toolsRegistered: toolsCount
        });
        
      } catch (error) {
        failedModules.push(moduleName);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.logger.error('Tool registration threw exception', {
          moduleName,
          error: errorMessage
        });
        
        return err(new GoogleServiceError(
          `Failed to register tools for module '${moduleName}': ${errorMessage}`,
          'service-registry',
          'TOOL_REGISTRATION_EXCEPTION',
          500,
          { moduleName, failedModules }
        ));
      }
    }

    this.logger.info('All tools registered successfully', {
      totalToolsRegistered,
      moduleCount: this.initializationOrder.length
    });

    return ok(undefined);
  }

  /**
   * Register all resources from all initialized modules
   * @param server - The MCP server instance
   */
  public registerAllResources(server: McpServer): Result<void, GoogleWorkspaceError> {
    if (!this.isInitialized) {
      return err(new GoogleServiceError(
        'Service registry not initialized. Call initializeAll() first.',
        'service-registry',
        'REGISTRY_NOT_INITIALIZED',
        500,
        {}
      ));
    }

    let totalResourcesRegistered = 0;
    const failedModules: string[] = [];

    for (const moduleName of this.initializationOrder) {
      const module = this.modules.get(moduleName);
      if (!module) continue;

      try {
        const result = module.registerResources(server);
        
        if (result.isErr()) {
          failedModules.push(moduleName);
          this.logger.error('Resource registration failed', {
            moduleName,
            error: result.error.toJSON()
          });
          
          return err(new GoogleServiceError(
            `Failed to register resources for module '${moduleName}': ${result.error.message}`,
            'service-registry',
            'RESOURCE_REGISTRATION_FAILED',
            500,
            { moduleName, failedModules, originalError: result.error }
          ));
        }
        
        // Get metrics if available
        const healthStatus = module.getHealthStatus();
        const resourcesCount = healthStatus.metrics?.resourcesRegistered || 0;
        totalResourcesRegistered += resourcesCount;
        
        this.logger.info('Resources registered for module', {
          moduleName,
          resourcesRegistered: resourcesCount
        });
        
      } catch (error) {
        failedModules.push(moduleName);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.logger.error('Resource registration threw exception', {
          moduleName,
          error: errorMessage
        });
        
        return err(new GoogleServiceError(
          `Failed to register resources for module '${moduleName}': ${errorMessage}`,
          'service-registry',
          'RESOURCE_REGISTRATION_EXCEPTION',
          500,
          { moduleName, failedModules }
        ));
      }
    }

    this.logger.info('All resources registered successfully', {
      totalResourcesRegistered,
      moduleCount: this.initializationOrder.length
    });

    return ok(undefined);
  }

  /**
   * Get a specific service module by name
   * @param moduleName - Name of the module to retrieve
   */
  public getModule(moduleName: string): ServiceModule | undefined {
    return this.modules.get(moduleName);
  }

  /**
   * Get all registered module names
   */
  public getModuleNames(): string[] {
    return Array.from(this.modules.keys());
  }

  /**
   * Get health status for all modules
   */
  public getOverallHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    modules: Record<string, ServiceModuleHealthStatus>;
    summary: {
      healthy: number;
      degraded: number;
      unhealthy: number;
      total: number;
    };
  } {
    const moduleStatuses: Record<string, ServiceModuleHealthStatus> = {};
    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;

    for (const [name, module] of this.modules) {
      const status = module.getHealthStatus();
      moduleStatuses[name] = status;

      switch (status.status) {
        case 'healthy': healthy++; break;
        case 'degraded': degraded++; break;
        case 'unhealthy': unhealthy++; break;
      }
    }

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (unhealthy > 0) {
      overallStatus = 'unhealthy';
    } else if (degraded > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      modules: moduleStatuses,
      summary: {
        healthy,
        degraded,
        unhealthy,
        total: this.modules.size
      }
    };
  }

  /**
   * Clean up all modules
   */
  public async cleanup(): Promise<Result<void, GoogleWorkspaceError>> {
    const errors: GoogleWorkspaceError[] = [];
    
    // Cleanup in reverse initialization order
    const cleanupOrder = [...this.initializationOrder].reverse();
    
    for (const moduleName of cleanupOrder) {
      const module = this.modules.get(moduleName);
      if (!module || !module.cleanup) continue;

      try {
        const result = await module.cleanup();
        if (result.isErr()) {
          errors.push(result.error);
          this.logger.error('Module cleanup failed', {
            moduleName,
            error: result.error.toJSON()
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const cleanupError = new GoogleServiceError(
          `Module cleanup threw exception: ${errorMessage}`,
          'service-registry',
          'MODULE_CLEANUP_EXCEPTION',
          500,
          { moduleName }
        );
        errors.push(cleanupError);
        
        this.logger.error('Module cleanup threw exception', {
          moduleName,
          error: errorMessage
        });
      }
    }

    this.isInitialized = false;
    this.initializationOrder = [];
    
    if (errors.length > 0) {
      return err(new GoogleServiceError(
        `Cleanup completed with ${errors.length} error(s)`,
        'service-registry',
        'CLEANUP_PARTIAL_FAILURE',
        500,
        { errors: errors.map(e => e.toJSON()) }
      ));
    }

    this.logger.info('Service registry cleanup completed successfully');
    return ok(undefined);
  }

  /**
   * Check if the registry is initialized
   */
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get initialization order
   */
  public getInitializationOrder(): string[] {
    return [...this.initializationOrder];
  }
}