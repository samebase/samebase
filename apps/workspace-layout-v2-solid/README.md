# WorkspaceLayoutV2 Solid Lab

This app is a tiny SolidJS sandbox for the `WorkspaceLayoutV2` sidebar shell. It
exists to show the smallest useful version of the layout without React app
chrome, Convex state, or custom gesture code.

## Current Shape

- Desktop is a plain three-column layout.
- Mobile is a native scroll-snap carousel with `left`, `main`, and `right`
  panes.
- The only JavaScript behavior is scrolling the mobile view to the main pane on
  load.

## Commands

From the repo root:

```bash
pnpm install
pnpm --filter workspace-layout-v2-solid dev
```

The default dev server port is `43130`.
