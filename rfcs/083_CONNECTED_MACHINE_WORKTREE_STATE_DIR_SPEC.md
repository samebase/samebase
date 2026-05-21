# 083 Connected Machine Worktree State Directory Spec

## Document Control

- Status: Proposed
- Owner: Noter local developer workflow (DRI: `@nicu`)
- Last updated: 2026-04-04
- Related docs:
  - `rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md`
  - `rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md`

## Summary

The previous multi-connection direction was too broad for the actual problem.

The real operator need is narrower:

1. keep the normal production `~/.noter` connection unchanged
2. run a second connected-machine install for a worktree when needed
3. keep the worktree install fully isolated from production
4. allow the worktree to run its own `noter.ts` implementation and state

Recommendation:

1. keep the shipped single-connection model as the default
2. add a `--state-dir` option to `noter-sync connect` and `noter-sync run`
3. default `--state-dir` to `~/.noter`
4. let worktrees use a subdirectory such as `~/.noter/worktrees/ceff`

Each state directory acts as its own logical install:

1. its own `config.json`
2. its own machine credential
3. its own `machineId`
4. its own local control server process
5. its own Cloudflare tunnel process

This is smaller, more isolated, and better aligned with internal Noter development than a shared
multi-connection config.

## Why This RFC Exists

The current phone-only testing problem is real, but the earlier multi-connection proposal solved a
bigger product problem than we actually have.

For internal Noter development, the more important constraint is isolation:

1. production should keep using the stable `noter.ts` install
2. a worktree should be able to run modified `noter.ts` code
3. the worktree install should not share config or runtime state with production

That means one shared config with many backends is the wrong boundary.

## Problem Statement

Today the connected-machine flow assumes one machine-scoped state directory:

1. one `~/.noter/config.json`
2. one `sourceUrl`
3. one machine credential
4. one live connected-machine install per shell environment

That works for normal users and for the current production setup.

It is awkward for internal worktree testing because a worktree often needs its own:

1. backend origin
2. local credential
3. `noter.ts` implementation under development
4. long-running `run` process

Overwriting the default `~/.noter/config.json` to test a worktree is possible, but it breaks the
production-connected setup until the operator reconnects production.

## Current Code Facts

The implementation currently lives in `packages/sync/noter.ts` and is mirrored to
`apps/noter/public/noter.ts` for the browser-served installer.

The relevant current behavior is:

1. config lives at `~/.noter/config.json`
2. `connect` writes one machine-scoped config record
3. `run` reads that one config record
4. the local control server already binds with `LOCAL_CODEX_CONTROL_PORT = 0`, so the OS chooses a
   free port automatically for each process

That last point matters:

1. a second worktree install does **not** need a new port-allocation system
2. separate `run` processes can already get different local control ports
3. the real missing piece is config and credential isolation, not port math

## Recommendation

Adopt a per-state-directory model.

### Core idea

Keep the default user-facing install exactly as it is:

1. `~/.noter/config.json`
2. one connection
3. one machine-scoped install

Then add an operator-only escape hatch:

1. `--state-dir <path>`

When the operator passes `--state-dir`, `noter-sync` should treat that directory as the root of a
separate logical install.

Example:

1. production state dir: `~/.noter`
2. worktree state dir: `~/.noter/worktrees/ceff`

The config file for the worktree install would then be:

`~/.noter/worktrees/ceff/config.json`

## Why This Is Better Than Multi-Connection

The earlier multi-connection direction required all of these extra moving parts:

1. one config with many backends
2. one local service allowing many browser origins
3. one local service introspecting tokens against many backends
4. one runtime publishing into many backends at once

That is unnecessary for the actual operator workflow.

The state-dir model is smaller:

1. each install stays single-connection
2. each install reuses the current auth model unchanged
3. each install runs its own copy of the current runtime behavior
4. worktree changes to `noter.ts` stay isolated from production

This is the correct boundary for internal worktree development.

## Proposed CLI Contract

### `noter-sync connect`

Add:

```bash
noter-sync connect --state-dir <path> <source-url>
```

Behavior:

1. if `--state-dir` is omitted, use `~/.noter`
2. create the directory if it does not exist
3. read and write `<state-dir>/config.json`
4. if `<state-dir>/config.json` already exists, load it before registering
5. if the existing config already has a `machineId`, preserve it for the next successful
   registration
6. if the existing config already points at the same `sourceUrl`, treat reconnect as a refresh of
   that logical install and rewrite the completed record in place
7. if the existing config points at a different `sourceUrl`, treat reconnect as rebinding that one
   state directory to a different backend; replace `sourceUrl` and `machineCredential`, keep
   `machineId` when present, and use a different state directory instead when concurrent installs
   must remain live
8. if the existing config is partial, fill the missing fields and persist the completed record
9. keep the rest of the connect flow unchanged

### `noter-sync run`

Add:

