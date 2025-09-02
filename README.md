# Google Workspace MCP Server

[![CI](https://github.com/yourusername/google-workspace-mcp-server/workflows/CI/badge.svg)](https://github.com/yourusername/google-workspace-mcp-server/actions)

A Model Context Protocol (MCP) server for Google Workspace integration, providing seamless access to Google Sheets, Calendar, Drive, and Docs services with advanced folder management capabilities.

## Overview

This MCP server implements the [Model Context Protocol](https://modelcontextprotocol.io/) to enable Claude and other AI assistants to interact with Google Workspace resources. The server provides a standardized interface for accessing Google Sheets data, managing Calendar events, organizing Drive files, and editing Google Docs through natural language interactions.

### Key Features

- **Google Sheets Integration**: Full CRUD operations on spreadsheets with optional folder placement
- **Google Calendar Integration**: Complete calendar management with event creation, updates, and deletion
- **Google Drive Integration**: Smart file creation with folder management for organized workspace
- **Google Docs Integration**: Complete document creation, editing, and content management
- **Dual Authentication Support**: Both Service Account and OAuth2 user authentication with PKCE enhanced security
- **Advanced Timeout Control**: Dual-layer timeout protection with AbortController
- **Configurable Retry/Backoff Strategy**: Intelligent retry handling for transient API failures
- **Folder-Based Organization**: Optional GOOGLE_DRIVE_FOLDER_ID for organized file management
- **Extensible Architecture**: Plugin-based design for easy addition of new Google services
- **Type-Safe Implementation**: Built with TypeScript for reliability and maintainability
- **Access Control System**: Flexible permission management for write operations with folder, service, and tool-level restrictions
- **Comprehensive Testing**: Over 785 unit and integration tests with 100% pass rate
- **Production-Ready Error Handling**: Comprehensive error classification and recovery

### Architecture

The server follows a modular architecture with these key components:

- **Service Registry**: Manages service lifecycle and dependencies (Sheets, Calendar, Drive, Docs)
- **Service Collaboration**: DriveService integration for folder-based file creation
- **Tool System**: Implements MCP tools for specific operations
- **Resource System**: Exposes structured data through MCP resources
- **Authentication Layer**: Handles Google API authentication and token management
- **Intelligent Routing**: Automatic selection between Drive and Sheets APIs based on configuration

## Prerequisites

- Node.js >= 18.0.0
- A Google Cloud Project with Google Sheets API, Google Calendar API, Google Drive API, and Google Docs API enabled
- Authentication credentials (Service Account or OAuth2 Client credentials)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/google-workspace-mcp-server.git
cd google-workspace-mcp-server
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Authentication Setup

This server supports two authentication methods:

### Option 1: Service Account Authentication (Server-to-Server)

**Best for:** Automated workflows, server environments, accessing organization-wide resources

#### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the required Google APIs:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API" and click "Enable"
   - Search for "Google Calendar API" and click "Enable"
   - Search for "Google Drive API" and click "Enable"
   - Search for "Google Docs API" and click "Enable"

#### 2. Create a Service Account

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details
4. Click "Create and Continue"
5. Skip role assignment (or assign minimal required roles)
6. Click "Done"

#### 3. Generate Service Account Key

1. Find your service account in the credentials list
2. Click on the service account name
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Choose "JSON" format
6. Download the key file and save it securely

#### 4. Share Google Workspace Resources

For the service account to access your Google Workspace resources:

**For Google Sheets:**
1. Open the Google Sheet you want to access
2. Click "Share"
3. Add the service account email (found in the JSON key file)
4. Grant appropriate permissions (Viewer/Editor)

**For Google Calendar:**
1. Open Google Calendar
2. In the left sidebar, find the calendar you want to share
3. Click the three dots next to the calendar name
4. Select "Settings and sharing"
5. In "Share with specific people", click "Add people"
6. Add the service account email (found in the JSON key file)
7. Grant appropriate permissions (See all event details/Make changes to events)

**For Google Docs:**
1. Open the Google Doc you want to access
2. Click "Share"
3. Add the service account email (found in the JSON key file)
4. Grant appropriate permissions (Viewer/Editor)

### Option 2: OAuth2 User Authentication (Interactive)

**Best for:** Personal use, development, accessing user's own resources

This option requires both client ID and client secret, with PKCE (Proof Key for Code Exchange) providing enhanced security. PKCE follows RFC 7636 standards to protect against authorization code interception attacks, working in addition to the standard client secret authentication.

#### 1. Create OAuth2 Credentials

1. In the [Google Cloud Console](https://console.cloud.google.com/), navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Select "Desktop application" as the application type
4. Give it a name (e.g., "Google Workspace MCP Server")
5. Click "Create"
6. **Important**: Download the credentials JSON file and note both the Client ID and Client Secret - both are required for OAuth2 authentication

#### 2. Configure Redirect URI

1. Edit your OAuth2 client credentials
2. Add `http://localhost:3000/oauth2callback` to "Authorized redirect URIs"
3. Save the changes

#### 3. Configure Environment Variables

Set up your `.env` file with OAuth2 credentials (both client ID and client secret are required):
```env
GOOGLE_AUTH_MODE=oauth2
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/documents
```

**Note**: Both `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are required. PKCE security is automatically enabled to provide additional protection beyond the client secret.

#### 4. First-Time Authentication

When you first run the server with OAuth2:
1. The server will automatically open your browser
2. Sign in to your Google account
3. Grant the requested permissions
4. The server will receive the authorization and store refresh tokens securely
5. Future runs will use stored tokens automatically

#### 5. Token Security

- **Enhanced Security**: PKCE (Proof Key for Code Exchange) provides additional protection against authorization code interception attacks
- **Secure Storage**: Tokens are stored securely using your OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- **Fallback Storage**: Encrypted file storage is used if keychain access is unavailable
- **Token Management**: Refresh tokens are automatically managed and never logged
- **Client Secret Protection**: Standard OAuth2 client secret authentication is required, with PKCE providing an additional security layer

## Configuration

Create a `.env` file in the project root (use `.env.example` as template).

> **🛡️ SECURE BY DEFAULT**: The server defaults to read-only mode (`GOOGLE_READ_ONLY_MODE=true`) for enhanced security. You must explicitly set `GOOGLE_READ_ONLY_MODE=false` to enable write operations. This secure-by-default configuration ensures maximum data protection.

### Service Account Configuration

For Service Account authentication:

```env
GOOGLE_AUTH_MODE=service-account
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/your/service-account-key.json
```

### OAuth2 Configuration

For OAuth2 authentication (both client ID and client secret are required):

```env
GOOGLE_AUTH_MODE=oauth2
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/documents
GOOGLE_OAUTH_PORT=3000
```

**Security Features**:
- Standard OAuth2 client secret authentication
- PKCE (Proof Key for Code Exchange) for enhanced security
- Secure token storage with OS keychain integration

### Optional Folder Configuration

```env
# Optional folder placement for new spreadsheets
# If set, new spreadsheets will be created in this folder
# If not set, spreadsheets will be created in the default location (root)
GOOGLE_DRIVE_FOLDER_ID=your-folder-id

# Google API Retry Configuration (Optional)
GOOGLE_RETRY_MAX_ATTEMPTS=3
GOOGLE_RETRY_BASE_DELAY=1000
GOOGLE_RETRY_MAX_DELAY=30000
GOOGLE_RETRY_JITTER=0.1
GOOGLE_RETRY_RETRIABLE_CODES=429,500,502,503,504

# Timeout Configuration (Optional)
GOOGLE_REQUEST_TIMEOUT=30000
GOOGLE_TOTAL_TIMEOUT=120000
```

### Access Control Configuration

The server supports comprehensive access control to restrict write operations for enhanced security and organization. The server defaults to read-only mode (`GOOGLE_READ_ONLY_MODE=true`) for maximum security. Users must explicitly opt-in to write operations.

```env
# Folder-based write restrictions
# When GOOGLE_DRIVE_FOLDER_ID is set, restrict writes to that folder only
GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER=false  # Default: true (unrestricted)

# Service-level write permissions (comma-separated)
# Only allow write operations for specified services
GOOGLE_ALLOWED_WRITE_SERVICES=sheets,docs  # Allow: sheets, docs, calendar, drive

# Tool-specific write permissions (comma-separated)
# Only allow specific write tools to execute
GOOGLE_ALLOWED_WRITE_TOOLS=google-workspace__sheets-write,google-workspace__sheets-append

# Global read-only mode (SECURE BY DEFAULT)
# Must be explicitly set to false to enable write operations
GOOGLE_READ_ONLY_MODE=true  # Default: true (secure by default - read-only)
```

#### Access Control Modes

**Folder-based Restrictions:**
```env
# Restrict all file modifications to the specified folder
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER=false
```

**Service-level Restrictions:**
```env
# Only allow Sheets and Docs write operations
GOOGLE_ALLOWED_WRITE_SERVICES=sheets,docs
```

**Tool-specific Restrictions:**
```env
# Only allow specific write operations
GOOGLE_ALLOWED_WRITE_TOOLS=google-workspace__sheets-write,google-workspace__docs-create-document
```

**Global Read-only Mode (Default Behavior):**
```env
# Default secure behavior - all write operations disabled
GOOGLE_READ_ONLY_MODE=true  # Default configuration for maximum security
```

**Enabling Write Operations:**
```env
# Explicitly enable write operations
GOOGLE_READ_ONLY_MODE=false
```

**Unrestricted Write Access:**
```env
# Disable read-only mode to enable write operations
GOOGLE_READ_ONLY_MODE=false
# Additional write controls can then be applied as needed
```

## Usage

### Starting the Server

For development:
```bash
npm run dev
```

For production:
```bash
npm start
```

### Claude Desktop Integration

#### For Service Account Authentication

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp-server/dist/index.js"],
      "env": {
        "GOOGLE_AUTH_MODE": "service-account",
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/your/service-account-key.json",
        "GOOGLE_READ_ONLY_MODE": "false"
      }
    }
  }
}
```

> **Note**: The `GOOGLE_READ_ONLY_MODE: "false"` is required to enable write operations (secure by default configuration).

#### For OAuth2 Authentication

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp-server/dist/index.js"],
      "env": {
        "GOOGLE_AUTH_MODE": "oauth2",
        "GOOGLE_OAUTH_CLIENT_ID": "your-client-id.apps.googleusercontent.com",
        "GOOGLE_OAUTH_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_OAUTH_REDIRECT_URI": "http://localhost:3000/oauth2callback",
        "GOOGLE_OAUTH_SCOPES": "https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar,https://www.googleapis.com/auth/drive.file",
        "GOOGLE_READ_ONLY_MODE": "false"
      }
    }
  }
}
```

> **Note**: The `GOOGLE_READ_ONLY_MODE: "false"` is required to enable write operations (secure by default configuration).

## Available Tools

### Sheets Tools

#### `sheets-list`
Lists all spreadsheets accessible to the service account.

**Example usage in Claude:**
```
"Can you list all the Google Sheets I have access to?"
```

#### `sheets-read`
Reads data from a specific range in a spreadsheet.

**Parameters:**
- `spreadsheetId` (required): The ID of the spreadsheet
- `range` (required): A1 notation range (e.g., "Sheet1!A1:C10")

**Example usage in Claude:**
```
"Read data from cells A1 to D10 in the first sheet of spreadsheet [spreadsheet-id]"
```

#### `sheets-write`
Writes data to a specific range in a spreadsheet.

**Parameters:**
- `spreadsheetId` (required): The ID of the spreadsheet  
- `range` (required): A1 notation range
- `values` (required): 2D array of values to write

**Example usage in Claude:**
```
"Write the following data to cells A1:B3 in my spreadsheet:
- Name, Age
- John, 30
- Jane, 25"
```

#### `sheets-append`
Appends data to the end of a sheet.

**Parameters:**
- `spreadsheetId` (required): The ID of the spreadsheet
- `range` (required): Range to append to
- `values` (required): 2D array of values to append

**Example usage in Claude:**
```
"Add a new row with data [Product X, $50, In Stock] to my inventory spreadsheet"
```

#### `sheets-add-sheet`
Adds a new sheet (tab) to an existing spreadsheet.

**Parameters:**
- `spreadsheetId` (required): The ID of the spreadsheet
- `title` (required): Name for the new sheet
- `index` (optional): Position index for the new sheet

**Example usage in Claude:**
```
"Add a new sheet called 'Q1 Results' to my spreadsheet"
```

#### `sheets-create`
Creates a new spreadsheet with optional initial sheets.

**Parameters:**
- `title` (required): Name for the new spreadsheet
- `sheetTitles` (optional): Array of initial sheet names

**Example usage in Claude:**
```
"Create a new spreadsheet called 'Sales Report' with sheets for each quarter"
```

## Folder Management

### Optional Folder Placement

The server supports optional folder placement for new spreadsheets through the `GOOGLE_DRIVE_FOLDER_ID` environment variable:

**When configured:**
- New spreadsheets are created directly in the specified folder
- Uses DriveService for efficient folder-based creation
- Maintains all existing spreadsheet functionality

**When not configured:**
- Spreadsheets are created in the default location (root)
- Uses traditional Sheets API for backward compatibility
- No changes to existing functionality

### Benefits

- **Organization**: Keep spreadsheets organized in specific folders
- **Performance**: Direct folder creation instead of create-then-move
- **Optional Configuration**: Users without folder configuration use the default behavior (root placement)
- **Flexibility**: Per-environment folder configuration

### Usage Examples

**With folder configuration:**
```bash
# Create spreadsheet in specified folder
GOOGLE_DRIVE_FOLDER_ID=1A2B3C4D5E6F7G8H9I0J
```

**Without folder configuration:**
```bash
# Create spreadsheet in root (default behavior)
# GOOGLE_DRIVE_FOLDER_ID= (empty or not set)
```

### Calendar Tools

#### `google-workspace__calendar-list`
Lists all calendars accessible to the service account.

**Example usage in Claude:**
```
"Show me all the calendars I have access to"
```

#### `google-workspace__calendar-list-events`
Lists events from a specific calendar with optional filtering.

**Parameters:**
- `calendarId` (required): The calendar ID to list events from
- `maxResults` (optional): Maximum number of events to return
- `timeMin` (optional): Lower bound for event start time (RFC3339)
- `timeMax` (optional): Upper bound for event start time (RFC3339)
- `q` (optional): Free text search query
- `orderBy` (optional): How to order events (startTime, updated)
- `singleEvents` (optional): Whether to expand recurring events
- `showDeleted` (optional): Whether to include deleted events

**Example usage in Claude:**
```
"List all events for next week in my primary calendar"
"Show me upcoming meetings in calendar [calendar-id] with 'project' in the title"
```

#### `google-workspace__calendar-get-event`
Retrieves detailed information about a specific calendar event.

**Parameters:**
- `calendarId` (required): The calendar ID containing the event
- `eventId` (required): The unique identifier of the event

**Example usage in Claude:**
```
"Get details for event [event-id] in my calendar"
```

#### `google-workspace__calendar-create-event`
Creates a new calendar event with comprehensive options for attendees, reminders, and recurrence.

**Parameters:**
- `calendarId` (required): The calendar ID to create the event in
- `summary` (required): The title/summary of the event
- `start` (required): Start date/time of the event
- `end` (required): End date/time of the event
- `description` (optional): Detailed description of the event
- `location` (optional): Location of the event
- `attendees` (optional): List of event attendees
- `reminders` (optional): Reminder settings
- `recurrence` (optional): RRULE recurrence patterns
- `visibility` (optional): Event visibility (default, public, private, confidential)
- `transparency` (optional): Event transparency (opaque, transparent)

**Example usage in Claude:**
```
"Create a meeting called 'Team Standup' tomorrow at 9 AM for 1 hour with john@company.com and jane@company.com"
"Schedule a recurring weekly meeting 'Weekly Review' every Monday at 2 PM in Conference Room A"
```

#### `google-workspace__calendar-quick-add`
Creates a calendar event using natural language text with intelligent parsing of dates, times, and locations.

**Parameters:**
- `calendarId` (required): The calendar ID to create the event in
- `text` (required): Natural language description of the event

**Example usage in Claude:**
```
"Add 'Lunch with client at Joe's Pizza tomorrow at 12:30 PM' to my calendar"
"Quick add 'Doctor appointment Friday 3 PM' to my calendar"
```

#### `google-workspace__calendar-delete-event`
Deletes a calendar event with optional attendee notifications.

**Parameters:**
- `calendarId` (required): The calendar ID containing the event
- `eventId` (required): The unique identifier of the event to delete
- `sendUpdates` (optional): Whether to send cancellation emails (all, externalOnly, none)

**Example usage in Claude:**
```
"Delete the meeting [event-id] from my calendar and notify all attendees"
```

### Drive Tools

#### `google-workspace__drive-list`
Lists files in Google Drive with optional filtering and search capabilities.

**Parameters:**
- `query` (optional): Search query string (e.g., "name contains 'report'" or "mimeType='application/vnd.google-apps.spreadsheet'")
- `maxResults` (optional): Maximum number of files to return (default: 10, max: 1000)
- `orderBy` (optional): Sort order (name, createdTime, modifiedTime, size)
- `folderId` (optional): List files only in specific folder
- `pageToken` (optional): Token for pagination

**Example usage in Claude:**
```
"List all my Google Drive files"
"Show me spreadsheets created in the last month"
"Find files with 'budget' in the name"
"List files in folder [folder-id]"
```

#### `google-workspace__drive-get`
Retrieves comprehensive metadata for a specific Google Drive file.

**Parameters:**
- `fileId` (required): The ID of the file to retrieve
- `includePermissions` (optional): Include file sharing permissions (default: false)

**Example usage in Claude:**
```
"Get details for file [file-id]"
"Show me metadata for this document including who has access"
```

#### `google-workspace__drive-get-content`
Downloads and retrieves the content of a Google Drive file, with automatic export for Google Workspace files.

**Parameters:**
- `fileId` (required): The ID of the file to download
- `exportFormat` (optional): Export format for Google Workspace files (pdf, docx, xlsx, pptx, odt, txt, html, etc.)

**Supported Export Formats:**
- **Google Docs**: pdf, docx, odt, txt, html
- **Google Sheets**: pdf, xlsx, csv, tsv, ods, html
- **Google Slides**: pdf, pptx, odp, txt, html, jpeg, png
- **Google Drawings**: pdf, svg, png, jpeg

**Example usage in Claude:**
```
"Download file [file-id]"
"Export this Google Doc as PDF"
"Get the content of this spreadsheet as Excel format"
"Download this presentation as PowerPoint"
```

### Docs Tools

#### `google-workspace__docs__create`
Creates a new Google Document with the specified title and optional folder placement.

**Parameters:**
- `title` (required): The title of the new document
- `folderId` (optional): Optional folder ID where the document should be created

**Example usage in Claude:**
```
"Create a new document called 'Project Report'"
"Create a document titled 'Meeting Notes' in folder [folder-id]"
```

#### `google-workspace__docs__get`
Retrieves Google Document metadata and optional content.

**Parameters:**
- `documentId` (required): The unique identifier of the Google Docs document
- `includeContent` (optional): Whether to include the document body content in the response

**Example usage in Claude:**
```
"Get metadata for document [document-id]"
"Get the full content of document [document-id]"
```

#### `google-workspace__docs__update`
Performs batch updates on Google Documents using the Google Docs API batch update system.

**Parameters:**
- `documentId` (required): The unique identifier of the Google Docs document
- `requests` (required): Array of batch update requests to apply to the document (max 500)

**Example usage in Claude:**
```
"Apply these batch updates to document [document-id]: [insert text at index 0, format paragraph]"
"Update document [document-id] with multiple text insertions and formatting changes"
```

#### `google-workspace__docs__insert-text`
Inserts text at a specific position in a Google Document.

**Parameters:**
- `documentId` (required): The unique identifier of the Google Docs document
- `text` (required): Text content to insert into the document
- `index` (optional): Zero-based index position where text should be inserted (defaults to beginning)

**Example usage in Claude:**
```
"Insert 'Hello World' at the beginning of document [document-id]"
"Insert 'New paragraph content' at position 100 in document [document-id]"
```

#### `google-workspace__docs__replace-text`
Replaces all occurrences of specified text in a Google Document.

**Parameters:**
- `documentId` (required): The unique identifier of the Google Docs document
- `searchText` (required): Text to search for in the document
- `replaceText` (required): Text to replace the search text with
- `matchCase` (optional): Whether the search should be case-sensitive

**Example usage in Claude:**
```
"Replace all instances of 'draft' with 'final' in document [document-id]"
"Replace 'Project X' with 'Project Alpha' in document [document-id] with case sensitivity"
```

## Retry and Error Handling

### Automatic Retry Strategy

All Google API operations include intelligent retry handling with exponential backoff:

- **Configurable Parameters**: Customize retry behavior via environment variables
- **Smart Error Classification**: Automatic retry for transient failures (rate limits, server errors)
- **Exponential Backoff with Jitter**: Prevents thundering herd problems
- **Detailed Logging**: Comprehensive retry attempt logging for debugging

### Retriable Conditions

- **HTTP 429**: Rate limit exceeded (respects retry-after headers)
- **HTTP 500**: Internal server error
- **HTTP 502**: Bad gateway
- **HTTP 503**: Service unavailable
- **HTTP 504**: Gateway timeout

### Configuration Options

| Parameter | Default | Description |
|-----------|---------|-------------|
| `GOOGLE_RETRY_MAX_ATTEMPTS` | 3 | Maximum retry attempts |
| `GOOGLE_RETRY_BASE_DELAY` | 1000ms | Initial delay between attempts |
| `GOOGLE_RETRY_MAX_DELAY` | 30000ms | Maximum delay cap |
| `GOOGLE_RETRY_JITTER` | 0.1 | Randomization factor (0-1) |
| `GOOGLE_RETRY_RETRIABLE_CODES` | 429,500,502,503,504 | HTTP codes that trigger retry |

### Example Retry Log Output

```
SheetsService: Attempt 1/3 failed, retrying in 1500ms (reason: retriable_http_status: 500)
SheetsService: Attempt 2/3 failed, retrying in 3200ms (reason: retriable_http_status: 502)
SheetsService: Operation 'readRange' succeeded on attempt 3
```

## Available Resources

### `spreadsheet-schema`
Provides structural information about spreadsheets, including sheet names, dimensions, and data types.

### `spreadsheet-data`
Offers static reference to spreadsheet data for context and analysis.

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Linting and Formatting

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting errors
npm run lint:fix

# Format code with Prettier
npm run format

# Check code formatting without making changes
npm run format:check
```

### Building

```bash
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests: `npm test`
5. Run linting: `npm run lint`
6. Commit your changes: `git commit -m 'Add amazing feature'`
7. Push to the branch: `git push origin feature/amazing-feature`
8. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Troubleshooting

### Common Issues

#### Service Account Authentication Issues

**"Authentication failed"**
- Verify that your service account key file path is correct
- Ensure the service account has been granted access to the specific Google Sheets/Calendars/Docs
- Check that the Google Sheets API, Google Calendar API, Google Drive API, and Google Docs API are enabled in your Google Cloud project

**"Spreadsheet not found"**
- Confirm the spreadsheet ID is correct
- Verify the service account has been shared with the spreadsheet
- Check that the spreadsheet hasn't been deleted or moved

**"Permission denied"**
- Ensure the service account has appropriate permissions
- Verify the required scopes are included in your configuration
- Check that the service account key hasn't expired

#### OAuth2 Authentication Issues

**"OAuth2 authorization required"**
- Run the server once to complete the initial OAuth2 flow
- Check that your browser opens automatically during first setup
- Verify that you've granted all requested permissions

**"OAuth2 client configuration error"**
- Ensure both `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are provided and correct
- Both client ID and client secret are required - verify both values from your Google Cloud Console credentials
- Verify the redirect URI matches: `http://localhost:3000/oauth2callback`
- Check that the OAuth2 client is configured for "Desktop application"

**"Token storage error"**
- On macOS: Check Keychain access permissions
- On Windows: Verify Credential Manager is accessible
- On Linux: Ensure Secret Service is available
- Fallback: Check file permissions in `~/.config/google-workspace-mcp/`

**"Browser doesn't open automatically"**
- Copy the authorization URL from the console and open manually
- Check if `open` command is available on your system

#### Access Control Issues

**"Operation blocked by access control"**
- Check your access control configuration settings
- Verify that the required service is allowed in `GOOGLE_ALLOWED_WRITE_SERVICES`
- Ensure the specific tool is permitted in `GOOGLE_ALLOWED_WRITE_TOOLS`
- Confirm you have explicitly enabled write operations (`GOOGLE_READ_ONLY_MODE=false`) - the server defaults to read-only for security

**"Folder access denied"**
- When `GOOGLE_DRIVE_FOLDER_ID` is set with `GOOGLE_ALLOW_WRITES_OUTSIDE_FOLDER=false`
- Ensure you're trying to modify files within the allowed folder
- Verify the folder ID is correct and the service account has access to it
- Check that the file you're trying to modify is actually in the specified folder

**"Write operation not permitted"**
- Verify `GOOGLE_READ_ONLY_MODE` is explicitly set to `false` (default is `true` for security)
- Check that the service (sheets, docs, calendar, drive) is included in `GOOGLE_ALLOWED_WRITE_SERVICES`
- Ensure the specific tool name is listed in `GOOGLE_ALLOWED_WRITE_TOOLS` if using tool-level restrictions
- Confirm your authentication has the necessary scopes for write operations
- Verify no firewall is blocking localhost connections

**"Refresh token expired"**
- Delete stored tokens and re-authenticate: `rm -rf ~/.config/google-workspace-mcp/`
- Or clear OS keychain entries for "google-workspace-mcp"
- Run the server again to complete new OAuth2 flow

#### "Rate limit exceeded" (HTTP 429)
- The server automatically handles rate limits with exponential backoff
- Consider adjusting `GOOGLE_RETRY_MAX_DELAY` for longer operations
- Monitor retry logs to understand usage patterns
- Consider implementing request batching for high-volume operations

#### Tuning Retry Configuration

**For Development/Testing:**
```env
# Faster retries for development
GOOGLE_RETRY_MAX_ATTEMPTS=2
GOOGLE_RETRY_BASE_DELAY=500
GOOGLE_RETRY_MAX_DELAY=5000
```

**For Production/High-Volume:**
```env
# More resilient settings for production
GOOGLE_RETRY_MAX_ATTEMPTS=5
GOOGLE_RETRY_BASE_DELAY=2000
GOOGLE_RETRY_MAX_DELAY=60000
```

### Getting Help

- Check the [Issues](https://github.com/yourusername/google-workspace-mcp-server/issues) page
- Review the [Model Context Protocol documentation](https://modelcontextprotocol.io/)
- Consult the [Google Sheets API documentation](https://developers.google.com/sheets/api)
- Refer to the [Google Calendar API documentation](https://developers.google.com/calendar)
- See the [Google Drive API documentation](https://developers.google.com/drive)
- Check the [Google Docs API documentation](https://developers.google.com/docs)

## Roadmap

- [x] Google Sheets integration with full CRUD operations
- [x] Google Calendar support with event management
- [x] Service Account authentication
- [x] OAuth2 user authentication with secure token storage
- [x] Advanced retry/backoff strategy with timeout control
- [x] Comprehensive error handling and logging
- [x] Google Drive service abstraction with folder management
- [x] Optional folder-based spreadsheet creation (GOOGLE_DRIVE_FOLDER_ID)
- [x] Google Drive search and reference functionality (list, get, get-content)
- [x] Google Docs integration with full document management (create, get, update, insert-text, replace-text)
- [ ] Additional Google Drive file operations (upload, modify, share)
- [ ] Batch operations support
- [ ] Real-time updates via webhooks
- [ ] Google Forms integration
- [ ] Google Meet integration