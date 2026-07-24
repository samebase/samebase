# Connected Machines Value And Retirement Audit

## Status

- Date: 2026-07-24
- Scope: connected-machine product, local connector, remote Codex control, and direct cross-cutting
  integrations
- Project context: pre-beta, with the operator as the only real user and no compatibility commitment
  to external data
- Outcome: product implementation retired; transferable design lessons preserved here and in Git
  history

## Decision

Remove connected machines from the active product and codebase.

Implementation completed on 2026-07-24:

1. removed the machine routes, browser UI, connector distribution, and machine-only Codex research
   runtime
2. deleted the five Convex tables directly, along with their HTTP functions and generated API
3. removed the connected-machines account-deletion group and reused the remaining generic cleanup
   machinery for its tests
4. deleted machine-only URL suggestion logic, token creation, CI checks, operator shortcuts, specs,
   RFCs, and manual tests
5. retained `access_machines` only because dormant Codespaces still owns that access key

This recommendation does not rely on user count. Samebase has not offered beta access, and the
operator is the product's only real user. Zero external users is therefore neutral evidence, not a
sign that connected machines failed.

The current implementation is a complete vertical product slice, not a cheap dormant experiment. It
includes browser approval, durable machine credentials, presence, short-lived control tokens, a
loopback Codex service, Cloudflare quick tunnels, cross-platform child-process management, thread
browsing, worktree creation, prompt submission, account-deletion integration, and visual coverage.

The user-owned-compute thesis remains strategically plausible. The mismatch is the current product
shape: connected machines builds a Codex-specific agent cockpit inside Samebase, while the current
Samebase direction is an app control plane used from the coding agent the user already chose.

The value worth preserving is:

1. user-owned compute as a future product direction
2. the machine authorization design is a strong precedent for a future self-hosted runner
3. the thread and work-log UI contains useful agent-task interaction research

Those lessons do not justify retaining this Codex-specific implementation or extracting a
speculative runner abstraction. Preserve them in this research note and Git history. If user-owned
compute becomes an immediate milestone, define an app-centric, agent-client-neutral runner first and
port only the proven invariants it needs.

## Evidence

### Pre-beta adoption is neutral

Samebase has not offered beta access. The operator is the only real user, so the absence of external
connected-machine users cannot show demand, product failure, or maintenance value.

The current staff-only access gate, hidden navigation, and unpublished npm package describe release
state, not product merit. Regular members do not receive `access_machines`
(`apps/samebase/shared/accessModel.ts:37-56`), `/machines` and `/machines/connect` require it
(`apps/samebase/src/routeAccessMetadata.ts:67-70`), and the nominal package remains version `0.0.0`
(`packages/sync/package.json:1-17`). The hosted `/samebase.ts` path is nevertheless a real working
distribution channel.

The useful priority signal is narrower: repository guidance says remote-machine features are dormant
and have no planned release (`AGENTS.md:226-228`). "No planned release" matters because it places
this large vertical outside the current product direction. "No active users" does not matter as
adoption evidence in the current project stage.

The machine links were removed from the application sidebar in `e05d08f84` on 2026-05-18. The main
connected-machine product work landed between 2026-03-30 and 2026-04-04. Later edits are mostly
rebranding, routing, access-policy conversion, account deletion, and general maintenance.

### The shipped job was remote Codex control from a phone

The original separation was sound: hosted plugin auth identifies the account, while a separate
machine-scoped connector registers a local Codex runtime
(`rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md:20-41`).

The primary product goal was to leave a connector running, open Samebase on a phone, browse local
Codex threads, and send prompts (`rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md:73-85`). The
onboarding work was explicitly framed as a first-user internal MVP rather than a beta launch
(`rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md:3-9`).

The implementation progressed well beyond presence:

1. `111daec07`: installer and connect UI
2. `52cdf65de`: registration and presence
3. `3803cdeeb`: local control, short-lived tokens, and Cloudflare tunnel
4. `4eb794d88`: `/machines` workspace
5. `01c3e4f21`: thread timeline and composer
6. `5d0df5572`: machine-local thread pinning
7. `f51e3d998`: local and worktree conversation creation

Some current docs understate the implementation. For example,
`specs/076_CONNECTED_MACHINE_REGISTRATION_AND_PRESENCE_ROLLOUT_SPEC.md:39-41` still describes a
presence-only capability, while the code supports live-control state, tunnel metadata, and control
tokens (`apps/samebase/convex/connectedMachineModel.ts:14-34` and
`apps/samebase/convex/connectedMachineControl.ts:14-143`). The proposed RFC was substantially
implemented without being promoted to an accepted current contract.

### The implementation conflicts with the current product boundary

