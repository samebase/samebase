# Codespace Connection Specification

## Related Specs

- `specs/002_VAULT_INFRA_AUTO_PROVISIONING_AND_AI_PROD_ACCESS_PLAN.md` - Master plan for infra
  provisioning and safe AI prod access.
- `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md` - Auto-provisioning flow and contracts for Convex +
  Cloudflare per vault.
- `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md` - Approval-first policy for AI production logs/data
  access.

# GitHub Codespace Connection Specification

## Overview

This document outlines how Noter connects to and interacts with GitHub Codespaces, providing both
visual and programmatic access to cloud development environments.

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

## Codex Authentication in Codespaces

### Problem

- Some IDE auth flows redirect to `http://localhost:1455/auth/callback`.
- In browser-based Codespaces, this `localhost` target resolves on the user's machine, not inside
  the remote container where the extension is listening.

### Supported Workflows

1. Prefer device authentication from the Codespace terminal:
   ```bash
   codex login --device-auth
   ```
2. Use API key auth in the extension/CLI when OAuth is not viable.
3. If loopback OAuth is required, forward callback port `1455` from local machine:
   ```bash
   gh codespace ports forward 1455:1455 -c <codespace-name>
   ```

### Devcontainer Contract

- Port `1455` is included in `forwardPorts` and marked private.
- This does not make loopback OAuth automatic in browser Codespaces, but keeps callback port wiring
  explicit for CLI forwarding workflows.

## Connection Workflow

### Creation Process:

1. **Codespace Creation**: Noter calls GitHub API to create a Codespace
2. **Agent Setup**: A Node.js HTTP server starts on port 3000 inside the Codespace
3. **URL Generation**:
   - Web URL: `{codespace-name}.github.dev`
   - Agent URL: `{codespace-name}-3000.app.github.dev`
4. **Token Storage**: Unique authentication token stored in Convex database

```ts
// Example connection flow
const codespace = await createCodespace(repoOwner, repoName);
const webUrl = `https://${codespace.name}.github.dev`;
const agentUrl = `https://${codespace.name}-3000.app.github.dev`;
```

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
- **Scope Isolation**: Each Codespace has a unique API token
- **Path Validation**: Prevents directory traversal attacks
- **Path Sanitization**: Input validation on all file paths
- **Workspace Isolation**: All operations restricted to `/workspaces` directory

## Usage in Noter

- **Visual Access**: Iframe embedding of VS Code web interface
- **Programmatic Control**: HTTP API for file operations and command execution
- **State Management**: Real-time status tracking (creating → running → stopped)
- **Error Handling**: Graceful fallbacks and external link options
- **Operational Safeguards**: Request timeouts and connection health checks back stop agent-driven
  flows

## Implementation Details

### Codespace States

- `creating` - Codespace is being provisioned
- `running` - Codespace is active and accessible
- `stopped` - Codespace is shut down (can be restarted)
- `error` - Codespace creation or operation failed

### Connection Establishment

The connection is established automatically when you create a Codespace through Noter's interface,
providing both visual and programmatic access to your GitHub repository in a cloud development
environment.

## TODOs / Ideas

### Monaco in ProseMirror

- **Idea**: Render Monaco editor inside ProseMirror for code blocks (`ts`, `js`, etc.)
- **Scope**: Not limited to TypeScript - apply to all languages that would use Monaco if they were
  in a file
- **Benefits**:
  - Syntax highlighting
  - IntelliSense/autocomplete
  - Error detection
  - Consistent editing experience
  - Rich code editing experience within Markdown documents
- **Implementation Considerations**:
  - Embed Monaco as a ProseMirror node view
  - Language detection from code fence info
  - Seamless integration with document flow
  - Performance optimization for multiple code blocks

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

## Implementation Files

- `apps/noter/src/components/CodespaceIframe.tsx` - Web interface embedding
- `apps/noter/convex/codespaces.ts` - Codespace management
- `apps/noter/convex/codespacesExecutor.ts` - HTTP agent communication
- `.codespace-agent/server.ts` - Agent HTTP server

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
```

```json
{
  "command": "string",
  "cwd": "string (optional)"
}
```

#### File Operations

**Write File**

```http
POST /files/write
```

```json
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

## Integration Points

### 1. Noter UI Components

**CodespaceIframe Component**

- Embeds VS Code web interface
- Handles authentication state
- Provides fallback external link
- **CodespaceStatus Component**
  - Real-time status display
  - Connection health indicators
  - Action buttons (start/stop/delete)

### 2. Convex Backend

**Database Schema**

```ts
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
