# Convex Manual Project Connection

## Document Control

- Status: Accepted
- Owner: Samebase provider resources, vault dashboard
- Last updated: 2026-07-21
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/103_CONVEX_API_VALIDATION_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/115_VAULT_RESOURCE_ATTACHMENT_MODEL_SPEC.md`

## Current Contract

Convex project connection combines two facts:

1. GitHub observation proves an exact `convex.json` location in the vault repository.
2. The user intends to attach one identified Convex project at that location.

`vaultConvexProjects` stores that intent and the last verified provider coordinates:

```ts
{
  vaultId;
  userId;
  teamId;
  projectId;
  convexConfigPath;
  origin;
  createdAt;
}
```

`projectId` is the stable global continuity key. `teamId` is the last provider team under which
Samebase verified the project. Several projects may intentionally select the same
`convexConfigPath`.

Project names, slugs, deployments, URLs, deploy keys, current team, and current repository file
existence remain live provider observations.

### Source discovery

`/vault/<org>/<repo>?add-convex` opens one vault-level dialog.

Samebase resolves the exact default-branch HEAD and recursive Git tree. It offers every regular blob
whose repository-relative path ends in exactly `convex.json` and whose body parses as a JSON object.
It does not require a sibling `package.json` or infer packages from path conventions. A truncated
tree cannot prove that no config exists.

The config path selector is closed over discovered files. There is no free-form app-root field.

### Existing project flow

1. Samebase lists projects visible through the connected Convex credential.
2. Projects named by discovered Workers' readable `SAMEBASE_CONVEX_PROJECT` markers sort first and
   show that evidence. Observation alone never selects a project.
3. The user may select several projects.
4. The user selects one discovered `convex.json` path for every selected project. Several projects
   may select the same path.
5. Samebase re-reads every exact config blob and project, then writes the full selection in one
   transaction. Any invalid source, inaccessible project, or attachment conflict rejects the whole
   confirmation.

### Create project flow

The user chooses one discovered config path and a project name. Samebase validates the source,
creates the project with a production deployment, reads the project back, and attaches it at that
path. If the provider create succeeds but attachment fails, Samebase reports the ambiguous external
state and does not delete the project automatically.

### Identity, transfer, and writes

An exact `projectId` can be attached to only one vault, even if its team changes. Idempotent
confirmation preserves attachment identity and only upgrades `origin` when a managed operation
proves ownership.

Provider writes require the connected credential to verify the stored `projectId` under the stored
`teamId`. A 404 under that team is ambiguous because the project may have been deleted or
transferred, so writes fail closed.

If the connected credential reads the same `projectId` under a different team, Samebase reports team
drift. Explicit reconciliation re-verifies the destination team and compare-and-swaps only `teamId`.
It preserves the attachment ID, config path, origin, and creation time.

### Source drift and removal

Moving or deleting the selected `convex.json` does not detach or silently relocate the project. The
stored path remains the expected placement and the dashboard reports the GitHub observation.

`Change code location` offers only currently discovered configs, re-verifies the selected blob, and
compare-and-swaps only `convexConfigPath`.

`Remove from vault` is an explicit user-intent mutation. It removes only the unchanged local
attachment. It never deletes the Convex project. Provider absence and a stored-team 404 never remove
the attachment automatically.

### Resource routes

Data and Schema routes identify the `vaultConvexProjects` attachment directly. They do not resolve a
project by config root and never choose the first project at a shared path.

## Non-Goals

- Persisting deployment or dashboard metadata.
- Persisting a Worker-to-project edge.
- Fuzzy project-to-folder inference.
- Treating `teamId` as immutable project identity.
- Automatically removing inaccessible projects.

## Validation

- GitHub tests cover root and nested configs, malformed JSON, non-regular files, truncated trees,
  exact-blob confirmation, and a blob changed between discovery and confirmation.
- Mutation tests cover atomic batches, global `projectId` uniqueness, shared config paths,
  idempotency, origin upgrade, config-path compare-and-swap, and team compare-and-swap.
- Provider tests cover transfers, inaccessible projects, stale markers, and writes that fail closed.
- UI and route tests cover multi-selection, Worker-reference ordering without automatic selection,
  closed config selectors, moved configs, shared roots, team reconciliation, explicit removal, and
  attachment-ID Data and Schema routes.
