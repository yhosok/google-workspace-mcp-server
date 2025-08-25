import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthService } from '../services/auth.service.js';
import { Result } from 'neverthrow';
import { GoogleWorkspaceError } from '../errors/index.js';

/**
 * Interface for modular service registration in the MCP server
 * Each service module encapsulates its tools, resources, and lifecycle management
 */
export interface ServiceModule {
  /** Unique identifier for the service module */
  readonly name: string;
  
  /** Display name for logging and debugging */
  readonly displayName: string;
  
  /** Service version for compatibility checks */
  readonly version: string;
  
  /**
   * Initialize the service module with required dependencies
   * @param authService - Authenticated service for Google APIs
   */
  initialize(authService: AuthService): Promise<Result<void, GoogleWorkspaceError>>;
  
  /**
   * Register all tools provided by this service module
   * @param server - The MCP server instance
   */
  registerTools(server: McpServer): Result<void, GoogleWorkspaceError>;
  
  /**
   * Register all resources provided by this service module
   * @param server - The MCP server instance
   */
  registerResources(server: McpServer): Result<void, GoogleWorkspaceError>;
  
  /**
   * Optional cleanup method for resource disposal
   * Called when the service is being shut down
   */
  cleanup?(): Promise<Result<void, GoogleWorkspaceError>>;
  
  /**
   * Check if the service module is properly initialized
   */
  isInitialized(): boolean;
  
  /**
   * Get service module health status
   */
  getHealthStatus(): ServiceModuleHealthStatus;
}

/**
 * Health status information for service modules
 */
export interface ServiceModuleHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastChecked: Date;
  metrics?: {
    toolsRegistered: number;
    resourcesRegistered: number;
    initializationTime?: number;
  };
}

/**
 * Configuration interface for service modules
 */
export interface ServiceModuleConfig {
  enabled: boolean;
  timeout?: number;
  retryAttempts?: number;
  [key: string]: unknown;
}