# Codespace Connection Specification

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

### Creation Process:
1. **Codespace Creation**: Noter calls GitHub API to create a Codespace
2. **Agent Setup**: A Node.js HTTP server starts on port 3000 inside the Codespace
3. **URL Generation**: 
   - Web URL: `{codespace-name}.github.dev`
   - Agent URL: `{codespace-name}-3000.app.github.dev`
4. **Token Storage**: Unique authentication token stored in Convex database

### Agent API Endpoints:
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

## Implementation Files
- `apps/noter/src/components/CodespaceIframe.tsx` - Web interface embedding
- `apps/noter/convex/codespaces.ts` - Codespace management
- `apps/noter/convex/codespacesExecutor.ts` - HTTP agent communication
- `.codespace-agent/server.js` - Agent HTTP server

## TODOs / Ideas

### Monaco in ProseMirror
- **Idea**: Render Monaco editor inside ProseMirror for code blocks (```ts, ```js, etc.)
- **Scope**: Not just TypeScript - all languages that would use Monaco if they were in a file
- **Benefit**: Rich code editing experience within markdown documents
- **Implementation**: Custom ProseMirror node view with embedded Monaco instance

### Agent/Code Toggle (like build.io)
- **Idea**: Toggle between "agent" and "code" modes
- **Code Mode**: Full VS Code experience (current iframe implementation)
- **Agent Mode**: Simplified interface optimized for AI interactions
- **Questions**: 
  - What would the agent mode UI look like?
  - How would it differ from the full VS Code experience?
  - Should it be a completely different interface or a simplified VS Code view?

## Future Considerations
- Performance optimization for Monaco embedding
- User preference storage for mode selection
- Integration with AI chat for seamless agent interactions