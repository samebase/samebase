# 065 Netlify Removal Rollout Plan

## Document Control

- Status: In progress
- Owner: Noter backend/frontend + Convex infra/tool runtime
- Last updated: 2026-03-20
- Depends on:
  - `rfcs/062_NETLIFY_REMOVAL_AND_CLOUDFLARE_ONLY_HOSTING_SPEC.md`

## Delivery Status Snapshot (2026-03-20)

1. Phase 0: pending
2. Phase 1: pending
3. Phase 2: pending
4. Phase 3: pending
5. Phase 4: pending

## Purpose

Turn the Netlify-removal RFC into a working implementation tracker with:

1. a fixed execution order
2. explicit validation gates
3. a place to record current phase status while implementation is in flight

## Current Working Notes

1. Working branch: `codex/remove-netlify`
2. The hard deployment gate is Phase 0. Do not remove Netlify schema literals or runtime branches
   until deployment data is clean.
3. The first code slice should be Phase 1 so hosted-app prod-read capability still exists before
   Netlify tool removal.

## Guardrails

1. Do not delete Netlify schema literals or compatibility fields until deployment cleanup is
   complete.
2. Ship Cloudflare status/log prod-read parity before removing Netlify prod-read tools.
3. Keep `vaultInfrastructure.hosting` as the single source of truth for hosted app state.
4. Use checkpoint commits at the end of each meaningful phase.
5. Update this file whenever phase status or validation results change.

## Phase 0: Manual Cleanup and Vault Migration Audit

### Scope

1. Identify all deployments with Netlify-shaped data in:
   - `providerConnections`
   - `operations_providerOauthStates`
   - `operations_aiProdAccessRequests`
   - `vaults.hostingProvider`
   - `vaultInfrastructure`
   - `vaultDomains`
2. Backfill Cloudflare hosting state where a vault was already migrated.
3. Otherwise clear Netlify-only state and leave a reprovision message.

### Validation

1. Verify there are zero rows with:
   - `providerConnections.kind == "netlify"`
   - `oauthStates.provider == "netlify"`
   - `aiProdAccessRequests.provider == "netlify"`
   - `vaultDomains.source in {"netlify_default", "netlify_custom"}`
2. Verify no deployment data still depends on Netlify-only compatibility fields that runtime code
   will remove in Phase 2.
3. Record any vaults that require manual Cloudflare reprovision before schema removal.

### Exit Criteria

1. Deployment data no longer depends on Netlify literals or Netlify-only runtime branches.
2. Phase 2 can remove schema literals without breaking deployed data.

### Tracking Checklist

- [ ] Inventory completed for all target deployments
- [ ] Netlify provider connections removed
- [ ] Netlify OAuth states removed
- [ ] Netlify prod-read request rows removed
- [ ] Netlify domain-source rows removed or replaced
- [ ] Netlify-shaped hosting rows backfilled or cleared

## Phase 1: Cloudflare Prod-Read Parity

### Scope

1. Add Cloudflare vault-scoped status read.
2. Add Cloudflare vault-scoped deployment-log read.
3. Replace Netlify prod-read tool names in:
   - agent tool catalog/runtime
   - MCP tool runtime
   - chat approval execution
   - shared chat metadata

### Validation

1. Tool catalog tests expose Cloudflare status/log proposal tools and no longer require Netlify
   status/log proposal tools.
2. Manual chat smoke check still shows hosted-app approval cards for status/log reads.
3. Netlify prod-read removal does not leave a gap in hosted-app diagnostics.

### Validation Commands

```bash
pnpm exec vitest run apps/noter/convex/toolRuntime/catalog.test.ts
pnpm dev:worktree
```

Manual smoke after `pnpm dev:worktree`:

1. open the app
2. create or open a vault chat
3. confirm hosted-app status/log approval proposals still exist with Cloudflare naming

### Exit Criteria

1. Hosted-app prod-read capability exists entirely on Cloudflare paths.
2. Netlify prod-read tools can be removed without a user-visible regression.

### Tracking Checklist

- [ ] Cloudflare status read exists
- [ ] Cloudflare logs read exists
- [ ] Tool catalogs renamed to Cloudflare-only hosted-app reads
- [ ] Chat execution path uses Cloudflare hosted-app reads
- [ ] Tool runtime tests updated and green

## Phase 2: Backend Netlify Removal and Cloudflare-Only Simplification

### Scope

1. Remove Netlify schema/provider literals and compatibility fields.
2. Delete Netlify OAuth, API-key, and dev-seed backend paths.
3. Collapse provisioning, teardown, and infra-read branches to Cloudflare-only hosting.
4. Remove `vaults.hostingProvider` runtime branching if the field no longer has a current consumer.

### Validation

