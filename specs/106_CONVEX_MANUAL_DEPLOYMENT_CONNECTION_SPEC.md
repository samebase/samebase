# Convex Manual Project Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, vault dashboard
- Last updated: 2026-07-29
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/103_CONVEX_API_VALIDATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`

## Current Contract

Convex project connection combines two facts:

1. GitHub observation proves an exact Convex code location in the vault repository.
2. The user intends to attach one identified Convex project at that location.

`vaultConvexProjects` stores that intent and the last verified provider coordinates:

```ts
{
  vaultId;
  userId;
  teamId;
  projectId;
  convexConfigPath;
  // or convexDirectoryPath
  origin;
}
```

`projectId` is the stable global continuity key. `teamId` is the last provider team under which
Samebase verified the project. Each row stores exactly one placement variant: an explicit
`convexConfigPath`, or a default-layout `convexDirectoryPath`. Several projects may intentionally
select the same code location. Convex `_creationTime` records when the attachment was created.

Project names, slugs, deployments, URLs, deploy keys, current team, and current repository file
existence remain live provider observations.

### Source discovery

`/vault/<org>/<repo>?add-convex` opens one vault-level dialog.

Samebase resolves the exact default-branch HEAD and recursive Git tree. It offers either:

- an explicit regular blob whose repository-relative path ends in exactly `convex.json`; or
- a default-layout directory named exactly `convex` whose parent contains a regular `package.json`
  blob.

Both forms use Git tree metadata only. Samebase does not read or validate the `convex.json` or
`package.json` body. An explicit `convex.json` at a root suppresses the default-layout candidate at
that same root. A truncated tree cannot prove that no code location exists.

The code location selector is closed over discovered evidence. There is no free-form app-root field.

### Existing project flow

1. Samebase lists projects visible through the connected Convex credential.
2. Projects named by discovered Workers' readable `SAMEBASE_CONVEX_PROJECT` markers sort first and
   show that evidence. Observation alone never selects a project.
3. The user may select several projects.
4. The user selects one discovered code location for every selected project. Several projects may
   select the same location.
5. Samebase re-verifies every exact config blob or default-layout tree entry plus `package.json`
   blob by object SHA, and reads every project, then writes the full selection in one transaction.
   Any changed or missing source, inaccessible project, or attachment conflict rejects the whole
   confirmation.

### Create project flow

The user chooses one discovered code location and a project name. Samebase re-verifies the source,
creates the project with a production deployment, reads the project back, and attaches it at that
location. If the provider create succeeds but attachment fails, Samebase reports the ambiguous
external state and does not delete the project automatically.

### Identity, transfer, and writes

An exact `projectId` can be attached to only one vault, even if its team changes. Idempotent
confirmation preserves attachment identity and only upgrades `origin` when a managed operation
proves ownership.

Provider writes require the connected credential to verify the stored `projectId` under the stored
`teamId`. A 404 under that team is ambiguous because the project may have been deleted or
transferred, so writes fail closed.

If the connected credential reads the same `projectId` under a different team, Samebase reports team
drift. Explicit reconciliation re-verifies the destination team and compare-and-swaps only `teamId`.
It preserves the attachment ID, code location, origin, and creation time.

### Source drift and removal

Moving or deleting the selected `convex.json`, `convex/`, or sibling `package.json` does not detach
or silently relocate the project. The stored location remains the expected placement and the
dashboard reports the GitHub observation.

`Change code location` offers only currently discovered locations, re-verifies the selected Git
evidence, and compare-and-swaps only the code location variant.

`Remove from vault` is an explicit user-intent mutation. It removes only the unchanged local
attachment. It never deletes the Convex project. Provider absence and a stored-team 404 never remove
the attachment automatically.

### Resource routes

Data and Schema routes identify the `vaultConvexProjects` attachment directly. They do not resolve a
project by config root and never choose the first project at a shared path.

### Operation safety

Attaching projects, changing a code location, reconciling a team, and detaching a project are
database-only attachment changes. Each mutation checks the shared vault infrastructure state and
changes the attachment in the same transaction.

Creating a Convex project is an external provider write. It claims the durable manual provider owner
before its first provider call. Normal success or error makes the owner terminal and ends the block.
A late action or a different action ID cannot record the result.

One fenced expiry handles a silent create. It marks only the matching active action failed and
advances `lastWriteAt.convex`. It does not call Convex, repeat the create request, or store a replay
target.

After expiry, the user or agent uses the normal Convex discovery. If the project was created but its
attachment was not recorded, discovery shows it as an existing project. The user can attach it with
the normal existing-project action. Samebase does not adopt it automatically. If the project does
not exist, the user can use the normal create action again.

A known create result or expiry updates `lastWriteAt.convex` so the dashboard cannot reuse an
observation from before the action.

## Non-Goals

- Persisting deployment or dashboard metadata.
- Persisting a Worker-to-project edge.
- Fuzzy project-to-folder inference.
- Treating `teamId` as immutable project identity.
- Automatically removing inaccessible projects.

## Validation

- GitHub tests cover root and nested configs, default-layout directories, package metadata without
  package contents, malformed JSON, non-regular files, truncated trees, exact evidence confirmation,
  and evidence changed between discovery and confirmation.
- Mutation tests cover atomic batches, global `projectId` uniqueness, shared code locations,
  idempotency, origin upgrade, code-location compare-and-swap, and team compare-and-swap.
- Provider tests cover transfers, inaccessible projects, stale markers, and writes that fail closed.
- Operation tests cover the same-transaction attachment gate, durable create claims, one fenced
  expiry, stale completion rejection, normal existing-project attachment after expiry, and
  Convex-only write times.
- UI and route tests cover multi-selection, Worker-reference ordering without automatic selection,
  closed code-location selectors, moved code, shared roots, team reconciliation, explicit removal,
  and attachment-ID Data and Schema routes.
