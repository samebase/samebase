# GitHub Codespace Connection Specification

## Overview
This document outlines how Noter connects to and interacts with GitHub Codespaces, providing both visual and programmatic access to cloud development environments.

## Connection Methods

### 1. Web Interface (Primary Method)
- **URL Pattern**: `https://{codespace-name}.github.dev`
- **Access**: Direct browser access to VS Code in the browser
- **Integration**: Embedded via iframe in Noter's `CodespaceIframe` component
- **Features**: Full VS Code experience with extensions, terminal, file editing

### 2. HTTP Agent API (Programmatic Access)
- **URL Pattern**: `https://{codespace-name}-3000.app.github.dev`
- **Authentication**: Bearer token (generated UUID stored in database)
- **Purpose**: Allows Noter to programmatically interact with the Codespace

## Connection Workflow

### Creation Process
1. **Codespace Creation**: Noter calls GitHub API to create a Codespace
2. **Agent Setup**: A Node.js HTTP server starts on port 3000 inside the Codespace
3. **URL Generation**: 
   - Web URL: `{codespace-name}.github.dev`
   - Agent URL: `{codespace-name}-3000.app.github.dev`
4. **Token Storage**: Unique authentication token stored in Convex database

### Agent API Endpoints
- `GET /health` - Health check (no auth required)
- `POST /exec` - Execute shell commands
- `POST /files/write` - Write files
- `GET /files/read` - Read files  
- `GET /files/list` - List directory contents
- `DELETE /files/delete` - Delete files/directories
- `GET /files/stat` - Get file metadata

## Security Features
- **Token Authentication**: All API calls (except health) require Bearer token
- **Path Validation**: Prevents directory traversal attacks
- **Workspace Isolation**: All operations restricted to `/workspaces` directory

## Usage in Noter
- **Visual Access**: Iframe embedding of VS Code web interface
- **Programmatic Control**: HTTP API for file operations and command execution
- **State Management**: Real-time status tracking (creating → running → stopped)
- **Error Handling**: Graceful fallbacks and external link options

## Implementation Details

### Codespace States
- `creating` - Codespace is being provisioned
- `running` - Codespace is active and accessible
- `stopped` - Codespace is shut down (can be restarted)
- `error` - Codespace creation or operation failed

### Connection Establishment
The connection is established automatically when you create a Codespace through Noter's interface, providing both visual and programmatic access to your GitHub repository in a cloud development environment.

## TODO/Ideas

### Enhanced Code Block Rendering
- **Idea**: Render Monaco editor inside ProseMirror for code blocks (```ts, ```js, etc.)
- **Scope**: Not limited to TypeScript - apply to all languages that would use Monaco if they were in a file
- **Benefits**: 
  - Syntax highlighting
  - IntelliSense/autocomplete
  - Error detection
  - Consistent editing experience
- **Implementation Considerations**:
  - Embed Monaco as a ProseMirror node view
  - Language detection from code fence info
  - Seamless integration with document flow
  - Performance optimization for multiple code blocks