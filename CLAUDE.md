# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

WorkFir is a Turborepo monorepo using PNPM that combines:
- **Main App** (`apps/workfir`): React + Vite + Convex collaborative code editor with GitHub integration
- **Core Package** (`packages/core`): ProseMark - CodeMirror-based markdown editor library

## Development Commands

**Monorepo Level** (run from root):
```bash
# Install dependencies
pnpm install

# Development (starts all apps)
pnpm dev

# Build all packages and apps
pnpm build

# Lint all packages and apps
pnpm lint

# Target specific app/package
pnpm dev:workfir      # Dev mode for workfir app only
pnpm build:workfir    # Build workfir app only
pnpm lint:workfir     # Lint workfir app only
```

**WorkFir App** (`apps/workfir`):
```bash
# Development with Convex backend
npm run dev           # Runs both frontend (Vite) and backend (Convex) in parallel
npm run dev:frontend  # Vite dev server only
npm run dev:backend   # Convex dev server only

# Build and deployment
npm run build         # TypeScript compile + Vite build
npm run build:vercel  # Vercel-specific build

# Type checking and linting
npm run lint          # TypeScript + ESLint check
```

**ProseMark Core** (`packages/core`):
```bash
# Library development
npm run dev           # Watch mode build
npm run build         # Production build
npm run lint          # ESLint check
npm run check-types   # TypeScript check
```

## Architecture Overview

### WorkFir App (`apps/workfir`)
- **Frontend**: React 18 + React Router + Vite
- **Backend**: Convex (real-time database + serverless functions)
- **Auth**: Convex Auth with GitHub OAuth integration
- **Editor**: CodeMirror 6 with collaborative editing via Convex
- **UI**: Tailwind CSS + Radix UI components + shadcn/ui patterns
- **State**: Convex real-time queries + TanStack Query

**Key Data Models** (Convex schema):
- `users`: GitHub-authenticated users with access tokens
- `vaults`: Connected GitHub repositories per user
- `fileStaging`: Real-time collaborative file editing state
- `collaborativeUpdates`: Operational transformation for conflict resolution
- `folderExpansionState`: UI state for file tree per user/vault

**Core Components**:
- `VaultDashboard`: Main dashboard showing connected repositories
- `AddRepository`: GitHub repository connection flow
- `RepositoryReadme`: File browser + collaborative editor view
- `CodeEditor`: CodeMirror-based editor with real-time collaboration
- `FileTree`: Repository file browser with expansion state

### ProseMark Core (`packages/core`)
CodeMirror 6 extension library providing:
- Markdown editing with syntax highlighting
- Code folding for markdown elements (lists, quotes, images, etc.)
- Element hiding/showing toggle functionality
- Enhanced markdown parsing with Lezer grammar

## UI/UX Guidelines (from .cursorrules)

- **Avoid unnecessary loading states** - prefer `null`/empty arrays over "Loading..." text
- **No "No items found" placeholders** - let empty state speak for itself  
- **Only show loading for operations >500ms** or when user expects feedback
- **Prefer silent, smooth UX** over chatty, jumpy interfaces

## Technology Stack

- **Monorepo**: Turborepo + PNPM workspaces
- **Frontend**: React 18, TypeScript, Vite, React Router 7
- **Backend**: Convex (real-time database + serverless functions)  
- **Editor**: CodeMirror 6 + custom ProseMark extensions
- **Auth**: Convex Auth + GitHub OAuth
- **UI**: Tailwind CSS + Radix UI + shadcn/ui
- **State**: Convex real-time subscriptions + TanStack Query
- **Build**: Vite (frontend) + Convex (backend) + Turborepo (orchestration)

## Key Features

- GitHub repository integration and OAuth authentication
- Real-time collaborative code editing with operational transformation
- File tree navigation with persistent expansion state
- Multi-language syntax highlighting via CodeMirror
- Markdown editing with advanced folding/hiding capabilities