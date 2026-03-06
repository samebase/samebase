# Noter

Noter is a collaborative, GitHub-connected code editor built as a Turborepo
monorepo with React + Vite on the frontend and Convex on the backend.

## Current Product Capabilities (2026-02-13)

- Real-time collaborative editing with CodeMirror + Convex synchronization
- GitHub repository connection (`connectRepository`) for existing repos
- New agent/repo creation (`createRepository`) for noter-managed vaults, seeded
  as a runnable starter in a single commit
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

- Auto infra provisioning is triggered only for newly created noter-managed
  vaults.
- Connecting an existing GitHub repository does not auto-provision infra.
- Starter seed source of truth is maintained in `apps/noter-starter-template`
  and exported to `apps/noter/convex/starterSeedManifest.generated.ts`.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, React Router
- Backend: Convex (queries, mutations, actions, scheduler)
- Editor: CodeMirror 6
- Auth: Convex Auth (Google in prod, Google + password in dev) + provider
  OAuth/API key connections
- UI: Tailwind CSS + Radix UI + shadcn/ui patterns
- Monorepo: Turborepo + PNPM

## Project Structure

```text
.
├── AGENTS.md
├── apps/
│   ├── noter/
│   │   ├── src/
│   │   └── convex/
│   └── noter-starter-template/
├── scripts/
├── specs/
├── package.json
├── turbo.json
└── pnpm-workspace.yaml
```

## Getting Started

### Prerequisites

- Node.js 24+ (`.nvmrc`)
- PNPM 9+

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

## Environment Setup

1. Configure Convex deployment env vars.
2. Configure app-login providers (Google, plus password in dev).
3. Configure provider connection OAuth/API keys (GitHub/Convex/Netlify).

## Temporary Dependency Patch

- This repo temporarily patches `convex@1.32.0` via `pnpm.patchedDependencies`
  and `patches/convex@1.32.0.patch`.
- Reason: preserve existing `convex/README.md` and `convex/tsconfig.json` during
  anonymous/local init (`doInitConvexFolder` currently overwrites by default in
  Convex CLI codegen internals).
- Upstream reference:
  https://github.com/get-convex/convex-js/blob/98278dfdfe788cf5069c921a80f1f6f7d09d8d2f/src/cli/lib/codegen.ts
- Removal guidance when upgrading Convex:
  1. Check whether upstream no longer overwrites existing files (or has an
     explicit opt-out).
  2. If fixed, remove `patches/convex@1.32.0.patch` and the
     `pnpm.patchedDependencies` entry in `package.json`.
  3. Remove the `COPY patches patches` line from `Dockerfile.daytona-deps` if no
     other patches remain.

## Contributing

This project uses:

- ESLint and Prettier for code formatting
- Husky for pre-commit hooks
- TypeScript for type safety
- Vitest for testing

## License

Proprietary. All rights reserved.

This repository is not open source. Access to the source code does not grant
permission to use, modify, or redistribute it unless the copyright holder gives
separate written permission. Third-party dependencies remain subject to their
own license terms.
