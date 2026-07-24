# Connected Machines Value And Retirement Audit

## Status

- Date: 2026-07-24
- Scope: connected-machine product, local connector, remote Codex control, and direct cross-cutting
  integrations
- Outcome: preserve the transferable design lessons, but retire the product implementation

## Decision

Remove connected machines from the active product and codebase.

The current implementation is a complete vertical product slice, not a cheap dormant experiment. It
includes browser approval, durable machine credentials, presence, short-lived control tokens, a
loopback Codex service, Cloudflare quick tunnels, cross-platform child-process management, thread
browsing, worktree creation, prompt submission, account-deletion integration, and visual coverage.

The value that remains is primarily conceptual:

1. user-owned compute may still be a useful product direction
2. the machine authorization design is a strong precedent for a future self-hosted runner
3. the thread and work-log UI contains useful agent-task interaction research

Those lessons do not justify retaining the current feature code. Preserve them in this research note
and Git history. Reintroduce only the pieces required by a future validated product.

## Evidence

### The feature is dormant and unavailable to members

The current repository guidance says remote-machine features have no active users or planned release
and should not drive migrations or scope (`AGENTS.md:226-228`). That status was added by `b4b32a468`
on 2026-07-13.

Regular members do not receive `access_machines`; only staff receive the full access-key set
(`apps/samebase/shared/accessModel.ts:37-56`). Both `/machines` and `/machines/connect` require that
access (`apps/samebase/src/routeAccessMetadata.ts:67-70`), and the route-discovery tests explicitly
verify that members do not see `/machines`
(`apps/samebase/src/routing/urlPathSuggestions.test.ts:89-103`).

The machine links were removed from the application sidebar in `e05d08f84` on 2026-05-18. The main
connected-machine product work landed between 2026-03-30 and 2026-04-04. Later edits are mostly
rebranding, routing, access-policy conversion, account deletion, and general maintenance.

The nominal npm package is still version `0.0.0` (`packages/sync/package.json:1-17`), and the
connect page says the package command is for use after `@samebase/sync` is published
(`apps/samebase/src/components/MachineConnectPage.tsx:335-339`). The hosted `/samebase.ts` path is
nevertheless built and deployed today.

### The shipped job was remote Codex control from a phone

The original separation was sound: hosted plugin auth identifies the account, while a separate
machine-scoped connector registers a local Codex runtime
(`rfcs/073_CODEX_PLUGIN_CONNECTED_MACHINE_ONBOARDING_RESEARCH.md:20-41`).

The primary product goal was to leave a connector running, open Samebase on a phone, browse local
Codex threads, and send prompts (`rfcs/078_TUNNELED_LOCAL_CODEX_CONTROL_SPEC.md:73-85`). The
onboarding work was explicitly framed as a first-user internal MVP, not a validated public feature
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

### Carrying cost is material

A conservative direct-file count totals about 13,200 lines across the connector, focused backend,
machine UI, helpers, tests, and visual fixtures. That excludes cross-cutting schema, account
deletion, access control, Vite asset serving, generated files, and documentation.

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

The dormant implementation also has unfinished operational boundaries:

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
security boundary to retain without users or a release plan.

## What Is Worth Preserving

