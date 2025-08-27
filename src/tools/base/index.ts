/**
 * Base tools module
 *
 * This module provides the foundational classes and utilities for creating
 * standardized MCP tools with consistent error handling, logging, and schema validation.
 */

export {
  ToolRegistry,
  type ToolMetadata,
  type ToolExecutionContext,
} from './tool-registry.js';

export { SchemaFactory, type SupportedTool } from './tool-schema.js';
