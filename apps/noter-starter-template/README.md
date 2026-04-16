# Noter Starter Template

This directory is a transitional monorepo-local copy of the older starter
template.

Canonical source of truth now lives in `noter-md/convex-cloudflare-pages-stack`.
Refresh the pinned seed snapshot with:

```bash
pnpm run starter:refresh -- --source-dir <path-to-convex-cloudflare-pages-stack>
```

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
pnpm run check
```

## Template Manifest

```bash
pnpm run template:export
```
