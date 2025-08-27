/**
 * Structured logging system for Google Workspace MCP Server
 *
 * This module provides enterprise-grade logging capabilities with:
 * - Structured log format (JSON)
 * - Multiple log levels
 * - Context preservation
 * - Debug mode support
 * - Performance tracking
 * - Error serialization
 */

import { GoogleWorkspaceError } from '../errors/index.js';

/**
 * Available log levels in order of severity
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  FATAL = 4,
}

/**
 * Log entry structure
 */
export interface LogEntry {
  /**
   * Timestamp in ISO format
   */
  timestamp: string;

  /**
   * Log level
   */
  level: LogLevel;

  /**
   * Log level name
   */
  levelName: string;

  /**
   * Log message
   */
  message: string;

  /**
   * Additional context data
   */
  context?: Record<string, unknown>;

  /**
   * Error information if applicable
   */
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    statusCode?: number;
  };

  /**
   * Source information
   */
  source: {
    service: string;
    operation?: string;
    requestId?: string;
  };

  /**
   * Performance metrics
   */
  performance?: {
    duration?: number;
    memoryUsage?: NodeJS.MemoryUsage;
  };
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output
   */
  level: LogLevel;

  /**
   * Whether to enable debug mode
   */
  debugMode: boolean;

  /**
   * Service name for source identification
   */
  serviceName: string;

  /**
   * Whether to include performance metrics
   */
  includePerformanceMetrics: boolean;

  /**
   * Whether to pretty-print JSON output
   */
  prettyPrint: boolean;

  /**
   * Custom output function (defaults to console)
   */
  outputFn?: (entry: LogEntry) => void;
}

/**
 * Default logger configuration
 */
export const DEFAULT_LOGGER_CONFIG: LoggerConfig = {
  level:
    process.env.NODE_ENV === 'production'
      ? LogLevel.INFO
      : process.env.NODE_ENV === 'test'
        ? LogLevel.ERROR // Minimize log output during testing
        : LogLevel.DEBUG,
  debugMode:
    process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development', // Simplified condition
  serviceName: 'google-workspace-mcp',
  includePerformanceMetrics: process.env.NODE_ENV === 'development',
  prettyPrint: false, // Always use compact JSON to prevent stdout pollution
  outputFn: (entry: LogEntry) => {
    // Always write logs to stderr to prevent JSON-RPC stdout pollution
    process.stderr.write(JSON.stringify(entry) + '\n');
  },
};

/**
 * Performance timer for measuring operation duration
 */
export interface PerformanceTimer {
  start: [number, number];
  label: string;
}

/**
 * Structured logger implementation
 */
