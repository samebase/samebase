# AGENTS.md

This file governs how AI agents maintain this starter template.

## Purpose

This directory is the source of truth for starter content seeded into newly
created noter-managed vault repositories.

Iteration 1 policy:

- Seed output is a single commit in the target repository.
- Do not maintain layered `seed-commits/*` snapshots.
- Keep this template flat-root and production deployable.
- Use pnpm as the package manager for this template.

## Initialization Sequence (Commands Used)

Run from repository root:

```bash
pnpm install
```

Run from the template directory (`apps/noter-starter-template`):

```bash
pnpm create vite . --template react-ts
pnpm dlx convex dev --once
pnpm install
pnpm add -D tailwindcss @tailwindcss/vite
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button input card
pnpm run template:export
```

## Regeneration Workflow

1. Browse official setup docs first for Vite, Convex, Tailwind, and shadcn
   before making changes.
2. Update template files in this directory only (no layered snapshots).
3. Keep runtime baseline intact:
   - React + Vite
   - Convex backend
   - Tailwind CSS
   - shadcn components
4. Refresh the seeded manifest used by Convex seeding:

```bash
pnpm run template:export
```

`template:export` now auto-syncs these root assets into the template before
manifest generation:

- `.codespace-agent/**`
- `.devcontainer/devcontainer.json`
- `.devcontainer/Dockerfile`

Optional manual sync without export:

```bash
pnpm run template:sync-codespace
```

5. Confirm generated output file exists and is updated:
   - `apps/noter/convex/starterSeedManifest.generated.ts`

## Official References

- [Vite Getting Started](https://vite.dev/guide/)
- [Convex React Quickstart](https://docs.convex.dev/quickstart/react)
- [Convex Deploy Key / CI guidance](https://docs.convex.dev/production/ci-cd)
- [Tailwind with Vite](https://tailwindcss.com/docs/installation/using-vite)
- [shadcn/ui Vite install](https://ui.shadcn.com/docs/installation/vite)
