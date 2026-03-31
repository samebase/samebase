# 076 Connected Machine Registration And Presence Rollout Spec

## Document Control

- Status: Accepted
- Owner: connected machine onboarding + presence
- Last updated: 2026-03-30
- Related docs:
  - `rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md`
  - `specs/075_CONNECTED_MACHINE_INSTALLER_LOCAL_WALKTHROUGH_SPEC.md`
  - `specs/077_CONNECTED_MACHINE_PRESENCE_MERGE_CHECKLIST_SPEC.md`
  - `specs/069_LOCAL_PROVIDER_THREAD_INVENTORY_RESEARCH_SURFACE_SPEC.md`

## Summary

After `#372`, `main` now has:

1. a hosted installer artifact at `/noter.js`
2. a local bootstrap flow that writes `~/.noter/config.json`
3. a `/machines/connect` browser handoff page

After `#372`, `main` still does **not** have:

1. durable machine credentials
2. machine registration in Convex
3. machine heartbeats or online/offline presence
4. synced thread summaries
5. a `noter.md` UI that can browse connected-machine threads

The next rollout should **not** revive `#359` as a PR.

Instead, Noter should treat `#359` as a code quarry and ship the remaining work
in fresh follow-up PRs on top of current `main`, starting with machine
registration and presence.

The active blocker checklist for the current slice lives in
`specs/077_CONNECTED_MACHINE_PRESENCE_MERGE_CHECKLIST_SPEC.md`.

## Why `#359` Is Superseded

`#359` still contains useful foundation code:

1. `connectedMachines` schema shape
2. `machineThreads` summary schema shape
3. heartbeat + summary-sync connector logic
4. research docs that informed the MVP direction

But `#359` is stale as a review unit because:

1. `#372` already changed the onboarding contract on `main`
2. `#359` assumes the older research bootstrap path where the connector is
   configured directly with `CONVEX_DEPLOY_KEY` and
   `NOTER_CONNECTED_MACHINE_USER_ID`
3. `#359` uses admin-auth-style Convex access for the connector instead of the
   machine approval + credential issuance direction now documented in RFC 073
4. `#359` carries branch-local docs/spec numbering that no longer matches
   current `main`
5. `#359` still would not give `noter.md` the product UI needed to browse
   connected machines and their thread summaries

Conclusion:

1. do not rebase `#359`
2. do not merge `#359`
3. port only the useful code into fresh follow-up PRs

## Locked Product Decisions

1. `#372` remains the installer/bootstrap slice.
2. Plugin auth and machine auth stay separate concerns.
3. The browser handoff page at `/machines/connect` remains the approval
   checkpoint between local bootstrap and durable machine registration.
4. The connector must authenticate with a machine-scoped credential, not with a
   copied browser session and not with a manually pasted admin deploy key.
5. The local config stays machine-scoped at `~/.noter/config.json`; reruns
   update one installation record instead of creating parallel installs.
6. The next implementation slice is machine registration + presence, not remote
   thread control.
7. Thread summary sync ships after registration + presence.
8. `machineCommands` / `readThread` / `sendTurn` ship after thread summary
   browsing is live.

## Rollout Order

### Slice 1: Installer Hardening Plus Machine Registration And Presence

This is the next PR after `#372`.

Scope:

1. fix the remaining installer robustness issues from `#372`
2. add browser-side machine approval and credential issuance
3. add the `connectedMachines` Convex table and auth-bound queries
4. add a connector heartbeat path that uses the new machine credential model
5. show the registered machine in the app as online/offline presence

This slice intentionally does **not** include:

1. thread summary sync
2. thread detail reads
3. command delivery

### Slice 2: Machine Thread Summary Sync And Browse UI

This follows slice 1.

Scope:

1. port the useful `machineThreads` summary model from `#359`
2. sync thread summary rows from the approved local connector
3. add the browser UI that lists a machine's synced Codex thread summaries
4. reuse the existing local research browser visuals where helpful, but adapt
   them to summary rows instead of direct app-server detail objects

