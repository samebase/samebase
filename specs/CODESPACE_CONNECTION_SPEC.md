# GitHub Codespace Connection Specification

## Overview

This document specifies how Noter connects to and interacts with GitHub Codespaces, providing both visual and programmatic access to cloud development environments.

## Connection Methods

### 1. Web Interface (Primary Method)

**URL Pattern**: `https://{codespace-name}.github.dev`

- **Access Type**: Direct browser access to VS Code in the browser
- **Integration**: Embedded via iframe in Noter's `CodespaceIframe` component
- **Features**: Full VS Code experience with extensions, terminal, file editing
- **Authentication**: GitHub session-based authentication

### 2. HTTP Agent API (Programmatic Access)

**URL Pattern**: `https://{codespace-name}-3000.app.github.dev`

- **Authentication**: Bearer token (generated UUID stored in database)
- **Purpose**: Allows Noter to programmatically interact with the Codespace
- **Port**: Runs on port 3000 inside the Codespace

## Connection Workflow

### 1. Codespace Creation Process

1. **API Call**: Noter calls GitHub API to create a Codespace
2. **Agent Setup**: Node.js HTTP server starts on port 3000 inside the Codespace
3. **URL Generation**: 
   - Web URL: `{codespace-name}.github.dev`
   - Agent URL: `{codespace-name}-3000.app.github.dev`
4. **Token Storage**: Unique authentication token stored in Convex database
5. **Status Tracking**: Real-time status updates (creating → running → stopped)

### 2. Connection Establishment

```typescript
// Example connection flow
const codespace = await createCodespace(repoOwner, repoName);
const webUrl = `https://${codespace.name}.github.dev`;
const agentUrl = `https://${codespace.name}-3000.app.github.dev`;
```

## Agent API Specification

### Authentication

All API endpoints (except health check) require Bearer token authentication:

```http
Authorization: Bearer {uuid-token}
```

### Endpoints

#### Health Check
```http
GET /health
```
- **Auth Required**: No
- **Response**: `{ status: "ok" }`

#### Execute Commands
```http
POST /exec
Content-Type: application/json

{
  "command": "string",
  "cwd": "string (optional)"
}
```

#### File Operations

**Write File**
```http
POST /files/write
Content-Type: application/json

{
  "path": "string",
  "content": "string"
}
```

**Read File**
```http
GET /files/read?path={file-path}
```

**List Directory**
```http
GET /files/list?path={directory-path}
```

**Delete File/Directory**
```http
DELETE /files/delete?path={file-path}
```

**Get File Metadata**
```http
GET /files/stat?path={file-path}
```

## Security Features

### 1. Authentication
- **Token-based**: UUID tokens for API access
- **Session-based**: GitHub authentication for web interface
- **Scope Isolation**: Each Codespace has unique token

### 2. Path Validation
- **Directory Traversal Protection**: Prevents `../` attacks
- **Workspace Restriction**: All operations limited to `/workspaces` directory
- **Path Sanitization**: Input validation on all file paths

### 3. Error Handling
- **Graceful Degradation**: Fallback to external links if iframe fails
- **Timeout Management**: Request timeouts for API calls
- **Status Monitoring**: Real-time connection health checks

## Integration Points

### 1. Noter UI Components

**CodespaceIframe Component**
- Embeds VS Code web interface
- Handles authentication state
- Provides fallback external link

**CodespaceStatus Component**
- Real-time status display
- Connection health indicators
- Action buttons (start/stop/delete)

### 2. Convex Backend

**Database Schema**
```typescript
codespaces: {
  id: string;
  name: string;
  webUrl: string;
  agentUrl: string;
  token: string;
  status: "creating" | "running" | "stopped";
  createdAt: number;
  updatedAt: number;
}
```

**API Functions**
- `createCodespace`: Creates new Codespace
- `getCodespaceStatus`: Retrieves current status
- `executeCommand`: Runs commands via agent API
- `manageFiles`: File operations through agent

## Error Scenarios

### 1. Connection Failures
- **Network Issues**: Retry logic with exponential backoff
- **Authentication Errors**: Token refresh or re-authentication
- **Timeout Errors**: Graceful degradation to manual access

### 2. Codespace States
- **Creating**: Show loading state, poll for completion
- **Stopped**: Provide start button, disable interactions
- **Deleted**: Clean up database records, show creation option

### 3. Agent Unavailability
- **Port Not Ready**: Retry connection with delays
- **Service Down**: Fall back to web interface only
- **Invalid Token**: Regenerate and update database

## Performance Considerations

### 1. Connection Optimization
- **Connection Pooling**: Reuse HTTP connections
- **Request Batching**: Combine multiple file operations
- **Caching**: Cache file metadata and directory listings

### 2. UI Responsiveness
- **Async Operations**: Non-blocking API calls
- **Loading States**: Clear feedback during operations
- **Progressive Enhancement**: Core functionality without agent API

## Future Enhancements

### 1. Advanced Features
- **Port Forwarding**: Support for custom application ports
- **Extension Management**: Install/configure VS Code extensions
- **Environment Variables**: Secure environment configuration

### 2. Monitoring & Analytics
- **Usage Metrics**: Track Codespace utilization
- **Performance Monitoring**: API response times and errors
- **Cost Optimization**: Automatic shutdown policies

## Implementation Notes

### 1. Development Setup
- Agent server code located in `.codespace-agent/`
- Automatic startup via `.devcontainer/devcontainer.json`
- Environment-specific configuration

### 2. Deployment Considerations
- **Token Security**: Secure storage and transmission
- **Rate Limiting**: GitHub API quota management
- **Resource Cleanup**: Automatic Codespace lifecycle management