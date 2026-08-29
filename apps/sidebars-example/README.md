# Sidebars example

This single-page app is a small, real consumer of `@samebase/sidebars`. It renders a left sidebar, a
main pane, and a right sidebar. The app imports the package through its public production
entrypoints, owns its visible styles, saves layout state in localStorage, and applies that state
before React hydrates.

[Open the live example](https://samebase-sidebars-example.pfp.workers.dev/?prod-ui).

## Run the app

Install the dependencies, then start the development server:

```sh
pnpm install
pnpm run dev
```

The development server prints its local URL. The app needs no backend or environment variables.

Use these commands for validation and deployment:

```sh
pnpm run dev
pnpm run build
pnpm run check
pnpm run deploy:dry-run
pnpm run deploy:preview:dry-run
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run preview
pnpm run typecheck
```

## Cloudflare deployment

Use the repository root as the Cloudflare Workers Builds root directory. Run `pnpm run build`, then
`pnpm run deploy` for `main` or `pnpm run deploy:preview` for other branches. The deploy script uses
the connected Worker name that Cloudflare supplies and does not repeat the build during Workers
Builds.

For a local upload check, set `CLOUDFLARE_WORKER_NAME` to `samebase-sidebars-example`, then run one
of the dry-run commands above. `wrangler.jsonc` publishes `dist/client` with the standard Samebase
observability and SPA settings. `public/_redirects` maps `/` to its prerendered HTML file while
`index.html` remains the SPA fallback.

## Architecture

The root route always provides all three panes to `SidebarLayout`. The left sidebar links to the
package and example repositories. The main pane explains the controls. The right sidebar lists the
layout behavior.

The TanStack root route owns the state controller. The controller validates the localStorage value,
uses defaults for invalid or missing data, and defers repeated width writes. It flushes the last
width when the controller unmounts.

The desktop and mobile prehydration scripts render immediately after the layout. They read the same
validated storage value before hydration. React removes the temporary desktop prehydration style
after the runtime state takes control.

The package supplies structural CSS. The app uses a small plain CSS stylesheet for color, borders,
spacing, and resize-grip appearance. It follows the system light or dark theme.

The app uses these public package entrypoints:

```text
@samebase/sidebars/SidebarLayout
@samebase/sidebars/SidebarLayoutGeometry
@samebase/sidebars/PaneFrame
@samebase/sidebars/SidebarLayoutPrehydration
@samebase/sidebars/SidebarRuntime
@samebase/sidebars/SidebarLayoutState
```

It does not import `@samebase/sidebars/SidebarLayoutTesting`, package source files, or Samebase
application code.

## Manual flow

1. Open `/` in a desktop viewport.
2. Resize both sidebars and hide either one from the top rail.
3. Reload the page and confirm that both sidebars keep their saved widths and open states.
4. Open `/` in a mobile viewport and use the top rail to move between the left, main, and right
   panes.
5. Resize a mobile sidebar to the minimum and confirm that it merges with the main pane.
