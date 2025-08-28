// MCPツールの型定義とエクスポート用ファイル
export * from './sheets-tools.js';
export * from './calendar/index.js';

// IMPLEMENT_PLAN.mdで指定されたツール名定数
export const TOOL_NAMES = {
  SHEETS_LIST: 'sheets-list',
  SHEETS_READ: 'sheets-read',
  SHEETS_WRITE: 'sheets-write',
  SHEETS_APPEND: 'sheets-append',
  CALENDAR_LIST: 'calendar-list-calendars',
  CALENDAR_EVENTS_LIST: 'calendar-list-events',
  CALENDAR_EVENT_GET: 'calendar-get-event',
  CALENDAR_EVENT_CREATE: 'calendar-create-event',
  CALENDAR_EVENT_QUICK_ADD: 'calendar-quick-add-event',
  CALENDAR_EVENT_DELETE: 'calendar-delete-event',
} as const;
