# Google Workspace MCP Server

[![CI](https://github.com/yourusername/google-workspace-mcp-server/workflows/CI/badge.svg)](https://github.com/yourusername/google-workspace-mcp-server/actions)

A Model Context Protocol (MCP) server for Google Workspace integration, providing seamless access to Google Sheets and other Google Workspace services.

## Overview

This MCP server implements the [Model Context Protocol](https://modelcontextprotocol.io/) to enable Claude and other AI assistants to interact with Google Workspace resources. The server provides a standardized interface for accessing Google Sheets data, making it easy to read, write, and manage spreadsheet content through natural language interactions.

### Key Features

- **Google Sheets Integration**: Full CRUD operations on spreadsheets
- **Service Account Authentication**: Secure authentication using Google service accounts
- **Extensible Architecture**: Plugin-based design for easy addition of new Google services
- **Type-Safe Implementation**: Built with TypeScript for reliability and maintainability
- **Comprehensive Testing**: Over 200 unit and integration tests

### Architecture

The server follows a modular architecture with these key components:

- **Service Registry**: Manages service lifecycle and dependencies
- **Tool System**: Implements MCP tools for specific operations
- **Resource System**: Exposes structured data through MCP resources
- **Authentication Layer**: Handles Google API authentication and token management

## Prerequisites

- Node.js >= 18.0.0
- A Google Cloud Project with Google Sheets API enabled
- Google Service Account with appropriate permissions

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

## Google Workspace Setup

### 1. Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Sheets API:
   - Navigate to "APIs & Services" > "Library"
   - Search for "Google Sheets API"
   - Click "Enable"

### 2. Create a Service Account

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Fill in the service account details
4. Click "Create and Continue"
5. Skip role assignment (or assign minimal required roles)
6. Click "Done"

### 3. Generate Service Account Key

1. Find your service account in the credentials list
2. Click on the service account name
3. Go to the "Keys" tab
4. Click "Add Key" > "Create new key"
5. Choose "JSON" format
6. Download the key file and save it securely

### 4. Share Google Sheets

For the service account to access your Google Sheets:
1. Open the Google Sheet you want to access
2. Click "Share"
3. Add the service account email (found in the JSON key file)
4. Grant appropriate permissions (Viewer/Editor)

## Configuration

Create a `.env` file in the project root (use `.env.example` as template):

```env
# Google Service Account Configuration
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=/path/to/your/service-account-key.json

# Google Drive Folder ID (optional - limits access to specific folder)
GOOGLE_DRIVE_FOLDER_ID=your-folder-id

# Google API Scopes
GOOGLE_WORKSPACE_SCOPES=https://www.googleapis.com/auth/spreadsheets,https://www.googleapis.com/auth/drive.readonly
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

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "command": "node",
      "args": ["/path/to/google-workspace-mcp-server/dist/index.js"],
      "env": {
        "GOOGLE_SERVICE_ACCOUNT_KEY_PATH": "/path/to/your/service-account-key.json"
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

### Linting

```bash
# Check for linting errors
npm run lint

# Fix auto-fixable linting errors
npm run lint:fix
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

#### "Authentication failed"
- Verify that your service account key file path is correct
- Ensure the service account has been granted access to the specific Google Sheets
- Check that the Google Sheets API is enabled in your Google Cloud project

#### "Spreadsheet not found"
- Confirm the spreadsheet ID is correct
- Verify the service account has been shared with the spreadsheet
- Check that the spreadsheet hasn't been deleted or moved

#### "Permission denied"
- Ensure the service account has appropriate permissions
- Verify the required scopes are included in your configuration
- Check that the service account key hasn't expired

### Getting Help

- Check the [Issues](https://github.com/yourusername/google-workspace-mcp-server/issues) page
- Review the [Model Context Protocol documentation](https://modelcontextprotocol.io/)
- Consult the [Google Sheets API documentation](https://developers.google.com/sheets/api)

## Roadmap

- [ ] Google Drive file operations
- [ ] Google Docs integration  
- [ ] Google Calendar support
- [ ] Advanced authentication options (OAuth 2.0)
- [ ] Batch operations support
- [ ] Real-time updates via webhooks