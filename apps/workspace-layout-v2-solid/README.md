# WorkspaceLayoutV2 Solid Lab

This app is a deliberately small SolidJS sandbox for rebuilding the
`WorkspaceLayoutV2` shell without pulling in Noter's React components, Convex
state, or route chrome.

## Why this app exists

- Solid stays isolated from the React build in `apps/noter`.
- The shell can stay close to the real product shape without dragging in app
  logic too early.
- Fixtures are local and disposable, so the lab stays easy to refactor while
  learning.

## Working Rules

- Keep this lab literal and minimal.
- Prefer the simplest layout primitives that match the current goal.
- Do not add responsive variants, decorative styling, controls, copy, or extra
  behavior unless the current task explicitly needs them.
- Treat the current hand-edited prototype as the source of truth when deciding
  how much structure to add.

## Commands

From the repo root:

```bash
pnpm install
pnpm --filter workspace-layout-v2-solid dev
```

The default dev server port is `43130`.

## Suggested next steps

1. Add only the next missing shell behavior you want to learn.
2. Keep the visible surface empty until a real need for content appears.
3. Expand from the current minimal layout instead of front-loading structure.
