# Vault Resource Attachment Model

## Document Control

- Status: Accepted
- Owner: Samebase
- Last updated: 2026-07-21
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`

## Current Contract

### Domain entities

A vault is a user's connection to one GitHub repository. A provider resource attachment records the
user's intent to include one independently identified provider resource in that vault.

Samebase has no durable app, folder, or root-group entity. In particular, there is no `vaultApps`
table and provider attachments do not carry an `appId`.

The durable Cloudflare attachment is:

```ts
{
  vaultId;
  userId;
  accountId;
  workerName;
  workerTag;
  origin;
  createdAt;
}
```

The durable Convex attachment is:

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

`accountId` plus Worker identity and `teamId` plus `projectId` are provider coordinates. `projectId`
is the stable Convex project continuity key. `teamId` is the last team under which Samebase verified
that project and is updated only by explicit provider-verified reconciliation.

`convexConfigPath` is the user-confirmed repository placement of the Convex project. It names an
exact regular file named `convex.json` on the repository's default branch. Multiple Convex projects
may intentionally select the same config path.

### Observations and projection

Provider observations are current evidence, not attachment identity:

- GitHub supplies whether the stored `convexConfigPath` currently exists and parses as a JSON
  object.
- Cloudflare Workers Builds supplies the Worker's current GitHub repository and normalized root
  directory.
- `SAMEBASE_CONVEX_PROJECT` supplies the Worker's current declared Convex project coordinates.
- Convex supplies the project's current team and accessibility under the connected credential.

The dashboard derives a resource tree at read time:

- a Convex project's root is the parent directory of `convexConfigPath`;
- a Worker's root is its current verified Cloudflare Workers Builds root;
- resources group only when those normalized paths are exactly equal;
- a resource group has no ID, lifecycle, persisted row, or empty state;
- an attached Worker without one unambiguous verified root appears under `Needs attention`;
- a Worker marker may annotate a relation to a Convex project, but never changes either resource's
  placement or creates a persisted edge.

The common single-app repository is one `/` group. A monorepo is the same model with more derived
groups.

### Vault-level connection flows

The only provider-add dashboard routes are bare vault-level flags:

- `?add-cloudflare`
- `?add-convex`

There is no `?add-app-root` route and no `app-root` query parameter.

The Cloudflare dialog scans the selected account for Workers connected to the vault's immutable
GitHub repository identity. It groups selectable Workers by their read-only live root and supports
attaching several Workers in one confirmation. Confirmation re-reads the selected Worker identities,
repository triggers, roots, and markers before one atomic attachment mutation. A request-provided
root is never attachment authority.

The Convex dialog discovers regular `convex.json` files from the exact default-branch Git tree and
blob contents. It supports selecting several projects and requires one discovered config path for
each selected project. Confirmation re-reads every selected config blob and project before one
atomic attachment mutation.

Creating a Worker may ask for a repository root because the same operation writes that value to
Cloudflare Workers Builds. Samebase records the created provider identity and `provisioned`
attachment together before later configuration can fail, so cleanup ownership is never lost. The
Worker remains attached under `Needs attention` until Builds verifies a root. Creating a Convex
project requires a discovered `convexConfigPath`; Samebase verifies the source before provider
creation and records the returned project checkpoint and attachment together.

Configuring Builds for an attached Worker reuses its current unambiguous live root. If no live root
exists, the same Cloudflare dialog asks for a root as input to that provider write. This repair
input does not become attachment state.

### Drift and deletion

Moving or deleting `convex.json` does not silently move or detach a project. Samebase keeps the
stored expected path and reports the GitHub observation. `Change code location` verifies a newly
selected config and compare-and-swaps only `convexConfigPath`.

Changing a Worker's Cloudflare Builds root automatically changes its derived dashboard group after
the next observation. Samebase does not mirror the previous root.

A missing Worker remains attached under `Needs attention` until the user explicitly removes it from
the vault. A Convex 404 under the stored team is ambiguous because the project may have been deleted
or transferred. It never authorizes automatic removal.

When the connected Convex credential verifies the same `projectId` under a different team, Samebase
offers reconciliation. Confirmation compare-and-swaps only `teamId`; it preserves the attachment ID,
config path, origin, and creation time. Provider writes fail closed while the stored team is stale.

Removing either provider attachment is an explicit change to user intent. Provider absence may
explain why removal is useful, but is not the mutation authority.

### Resource-specific routes

Data and Schema routes identify a `vaultConvexProjects` attachment directly. They never select a
project through a root path or choose the first project in a group. This remains unambiguous when
several projects share one config path.

### Managed provisioning

The create-app workflow stores the exact `convexConfigPath` in its immutable provisioning plan and
stores the Cloudflare root only inside the Worker build configuration. These are independent
provider intents, not a reusable domain entity. Checkpoints resolve exact provider identities and
never use the derived root tree as authority.

## Non-Goals

- Inferring packages, applications, ownership, or parent-child relationships from repository
  folders.
- Persisting a Worker-to-Convex edge derived from `SAMEBASE_CONVEX_PROJECT`.
- Treating current provider observations as user intent.
- Reconstructing or preserving rows from the removed app-root model.
- Rejecting unusual repository layouts because they do not contain an expected sibling file.

## Validation

- Schema and mutation tests prove there is no `vaultApps` table or `appId` field, provider
  identities are globally exclusive, batch attachment is atomic, and several projects may share a
  config path.
- GitHub tests cover root and nested configs, malformed or non-regular files, truncated trees,
  changed blobs at confirmation, and explicit path reconciliation.
- Cloudflare tests cover complete pagination, partial fallback, exact GitHub repository matching,
  ambiguous roots, root drift, missing Workers, and marker disagreement.
- Convex tests cover project continuity by `projectId`, verified team reconciliation, concurrent
  changes, and inaccessible projects that fail closed.
- Route and UI tests cover bare provider flags, multi-selection, closed config selectors, read-only
  observed Worker roots, exact root grouping, `Needs attention`, and project-attachment Data and
  Schema routes.

## Rollout

Before the first schema push on a deployment that contains the old model, delete all rows from
`vaultCloudflareWorkers`, `vaultConvexProjects`, and `vaultApps`. Existing Convex placement cannot
be reconstructed authoritatively, so the rollout intentionally requires the user to attach resources
again through verified discovery. No migration field, dual write, fallback read, or compatibility
adapter is permitted.