export class Logger {
  private readonly config: LoggerConfig;
  private readonly performanceTimers: Map<string, PerformanceTimer> = new Map();

  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = { ...DEFAULT_LOGGER_CONFIG, ...config };
  }

  /**
   * Create a child logger with additional context
   */
  public child(context: Record<string, unknown>): Logger {
    const childLogger = new Logger(this.config);
    childLogger.addContext(context);
    return childLogger;
  }

  /**
   * Add persistent context to all log entries
   */
  private additionalContext: Record<string, unknown> = {};

  public addContext(context: Record<string, unknown>): void {
    Object.assign(this.additionalContext, context);
  }

  /**
   * Log a debug message
   */
  public debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, message, context);
  }

  /**
   * Log an info message
   */
  public info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, message, context);
  }

  /**
   * Log a warning message
   */
  public warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, message, context);
  }

  /**
   * Log an error message
   */
  public error(
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Log a fatal error message
   */
  public fatal(
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    this.log(LogLevel.FATAL, message, context, error);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error
  ): void {
    // Skip if below configured log level
    if (level < this.config.level) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];

    // Merge contexts
    const mergedContext = {
      ...this.additionalContext,
      ...context,
    };

    // Extract source information
    const source = {
      service: this.config.serviceName,
      operation: mergedContext.operation as string | undefined,
      requestId: mergedContext.requestId as string | undefined,
    };

    // Create base log entry
    const entry: LogEntry = {
      timestamp,
      level,
      levelName,
      message,
      context:
        Object.keys(mergedContext).length > 0 ? mergedContext : undefined,
      source,
    };

    // Add error information if provided
    if (error) {
      entry.error = this.serializeError(error);
    }

    // Add performance metrics if enabled
    if (this.config.includePerformanceMetrics) {
      entry.performance = {
        memoryUsage: process.memoryUsage(),
      };
    }

    // Output the log entry
    this.output(entry);
  }

  /**
   * Serialize error for logging
   */
  private serializeError(error: Error): LogEntry['error'] {
    const serialized: LogEntry['error'] = {
      name: error.name,
      message: error.message,
      stack: this.config.debugMode ? error.stack : undefined,
    };

    // Add custom error properties if it's our GoogleWorkspaceError
    if (error instanceof GoogleWorkspaceError) {
      serialized.code = error.code;
      serialized.statusCode = error.statusCode;
    }

    return serialized;
  }

  /**
   * Output log entry to configured destination
   */
  private output(entry: LogEntry): void {
    if (this.config.outputFn) {
      this.config.outputFn(entry);
    } else {
      const output = this.config.prettyPrint
        ? JSON.stringify(entry, null, 2)
        : JSON.stringify(entry);

      // Use appropriate console method based on log level
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(output);
          break;
        case LogLevel.INFO:
          console.info(output);
          break;
        case LogLevel.WARN:
          console.warn(output);
          break;
        case LogLevel.ERROR:
        case LogLevel.FATAL:
          console.error(output);
          break;
      }
    }
  }

  /**
   * Start a performance timer
   */
  public startTimer(label: string): void {
    this.performanceTimers.set(label, {
      start: process.hrtime(),
      label,
    });
  }

  /**
   * End a performance timer and log the duration
   */
  public endTimer(
    label: string,
    message?: string,
    context?: Record<string, unknown>
  ): void {
    const timer = this.performanceTimers.get(label);
    if (!timer) {
      this.warn(`Performance timer '${label}' not found`);
      return;
    }

    const [seconds, nanoseconds] = process.hrtime(timer.start);
    const duration = seconds * 1000 + nanoseconds / 1000000; // Convert to milliseconds

    this.performanceTimers.delete(label);

    const timerMessage = message || `Operation '${label}' completed`;
    const timerContext = {
      ...context,
      performance: { duration, label },
    };

    this.info(timerMessage, timerContext);
  }

  /**
   * Measure and log the execution time of an async operation
   */
  public async measureAsync<T>(
    label: string,
    operation: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    this.startTimer(label);

    try {
      const result = await operation();
      this.endTimer(
        label,
        `Async operation '${label}' completed successfully`,
        context
      );
      return result;
    } catch (error) {
      this.endTimer(label, `Async operation '${label}' failed`, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Measure and log the execution time of a sync operation
   */
  public measure<T>(
    label: string,
    operation: () => T,
    context?: Record<string, unknown>
  ): T {
    this.startTimer(label);

    try {
      const result = operation();
      this.endTimer(
        label,
        `Operation '${label}' completed successfully`,
        context
      );
      return result;
    } catch (error) {
      this.endTimer(label, `Operation '${label}' failed`, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Log an operation lifecycle (start -> end)
   */
  public logOperation<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>
  ): Promise<T> {
    const requestId = this.generateRequestId();
    const operationContext = { ...context, operation, requestId };

    this.info(`Starting operation: ${operation}`, operationContext);

    return this.measureAsync(`operation-${operation}`, fn, operationContext)
      .then(result => {
        this.info(`Completed operation: ${operation}`, operationContext);
        return result;
      })
      .catch(error => {
        this.error(
          `Failed operation: ${operation}`,
          operationContext,
          error instanceof Error ? error : new Error(String(error))
        );
        throw error;
      });
  }

  /**
   * Create a scoped logger for a specific operation
   */
  public forOperation(operation: string, requestId?: string): Logger {
    const childLogger = this.child({
      operation,
      requestId: requestId || this.generateRequestId(),
    });

    return childLogger;
  }

  /**
   * Generate a unique request ID
   */
  private generateRequestId(): string {
    return `${this.config.serviceName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check if a log level is enabled
   */
  public isLevelEnabled(level: LogLevel): boolean {
    return level >= this.config.level;
  }

  /**
   * Get current logger configuration
   */
  public getConfig(): Readonly<LoggerConfig> {
    return { ...this.config };
  }

  /**
   * Update logger configuration
   */
  public updateConfig(updates: Partial<LoggerConfig>): void {
    Object.assign(this.config, updates);
  }
}

/**
 * Default logger instance
 */
export const logger = new Logger();

/**
 * Create a logger for a specific service
 */
export function createServiceLogger(
  serviceName: string,
  config?: Partial<LoggerConfig>
): Logger {
  return new Logger({
    ...DEFAULT_LOGGER_CONFIG,
    ...config,
    serviceName,
  });
}

/**
 * Utility function to format errors for logging
 */
export function formatErrorForLog(error: Error): Record<string, unknown> {
  const formatted: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error instanceof GoogleWorkspaceError) {
    formatted.code = error.code;
    formatted.statusCode = error.statusCode;
    formatted.context = error.context;
    formatted.timestamp = error.timestamp.toISOString();
  }

  return formatted;
}

/**
 * Log level names for display/configuration
 */
export const LOG_LEVEL_NAMES = Object.keys(LogLevel).filter(key =>
  isNaN(Number(key))
);
