/**
 * Google Calendar Tools Export Module
 *
 * This module exports all Calendar-related MCP tools for use in the service registry.
 * Each tool provides specific Calendar API functionality with comprehensive input
 * validation, error handling, and detailed response formatting.
 *
 * Available Tools:
 * - ListCalendarsTool: List all accessible calendars
 * - ListEventsTool: List events from a specific calendar with filtering
 * - GetEventTool: Get detailed information about a specific event
 * - CreateEventTool: Create new events with full configuration options
 * - QuickAddTool: Create events using natural language parsing
 * - DeleteEventTool: Delete events with optional attendee notifications
 */

export { BaseCalendarTools } from './base-calendar-tool.js';
export { ListCalendarsTool } from './list-calendars.tool.js';
export { ListEventsTool } from './list-events.tool.js';
export { GetEventTool } from './get-event.tool.js';
export { CreateEventTool } from './create-event.tool.js';
export { QuickAddTool } from './quick-add.tool.js';
export { DeleteEventTool } from './delete-event.tool.js';

// Import for object literal usage
import { ListCalendarsTool } from './list-calendars.tool.js';
import { ListEventsTool } from './list-events.tool.js';
import { GetEventTool } from './get-event.tool.js';
import { CreateEventTool } from './create-event.tool.js';
import { QuickAddTool } from './quick-add.tool.js';
import { DeleteEventTool } from './delete-event.tool.js';

// Tool registry for easy instantiation
export const CALENDAR_TOOLS = {
  ListCalendarsTool,
  ListEventsTool,
  GetEventTool,
  CreateEventTool,
  QuickAddTool,
  DeleteEventTool,
} as const;

// Tool names for registration
export const CALENDAR_TOOL_NAMES = {
  LIST_CALENDARS: 'google-workspace__calendar-list',
  LIST_EVENTS: 'google-workspace__calendar-list-events',
  GET_EVENT: 'google-workspace__calendar-get-event',
  CREATE_EVENT: 'google-workspace__calendar-create-event',
  QUICK_ADD: 'google-workspace__calendar-quick-add',
  DELETE_EVENT: 'google-workspace__calendar-delete-event',
} as const;