| Asset                                      | Value                                                                                                                                                                                                                                                                     | Recommendation                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User-owned compute thesis                  | High product-level value. The operator's own computer is cheaper and more powerful than a hosted sandbox (`research/2026-07-02-landing-copy-interview.md:108-112`), and the idea remains in `TODO.md:43-44`.                                                              | Preserve the product insight, not this implementation. Revalidate the job before rebuilding.                                                                                                    |
| Machine authorization design               | High conceptual value. The browser never receives the durable machine credential. It gets a 15-minute machine-scoped token, and introspection rechecks ownership, account state, presence, and readiness (`apps/samebase/convex/connectedMachineControl.ts:14-143`).      | Preserve this pattern in the historical record. Reimplement against a future runner's actual trust boundary.                                                                                    |
| Authenticated tunnel publication           | Medium conceptual value. The connector binds loopback, proves that auth rejects a synthetic token, publishes the tunnel only after readiness, and degrades to presence-only on failure (`packages/sync/samebase.ts:3808-3841` and `packages/sync/samebase.ts:4298-4385`). | Preserve the invariant, not the Cloudflare quick-tunnel supervisor code.                                                                                                                        |
| Codex thread and work-log UX               | Medium research value. Project-grouped threads, compact work groups, and local versus new-worktree starts are useful references for a future agent/task surface (`specs/077_CONNECTED_MACHINE_MAIN_THREAD_SURFACE_SPEC.md:14-42`).                                        | Keep shared primitives that already have independent consumers. Delete machines-only timeline and workspace code.                                                                               |
| Local Codex research runtime               | Conditional value. The dev-only Codex research bridge imports the runtime and router from `packages/sync/samebase.ts` (`apps/samebase/dev/codexAppServerResearchBridge.ts:33-87`).                                                                                        | If that research surface is explicitly retained, extract only the runtime contract to a dev-owned module before deleting the connector. Otherwise delete both. Do not extract it speculatively. |
| `--state-dir` isolation and `link machine` | Low independent value. They exist to test multiple connected-machine installs without overwriting production state (`rfcs/083_CONNECTED_MACHINE_WORKTREE_STATE_DIR_SPEC.md:14-41`).                                                                                       | Delete with the connector and remove the workflow shortcut.                                                                                                                                     |
| Workspace shell, ProseMark, URL helpers    | Existing shared value unrelated to machines.                                                                                                                                                                                                                              | Keep because current non-machine consumers already own them.                                                                                                                                    |

## Removal Boundary

The removal should be staged so deployed data remains readable until it is migrated.

### 1. Quiesce the feature

Before removing the UI or validators:

1. stop new machine bootstrap and control-token issuance
2. revoke or delete active machine-control tokens and mark machines offline
3. wait at least the 15-minute token lifetime plus the connector's 30-second positive-validation
   cache, unless introspection is changed to return inactive immediately

This closes the remote-control path before its management surfaces are removed.

### 2. Remove the product surface

Delete:

1. `/machines` and `/machines/connect`
2. machine route-search and page-metadata entries
3. `MachineConnectPage`, `MachinesWorkspacePage`, `MachinesWorkspaceView`, and
   `MachinesWorkspaceThreadPane`
4. machines-only helpers, fixtures, screenshots, live specs, and visual specs
5. the hosted `/samebase.ts` and `/samebase-connect.json` delivery wiring
6. the `link machine` shortcut and worktree machine-link cleanup behavior

Do not delete shared workspace, ProseMark, Codex sidebar, or URL utilities merely because machines
used them.

### 3. Remove the connector and remote-control backend

Delete:

1. `packages/sync`
2. connected-machine registration, heartbeat, and control-token HTTP endpoints
3. connected-machine queries and mutations
4. presence and ordering helpers
5. connector-specific CI and tracked-file entries

Before deleting `packages/sync`, make one explicit decision on the dev-only Codex research routes.
The current research bridge imports its runtime from the connector. Delete the dev research routes
too unless there is a current engineering owner and an immediate use. If they are retained, extract
the minimum local runtime into that dev boundary in a separate preparatory change.

Do not remove `access_machines` in this phase. Dormant Codespaces routes and functions also use that
access key, so its removal belongs to the broader remote-compute cleanup.

### 4. Migrate and narrow persisted data

Use the repository's widen-migrate-narrow Convex workflow:

1. deploy code that no longer reads or writes connected-machine data
2. delete existing rows from `connectedMachines`, `machineRegistrationRequests`,
   `machineRegistrationRateLimits`, `machineCredentials`, and `machineControlTokens`
3. verify the tables are empty
4. remove the tables from the schema
5. remove the connected-machines account-deletion progress group and cleanup handlers
6. delete migration scaffolding after the narrow deploy is stable

The lack of active users does not make it safe to remove Convex table validators before old rows are
deleted.

### 5. Retire documentation

Archive or replace the active connected-machine specs and RFCs with this concise historical record.
Remove current walkthroughs and manual tests so future agents do not treat the feature as supported.
Keep Git history as the implementation archive.

## Rebuild Trigger

Do not revive connected machines because the old implementation is available.

A future implementation should start only after a concrete active job requires user-owned compute.
At that point, reuse these proven decisions:

1. explicit browser approval for a local runner
2. a durable credential that never reaches browser JavaScript
3. short-lived audience- and runner-scoped browser tokens
4. loopback-only local service
5. fail-closed readiness before advertising remote ingress

Everything else should be selected from the future product's current requirements.