Samebase's current thesis is that the coding agent the user already chose should create, connect,
observe, and repair a standard app base across GitHub, Convex, and Cloudflare
(`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md:30-52`). The app is explicitly a tool used from inside
Codex or Claude, not a wrapper that replaces their interfaces
(`rfcs/093_AGENT_NATIVE_ONE_BASE_PLAN.md:68-72`).

The shipped plugin follows that boundary:

1. it supports both Codex and Claude Code from one package
2. work continues in the app's real GitHub repository
3. Samebase owns app inventory, provider joins, and repair flows
4. Git and the repository own source and version identity

That responsibility split is explicit in
`apps/samebase/src/content/docs-operate-agent-plugin.md:1-10` and
`apps/samebase/src/content/docs-operate-agent-plugin.md:36-48`.

Connected machines implements a different category:

1. a Codex-specific runtime that launches `codex app-server`
2. machine-wide Codex thread inventory and pin/archive state
3. a Samebase-owned transcript, work log, and composer
4. browser-controlled worktree creation, approvals, and turns
5. remote-control transport from a phone

Current positioning assigns sessions, workspaces, terminals, and remote control to the agent-cockpit
category represented by CLONK and Conductor. Samebase's category is app-base standardization
(`research/2026-07-14-agent-native-positioning-and-competitor-eval.md:191-224`).

User-owned compute still fits Samebase's cost and ownership philosophy. The current remote Codex
client does not strengthen the app and provider control plane, and it bakes one agent client into a
direction whose current plugin is deliberately client-neutral.

### Carrying cost is material

A conservative named-surface count totals about 13,200 lines across the connector, focused backend,
machine UI, helpers, tests, and visual fixtures. That is not the direct deletion savings because the
connector also contains a generic Codex research runtime. The count excludes cross-cutting schema,
account deletion, access control, Vite asset serving, generated files, and documentation.

The largest single boundary is `packages/sync/samebase.ts`, a 4,449-line dependency-free script with
a 2,453-line focused test. It combines:

1. installer and config management
2. Windows, macOS, and Linux Codex process discovery
3. Codex app-server protocol normalization
4. thread, turn, pin, archive, approval, and worktree operations
5. local HTTP routing and CORS
6. machine-token introspection
7. Cloudflare quick-tunnel supervision
8. heartbeats and connector lifecycle

The browser route then adds short-lived token brokerage, direct tunnel calls, retry behavior,
multi-machine polling, thread hydration, worktree conversation creation, and prompt submission
(`apps/samebase/src/components/MachinesWorkspacePage.tsx:92-143`,
`apps/samebase/src/components/MachinesWorkspacePage.tsx:255-309`, and
`apps/samebase/src/components/MachinesWorkspacePage.tsx:447-514`).

The backend owns five tables under `connectedMachineTables`
(`apps/samebase/convex/connectedMachineModel.ts:36-121`) and three HTTP endpoints
(`apps/samebase/convex/http.ts:96-112`). Account deletion has a dedicated progress group and cleanup
handlers (`apps/samebase/convex/accountDeletion/model.ts:148-169` and
`apps/samebase/convex/accountDeletion/cleanup.ts:402-456`).

The authorization design is reasonably fail-closed: durable credentials are hashed before backend
lookup, browser tokens are machine-scoped and short-lived, introspection rechecks ownership and
readiness, and the connector verifies rejection of a synthetic token before publishing its tunnel.
The audit found no obvious authentication bypass.

The dormant implementation still has unfinished operational boundaries:

1. `allowedRoots` is always published as an empty array and is not enforced by the local control
   router (`packages/sync/samebase.ts:316-347`)
2. there is no ordinary machine disconnect or token-revocation flow
3. expired registration requests, rate-limit rows, and control tokens have no scheduled garbage
   collection
4. browser clients poll every ready machine's inventory every 1.5 seconds, in addition to selected
   thread polling (`apps/samebase/src/components/MachinesWorkspacePage.tsx:447-573`)

The protected tunnel can choose a working directory and approval policy, create worktrees, start
turns, and respond to Codex approvals (`packages/sync/samebase.ts:3141-3214` and
`packages/sync/samebase.ts:3313-3375`). That is a legitimate product capability, but it is a large
security boundary to retain without an immediate product role or planned release.

## What Is Worth Preserving