1. Convex codegen, typecheck, and eslint pass after schema/runtime removal.
2. Backend grep gate shows no active Netlify runtime code remains under `apps/noter/convex`.
3. Managed create/retry/delete flows still typecheck against Cloudflare-only hosting state.

### Validation Commands

```bash
pnpm dev:worktree:once
cd apps/noter && npm run lint:ci
grep -Rni 'netlify' apps/noter/convex --exclude-dir=node_modules
```

### Exit Criteria

1. No backend runtime path depends on Netlify.
2. Backend passes codegen, typecheck, and lint after the removal.

### Tracking Checklist

- [ ] Netlify provider kind removed from schema/runtime unions
- [ ] `apps/noter/convex/netlifyOAuth.ts` deleted
- [ ] Netlify users/auth/devAuth connection flows removed
- [ ] Provisioning and delete flows collapsed to Cloudflare-only hosting
- [ ] Backend lint/typecheck gate passes

## Phase 3: Frontend and Starter-Template Cleanup

### Scope

1. Remove Netlify dashboard connect surfaces and callback route/component.
2. Remove the hosting-provider selector from noter-managed create flow.
3. Update delete-flow labels and provider copy to Cloudflare-only reality.
4. Remove `apps/noter-starter-template/netlify.toml`.
5. Regenerate `apps/noter/convex/starterSeedManifest.generated.ts`.
6. Update starter-template tests and related fixture expectations.

### Validation

1. UI exposes only GitHub, Convex, and Cloudflare provider surfaces.
2. Create flow no longer asks the user to choose between Netlify and Cloudflare.
3. Starter manifest no longer contains `netlify.toml`.
4. Starter manifest tests reflect the new contract.

### Validation Commands

```bash
cd apps/noter-starter-template && pnpm run template:export
pnpm exec vitest run apps/noter/convex/starterSeedManifest.test.ts
pnpm dev:worktree
```

Manual smoke after `pnpm dev:worktree`:

1. open the dashboard
2. confirm there is no Netlify provider card
3. confirm there is no Netlify OAuth callback route in the app flow
4. confirm the create flow does not expose a hosting-provider selector

### Exit Criteria

1. Frontend surfaces are Cloudflare-only for managed hosting.
2. Starter template no longer ships Netlify deployment assets.

### Tracking Checklist

- [ ] Netlify callback component removed
- [ ] Netlify route removed from app/router/http wiring
- [ ] Dashboard provider surfaces reduced to GitHub, Convex, Cloudflare
- [ ] Hosting-provider selector removed from create flow
- [ ] Starter manifest regenerated
- [ ] Starter manifest test updated and green

## Phase 4: Active Doc, Spec, and Fixture Cleanup

### Scope

1. Rewrite active docs/specs that still describe Netlify as current behavior.
2. Delete or archive obsolete Netlify-specific docs where appropriate.
3. Keep `simpleView` fixture coverage in sync with added/removed Markdown files.

### Validation

1. Active docs no longer describe Netlify as supported runtime behavior.
2. Fixture coverage remains in sync with any doc-file additions or deletions.
3. Repo grep gate shows Netlify references only where intentionally retained for historical context.

### Validation Commands

```bash
pnpm exec vitest run apps/noter/src/lib/simpleView.test.ts
grep -Rni 'netlify' README.md apps/noter apps/noter-starter-template specs rfcs --exclude-dir=node_modules
```

### Exit Criteria

1. Current runtime docs reflect Cloudflare-only hosting reality.
2. Historical references are limited to intentional RFC/archive context.

### Tracking Checklist

- [ ] Runtime README updated
- [ ] Active specs rewritten to Cloudflare-only wording
- [ ] Obsolete Netlify-specific docs removed or reclassified
- [ ] `simpleView` fixture synced

## Cross-Phase Verification Matrix

1. Repo-wide backend/frontend gate:

```bash
pnpm dev:worktree:once
cd apps/noter && npm run lint:ci
```

2. Tool-runtime regression gate:

```bash
pnpm exec vitest run apps/noter/convex/toolRuntime/catalog.test.ts
```

3. Starter-template regression gate:

```bash
cd apps/noter-starter-template && pnpm run template:export
pnpm exec vitest run apps/noter/convex/starterSeedManifest.test.ts
```

4. Doc/fixture regression gate:

```bash
pnpm exec vitest run apps/noter/src/lib/simpleView.test.ts
```

5. Repo grep gate:

```bash
grep -Rni 'netlify' apps/noter/convex apps/noter/src apps/noter-starter-template README.md specs rfcs --exclude-dir=node_modules
```

## Definition of Done

1. Netlify is absent from active backend runtime, frontend runtime, and starter template assets.
2. Cloudflare fully owns managed hosted-app create/provision/delete/status/log behavior.
3. Active docs describe Cloudflare-only reality.
4. This plan file reflects completed phase status and remaining follow-ups.
