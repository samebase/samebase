# Daytona Browser Convex Transport Spec

## Summary

Daytona local sandboxes currently start the frontend preview correctly, but the
browser-side Convex client still points at the sandbox-local anonymous backend
URL (for example `http://127.0.0.1:11310`). That works for processes running
inside the sandbox, but it fails for the external browser preview because the
browser cannot reach sandbox loopback. The result is a partially working
preview: Vite loads, but auth, queries, and subscriptions hang on websocket
connection errors.

This spec adds an explicit split between:

1. the internal local Convex URL used by bootstrap, seeding, and sandbox-local
   CLI processes
2. the external browser-facing Convex URL exposed through a Daytona preview link

The goal is to keep the existing local anonymous runtime contract while making
the browser preview fully usable.

## Problem Statement

After `053_DAYTONA_LOCAL_RUNTIME_PROFILE_AND_SEED_SOURCE_SPEC` landed, the
remaining production failure was no longer bootstrap auth. The debug sandbox now
starts successfully, but browser login in the Daytona preview stalls because the
frontend attempts to connect to `ws://127.0.0.1:<local-cloud-port>`.

The current split is incomplete:

- `DEV_ENV_ORIGIN` already uses the public Daytona preview origin for the
  frontend host
- `.env.local` still correctly resolves to a sandbox-local anonymous Convex
  backend
- `VITE_CONVEX_URL` for the browser is still inherited from `.env.local`

That means we solved OAuth redirect origin but not browser-to-Convex transport.

## Goals

1. Keep the anonymous local Convex backend private to the sandbox.
2. Expose a browser-reachable Convex URL through Daytona preview for the local
   Convex cloud port.
3. Inject the public Convex URL only into the frontend runtime.
4. Keep `.env.local` inside the sandbox pointed at the local anonymous backend.
5. Preserve the existing `daytona-local` bootstrap contract from spec 053.

## Non-Goals

1. Do not switch Daytona local mode to a shared Convex cloud deployment.
2. Do not rewrite `.env.local` to a public preview hostname.
3. Do not proxy Convex traffic through Vite or add a generic reverse proxy layer
   in the first rollout.
4. Do not add a separate product surface for managing Convex preview tunnels.

## Design

### 1. Distinguish internal and browser-facing Convex URLs

For Daytona local sandboxes, there are now two valid Convex URLs:

- Internal Convex URL:
  - sandbox-local loopback URL written to `.env.local`
  - used by bootstrap, env sync, auth seeding, `convex dev`, and other
    sandbox-local scripts
- Browser Convex URL:
  - Daytona preview URL for the anonymous local Convex cloud port
  - used only by the browser bundle through `VITE_CONVEX_URL`

This split must be explicit in the launcher code.

### 2. Reuse the same anonymous local port-selection contract

The Daytona launcher must not guess an arbitrary Convex port. It must use the
same deterministic anonymous local port-selection contract as
`apps/noter/convex-dev.js`.

Implementation requirement:

1. extract the candidate-order logic into a shared runtime helper
2. use that helper in both the Convex dev wrapper and Daytona launch code
3. when Daytona needs a browser-facing Convex preview URL, resolve the first
   available anonymous local port pair in the sandbox using the shared candidate
   order

This keeps the external preview URL aligned with the port the local backend will
actually use.

### 3. Compute the public Convex preview URL in Daytona launch code

Before starting the long-lived dev server process, Daytona launch code should:

1. infer the public frontend origin from preview port `5173`
2. infer the anonymous local Convex cloud port that the sandbox will use
3. request a Daytona preview URL for that Convex cloud port

If the Convex preview URL cannot be resolved, dev startup should continue with
current behavior so the failure remains diagnosable, but the launcher should log
that the browser-facing Convex URL could not be prepared.

### 4. Inject the browser-facing Convex URL only into the dev-server process

When launching the Daytona dev server, export:

- `DEV_ENV_ORIGIN=<public frontend preview origin>`
- `VITE_CONVEX_URL=<public Convex preview URL>`

Do not write the public Convex preview URL into `.env.local`.

Rationale:

- sandbox-local scripts still need the loopback backend URL
- the browser needs the public preview URL
- process-level env for the Vite frontend is the narrowest place where the
  public URL is required

### 5. Keep spec 053 invariants intact

This change does not replace `daytona-local`. It only adds the missing
browser-facing transport wiring around the existing contract:

- `make daytona-local` still owns bootstrap
- `.env.local` still resolves to a local anonymous deployment
- snapshot-backed and live/debug flows still converge on the same runtime
  contract

## Acceptance Criteria

1. Daytona debug sandbox startup still succeeds for `main` after the bootstrap
   auth fix from PR `#193`.
2. The Daytona preview loads the frontend on port `5173`.
3. Browser login in the Daytona preview no longer hangs on websocket attempts to
   `127.0.0.1`.
4. Browser-side Convex traffic uses the public Daytona preview hostname for the
   local Convex cloud port.
5. `.env.local` inside the sandbox still contains the local anonymous Convex
   URL.
6. Sandbox-local seeding and auth setup continue to work without using the
   public Convex preview hostname.

## Validation

1. Unit-test the shared anonymous local port-selection helper.
2. Verify the Daytona launcher exports `VITE_CONVEX_URL` only when a public
   Convex preview URL is available.
3. Re-run the production-style Daytona debug sandbox flow and confirm:
   - preview loads
   - login completes
   - websocket traffic targets the public Convex preview host instead of
     `127.0.0.1`

## Follow-Ups

1. If Daytona preview auth or websocket handling on the Convex cloud port turns
   out to be insufficient, revisit a same-origin Vite proxy as a second-step
   fallback.
2. Expand runtime-manifest validation so browser-facing transport assumptions
   are covered explicitly, not only frontend port reachability.