| Asset                                      | Value                                                                                                                                                                                                                                                                     | Recommendation                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| User-owned compute thesis                  | High strategic value. The operator's own computer is cheaper and more powerful than a hosted sandbox (`research/2026-07-02-landing-copy-interview.md:108-112`), and the idea remains in `TODO.md:43-44`.                                                                  | Preserve this as a future direction. Do not describe it as disproven by adoption.                                                      |
| Machine authorization design               | High conceptual value. The browser never receives the durable machine credential. It gets a 15-minute machine-scoped token, and introspection rechecks ownership, account state, presence, and readiness (`apps/samebase/convex/connectedMachineControl.ts:14-143`).      | Preserve this pattern in the historical record. Reimplement it against a future runner's actual trust boundary.                        |
| Authenticated tunnel publication           | Medium conceptual value. The connector binds loopback, proves that auth rejects a synthetic token, publishes the tunnel only after readiness, and degrades to presence-only on failure (`packages/sync/samebase.ts:3808-3841` and `packages/sync/samebase.ts:4298-4385`). | Preserve the invariant, not the Cloudflare quick-tunnel supervisor code.                                                               |
| Remote Codex workflow and UX               | Real operator value when used: thread browsing, pinning, transcripts, prompts, approvals, and local or worktree starts. It is nevertheless an agent-cockpit product rather than the current Samebase control-plane product.                                               | Preserve the research record and delete the implementation because it sits outside the planned product boundary.                       |
| Local Codex research runtime               | Technically reusable, but its only non-machine caller is a dev-only admin research surface (`apps/samebase/dev/codexAppServerResearchBridge.ts:33-87`).                                                                                                                   | Delete it with that dormant research surface. Do not extract a reusable runner until a current requirement defines the right boundary. |
| `--state-dir` isolation and `link machine` | Low independent value. They exist to test multiple connected-machine installs without overwriting production state (`rfcs/083_CONNECTED_MACHINE_WORKTREE_STATE_DIR_SPEC.md:14-41`).                                                                                       | Delete with the connector and remove the workflow shortcut.                                                                            |
| Workspace shell, ProseMark, URL helpers    | Existing shared value unrelated to machines.                                                                                                                                                                                                                              | Keep because current non-machine consumers already own them.                                                                           |

## Direct Removal Boundary

This pre-beta project removes obsolete tables directly. The cleanup should not add migrations,
compatibility validators, staged rollout state, or sunset infrastructure.

### 1. Stop operator-local processes

If a connector is currently running, stop that exact process before deleting its server-side
support. Removing a local `~/.samebase` or checkout-specific state directory is a separate local
cleanup action with an explicit target. Do not treat local-machine deletion as an automatic code
change.

### 2. Delete the product and research surfaces

Delete:

1. `/machines` and `/machines/connect`
2. machine route-search, page-metadata, address, and URL-suggestion entries
3. `MachineConnectPage`, `MachinesWorkspacePage`, `MachinesWorkspaceView`, and
   `MachinesWorkspaceThreadPane`
4. machine-only helpers, fixtures, screenshots, live specs, visual specs, and tests
5. the dev-only Codex app-server research routes, bridge, components, and types that have no other
   active consumer
6. the `link machine` shortcut and worktree machine-link cleanup behavior

Do not delete shared workspace, ProseMark, URL, or cryptographic utilities that have current
non-machine consumers.

### 3. Delete the backend and five tables

Delete the connected-machine Convex modules, three HTTP routes, schema spread, generated API
entries, presence and ordering helpers, and these five tables:

1. `connectedMachines`
2. `machineRegistrationRequests`
3. `machineRegistrationRateLimits`
4. `machineCredentials`
5. `machineControlTokens`

Remove the connected-machines account-deletion progress field, cleanup handlers, UI label, and tests
in the same change. Before deploying the narrowed schema, directly delete any active
`workflow_accountDeletion_runs` row whose `dataDeletion` still contains `connectedMachines` and any
`ui_workspaceSidebar_layouts` row whose `workspaceKey` is `machines`.

Removing a table definition from `schema.ts` does not delete stored Convex tables. After deploying
the backend removal, delete the five tables directly from each persistent deployment. Do not build a
migration framework for these rows or tables.

Keep `access_machines` while Codespaces remains because Codespaces shares that key. Its deletion
belongs to the separate Codespaces cleanup.

### 4. Delete machine distribution

Delete `packages/sync`, the hosted `/samebase.ts` and `/samebase-connect.json` Vite paths, public
headers, connector-specific CI, and tracked-file entries.

Do not extract `CodexLocalControlRuntime` merely because it could be reused. Its only other consumer
is the dormant dev research surface, and no current runner contract defines a correct reusable
boundary.

### 5. Retire documentation

Archive or replace the active connected-machine specs and RFCs with this concise historical record.
Remove current walkthroughs and manual tests so future agents do not treat the feature as supported.
Keep Git history as the implementation archive.

## Rebuild Trigger

Do not revive connected machines merely because the old implementation is available.

If user-owned compute becomes an immediate milestone, first define an app-centric,
agent-client-neutral runner that strengthens Samebase's app and provider control plane. Then port
these proven decisions:

1. explicit browser approval for a local runner
2. a durable credential that never reaches browser JavaScript
3. short-lived audience- and runner-scoped browser tokens
4. loopback-only local service
5. fail-closed readiness before advertising remote ingress

Everything else should be selected from the future product's current requirements.
