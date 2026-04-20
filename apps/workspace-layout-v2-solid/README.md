# WorkspaceLayoutV2 Solid Lab

This app is a tiny SolidJS sandbox for the `WorkspaceLayoutV2` sidebar shell. It
exists to show the smallest useful version of the layout without React app
chrome, Convex state, or custom gesture code.

## Current Shape

- Left sidebar is a ProseMark editor.
- Main pane is a Monaco editor.
- Right sidebar is a single link.
- Mobile is a native scroll-snap carousel with a full-width main pane.

## Commands

From the repo root:

```bash
pnpm install
pnpm --filter workspace-layout-v2-solid dev
```

The default dev server port is `43130`.
