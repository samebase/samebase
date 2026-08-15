# Vault Resource Attachment Model

## Document Control

- Status: Accepted
- Owner: Samebase
- Last updated: 2026-08-15
- Related:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/105_CLOUDFLARE_MANUAL_WORKER_CONNECTION_SPEC.md`
  - `specs/106_CONVEX_MANUAL_DEPLOYMENT_CONNECTION_SPEC.md`
  - `specs/110_VAULT_ROUTE_SURFACE_SPEC.md`
  - `specs/120_ORGANIZATION_OWNERSHIP_SPEC.md`

## Current Contract

### Domain entities

A vault belongs to one Samebase organization and connects it to one GitHub repository. A provider
resource attachment records the organization's intent to include one independently identified
provider resource in that vault.

Every vault lifecycle variant stores required `convexTeamId` and `cloudflareAccountId` fields. Vault
creation copies both values from the organization in the same transaction. These values are the
fixed destinations for all provider resources attached to that vault.

Samebase has no durable app, folder, or root-group entity. In particular, there is no `vaultApps`
table and provider attachments do not carry an `appId`.

The durable Cloudflare attachment is:

```ts
{
  vaultId;
  organizationId;
  accountId;
  workerName;
  workerTag;
  rootDirectory;
  origin;
}
```

The durable Convex attachment is:

```ts
{
  vaultId;
  organizationId;
  teamId;
  projectId;
  convexConfigPath;
  // or convexDirectoryPath
  origin;
}
```

Convex `_creationTime` records when each attachment was created. The rows do not duplicate it as a
domain field.

`accountId` plus `workerTag` and `teamId` plus `projectId` are provider identities. `workerTag` is
the stable Cloudflare Worker continuity key. `workerName` and `rootDirectory` are mutable,
user-approved coordinates for that identity. `projectId` is the stable Convex project continuity
key. An attachment's `teamId` must equal its vault's `convexTeamId`, and its `accountId` must equal
its vault's `cloudflareAccountId`.

Attachments do not store a credential document ID. Convex and Cloudflare operations load the
organization's singleton provider credential slot and require it to match the vault destination and
the attachment coordinates.

Convex placement is exactly one of two row variants: `convexConfigPath` names an exact regular
`convex.json` file, or `convexDirectoryPath` names an exact `convex/` tree whose parent contains a
regular `package.json` blob. Multiple Convex projects may intentionally select the same code
location.

### Observations and projection

Provider observations are current evidence, not attachment identity:

- GitHub supplies whether the stored code location still has its required config blob or
  default-layout tree metadata.
- Cloudflare supplies the current Worker name. Cloudflare Workers Builds supplies the current GitHub
  repository and normalized root directory. Samebase compares both values with the approved
  attachment coordinates.
- `SAMEBASE_CONVEX_PROJECT` supplies the Worker's current declared Convex project coordinates.
- Convex supplies the project's current team and accessibility under the connected credential.

The managed provider plan, durable attachments, and provider observations stay separate. Settings
uses this precedence for one resource row:

1. Show the attachment when it exists.
2. Add current provider observations only to that attachment row.
3. If no attachment exists, show the matching plan item while a managed provider run is active.
   Continue to show it after that run fails. Stop showing it when a user or agent starts a later
   manual provider action.
4. Show the empty state only when no attachment and no applicable plan item exist.

An attachment replaces its plan item. A canceled run does not keep a plan-only row visible. A plan
row uses the readable planned project or Worker name. It has no provider link or manual repair
action. An observation must not create a resource row.

Each provider observation query includes its provider-specific `lastWriteAt` value in the query key.
If that value is newer than the displayed observation, Settings shows `Checking` until one new read
returns. During `Checking`, the older observation cannot create attention or repair UI. The first
new result becomes current, including a provider read failure. This is one bounded read, not
continuous polling.

The shared operation contract in spec 003 suppresses conflicting attachment and repair actions. When
an operation ends and its provider write time changes, the `Checking` rule above applies. After the
fresh observation returns, the dashboard uses the normal attachment or repair action for that
observed state. Provider observations do not carry a manual replay state.

The dashboard derives a resource tree at read time:

- a Convex project's root is the parent directory of `convexConfigPath` or `convexDirectoryPath`;
- a Worker's root is its stored `rootDirectory`;
- resources group only when those normalized paths are exactly equal;
- a resource group has no ID, lifecycle, persisted row, or empty state;
- provider root drift adds a Settings warning and never moves the Worker automatically;
- a Worker marker may annotate a relation to a Convex project, but never changes either resource's
  placement or creates a persisted edge.

The common single-app repository is one `/` group. A monorepo is the same model with more derived
groups.

### Vault-level attachment flows

The only provider-add dashboard routes are bare vault-level flags:

- `?add-cloudflare`
- `?add-convex`

There is no `?add-app-root` route and no `app-root` query parameter.

The Cloudflare dialog scans the vault's Cloudflare account for Workers connected to its immutable
GitHub repository identity. It groups selectable Workers by their read-only live root and supports
attaching several Workers in one confirmation. Every verified selectable Worker starts selected, and
the user may deselect any of them. Confirmation re-reads the selected Worker identities, repository
triggers, roots, and markers before one atomic attachment mutation. The verified name and root
become the approved coordinates in that mutation. A request-provided root alone is never attachment
authority for an already configured Worker.

The Convex dialog discovers regular `convex.json` files from exact default-branch Git tree and blob
evidence. It also discovers the default layout when a regular `package.json` blob and sibling
`convex/` tree exist. Neither form reads or validates file contents. It supports selecting several
projects and requires one discovered code location for each selected project. Projects referenced by
discovered Worker markers sort first and show that evidence, but remain unselected until the user
expresses attachment intent. Confirmation re-verifies every selected Git evidence set and project
before one atomic attachment mutation.

Creating a Worker asks for a repository root because the same operation writes that value to
Cloudflare Workers Builds. Samebase records the created provider identity, approved root, and
`provisioned` attachment together before later configuration can fail, so cleanup ownership is never
lost. The Worker stays under that stored root and shows `Needs attention` until Builds verifies the
configuration. Creating a Convex project requires a discovered Convex code location; Samebase
verifies the source before provider creation and records the returned project checkpoint and
attachment together.

Configuring Builds for an attached Worker uses its stored approved root. A later verified provider
root change does not replace that value. The user must first accept the provider coordinate through
`Update root` when the changed provider root is the intended placement.

### Drift and deletion

Moving or deleting `convex.json`, `convex/`, or its sibling `package.json` does not silently move or
detach a project. Samebase keeps the stored expected location and reports the GitHub observation.
`Change code location` verifies a newly selected location and compare-and-swaps only that placement
variant.

Changing a Worker's Cloudflare name or Builds root does not change its Samebase label or dashboard
group. Settings compares the live values with `workerName` and `rootDirectory` and warns for each
changed coordinate. Overview and pull request surfaces continue to use the stored coordinates.

`Update name` calls `updateWorkerName({ vaultId, workerId, expectedWorkerName })`. `Update root`
calls `updateWorkerRootDirectory({ vaultId, workerId, expectedRootDirectory })`. Each action
requires an active organization member, resolves the exact provider resource through `workerTag`,
re-reads the current provider coordinate, and compare-and-swaps only the requested stored field. The
root action also requires one unambiguous normalized root for the vault's exact GitHub repository. A
failed or conflicting re-read leaves the attachment unchanged. Samebase never updates either
coordinate from an observation alone.

A missing Worker remains attached under `Needs attention` until the user explicitly removes it from
the vault. A Convex 404 under the stored team is ambiguous because the project may have been deleted
or transferred. It never authorizes automatic removal.

When the organization Convex credential observes the same `projectId` under a different team,
Samebase reports the move but does not update the attachment `teamId`. Provider writes fail closed
because the resource no longer matches the vault's fixed Convex destination. The product has no
project-team reconciliation action.

Removing either provider attachment is an explicit change to organization attachment intent.
Provider absence may explain why removal is useful, but is not the mutation authority. Cloudflare
deletion continues to use `workerTag` as provider authority. Neither the mutable Worker name nor its
root can authorize deletion.

### Resource-specific routes

Data and Schema routes identify a `vaultConvexProjects` attachment directly. They never select a
project through a root path or choose the first project in a group. This remains unambiguous when
several projects share one code location.

### Managed provisioning

The create-app workflow stores the exact `convexConfigPath` and Cloudflare root in its immutable
provisioning plan. Successful attachment writes copy each approved source coordinate to its matching
resource attachment. These are independent resource coordinates, not a reusable domain entity.
Checkpoints resolve exact provider identities and never use the root tree as identity authority.

The plan is retry input and a temporary dashboard projection source. It is not an attachment,
provider observation, or active operation.

## Non-Goals

- Inferring packages, applications, ownership, or parent-child relationships from repository
  folders.
- Persisting a Worker-to-Convex edge derived from `SAMEBASE_CONVEX_PROJECT`.
- Treating current provider observations as organization attachment intent.
- Automatically accepting a changed Worker name or root.
- Persisting Worker domains, URLs, triggers, build status, token data, or Convex build markers.
- Reconstructing or preserving rows from the removed app-root model.
- Rejecting unusual repository layouts because they do not contain an expected sibling file.

## Validation

- Schema and mutation tests prove there is no `vaultApps` table or `appId` field, provider
  identities are globally exclusive, Worker roots are stored, batch attachment is atomic, and
  several projects may share a code location.
- GitHub tests cover root and nested configs, default-layout metadata, malformed or non-regular
  files, truncated trees, changed evidence at confirmation, and explicit location reconciliation.
- Cloudflare tests cover complete pagination, partial fallback, exact GitHub repository matching,
  ambiguous roots, name and root drift, explicit coordinate updates, missing Workers, and marker
  disagreement.
- Convex tests cover project continuity by `projectId`, destination mismatches, concurrent changes,
  and inaccessible projects that fail closed.
- Route and UI tests cover bare provider flags, multi-selection, closed code-location selectors,
  read-only observed Worker roots, default Worker selection, Worker-referenced Convex ordering,
  exact build access targets, stored root grouping, Settings drift warnings and update actions,
  `Needs attention`, and project-attachment Data and Schema routes.
- Projection tests cover plan-only rows, manual supersession of a managed failure, attachment
  replacement, observation decoration, canceled plans, readable labels, empty states, and the rule
  that observations never create rows.
- Freshness tests cover a client that missed the active write, an observation that finishes during a
  write, independent provider times, `Checking`, and a failed fresh read.

## Rollout

Production data passed the adoption gate before this requirement was deployed. Every existing
`vaultCloudflareWorkers` row had one non-empty normalized root. `rootDirectory` is now required.
Product reads, Settings, and Builds repair use only the saved root. The system has no rootless
placement, adoption, or repair path.
