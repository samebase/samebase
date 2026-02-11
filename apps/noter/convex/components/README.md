# Convex Components for Noter

This directory contains Convex components that provide reusable, composable functionality for both internal system operations and AI agent capabilities.

## Architecture

### Core Components
- **FileSystem**: Manages file operations, staging, and GitHub synchronization
- **Collaboration**: Handles real-time collaborative editing and conflict resolution  
- **Agent**: Provides AI agent capabilities with tool access and context management
- **Vault**: Manages repository connections and user permissions

### AI Agent Components
- **ToolRegistry**: Centralized tool definitions and capabilities
- **ContextManager**: Manages conversation context and repository state
- **ActionExecutor**: Executes agent actions with proper validation and error handling

## Benefits of Using Components

1. **Modularity**: Each component encapsulates related functionality
2. **Reusability**: Components can be composed and reused across different contexts
3. **Type Safety**: Strong typing for component interfaces and data flow
4. **Testing**: Components can be tested in isolation
5. **AI Integration**: Components provide structured interfaces for AI agents

## Component Structure

Each component follows this pattern:
```
components/
├── filesystem/
│   ├── component.ts      # Main component definition
│   ├── schema.ts         # Data schemas and types
│   ├── actions.ts        # Component actions
│   └── queries.ts        # Component queries
```

## Usage

Components are imported and used in regular Convex functions:

```typescript
import { FileSystemComponent } from "./components/filesystem/component";
import { AgentComponent } from "./components/agent/component";

// Use in mutations, queries, and actions
export const myFunction = mutation({
  args: { ... },
  handler: async (ctx, args) => {
    const fs = new FileSystemComponent(ctx);
    const result = await fs.readFile(args.path);
    return result;
  }
});
```