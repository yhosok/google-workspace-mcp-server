// 環境変数の型定義
export interface EnvironmentConfig {
  // Service Account Configuration
  GOOGLE_SERVICE_ACCOUNT_KEY_PATH?: string;
  GOOGLE_DRIVE_FOLDER_ID: string;

  // OAuth2 Configuration
  GOOGLE_AUTH_MODE?: 'service-account' | 'oauth2';
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT_URI?: string;
  GOOGLE_OAUTH_SCOPES?: string;
  GOOGLE_OAUTH_PORT?: number;

  // Retry Configuration
  GOOGLE_RETRY_MAX_ATTEMPTS?: number;
  GOOGLE_RETRY_BASE_DELAY?: number;
  GOOGLE_RETRY_MAX_DELAY?: number;
  GOOGLE_RETRY_JITTER?: number;
  GOOGLE_RETRY_RETRIABLE_CODES?: number[];

  // Timeout Configuration
  GOOGLE_REQUEST_TIMEOUT?: number;
  GOOGLE_TOTAL_TIMEOUT?: number;
}

// Google Sheets関連の型定義
export interface SpreadsheetInfo {
  id: string;
  title: string;
  url: string;
  modifiedTime?: string;
}

export interface SheetData {
  range: string;
  values: string[][];
  majorDimension?: string;
}

// MCPツール関連の型定義
export interface ToolMetadata {
  title: string;
  description: string;
  inputSchema: Record<string, any>;
}

export interface MCPToolResult {
  content: Array<{
    type: 'text' | 'resource_link';
    text?: string;
    uri?: string;
    name?: string;
    mimeType?: string;
    description?: string;
  }>;
  isError?: boolean;
}

// Sheetsツール用の結果型
export interface SheetsListResult {
  spreadsheets: Array<{
    id: string;
    title: string;
    url: string;
    modifiedTime?: string;
  }>;
}

export interface SheetsReadResult {
  range: string;
  values: string[][];
  majorDimension: string;
}

export interface SheetsWriteResult {
  updatedCells: number;
  updatedRows: number;
  updatedColumns: number;
}

export interface SheetsAppendResult {
  updates: {
    updatedRows: number;
    updatedCells: number;
  };
}

export interface SheetsAddSheetResult {
  sheetId: number;
  title: string;
  index: number;
  spreadsheetId: string;
}

export interface SheetsCreateSpreadsheetResult {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  sheets: Array<{
    sheetId: number;
    title: string;
    index: number;
  }>;
}

// Google Calendar関連の型定義
export interface CalendarInfo {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  kind?: string;
  etag?: string;
  conferenceProperties?: {
    allowedConferenceSolutionTypes?: string[];
  };
}

export interface CalendarListEntry {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  timeZone?: string;
  primary?: boolean;
  accessRole?: string;
  colorId?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  selected?: boolean;
  deleted?: boolean;
}

export interface CalendarEvent {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: string;
  created?: string;
  updated?: string;
  creator?: {
    id?: string;
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  organizer?: {
    id?: string;
    email?: string;
    displayName?: string;
    self?: boolean;
  };
  attendees?: Array<{
    id?: string;
    email?: string;
    displayName?: string;
    optional?: boolean;
    responseStatus?: 'needsAction' | 'declined' | 'tentative' | 'accepted';
    comment?: string;
    additionalGuests?: number;
  }>;
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method?: 'email' | 'popup';
      minutes?: number;
    }>;
  };
  recurrence?: string[];
  transparency?: 'opaque' | 'transparent';
  visibility?: 'default' | 'public' | 'private' | 'confidential';
  sequence?: number;
  htmlLink?: string;
  iCalUID?: string;
  conferenceData?: {
    createRequest?: {
      requestId?: string;
      conferenceSolutionKey?: {
        type?: string;
      };
      status?: {
        statusCode?: string;
      };
    };
    entryPoints?: Array<{
      entryPointType?: string;
      uri?: string;
      label?: string;
      pin?: string;
      accessCode?: string;
      meetingCode?: string;
      passcode?: string;
      password?: string;
    }>;
    conferenceSolution?: {
      key?: {
        type?: string;
      };
      name?: string;
      iconUri?: string;
    };
    conferenceId?: string;
    signature?: string;
    notes?: string;
  };
  gadget?: {
    type?: string;
    title?: string;
    link?: string;
    iconLink?: string;
    width?: number;
    height?: number;
    display?: string;
    preferences?: Record<string, string>;
  };
  anyoneCanAddSelf?: boolean;
  guestsCanInviteOthers?: boolean;
  guestsCanModify?: boolean;
  guestsCanSeeOtherGuests?: boolean;
  privateCopy?: boolean;
  locked?: boolean;
  source?: {
    url?: string;
    title?: string;
  };
  attachments?: Array<{
    fileUrl?: string;
    title?: string;
    mimeType?: string;
    iconLink?: string;
    fileId?: string;
  }>;
}

