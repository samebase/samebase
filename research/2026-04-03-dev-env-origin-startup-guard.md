# DEV_ENV_ORIGIN Startup Guard Research

Date: 2026-04-03

## Why This Document Exists

Running `make run` in the primary local checkout currently fails during `predev`
with:

```text
DEV_ENV_ORIGIN is required unless the Convex deployment points at localhost.
```

This memo captures the current behavior, the relevant repo history, and the most
likely correct fix direction before implementation changes begin.

## Why This Lives In `research`

This is a current-state investigation memo. It documents observed behavior,
links it to recent repo changes, and recommends a repair direction, but it does
not yet define the repo's accepted startup contract.

## Observed Behavior

From the primary checkout, `make run` currently expands to:

1. `make bootstrap`
2. `pnpm dev`

`pnpm dev` in `apps/noter` runs:

1. `predev`
2. `dev:frontend` and `dev:backend` in parallel

The relevant `predev` chain is:

1. `node convex-dev.js --until-success --codegen=enable`
2. `node setup.mjs --once`
3. `node sync-site-url.mjs`

The failure happens inside `sync-site-url.mjs` before the long-running frontend
or backend dev processes take over.

## Repo Findings

### 1) `make run` does not currently provide `DEV_ENV_ORIGIN`

The root `Makefile` runs plain `pnpm dev` for the primary checkout path. It does
not set `DEV_ENV_ORIGIN` first.

### 2) The guard is repo code, not a raw Convex CLI error

`apps/noter/sync-site-url.mjs` asks `resolveSiteUrlSyncOrigin(...)` for the
origin it should write into Convex `SITE_URL`.

That helper throws when all of the following are true:

- `DEV_ENV_ORIGIN` is missing
- the current Convex deployment is not localhost

The rationale in code is explicit: shared Convex deployments must not silently
fall back to `http://localhost:<port>` because that would overwrite `SITE_URL`
for other contributors with an unusable redirect target.

### 3) The current checkout is using a non-local Convex deployment

The local `apps/noter/.env.local` for this checkout points at a non-local Convex
deployment, so the guard is expected to fire when `DEV_ENV_ORIGIN` is missing.

### 4) The frontend wrapper already computes the local origin, but too late

`apps/noter/scripts/run-vite-dev.js` already chooses the Vite port
deterministically and writes `http://localhost:<port>` to
`node_modules/.cache/noter-local-dev-origin.json`.

That happens only when `dev:frontend` starts, which is after `predev` has
already succeeded. It cannot rescue the earlier `sync-site-url.mjs` failure.

### 5) The backend wrapper already has a local retry path, but it does not help here

`apps/noter/convex-dev.js` has a retry path that waits for the local frontend
wrapper to publish the chosen origin and then reruns `sync-site-url.mjs` with
`DEV_ENV_ORIGIN` populated.

That retry path is intentionally limited:

- it only runs when Convex is local
- it does not run for the `--until-success` predev invocation

That means the current primary-checkout `make run` flow has no recovery path for
a shared Convex deployment when `DEV_ENV_ORIGIN` is missing.

## Timeline

### 2026-04-01: Convex upgrade

Commit `b3c51548` upgraded `apps/noter` from Convex `1.32.0` to `1.34.1`.

This commit updated package versions and removed obsolete local patch wiring,
but it did not add the `DEV_ENV_ORIGIN` startup throw.

### 2026-04-02: Startup guard and local-origin orchestration

Commit `d7a16ff2` introduced:

- `apps/noter/convex-local-utils.js`
- the explicit `DEV_ENV_ORIGIN` guard
- `apps/noter/scripts/run-vite-dev.js`
- the local origin cache file flow
- the local post-start SITE_URL retry path

This is the change that made the current failure possible.

## Interpretation

The fatal startup failure is not evidence that Convex `1.34.1` itself started
requiring `DEV_ENV_ORIGIN`.

The repo added a stricter safety check after the upgrade, and the primary local
`make run` path is now missing the explicit origin that the guard expects for
shared Convex deployments.

The separate warning about Convex AI files not being installed is likely tied to
newer Convex tooling, but it is not the cause of the fatal `make run` failure.

## Design Constraints

Any fix should preserve these constraints:

1. Do not silently write `SITE_URL=http://localhost:...` to a shared Convex
   deployment unless the startup path has intentionally selected that origin.
2. Keep `make run` working in the primary checkout without asking contributors
   to hand-export `DEV_ENV_ORIGIN` every time.
3. Keep the chosen local frontend origin deterministic and aligned with the same
   port Vite will actually claim.
4. Avoid introducing a second place where the local port-selection logic can
   drift.

## Fix Options

### Option A: Remove the guard or restore silent localhost fallback

Assessment:

- Wrong direction.
- This would reintroduce the exact shared-deployment footgun the guard was added
  to prevent.

### Option B: Make the primary startup path set `DEV_ENV_ORIGIN` explicitly before `pnpm dev`

Assessment:

- Best fit with the existing architecture.
- Keeps the safety guard.
- Makes the shared-deployment overwrite explicit as part of the primary local
  startup contract rather than as an implicit fallback.

Likely shape:

- Add a small Node wrapper for the root `make run` path, or replace the plain
  `pnpm dev` entrypoint with a wrapper that:
  - resolves the same local dev origin the Vite wrapper would use
  - exports `DEV_ENV_ORIGIN`
  - launches `pnpm dev`

### Option C: Move shared-deployment SITE_URL sync entirely to a later retry phase

Assessment:

- Less attractive.
- It complicates the startup contract and still needs an explicit source of
  truth for the frontend origin.
- It also weakens the clean separation between preflight setup and long-running
  dev processes.

## Recommendation

Keep the guard.

The correct repair is most likely to make the sanctioned primary-checkout
startup path explicit about the frontend origin before `predev` runs. In
practice, that means `make run` should launch the dev server with an explicit
`DEV_ENV_ORIGIN=http://localhost:<chosen-port>` derived from the same shared
helper logic that the frontend wrapper already uses.

That keeps the safety guarantee for shared Convex deployments while restoring a
zero-manual-step startup path for the primary checkout.

## Follow-Up Questions For Implementation

1. Should the explicit-origin wrapper live in the root `Makefile`, a new root
   Node script, or an `apps/noter` script that `make run` calls?
2. Should the wrapper always set `DEV_ENV_ORIGIN` for primary local startup, or
   only when the current Convex deployment is non-local?
3. Is there any other sanctioned non-anonymous startup path besides `make run`
   that also needs the same explicit-origin behavior?
