# Machine Package UI Direction

Date: 2026-04-16

## Why This Note Exists

The current connected-machine flow works, but the package path is still
terminal-first: the operator lands on browser instructions that mostly ask them
to copy commands, and the published package itself exposes only CLI entry
points.

The requested direction is to make the package path feel like a real UI instead
of trying to stretch terminal output into an app surface.

## Operator Direction

Initial product direction from the operator:

> when connecting machines, when using package we need to provide a nice UI, for
> that we can use tanstack router with solidjs guaranteeing fast startup in
> small dev envs; otherwise trying to reimplement react in cli is bad idea, but
> if it's on a local port you can just use cloudflare tunnel to get access
> automatically

## What Exists On `main`

### The published package is CLI-only today

- `packages/sync/package.json` publishes `@noter-md/sync`.
- The package only ships `cli.ts` and `noter.ts`.
- `packages/sync/cli.ts` is a thin wrapper around `main()` in `noter.ts`.

This means the published path currently optimizes for
`npx @noter-md/sync connect` and `npx @noter-md/sync run`, not for a local
browser experience.

### The browser UI already exists, but it is command-copy oriented

- `apps/noter/src/components/MachineConnectPage.tsx` is the current
  `/machines/connect` experience.
- The page already renders separate blocks for:
  - `Published package connect`
  - `Published package run`
  - direct hosted-file variants for Unix and Windows
- The page is built in the main React app with `@tanstack/react-router`.

This page helps the operator finish machine approval, but it does not make the
package itself feel like a local UI runtime.

### The connector already exposes the right transport shape for a local UI

- `packages/sync/noter.ts` starts a local HTTP control server during
  `runConnectorCommand()`.
- That server already exposes machine-control routes such as:
  - `GET /status`
  - `GET /threads`
  - `POST /thread/start`
  - `POST /worktree/create`
  - `POST /turn/start`
- When local control auth is ready, the connector also starts a Cloudflare quick
  tunnel automatically.

This is important because the operator direction does not require inventing a
second remote transport. The local port plus automatic tunnel already exists.

### The repo does not currently ship a Solid-based machine UI

- The main app is already on TanStack Router, but through React.
- There is no direct `solid-js` or `@tanstack/solid-router` dependency declared
  in the app or package manifests.

Adopting Solid for the package path would therefore be a deliberate second
frontend runtime, not a small extension of the current app.

## Product Implications

### The package UI should probably be a local web surface, not richer terminal output

The operator direction is consistent with the current transport primitives:

1. let `noter-sync` host or launch a small local web app
2. let that app talk to the existing local control port
3. let the existing Cloudflare quick tunnel expose that local surface when
   remote access is needed

That is a cleaner direction than trying to recreate browser-grade interaction
inside CLI output.

### Solid plus TanStack Router is plausible, but it adds a second app stack

Using TanStack Router with Solid could keep cold-start and bundle size lower for
the package UI, especially if the surface is intentionally narrow.

However, this only pays off if the package UI stays isolated and small. If the
goal is to mirror more of the existing `/machines` workspace, a second UI stack
could create more maintenance cost than startup savings.

### The best near-term seam is a narrow machine companion UI

The existing connector routes suggest a contained first scope:

- bootstrap state
- approval status
- local/live-control health
- thread list
- start local thread
- create worktree then start first thread

That scope fits the operator’s “nice UI” direction without requiring parity with
the full Noter web app on day one.

## Recommendation

Treat this as a package companion UI investigation, not as a terminal UX tweak.

The first design pass should assume:

1. the package remains responsible for local runtime and machine control
2. the UI is served from a local port instead of rendered in the terminal
3. Cloudflare quick tunnels stay the default “remote reachability” path
4. Solid plus TanStack Router is only worth adopting if the package UI remains
   clearly smaller and more isolated than the main React app

## Open Questions

1. Should this package UI stop at bootstrap, approval, and thread launch, or do
   you want it to include the full machine-thread browsing experience too?
2. Do you want the package UI to be fully owned by `@noter-md/sync`, or should
   it reuse more of the existing `/machines/connect` behavior from the main app?
3. Is the main priority startup speed in constrained environments, or long-term
   code ownership simplicity?
