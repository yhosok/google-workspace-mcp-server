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

export {
  ALL_TOOLS,
  SHEETS_TOOLS,
  DRIVE_TOOLS,
  CALENDAR_TOOLS,
  DOCS_TOOLS,
  TOOL_METADATA,
  TOOLS_BY_SERVICE,
  getToolMetadata,
  isToolFromService,
  getToolsForService,
  isValidToolId,
  type SupportedToolId,
  type SheetsToolId,
  type DriveToolId,
  type CalendarToolId,
  type DocsToolId,
} from './tool-definitions.js';
