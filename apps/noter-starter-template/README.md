# Noter Starter Template

This project is the seeded baseline for newly created noter-managed repositories.

## Stack

- React + Vite
- Convex backend
- Tailwind CSS
- shadcn/ui primitives

## Scripts

```bash
pnpm install
pnpm run dev
pnpm run build
pnpm run lint
```

## Template Manifest

```bash
pnpm run template:export
```

## Netlify Production Build

`netlify.toml` uses Convex deploy as a build wrapper:

```bash
pnpm exec convex deploy --cmd 'pnpm run build:frontend'
```

This keeps backend and frontend deploys in sync in a single build.
