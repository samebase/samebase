# Sidebars example

This app is a small, real consumer of `@samebase/sidebars`. It uses the standard Samebase frontend
stack without Convex. The app imports the package through its public production entrypoints, owns
its visible styles, saves layout state in localStorage, and applies that state before React
hydrates.

[Open the live example](https://samebase-sidebars-example.pfp.workers.dev/?prod-ui).

## Routes

| Route        | Sidebars | Purpose                                                   |
| ------------ | -------- | --------------------------------------------------------- |
| `/`          | None     | Shows the main-pane fallback when no sidebar is available |
| `/docs`      | Left     | Shows the package with one sidebar                        |
| `/workbench` | Two      | Shows the package with left and right sidebars            |

All routes use one root sidebar state controller. A route can omit a saved sidebar without deleting
its state. When a later route includes that sidebar again, its saved width, open state, mobile pane,
and mobile merge become available again.

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
observability and SPA settings. `public/_redirects` maps the public routes to their prerendered HTML
files while `index.html` remains the SPA fallback.

## Architecture

The TanStack root route owns the state controller and keeps it mounted during client navigation. The
controller validates the localStorage value, uses defaults for invalid or missing data, and defers
repeated width writes. It flushes the last width when the controller unmounts.

Each route declares the sidebars that it provides and renders the canonical `SidebarLayout`. The
desktop and mobile prehydration scripts render immediately after that layout. They read the same
validated storage value before hydration. React removes the temporary desktop prehydration style
after the runtime state takes control.

The package supplies structural CSS. The app stylesheet uses the package part and state attributes
for color, borders, spacing, and resize-grip appearance.

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

### Saved desktop widths

1. Open `/workbench` in a desktop viewport.
2. Resize both sidebars.
3. Go to `/docs`, then `/`, and then return to `/workbench`.
4. Confirm that both sidebars use the saved widths.
5. Reload `/workbench` and confirm that the widths remain.

### Missing-pane mobile merge

1. Open `/docs` in a mobile-emulated browser context.
2. Show the left sidebar and resize it to the minimum until the left and main panes merge.
3. Use the persistent route navigation to go to `/`.
4. Confirm that the route shows the main pane without a merge because it has no left sidebar.
5. Return to `/docs` and confirm that the saved left merge appears again.
6. Reload `/docs` and confirm that the merge remains.
7. Use the visible mobile action to return to the main pane.