export interface EventListOptions {
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
  singleEvents?: boolean;
  orderBy?: 'startTime' | 'updated';
  q?: string;
  showDeleted?: boolean;
  showHiddenInvitations?: boolean;
  updatedMin?: string;
  privateExtendedProperty?: string;
  sharedExtendedProperty?: string;
  syncToken?: string;
  pageToken?: string;
}

// Calendarツール用の結果型
export interface CalendarListResult {
  calendars: CalendarListEntry[];
}

export interface CalendarEventsResult {
  events: CalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export interface CalendarEventResult {
  event: CalendarEvent;
}

export interface CalendarCreateEventResult {
  event: CalendarEvent;
}

export interface CalendarUpdateEventResult {
  event: CalendarEvent;
}

export interface CalendarDeleteEventResult {
  success: boolean;
}

export interface CalendarQuickAddResult {
  event: CalendarEvent;
}

// MCPリソース関連の型定義
export interface MCPResourceContent {
  uri: string;
  text?: string;
  mimeType?: string;
}

export interface MCPResourceResponse {
  /** Array of resource contents */
  contents: MCPResourceContent[];
}

/**
 * Configuration interface for retry behavior.
 * Used by GoogleService for handling transient failures.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts: number;

  /** Base delay in milliseconds between attempts (default: 1000) */
  baseDelay: number;

  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number;

  /** Jitter factor to randomize delays (0-1, default: 0.1) */
  jitter: number;

  /** HTTP status codes that should trigger retry attempts */
  retriableCodes: number[];
}

/**
 * HTTP status codes commonly used in Google API error handling.
 */
export enum HttpStatusCode {
  /** Request succeeded */
  OK = 200,

  /** Bad request - client error */
  BAD_REQUEST = 400,

  /** Authentication failed */
  UNAUTHORIZED = 401,

  /** Access denied */
  FORBIDDEN = 403,

  /** Resource not found */
  NOT_FOUND = 404,

  /** Request method not allowed */
  METHOD_NOT_ALLOWED = 405,

  /** Request timeout */
  REQUEST_TIMEOUT = 408,

  /** Rate limit exceeded */
  TOO_MANY_REQUESTS = 429,

  /** Internal server error */
  INTERNAL_SERVER_ERROR = 500,

  /** Bad gateway */
  BAD_GATEWAY = 502,

  /** Service unavailable */
  SERVICE_UNAVAILABLE = 503,

  /** Gateway timeout */
  GATEWAY_TIMEOUT = 504,
}

// Authentication related types
export interface AuthInfo {
  /** Whether the provider is currently authenticated */
  isAuthenticated: boolean;
  /** Service account key file path or client ID (depending on provider type) */
  keyFile: string;
  /** OAuth2 scopes granted for the authentication */
  scopes: string[];
  /** Optional token information for OAuth2 providers */
  tokenInfo?: {
    /** Token expiration date if available */
    expiresAt?: Date;
    /** Whether a valid token is currently available */
    hasToken: boolean;
  };
}
