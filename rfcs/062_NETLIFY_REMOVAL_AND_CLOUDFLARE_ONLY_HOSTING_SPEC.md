# 062 Netlify Removal and Cloudflare-Only Hosting Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-19
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/006_DNS_DOMAIN_STRATEGY_SPEC.md`
  - `rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
  - `rfcs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `rfcs/038_RAILWAY_REMOVAL_AND_DATA_CLEANUP_SPEC.md`
  - `specs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`

## Summary

Remove Netlify from the Noter product surface and codebase. Cloudflare becomes the only supported
frontend hosting path for noter-managed vault apps.

This is not a narrow string-removal pass. Netlify support currently shapes schema unions, provider
connections, create/delete flows, infrastructure provisioning, AI production-read tools,
starter-template assets, and active docs/specs. The removal should therefore also collapse the
multi-provider abstractions that only exist to keep Netlify and Cloudflare side-by-side.

## Why this spec exists

As of 2026-03-19, Netlify remains deeply wired into current runtime behavior:

- 578 Netlify references across active runtime/docs/tooling surfaces searched in `apps/noter/src`,
  `apps/noter/convex`, `apps/noter-starter-template`, `README.md`, `AGENTS.md`, `scripts`, and
  `manual-tests`.
- 35 runtime files under `apps/noter/src` + `apps/noter/convex` still mention Netlify.
- 17 spec files still describe Netlify as current or planned behavior.

Important current-state mismatches:

1. Dashboard create UI already defaults to Cloudflare, but `vaultActions.createRepository` still
   defaults to `"netlify"` when `hostingProvider` is omitted.
2. Cloudflare inventory reads exist, but Cloudflare does not yet have the vault-scoped status/log
   prod-read tools that currently exist for Netlify.
3. The starter template still ships `netlify.toml`, template docs describe a Netlify production
   build, and generated manifest/tests assert that contract.

## Product Decisions (Locked)

1. Netlify support is removed completely.
2. Cloudflare is the only supported frontend hosting provider for noter-managed vault apps.
3. Noter-managed create flow no longer exposes a hosting-provider selector.
4. Netlify OAuth, API-key, dev-seed, and teardown paths are removed rather than hidden behind flags.
5. Cloudflare remains the supported hosting path; this spec does not redesign Cloudflare auth beyond
   what Netlify removal requires.
6. Multi-provider abstractions that only exist to support Netlify side-by-side should be removed or
   collapsed.
7. Existing Netlify-shaped data must be cleaned or normalized before schema literals and runtime
   branches are removed.

## Goals

1. Remove Netlify from backend, frontend, starter-template, and active docs.
2. Simplify hosting-related schema and runtime flows to a single Cloudflare path.
3. Replace Netlify prod-read tooling with Cloudflare-equivalent status/log reads so hosted-app
   debugging capability is not lost.
4. Define a safe cleanup and rollout order for existing Convex data.
5. Leave a clear decision record that Netlify is no longer part of Noter’s supported architecture.

## Non-Goals

1. Redesigning GitHub or Convex connection flows.
2. Removing existing Cloudflare auth modes that are unrelated to Netlify removal.
3. Backfilling or rewriting historical chat metadata payloads just to remove old Netlify labels.
4. Expanding Cloudflare custom-domain automation beyond what is needed for Netlify removal.
5. Preserving dormant multi-hosting abstractions for hypothetical future providers.

## Current Runtime Footprint

### 1) Schema and core types

Netlify currently appears in:

- `apps/noter/convex/schema.ts`
- `apps/noter/convex/hostingState.ts`
- `apps/noter/convex/hostingStateHelpers.ts`
- `apps/noter/convex/providerConnections.ts`
- `apps/noter/shared/chatMetadata.ts`

Current Netlify-shaped schema surfaces include:

- `ProviderKind`
- `ProdAccessProvider`
- `VaultDomainSource`
- `oauthStates.provider`
- hosting provider unions (`hostingProviderValidator`, `hostingStateValidator`)
- `providerConnections(kind="netlify")`
- deprecated `vaultInfrastructure.netlify*` compatibility fields
- `vaults.hostingProvider`
- `vault.getUserVaults().hasNetlifyProvision`

### 2) Backend runtime

Netlify-specific runtime branches exist in:

- `apps/noter/convex/netlifyOAuth.ts`
- `apps/noter/convex/http.ts`
- `apps/noter/convex/auth.ts`
- `apps/noter/convex/devAuth.ts`
- `apps/noter/convex/users.ts`
- `apps/noter/convex/infraProviders.ts`
- `apps/noter/convex/hostingProviders.ts`
- `apps/noter/convex/infraProvisioning.ts`
- `apps/noter/convex/infraRead.ts`
- `apps/noter/convex/infraReadQueries.ts`
- `apps/noter/convex/vault.ts`
- `apps/noter/convex/vaultActions.ts`
- `apps/noter/convex/agent/graph.ts`
- `apps/noter/convex/agent/systemPrompt.ts`
- `apps/noter/convex/agent/toolCatalog.ts`
- `apps/noter/convex/agent/tools.ts`
- `apps/noter/convex/chat/actions.ts`
- `apps/noter/convex/toolRuntime/catalog.ts`
- `apps/noter/convex/toolRuntime/executors.ts`
- `apps/noter/convex/toolRuntime/catalog.test.ts`

### 3) Frontend runtime

Netlify-specific UI remains in:

- `apps/noter/src/App.tsx`
- `apps/noter/src/components/vault-dashboard/VaultDashboard.tsx`
- `apps/noter/src/components/ApiKeyConnectDialog.tsx`
- `apps/noter/src/components/NetlifyOAuthCallback.tsx`
- `apps/noter/src/components/PricingPage.tsx`
- `apps/noter/src/components/ChatFab.tsx`

### 4) Starter template and generated artifacts

Netlify is still baked into:

- `apps/noter-starter-template/netlify.toml`
- `apps/noter-starter-template/README.md`
- `apps/noter-starter-template/AGENTS.md`
- `apps/noter-starter-template/.gitignore`
- `apps/noter/convex/starterSeedManifest.generated.ts`
- `apps/noter/convex/starterSeedManifest.test.ts`

### 5) Active docs, scripts, and manual tests

Netlify remains in:

- `README.md`
- `AGENTS.md`
- `apps/noter/convex/README.md`
- `scripts/worktree-env-allowlist.ts`
- `manual-tests/worktree/WT-001-anon-worktree-isolation.md`
- active specs including `003`, `004`, `006`, `016`, `017`, `026`, and `032`

## Required Architecture Changes

### 1) Cloudflare becomes the only create/provision/delete path

`createRepository` should stop accepting or defaulting a hosting-provider choice. The create flow
should always provision Cloudflare hosting for noter-managed vaults.

Implications:

- Remove the hosting-provider dropdown from `VaultDashboard`.
- Remove `vaults.hostingProvider` if it has no remaining runtime consumer.
- Remove Netlify branches from provisioning and teardown logic.
- Keep Cloudflare teardown for managed delete flow.

### 2) Keep `hosting` as the single source of truth, but Cloudflare-only

`vaultInfrastructure.hosting` should remain the canonical hosted-app record, but it should no longer
be a Netlify-or-Cloudflare union.

Chosen direction:

- Keep the current Cloudflare hosting shape:
  - `provider: "cloudflare"`
  - `accountId`
  - `projectName`
  - `subdomain?`
  - `productionUrl?`
- Remove the Netlify branch from `hostingStateValidator`.
- Remove deprecated `netlifySiteId`, `netlifySiteName`, `netlifyTeamId`, `netlifyDefaultUrl`,
  `netlifyProductionUrl`, and `netlifyBuildHookId`.

This preserves the existing Cloudflare document shape while removing the Netlify-only compatibility
burden.

### 3) Replace Netlify prod-read tools with Cloudflare prod-read parity

Netlify cannot simply be removed from prod-read tooling because it currently provides the only
hosted-app status/log flow.

Add Cloudflare vault-scoped reads that replace the Netlify tools:

1. Cloudflare project/deployment status
   - use the existing Pages project identity stored in `hosting`
   - read project details and/or deployments from:
     - `GET /accounts/{account_id}/pages/projects/{project_name}`
     - `GET /accounts/{account_id}/pages/projects/{project_name}/deployments`
2. Cloudflare deployment logs
   - read logs for the selected deployment from:
     - `GET /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id}/history/logs`

Tool surface changes:

- Remove:
  - `request_netlify_status_read`
  - `request_netlify_logs_read`
  - `request_netlify_projects_read`
- Add:
  - `request_cloudflare_status_read`
  - `request_cloudflare_logs_read`
- Keep:
  - `request_cloudflare_accounts_read`
  - `request_cloudflare_pages_projects_read`
  - Convex prod-read tools

Runtime modules that must move together:

- `apps/noter/convex/agent/toolCatalog.ts`
- `apps/noter/convex/agent/tools.ts`
- `apps/noter/convex/agent/systemPrompt.ts`
- `apps/noter/convex/agent/graph.ts`
- `apps/noter/convex/toolRuntime/catalog.ts`
- `apps/noter/convex/toolRuntime/executors.ts`
- `apps/noter/convex/chat/actions.ts`
- `apps/noter/convex/infraRead.ts`
- `apps/noter/shared/chatMetadata.ts`

### 4) Remove Netlify connection and OAuth surfaces

Delete the dedicated Netlify provider connection path:

- remove `kind: "netlify"` from schema/provider unions
- delete `apps/noter/convex/netlifyOAuth.ts`
- remove `/oauth/netlify/start` and `/oauth/netlify/callback` from `apps/noter/convex/http.ts`
- remove Netlify connect/disconnect/status/API-key actions from `apps/noter/convex/users.ts`
- remove Netlify seeding from `apps/noter/convex/auth.ts` and `apps/noter/convex/devAuth.ts`
- remove Netlify dev-seed env passthrough from `scripts/worktree-env-allowlist.ts`

### 5) Remove Netlify from starter-template contract

The starter template should stop shipping Netlify deployment config.

Required changes:

- delete `apps/noter-starter-template/netlify.toml`
- remove template README/AGENTS copy that describes Netlify as production build wrapper
- remove `.netlify` ignore entries where they only exist for that template/app
- regenerate `apps/noter/convex/starterSeedManifest.generated.ts`
- update `apps/noter/convex/starterSeedManifest.test.ts`

Cloudflare replacement note:

- No direct replacement config file is required for current provisioning because Cloudflare build
  settings already come from `infraProvisioning.resolveCloudflareBuildConfig(...)`.

## Data Cleanup Strategy

### Principle

Run targeted cleanup in target deployments before removing Netlify schema literals and runtime
branches.

### Manual cleanup required before schema removal

1. `providerConnections`
   - delete rows where `kind == "netlify"`
2. `oauthStates`
   - delete rows where `provider == "netlify"`
3. `aiProdAccessRequests`
   - delete rows where `provider == "netlify"`
4. `vaults`
   - if `hostingProvider` is being removed in this phase, unset it on all rows
   - if rollout is split, normalize any remaining `"netlify"` values before the field becomes
     Cloudflare-only or disappears
5. `vaultInfrastructure`
   - for rows with Netlify-shaped hosting:
     - preferred: backfill the Cloudflare hosting state if the vault has already been migrated
     - otherwise:
       - clear Netlify-only hosting data
       - set `status` to `"partial"`
       - set `lastError` to a clear reprovision message such as:
         `"Netlify hosting has been removed. Reprovision this vault with Cloudflare."`
   - clear deprecated `netlify*` compatibility fields before those schema fields are removed
6. `vaultDomains`
   - delete or replace rows where `source` is `netlify_default` or `netlify_custom`
   - if a Cloudflare production URL already exists for the same vault/branch, replace the row with a
     Cloudflare source instead of dropping it

Notes:

- `aiProdAccessAudit` does not store a provider enum and can remain.
- `chatMessageMetadata.payloadJson` is opaque historical text; old Netlify labels can remain.

### Cleanup verification gate

Before deploying schema literal removal:

- zero `providerConnections.kind == "netlify"`
- zero `oauthStates.provider == "netlify"`
- zero `aiProdAccessRequests.provider == "netlify"`
- zero `vaultDomains.source in {"netlify_default", "netlify_custom"}`
- zero remaining Netlify compatibility fields relied on by runtime code

## Execution Plan

### Phase 0: Manual cleanup and vault migration audit

Work:

- Identify all vaults that still rely on Netlify-shaped infra.
- Backfill or clear those rows using the cleanup policy above.
- Remove Netlify provider-connection and OAuth-state rows.

Exit criteria:

- No deployment data remains that depends on Netlify literals or Netlify-only runtime branches.

### Phase 1: Cloudflare prod-read parity

Work:

- Add Cloudflare vault-scoped status read.
- Add Cloudflare vault-scoped deployment log read.
- Replace Netlify prod-read tool names everywhere they are surfaced.

Exit criteria:

- Hosted-app prod-read capability still exists after Netlify tool removal.

### Phase 2: Backend Netlify removal and Cloudflare-only simplification

Work:

- Remove Netlify schema literals and provider connection shape.
- Delete Netlify OAuth/API-key/seeding/runtime modules.
- Collapse provisioning/teardown/read branches to Cloudflare-only hosting.
- Remove `hostingProvider` runtime branching if the field is deleted.

Exit criteria:

- No Netlify runtime code remains in backend paths.
- Typecheck/lint pass after schema/runtime removal.

### Phase 3: Frontend and starter-template cleanup

Work:

- Remove Netlify dashboard provider card and callback route/component.
- Remove hosting-provider selector from create flow.
- Update delete-flow labels and pricing/provider copy.
- Remove `netlify.toml` and regenerate starter manifest/tests.

Exit criteria:

- UI exposes only GitHub, Convex, and Cloudflare provider surfaces.
- Starter template no longer contains Netlify deployment assets.

### Phase 4: Active spec/doc/manual-test cleanup

Work:

- Update runtime docs to Cloudflare-only wording.
- Remove or rewrite active specs that still describe Netlify as current.
- Keep simple-view fixtures in sync with any spec-file additions/deletions.

Exit criteria:

- Active docs no longer describe Netlify as supported runtime behavior.

## Spec Hygiene Decisions

Chosen approach:

1. Delete `rfcs/017_NETLIFY_OAUTH_AND_TEAM_SELECTION_SPEC.md`.
2. Rewrite these active specs to Cloudflare-only reality:
   - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
   - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
   - `specs/006_DNS_DOMAIN_STRATEGY_SPEC.md`
   - `rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
   - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
   - `rfcs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
3. Keep this RFC as the removal decision record until the runtime removal lands, then promote or
   archive it based on the final state.

Low-signal historical notes such as `TODO.md`, `VISION.md`, and `RECOVERED_IDEAS.md` are not
merge-blocking sources of truth for this removal, but can be cleaned opportunistically after active
runtime/docs are correct.

## Validation Checklist

- [ ] Manual cleanup completed for all Netlify-shaped data.
- [ ] Cloudflare status/log prod-read replacements exist before Netlify tools are removed.
- [ ] Noter-managed create flow no longer exposes a hosting-provider selector.
- [ ] New noter-managed vault creation requires GitHub + Convex + Cloudflare only.
- [ ] Managed retry/delete flows work without Netlify branches.
- [ ] Netlify OAuth callback route/component/module are removed.
- [ ] Starter template no longer contains `netlify.toml`.
- [ ] `apps/noter/convex/toolRuntime/catalog.test.ts` and
      `apps/noter/convex/starterSeedManifest.test.ts` reflect the new contract.
- [ ] Active docs/specs no longer describe Netlify as supported runtime behavior.

## Rollback and Safety

1. If cleanup reveals active Netlify-hosted vaults that have not been migrated, stop before schema
   literal deletion.
2. Ship Cloudflare prod-read parity before removing Netlify prod-read tools so hosted-app debugging
   does not regress.
3. Use normal git revert for code/spec rollback; do not keep dormant Netlify branches in runtime
   code.

## Acceptance Criteria

1. Netlify is absent from supported backend, frontend, starter-template, and active documentation
   surfaces.
2. Cloudflare is the only supported hosting path for noter-managed vault apps.
3. Existing Netlify-shaped data is cleaned or normalized before schema literal removal deploys.
4. Hosted-app prod-read status/log capability continues to exist through Cloudflare-based tools.

## References

- Cloudflare Pages REST API overview: https://developers.cloudflare.com/pages/configuration/api/
- Cloudflare Pages project and deployment API:
  https://developers.cloudflare.com/api/resources/pages/subresources/projects/
- Cloudflare Pages deployment logs API:
  https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/deployments/subresources/history/subresources/logs/methods/get/