This slice intentionally does **not** include:

1. `machineCommands`
2. remote prompt sending
3. remote turn result reads

### Slice 3: Remote Read And Continue

This follows slice 2.

Scope:

1. add `machineCommands`
2. support `readThread`
3. support `sendTurn`
4. add selected-thread detail/result surfaces in the browser

## Slice 1 Requirements

### Installer hardening

Before registration depends on the installer path, `main` should fix the
remaining merged issues from `#372`:

1. the published package path must execute correctly when launched through a
   `.bin` symlink such as `npx @noter-md/sync connect`
2. the direct hosted-file command must fail closed when the `curl` step fails
3. docs in the merged installer slice should stop pointing at stale branch-local
   file paths or missing follow-on docs
4. the hosted installer may use a tiny same-origin runtime config asset for
   deploy-specific Convex HTTP discovery, but `/noter.js` itself must remain
   byte-for-byte identical across deploys

### Approval and credential issuance

The machine-connect page should advance from "bootstrap ran" to actual machine
approval.

Required flow:

1. local bootstrap opens `/machines/connect?openedByCli`
2. the signed-in browser approves connecting the current Codex instance
3. the local bootstrap persists one machine-local credential in
   `~/.noter/config.json`
4. browser approval activates that machine credential for server-side use
5. the local `run` command reuses the stored credential for connector heartbeats

The exact wire format may change during implementation, but the product rule is
locked:

1. no manual `CONVEX_DEPLOY_KEY`
2. no manual `NOTER_CONNECTED_MACHINE_USER_ID`
3. no reuse of hosted plugin OAuth credentials as the machine credential

### Presence model

Port the useful `connectedMachines` shape from `#359` into a fresh PR on top of
`main`.

Required fields:

1. `userId`
2. `machineId`
3. `displayName`
4. `hostname`
5. `os`
6. `status`
7. `lastSeenAt`
8. `connectorVersion`
9. `capabilities`
10. `allowedRoots`

Required behavior:

1. machine heartbeats upsert one row per machine
2. stale heartbeats resolve to offline in queries
3. queries are auth-bound to the signed-in user
4. the browser can list connected machines without loading thread data

### UI outcome

Slice 1 is complete when the operator can:

1. run the local bootstrap
2. approve the machine in the browser
3. start or resume the local connector with the stored machine credential
4. see that machine appear in Noter as online

The minimal shipped browser surface may live on `/machines/connect`, the
dashboard, or both. The product requirement is that the machine is visible in
Noter with truthful online/offline state.

## Slice 2 Porting Rules

When porting code from `#359` into the later thread-summary slice:

1. keep the `machineThreads` summary idea
2. keep the auth-bound query shape
3. keep the connector-side dedupe and snapshot-replace semantics where still
   valid
4. do **not** port the old connector auth/bootstrap path
5. do **not** port branch-only docs/spec files unchanged
6. do **not** claim `machineCommands` are shipped until they actually are

## Acceptance

### Slice 1

- [ ] `npx @noter-md/sync connect` works through the published-package entry
      path.
- [ ] The direct hosted-file command fails visibly when the hosted script cannot
      be downloaded.
- [ ] The browser handoff page supports machine approval instead of only showing
      bootstrap instructions.
- [ ] The local connector can authenticate without `CONVEX_DEPLOY_KEY` and
      without `NOTER_CONNECTED_MACHINE_USER_ID`.
- [ ] Noter can list the approved machine with truthful online/offline state.

### Slice 2

- [ ] The connector syncs `machineThreads` summary rows into Convex.
- [ ] Noter can browse a machine's synced Codex thread summaries from another
      device.
- [ ] This browse surface works without direct browser-to-machine app-server
      access.

### Slice 3

- [ ] Noter can request thread detail on demand.
- [ ] Noter can send a prompt to an existing machine-local thread.
- [ ] The browser can show command state and the final result.
