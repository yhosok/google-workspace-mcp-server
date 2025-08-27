import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import { Result } from 'neverthrow';
import { GoogleWorkspaceError } from '../../errors/index.js';
import { Logger, createServiceLogger } from '../../utils/logger.js';
import type { MCPToolResult } from '../../types/index.js';

/**
 * Tool metadata interface for consistent typing
 */
export interface ToolMetadata {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodType>;
}

/**
 * Tool execution context for enhanced debugging
 */
export interface ToolExecutionContext {
  toolName: string;
  startTime: number;
  requestId?: string;
}

/**
 * Base abstract class for tool registration in the MCP server.
 * Provides a consistent pattern for tool registration with error handling and logging.
 * Uses Result pattern for unified error handling across all tools.
 */
export abstract class ToolRegistry<TInput = unknown, TOutput = unknown> {
  protected logger: Logger;

  constructor(logger?: Logger) {
    this.logger = logger || createServiceLogger('tool-registry');
  }

  /**
   * Abstract method to get the tool name for registration
   */
  public abstract getToolName(): string;

  /**
   * Abstract method to get tool metadata for registration
   */
  public abstract getToolMetadata(): ToolMetadata;

  /**
   * Abstract method to implement the actual tool execution logic
   * @param params - The validated input parameters
   * @param context - Execution context for debugging and tracing
   * @returns Promise resolving to Result<TOutput, GoogleWorkspaceError>
   */
  public abstract executeImpl(
    params: TInput,
    context?: ToolExecutionContext
  ): Promise<Result<TOutput, GoogleWorkspaceError>>;

  /**
   * Registers the tool with the MCP server with enhanced error handling and context
   */
  public registerTool(server: McpServer): void {
    const toolName = this.getToolName();
    const metadata = this.getToolMetadata();

    this.logger.info('Registering tool', {
      toolName,
      title: metadata.title,
    });

    server.registerTool(
      toolName,
      {
        title: metadata.title,
        description: metadata.description,
        inputSchema: metadata.inputSchema,
      },
      async (params: unknown) => {
        const context: ToolExecutionContext = {
          toolName,
          startTime: Date.now(),
          requestId: this.generateRequestId(),
        };

        try {
          this.logger.debug('Executing tool', {
            toolName,
            requestId: context.requestId,
            params: this.sanitizeParams(params),
          });

          const result = await this.executeImpl(params as TInput, context);

          const executionTime = Date.now() - context.startTime;

          return result.match(
            value => {
              this.logger.info('Tool execution completed', {
                toolName,
                requestId: context.requestId,
                executionTime,
              });

              // Convert result to MCPToolResult format
              return this.convertToMcpToolResult(value);
            },
            error => {
              this.logger.error('Tool execution failed', {
                toolName,
                requestId: context.requestId,
                executionTime,
                error: error.toJSON(),
              });

              // MCP server expects thrown errors for failures
              throw error;
            }
          );
        } catch (error) {
          const executionTime = Date.now() - context.startTime;
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          const errorStack = error instanceof Error ? error.stack : undefined;

          this.logger.error('Tool execution failed', {
            toolName,
            requestId: context.requestId,
            executionTime,
            error: errorMessage,
            stack: errorStack,
          });

          throw error;
        }
      }
    );
  }

  /**
   * Generates a unique request ID for tracing
   */
  protected generateRequestId(): string {
    return `${this.getToolName()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert tool result to MCP tool result format
   */
  protected convertToMcpToolResult(value: TOutput): any {
    // If value is already in MCPToolResult format, return as-is
    if (value && typeof value === 'object' && 'content' in value) {
      return value;
    }

    // Convert plain values to MCPToolResult format
    return {
      content: [
        {
          type: 'text',
          text:
            typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        },
      ],
    };
  }

  /**
   * Sanitizes parameters for logging (removes sensitive data)
   */
  protected sanitizeParams(params: unknown): unknown {
    if (typeof params !== 'object' || params === null) {
      return params;
    }

    const sanitized = { ...params } as Record<string, unknown>;

    // Remove or mask potentially sensitive fields
    const sensitiveFields = ['token', 'password', 'secret', 'key', 'auth'];

    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '***MASKED***';
      }
    }

    return sanitized;
  }
}
