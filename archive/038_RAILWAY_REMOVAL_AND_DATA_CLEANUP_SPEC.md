# 038 Railway Removal and Data Cleanup Spec

> Archived 2026-07-26: Railway retirement is complete. This document records historical migration
> work and must not guide current implementation.

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-05
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `archive/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
  - `archive/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `archive/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `archive/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`

## Summary

Remove Railway from the Noter product surface and codebase while keeping Netlify and Cloudflare
support.

This spec also defines a cleanup checklist and rollout order for removing Railway-shaped data before
schema/runtime changes are deployed.

## Why this spec exists

As of 2026-03-05, Railway references span many runtime surfaces (schema unions, provider auth,
hosting provisioning/read/delete logic, agent tools, and UI).

Current footprint snapshot:

- 575 `railway` references
- 36 files touched
- Highest concentration in infra/provider modules and dashboard provider UX

The removal must therefore be done in a controlled order:

1. Data cleanup first (to avoid schema deploy failures)
2. Type/schema/runtime removal second
3. Docs/spec cleanup last

## Product Decisions (Locked)

1. Railway support is removed completely.
2. Netlify remains supported in this phase.
3. Cloudflare remains supported in this phase.
4. We do not keep a dormant Railway feature flag path.
5. Data cleanup is executed manually in target deployments before Railway schema literals are
   removed.

## Goals

1. Remove Railway from backend, frontend, and agent tooling.
2. Keep Netlify + Cloudflare behavior stable.
3. Define a clear manual cleanup checklist and rollout sequence for Convex data.
4. Clean or normalize all Railway-shaped rows before schema literals are removed.
5. Leave a concise historical note of the Railway pilot decision.

## Non-Goals

1. Netlify removal (explicitly out of scope for now).
2. Cloudflare-only simplification in this phase.
3. Reworking unrelated provider auth architecture.
4. Backfilling old chat message prose/history for cosmetic reasons.

## Scope Inventory (What Must Change)

### 1) Schema and core types

- Remove Railway literals from:
  - `ProviderKind`
  - `ProdAccessProvider`
  - `VaultDomainSource`
  - `OAuthProvider`/`oauthStates.provider`
  - hosting provider unions (`hostingProviderValidator`, `hostingStateValidator`)
- Remove Railway provider connection shape from schema/provider validators.

### 2) Backend runtime

- Remove Railway implementation branches from:
  - infra providers
  - hosting providers (provision/read/logs/inventory/delete)
  - provisioning orchestration
  - vault deletion teardown logic
  - infra read actions and read-context queries
  - agent prod-read tool definitions and catalog entries
  - chat prod-read execution routing
- Remove Railway OAuth and Railway API-key profile helper modules.

### 3) Frontend runtime

- Remove Railway provider connection/status UI from dashboard.
- Remove Railway from hosting provider selector in create flow.
- Remove Railway OAuth callback route/component.
- Remove Railway API-key connect option from shared connect dialog.
- Remove Railway copy from pricing/provider copy where present.

### 4) Docs/specs/manual test references

- Delete the Railway pilot spec (`027`) and keep the decision record in this spec.
- Update Cloudflare specs (`031`, `032`) to remove Railway assumptions.
- Remove Railway mentions from manual test docs and env allowlists.
- Keep fixture manifests in sync when new/removed spec files change the visible simple-view list.

## Data Cleanup Strategy (Manual)

### Principle

Run targeted manual cleanup in Convex dashboard/CLI first, then deploy Railway schema/runtime
removal.

### Data transformations required before schema literal removal

1. `providerConnections`
   - Delete rows where `kind == "railway"`.
2. `providerOAuthCallbackStates`
   - Delete rows where `provider == "railway"`.
3. `vaults`
   - Normalize `hostingProvider == "railway"` to `"netlify"`.
4. `vaultInfrastructure`
   - For rows where `hosting.provider == "railway"`:
     - clear `hosting`
     - set `status` to `"partial"` (or `"failed"` if policy decides)
     - set a clear `lastError` message directing user to reprovision with a supported provider
5. `vaultDomains`
   - Delete rows where `source == "railway_default"`.
6. `aiProductionReadRequests`
   - Delete rows where `provider == "railway"`.

Notes:

- `audit_aiProductionRead_events` does not carry a provider enum field and can remain.
- `chatMessagePayloads.payloadJson` is opaque text; old entries can remain.

### Cleanup verification expectations

- Verify each listed table has zero Railway-shaped rows before deploying Railway literal removals.
- Treat zero remaining rows as the merge/deploy gate for schema changes.

## Execution Plan

### Phase 0: Manual cleanup in target deployments

- Remove/normalize Railway-shaped rows in each table listed above.
- Capture before/after counts as rollout evidence.

Exit criteria:

- No Railway rows remain in schema-constrained fields.

### Phase 1: Remove Railway backend code

- Remove Railway modules and all Railway branches in shared backend flows.
- Update provider/read/resource unions and validators.

Exit criteria:

- `apps/noter` typecheck/lint pass.
- No `railway` references in runtime backend paths.

### Phase 2: Remove Railway frontend code

- Remove Railway UI connect/status/callback/create-flow options.
- Keep Netlify + Cloudflare UX intact.

Exit criteria:

- Dashboard/provider flows work without Railway paths.

### Phase 3: Spec and doc cleanup

- Delete `027`.
- Update `031` and `032` related-spec links and wording.
- Remove Railway references in manual-test/env docs.

Exit criteria:

- No active spec describes Railway as current or planned runtime behavior.

## Spec Hygiene Decision (for old specs)

Chosen approach:

1. Delete `027`.
2. Keep this spec as the Railway historical note and removal decision record.

## Validation Checklist

- [ ] Manual cleanup completed for all listed Railway-shaped rows.
- [ ] Manual verification confirms zero Railway rows in constrained fields.
- [ ] `pnpm dev:worktree:once` + lint/typecheck pass in worktree.
- [ ] Vault create/delete/provision flows still work for Netlify/Cloudflare.
- [ ] Chat prod-read tools still work for non-Railway providers.
- [ ] No remaining `railway` references in runtime code/docs intended to remain active.

## Rollback and Safety

1. If cleanup introduces issues, stop before schema literal deletion.
2. Keep manual cleanup operations scoped and reversible where practical.
3. Use git revert for code/spec rollback; do not reintroduce manual table wipes as a standard
   process.

## Acceptance Criteria

1. Railway is absent from supported provider/runtime surfaces.
2. Railway data is cleaned/normalized before schema literal removal deploys.
3. Netlify and Cloudflare remain operational.
4. Active spec set no longer treats Railway as current strategy.
