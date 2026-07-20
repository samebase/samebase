# Convex Table Taxonomy and Ownership Spec

## Document Control

- Status: Accepted and implemented
- Owner: Samebase backend
- Last updated: 2026-07-21

## Current Contract

Table names show why a row exists. Feature model files own complete related table definitions, and
the root `convex/schema.ts` only combines those feature table objects.

Concrete product, protocol, authorization, and synchronization rows use unprefixed plural nouns.
Only these storage categories use a prefix:

- `workflow_`: durable execution, recovery, and inspection state for a named multi-step workflow;
- `observations_`: provider material retained because a current feature must read it without making
  the provider request again;
- `derived_`: local projections rebuilt completely from other local rows;
- `audit_`: append-only events that live behavior never reads to authorize, recover, or render;
- `ui_`: persisted presentation settings, filters, expansions, and layouts.

Temporary or mutable data does not automatically qualify for a generic category. A provider API
response is not persisted merely because the UI wants to cache it.

## Current Vault Boundary

Durable Samebase topology uses normal product tables:

```text
vaults
vaultCloudflareWorkers
vaultConvexProjects
vaultStagedFiles
vaultStagedFileUpdates
```

Vault workflows use:

```text
workflow_vaultProvisioning_plans
workflow_vaultProvisioning_writeLocks
workflow_vaultProvisioning_runs
workflow_vaultProvisioning_events
workflow_vaultDeletion_runs
workflow_vaultDeletion_events
```

The retained vault observations are:

```text
observations_vaultRepository_branchTrees
observations_vaultConvexSchema_snapshots
observations_vaultFiles_blobs
```

The branch-tree table is an exact editor cache keyed by vault and branch. It is not a remote branch
catalog or a pull request source.

Vault UI state uses:

```text
ui_vaultPullRequests_filters
ui_vaultResourceLinks_settings
ui_vaultConvexSchemaGraph_nodeLayouts
ui_vaultFileTree_folderExpansions
```

## Explicitly Absent Tables

The current schema has no table for:

- remote repository branch catalogs;
- GitHub pull requests;
- GitHub commit checks or check summaries;
- repository refresh requests;
- copied provider domain or URL state.

Those facts are read from providers for the feature that needs them. Reintroducing one requires a
current offline, historical, transactional, or subscription requirement that provider requests and
browser caching cannot satisfy.

## Naming Rules

A prefixed name uses `<category>_<subject>_<rowKind>`. Underscores separate those semantic levels;
camelCase joins words inside one level.

Use concrete nouns. Persisted rows are not named `target`, `ownership`, `claim`, `handoff`, `item`,
`record`, `data`, `history`, or bare `state` unless the product or protocol defines that noun
precisely.

Every supporting table definition begins with a plain-language comment that identifies one row and
why current behavior needs it.

## Definition Shape

- `convex/schema.ts` is the only schema entrypoint.
- A feature model exports one object containing its complete `defineTable` calls.
- Feature model files imported by the root schema do not import `_generated/dataModel`.
- Types derive from their validator or table definition instead of parallel handwritten shapes.
- A separate row validator exists only when another table, argument, result, or runtime boundary
  genuinely reuses it.
- App-internal table removal is direct. Compatibility validators, dual writes, and dormant readers
  are not retained for deleted tables.

## Validation

- Generated Convex bindings contain only declared functions and tables.
- Account and vault cleanup registries cover every current owned table and no deleted table.
- Provider list responses stay outside Convex storage unless a separate accepted spec requires
  persistence.
- UI tables contain presentation preferences, never provider truth.
