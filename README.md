# Noter

Noter is a collaborative, GitHub-connected code editor built as a Turborepo monorepo with React + Vite on the frontend and Convex on the backend.

## Current Product Capabilities (2026-02-13)

- Real-time collaborative editing with CodeMirror + Convex synchronization
- GitHub repository connection (`connectRepository`) for existing repos
- New agent/repo creation (`createRepository`) for noter-managed vaults
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

## Tech Stack

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
├── apps/
│   └── noter/
│       ├── convex/
│       └── src/
├── package.json
└── turbo.json
```

## Development

### Prerequisites

- Node 24+
- PNPM 9+

### Root commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
```

### App commands (`apps/noter`)

```bash
npm run dev           # frontend + backend
npm run dev:frontend
npm run dev:backend
npm run build
npm run lint
```

## Environment Notes

Infra provisioning requires backend environment configuration for provider tokens/team IDs (see `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`).

## Read-First Docs for New Agent Sessions

1. `AGENTS.md`
2. `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
3. `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
4. `specs/001_CODESPACE_CONNECTION_SPEC.md`
5. `apps/noter/convex/schema.ts`

## License

MIT
