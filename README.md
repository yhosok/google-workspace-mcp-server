# Google Workspace MCP Server

[![CI](https://github.com/yourusername/google-workspace-mcp-server/workflows/CI/badge.svg)](https://github.com/yourusername/google-workspace-mcp-server/actions)

A Model Context Protocol (MCP) server for Google Workspace integration, providing seamless access to Google Sheets and other Google Workspace services.

## Overview

This MCP server implements the [Model Context Protocol](https://modelcontextprotocol.io/) to enable Claude and other AI assistants to interact with Google Workspace resources. The server provides a standardized interface for accessing Google Sheets data, making it easy to read, write, and manage spreadsheet content through natural language interactions.

### Key Features

- **Google Sheets Integration**: Full CRUD operations on spreadsheets
- **Google Calendar Integration**: Complete calendar management with event creation, updates, and deletion
- **Dual Authentication Support**: Both Service Account and OAuth2 user authentication
- **Advanced Timeout Control**: Dual-layer timeout protection with AbortController
- **Configurable Retry/Backoff Strategy**: Intelligent retry handling for transient API failures
- **Extensible Architecture**: Plugin-based design for easy addition of new Google services
- **Type-Safe Implementation**: Built with TypeScript for reliability and maintainability
- **Comprehensive Testing**: Over 512 unit and integration tests with 100% pass rate
- **Production-Ready Error Handling**: Comprehensive error classification and recovery

### Architecture

The server follows a modular architecture with these key components:

- **Service Registry**: Manages service lifecycle and dependencies
- **Tool System**: Implements MCP tools for specific operations
- **Resource System**: Exposes structured data through MCP resources
- **Authentication Layer**: Handles Google API authentication and token management

## Prerequisites

- Node.js >= 18.0.0
- A Google Cloud Project with Google Sheets API and Google Calendar API enabled
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

### Option 2: OAuth2 User Authentication (Interactive)

**Best for:** Personal use, development, accessing user's own resources

#### 1. Create OAuth2 Credentials

1. In the [Google Cloud Console](https://console.cloud.google.com/), navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Select "Desktop application" as the application type
4. Give it a name (e.g., "Google Workspace MCP Server")
5. Click "Create"
6. Download the credentials JSON file or note the Client ID and Client Secret

#### 2. Configure Redirect URI

1. Edit your OAuth2 client credentials
2. Add `http://localhost:3000/oauth2callback` to "Authorized redirect URIs"
3. Save the changes

#### 3. Configure Environment Variables

Set up your `.env` file with OAuth2 credentials:
```env
GOOGLE_AUTH_MODE=oauth2
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar
```

#### 4. First-Time Authentication

When you first run the server with OAuth2:
1. The server will automatically open your browser
2. Sign in to your Google account
3. Grant the requested permissions
4. The server will receive the authorization and store refresh tokens securely
5. Future runs will use stored tokens automatically

#### 5. Token Security

- Tokens are stored securely using your OS keychain (Keychain on macOS, Credential Manager on Windows, Secret Service on Linux)
- Fallback encrypted file storage is used if keychain access is unavailable
- Refresh tokens are automatically managed and never logged

## Configuration

Create a `.env` file in the project root (use `.env.example` as template).

### Service Account Configuration

For Service Account authentication:

```env
GOOGLE_AUTH_MODE=service-account
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/your/service-account-key.json
```

### OAuth2 Configuration

For OAuth2 authentication:

```env
GOOGLE_AUTH_MODE=oauth2
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_OAUTH_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar
GOOGLE_OAUTH_PORT=3000
```

### Optional Settings

```env
# Google Drive Folder ID (optional - limits access to specific folder)
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
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/your/service-account-key.json"
      }
    }
  }
}
```

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
        "GOOGLE_OAUTH_SCOPES": "https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/calendar"
      }
    }
  }
}
```

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
- Ensure the service account has been granted access to the specific Google Sheets/Calendars
- Check that the Google Sheets API and Google Calendar API are enabled in your Google Cloud project

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
- Ensure `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are correct
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

## Roadmap

- [x] Google Sheets integration with full CRUD operations
- [x] Google Calendar support with event management
- [x] Service Account authentication
- [x] OAuth2 user authentication with secure token storage
- [x] Advanced retry/backoff strategy with timeout control
- [x] Comprehensive error handling and logging
- [ ] Google Drive file operations
- [ ] Google Docs integration  
- [ ] Batch operations support
- [ ] Real-time updates via webhooks
- [ ] Google Forms integration
- [ ] Google Meet integration