```bash
noter-sync run --state-dir <path>
```

Behavior:

1. if `--state-dir` is omitted, use `~/.noter`
2. read `<state-dir>/config.json`
3. keep the rest of the run flow unchanged
4. let the local control server keep using port `0` so each process gets its own free local port
   automatically

## Proposed State Model

Each state directory should be fully independent.

Minimum shape:

```json
{
  "sourceUrl": "https://noter.md/noter.ts",
  "codexVersion": "0.33.0",
  "machineId": "machine_abc",
  "machineCredential": "mmc_abc"
}
```

For a worktree install, the same shape would live under that worktree state directory instead of
under `~/.noter`.

Important design choice:

1. do not try to share `machineId` across state directories
2. do not try to share credentials across state directories
3. treat each state directory as a separate logical machine install

That is simpler and avoids hidden coupling between production and worktree testing.

### At-rest protections

The worktree state directory is operational state, not a general-purpose cache.

Requirements:

1. the worktree state directory itself should be owner-only, typically `0700`
2. `<state-dir>/config.json` must be written with owner-only file permissions, typically `0600`
3. if a later slice splits `machineCredential` into its own credential file, that file must also be
   created with owner-only permissions, typically `0600`
4. logs, screenshots, exported JSON, fixtures, and PR text must redact `machineCredential` rather
   than printing it verbatim

### Credential storage hardening

The initial slice keeps `machineCredential` in `<state-dir>/config.json` so the change stays minimal
and compatible with the current implementation.

Future hardening may allow the worktree state directory to store a keychain reference instead:

```json
{
  "sourceUrl": "https://noter.md/noter.ts",
  "codexVersion": "0.33.0",
  "machineId": "machine_abc",
  "keychainPath": "keychain://noter/connected-machines/ceff"
}
```

That future extension should replace plaintext `machineCredential` storage for that state directory
rather than duplicating both secrets.

### Rotation and revocation

Each worktree state directory is independent.

Operational rules:

1. rerunning `connect` in the same state directory rotates `machineCredential` for that logical
   install and keeps `machineId` when it is already present
2. revoking or replacing `machineCredential` in one state directory does not affect any other state
   directory
3. rotating `machineId` requires a fresh state directory or deleting that state directory's existing
   config before reconnecting
4. removing `machineCredential` from `<state-dir>/config.json` makes `run` fail closed until
   `connect` mints and stores a replacement credential

## Operator Workflow

### Production remains unchanged

```bash
curl -fsSL 'https://noter.md/noter.ts' | node --input-type=module - connect 'https://noter.md/noter.ts'
curl -fsSL 'https://noter.md/noter.ts' | node --input-type=module - run
```

### Worktree uses its own state dir

```bash
curl -fsSL 'https://<worktree>/noter.ts' | node --input-type=module - connect --state-dir ~/.noter/worktrees/ceff 'https://<worktree>/noter.ts'
curl -fsSL 'https://<worktree>/noter.ts' | node --input-type=module - run --state-dir ~/.noter/worktrees/ceff
```

This keeps:

1. production connected through the default state dir
2. the worktree connected through its own state dir
3. the two installs isolated from each other

## Why This Still Solves The Phone E2E Problem

The worktree backend does not need to share production machine state.

It only needs:

1. its own approved machine registration
2. its own running connector
3. its own tunnel metadata published into that worktree backend

Once the worktree state dir has its own `connect` and `run`, the worktree's `/machines` route can
operate normally from the phone.

That is enough for internal validation.

## Non-Goals

1. No multi-backend config format
2. No shared machine record across backends
3. No multi-origin local-control auth
4. No multi-backend token introspection
5. No user-facing UI for managing multiple installs
6. No attempt to productize this for general users right now

## Acceptance Criteria

1. The default `~/.noter` flow behaves exactly as it does today.
2. A worktree can connect and run using `--state-dir` without mutating the default production
   config.
3. Production and worktree `run` processes can stay active at the same time.
4. A worktree can use its own modified `noter.ts` implementation without affecting production.
5. The worktree's `/machines` route can be tested end-to-end from the phone after its own `connect`
   and `run`.

## Rollout

### Slice 1

1. add `--state-dir` parsing to `connect` and `run`
2. move config-path resolution behind a helper that uses the chosen state dir
3. keep the default path exactly as today

### Slice 2

1. document the operator workflow for production plus worktree installs
2. add one honest validation path using a worktree state dir

### Slice 3

1. optionally teach Playwright or repo scripts to launch worktree installs with a deterministic
   state-dir naming convention
2. keep that as internal tooling, not product surface

## Decision

Replace the earlier multi-connection direction with a per-state-directory design.

This is the smallest coherent change that:

1. keeps the current single-connection product model intact
2. gives internal Noter worktrees their own isolated connected-machine installs
3. allows worktree `/machines` phone E2E without destabilizing production
