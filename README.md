# Noter

Noter is a collaborative, GitHub-connected code editor built as a Turborepo monorepo with React + Vite on the frontend and Convex on the backend.
## Current Product Capabilities (2026-02-13)
- Real-time collaborative editing with CodeMirror + Convex synchronization
- GitHub repository connection (`connectRepository`) for existing repos
- New agent/repo creation (`createRepository`) for noter-managed vaults, seeded as a runnable starter in a single commit
- Automatic infrastructure provisioning for new noter-managed vaults:
  - Convex project/deployment
  - Netlify site + environment wiring
  - Infrastructure status surfaced in Vault Dashboard
- Manual infra retry for failed/partial provisioning
- GitHub Codespaces integration for cloud execution
- Persistent in-app chat with approval cards for:
  - Commit proposals
  - Production infrastructure/data read requests
## Important Behavior
- Auto infra provisioning is triggered only for newly created noter-managed vaults.
- Connecting an existing GitHub repository does not auto-provision infra.
- Starter seed source of truth is maintained in `apps/noter-starter-template` and exported to `apps/noter/convex/starterSeedManifest.generated.ts`.
- Frontend: React 18, TypeScript, Vite, React Router
- Backend: Convex (queries, mutations, actions, scheduler)
- Editor: CodeMirror 6
- Auth: Convex Auth + GitHub OAuth
- UI: Tailwind CSS + Radix UI + shadcn/ui patterns
- Monorepo: Turborepo + PNPM
## Project Layout
```text
.
├── AGENTS.md
├── specs/
│   ├── noter/
│   │   ├── convex/
│   │   └── src/
│   └── noter-starter-template/
│       ├── convex/
│       └── src/
├── package.json
└── turbo.json
- Node 24+
- PNPM 9+
### Root commands
pnpm dev           # noter app only (default filtered)
pnpm build         # noter app only (default filtered)
pnpm lint          # noter app only (default filtered)
pnpm dev:starter
pnpm build:starter
pnpm lint:starter
### App commands (`apps/noter`)
npm run dev           # frontend + backend
npm run dev:frontend
npm run dev:backend
npm run build
npm run lint
## Environment Notes
Infra provisioning requires backend environment configuration for provider tokens/team IDs (see `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`).
## Read-First Docs for New Agent Sessions
1. `AGENTS.md`
2. `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
3. `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
4. `specs/001_CODESPACE_CONNECTION_SPEC.md`
5. `apps/noter/convex/schema.ts`
MIT
A collaborative code editor connected to GitHub, built as a Turborepo + PNPM monorepo with React + Vite + Convex.

test


## Features

- **Collaborative Editing**: Real-time collaborative code editing
- **GitHub Integration**: Direct connection to GitHub repositories
- **AI-Powered Chat**: Built-in AI assistant for code help and analysis
- **File Management**: Complete file tree navigation and editing
- **Authentication**: Secure user authentication system
- **Real-time Sync**: Live collaboration with other developers

## Tech Stack

- **Frontend**: React + Vite + TypeScript
- **Backend**: Convex (real-time database and functions)
- **Styling**: Tailwind CSS + shadcn/ui components
- **Editor**: ProseMark for rich text editing
- **Monorepo**: Turborepo + PNPM
- **Authentication**: Convex Auth
- **GitHub API**: Direct repository integration

## Project Structure

```
├── apps/
│   └── noter/           # Main application
│       ├── src/         # React frontend source
│       ├── convex/      # Convex backend functions
│       └── public/      # Static assets
├── package.json         # Root package configuration
├── turbo.json          # Turborepo configuration
└── pnpm-workspace.yaml # PNPM workspace configuration
```

## Getting Started

### Prerequisites

- Node.js (see `.nvmrc` for version)
- PNPM package manager

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

This will start:
- Vite dev server for the frontend
- Convex development environment
- Hot reloading for both frontend and backend

### Build

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

## Environment Setup

1. Copy environment variables and configure your Convex project
2. Set up GitHub OAuth for repository access
3. Configure authentication providers

## TODO

- **Easy win**: Rename simple/all to important/code

## Contributing

This project uses:
- ESLint and Prettier for code formatting
- Husky for pre-commit hooks
- TypeScript for type safety
- Vitest for testing

## License

[Add your license information here]
# noter
Turborepo + PNPM monorepo with React + Vite + Convex.
Also using ProseMark. something
## Install
## Development
## Build
commit
