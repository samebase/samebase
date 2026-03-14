# 055 Noter Platform Domain Cutover And MCP Mutation Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-14
- Related specs:
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`
  - `specs/032_CLOUDFLARE_HOSTING_PILOT_SPEC.md`
  - `specs/044_CLOUDFLARE_MCP_AUTO_TOKEN_REFRESH_SPEC.md`
  - `specs/047_UNIFIED_TOOL_RUNTIME_AND_SURFACE_ADAPTERS_SPEC.md`

## Summary

Add a narrow, audited platform-operations surface to the `noter.md` MCP server
so Codex can execute the main Noter production cutover without manual Cloudflare
clicking.

Recommended end state:

1. Frontend serves from Cloudflare Pages on `https://noter.md`.
2. Convex client traffic uses `https://api.noter.md` as `CONVEX_CLOUD_URL`.
3. Convex HTTP actions and auth use `https://actions.noter.md` as
   `CONVEX_SITE_URL`.
4. Cloudflare mutations run through the existing Cloudflare MCP connection
   stored in `providerConnections(kind="cloudflare")`.
5. Convex mutations run through the existing Convex provider connection stored
   in `providerConnections(kind="convex")`.
6. Netlify teardown is deferred until after Cloudflare and Convex are stable.

This spec intentionally does not expose raw `create_dns_record`,
`patch_pages_project`, or `create_custom_domain` primitives to MCP clients.
Instead, it adds a small set of high-level, idempotent platform cutover tools.

## Why This Spec Exists

The operator wants Codex to perform the migration through Noter itself, using
the existing provider connections already managed by Noter.

The repo is already close to supporting that direction:

1. Cloudflare provider connections already exist and support MCP OAuth plus
   token refresh.
2. Cloudflare Pages provisioning already exists for vaults in
   `apps/noter/convex/hostingProviders.ts`.
3. Convex provider connections already exist and are used for project and
   deployment provisioning.
4. The shared tool runtime already exists in `apps/noter/convex/toolRuntime/*`.
5. The missing piece is not basic connectivity. The missing piece is an audited,
   high-level mutation surface for production platform changes.

## Goals

1. Let Codex inspect, plan, and execute the main Noter domain cutover through
   Noter MCP tools.
2. Reuse existing stored Cloudflare and Convex provider connections instead of
   introducing separate secrets or one-off scripts.
3. Keep the public MCP surface narrow, deterministic, and easy to audit.
4. Keep the cutover idempotent so retries are safe.
5. Anchor high-risk mutations to the operator's Google-account identity and
   durable audit logs.

## Non-goals

1. General-purpose Cloudflare DNS administration through Noter MCP.
2. General-purpose Convex admin primitives through Noter MCP.
3. Full Netlify retirement automation in phase 1.
4. Reworking vault-scoped infrastructure provisioning to own the main Noter app.
5. Depending on undocumented Convex DNS target behavior without first validating
   it in a sandbox.

## Current State Research

### Existing repo constraints

1. `providerConnections` already stores:
   - `kind="cloudflare"` with `auth.method="mcp_oauth"` or `api_key`
   - `kind="convex"` with standard provider auth
   - persisted `accountId` for Cloudflare
2. Cloudflare Pages projects are already created and patched through Cloudflare
   MCP `execute` calls in `apps/noter/convex/hostingProviders.ts`.
3. `apps/noter/convex/auth.config.ts` uses `process.env.CONVEX_SITE_URL` as the
   Convex Auth issuer domain. This is a strong signal that `CONVEX_SITE_URL`
   should get its own stable hostname, not be conflated with `api.noter.md`.
4. The current tool runtime supports `read_only`, `write`, `destructive`, and
   `proposal_only`, but the only provider-side production flow implemented today
   is proposal-first read access in `aiProdAccessRequests` and
   `aiProdAccessAudit`.
5. There is no current audited write path for provider mutations.

### Official product/API facts confirmed during research

1. Convex custom domains are configured per deployment and support two
   destinations: `convexCloud` and `convexSite`.
2. Convex docs explicitly call out overriding `CONVEX_CLOUD_URL` when using a
   custom backend domain.
3. Convex docs also state that `CONVEX_SITE_URL` may be overridden for a custom
   HTTP action domain, and mention use in `auth.config.ts`.
4. Convex public APIs currently expose:
   - `POST /deployments/{deployment_name}/create_custom_domain`
   - `GET /deployments/{deployment_name}/custom_domains`
5. The public Convex custom-domain response includes `domain`,
   `requestDestination`, and `verificationTime`, but does not expose the DNS
   target to create in the zone.
6. Convex docs still describe the dashboard as the place that shows the DNS
   records to create.
7. Cloudflare Pages domain APIs expose `status`, `validation_data`,
   `verification_data`, and `zone_tag`, which is enough to add and poll a Pages
   custom domain safely.
8. Cloudflare DNS APIs support list/create/update of records in a zone, which is
   enough for `api.noter.md` and `actions.noter.md` upserts.

## Architecture Decisions

### 1. Separate hostnames by responsibility

Use one hostname per external role:

1. `noter.md` for the frontend application on Cloudflare Pages.
2. `api.noter.md` for Convex client traffic (`CONVEX_CLOUD_URL`).
3. `actions.noter.md` for Convex HTTP actions and auth (`CONVEX_SITE_URL`).

Reasoning:

1. `CONVEX_CLOUD_URL` and `CONVEX_SITE_URL` are distinct surfaces in Convex.
2. This repo already treats `CONVEX_SITE_URL` as the auth issuer domain.
3. Splitting them avoids guessing that one hostname can safely back both
   `convexCloud` and `convexSite`.

### 2. Keep Cloudflare-first, but do not force vault infra abstractions onto the main app

The main Noter production app is not a vault. Its cutover should not be jammed
into `vaultInfrastructure` or `infraProvisioning.ts`.

Use a dedicated platform module instead:

1. `apps/noter/convex/platformOps.ts`
2. `apps/noter/convex/platformConfig.ts`
3. `apps/noter/convex/platformAudit.ts`

Existing Cloudflare Pages helper logic may be extracted from
`hostingProviders.ts`, but only when the platform module actually consumes it in
the same patch.

### 3. Public MCP tools stay high-level

Do not expose generic provider primitives.

Expose exactly these public MCP tools:

1. `platform.get_noter_cutover_status`
2. `platform.plan_noter_cutover`
3. `platform.apply_noter_cutover`

These tools should only operate on the single configured Noter production
target, not on arbitrary accounts, zones, or deployments.

### 4. Do not reuse `aiProdAccessRequests` for writes

Production read approvals already have a specific schema and lifecycle.
Provider-side mutations need a separate audit model because they require:

1. before and after state capture
2. provider operation logging
3. idempotent rerun tracking
4. explicit actor identity snapshot

### 5. Email is not the primary approval path

For Noter-managed resources inside the same trusted account boundary:

1. The primary approval anchor is the authenticated operator's Google email.
2. GitHub username is supplemental context only.
3. Durable audit logs are mandatory.
4. A post-change notification email or receipt is useful, but not a phase-1
   blocker.

Escalate to stronger confirmation only when ownership is ambiguous or the
operation crosses account or domain boundaries.

## Target Topology

### Desired production state

1. Cloudflare zone: `noter.md`
2. Cloudflare Pages project: configured main Noter frontend project
3. Pages custom domain: `noter.md`
4. Convex deployment: configured main Noter production deployment
5. Convex custom domain for `convexCloud`: `api.noter.md`
6. Convex custom domain for `convexSite`: `actions.noter.md`
7. Frontend build env: `VITE_CONVEX_URL=https://api.noter.md`
8. Convex canonical URLs:
   - `CONVEX_CLOUD_URL=https://api.noter.md`
   - `CONVEX_SITE_URL=https://actions.noter.md`

### Migration order

1. Confirm platform target config and provider connections.
2. Prepare Convex custom domains.
3. Create or update Cloudflare DNS records for `api` and `actions`.
4. Wait until Convex custom domains verify.
5. Set Convex canonical URLs.
6. Attach `noter.md` to the Cloudflare Pages project and wait until active.
7. Patch Pages project env so the frontend points at `https://api.noter.md`.
8. Redeploy the frontend on Cloudflare Pages.
9. Smoke-check the live site.
10. Keep Netlify as rollback capacity until stability is confirmed.
11. Retire or detach Netlify only after the cutover is stable.

## Platform Config Source Of Truth

Add a single platform target record rather than a pile of env vars.

Recommended new table:

- `platformTargets`

Recommended row shape:

```ts
platformTargets: defineTable({
  slug: v.literal('noter_production'),
  repoOwner: v.string(),
  repoName: v.string(),
  zoneName: v.string(),
  frontendDomain: v.string(),
  apiDomain: v.string(),
  actionsDomain: v.string(),
  cloudflareAccountId: v.string(),
  cloudflarePagesProjectName: v.string(),
  convexDeploymentName: v.string(),
  netlifySiteId: v.optional(v.string()),
  convexCloudDnsTargetOverride: v.optional(v.string()),
  convexSiteDnsTargetOverride: v.optional(v.string()),
  updatedAt: v.number(),
}).index('by_slug', ['slug'])
```

Why a table instead of env vars:

1. The values are operational state, not build-time configuration.
2. They need to be visible to backend actions and MCP tools.
3. They may need one-time manual correction without a redeploy.
4. Optional DNS target overrides give us a safe escape hatch for the current
   Convex DNS-target gap.

## MCP Surface

### 1. `platform.get_noter_cutover_status`

Purpose:

1. Return the live state of the configured frontend domain, Convex domains,
   Cloudflare Pages project, and optional Netlify rollback target.

Required scope:

1. `platform.read`

Behavior:

1. Load `platformTargets(slug="noter_production")`.
2. Resolve operator Cloudflare and Convex connections.
3. Query live provider state.
4. Return a bounded structured status object plus a concise text summary.

Suggested result fields:

1. `frontend.pagesDomainStatus`
2. `frontend.pagesProjectName`
3. `frontend.currentProductionUrl`
4. `backend.api.customDomainPresent`
5. `backend.api.verified`
6. `backend.actions.customDomainPresent`
7. `backend.actions.verified`
8. `dns.apiRecord`
9. `dns.actionsRecord`
10. `netlify.siteId`
11. `blockers`
12. `recommendedNextPhase`

### 2. `platform.plan_noter_cutover`

Purpose:

1. Produce an ordered, idempotent plan from current state to target state.

Required scope:

1. `platform.read`

Behavior:

1. Uses the same live status gatherer as `platform.get_noter_cutover_status`.
2. Computes a step list with `ready`, `blocked`, or `noop` status.
3. Surfaces unresolved blockers before any mutation is attempted.

Suggested input:

```ts
{
  includeNetlifyRetirement?: boolean;
}
```

Suggested result:

1. `phases`
2. `steps`
3. `manualBlockers`
4. `warnings`
5. `dnsTargetInferenceUsed`

### 3. `platform.apply_noter_cutover`

Purpose:

1. Execute one logical phase of the cutover.

Required scope:

1. `platform.write`

Suggested input:

```ts
{
  phase:
    | "prepare_convex_domains"
    | "prepare_pages_domain"
    | "deploy_frontend_on_cloudflare"
    | "retire_netlify";
  includeNetlifyRetirement?: boolean;
}
```

Behavior:

1. Reload live status at execution time.
2. Skip already-satisfied operations.
3. Execute only the selected phase.
4. Record step-level provider audits.
5. Return the new status plus a summary of changes.

Why phase-based instead of one giant `migrate_everything_now` tool:

1. It keeps reruns safe.
2. It keeps failures localized.
3. It preserves a clean rollback point before Netlify retirement.
4. It gives Codex a deterministic place to resume.

## Backend Execution Design

### Platform status helpers

Add internal helpers to gather live state:

1. `getPlatformTarget("noter_production")`
2. `resolvePlatformConnections(userId)`
3. `readCloudflareZoneStatus`
4. `readCloudflarePagesDomainStatus`
5. `readConvexCustomDomainStatus`
6. `readNetlifyRollbackStatus`

### Cloudflare mutation helpers

Reuse the existing Cloudflare MCP `execute` pattern and add focused internal
helpers:

1. `ensureCloudflareDnsRecord`
2. `ensureCloudflarePagesProjectEnv`
3. `ensureCloudflarePagesCustomDomain`
4. `pollCloudflarePagesDomainActive`

Preferred Cloudflare API calls:

1. `GET /zones?name=noter.md`
2. `GET /zones/{zone_id}/dns_records?...`
3. `POST /zones/{zone_id}/dns_records`
4. `PATCH /zones/{zone_id}/dns_records/{dns_record_id}`
5. `GET /accounts/{account_id}/pages/projects/{project_name}`
6. `PATCH /accounts/{account_id}/pages/projects/{project_name}`
7. `GET /accounts/{account_id}/pages/projects/{project_name}/domains`
8. `POST /accounts/{account_id}/pages/projects/{project_name}/domains`
9. `GET /accounts/{account_id}/pages/projects/{project_name}/domains/{domain}`

Important detail:

1. Prefer Pages domain APIs for `noter.md` rather than hand-editing apex DNS.
2. Use explicit DNS upserts only for `api.noter.md` and `actions.noter.md`.

### Convex mutation helpers

Use the existing Convex provider connection and add focused internal helpers:

1. `ensureConvexCustomDomain`
2. `listConvexCustomDomains`
3. `pollConvexCustomDomainVerified`
4. `setConvexCanonicalUrl`

Preferred Convex APIs:

1. `POST /deployments/{deployment_name}/create_custom_domain`
2. `GET /deployments/{deployment_name}/custom_domains`
3. deployment API `POST /update_canonical_url`

### Execution by phase

#### `prepare_convex_domains`

1. Ensure `api.noter.md` exists on `requestDestination="convexCloud"`.
2. Ensure `actions.noter.md` exists on `requestDestination="convexSite"`.
3. Determine DNS targets for both domains.
4. Upsert Cloudflare DNS records for both subdomains.
5. Poll until both Convex domains have `verificationTime`.
6. Set canonical URLs for both destinations.

#### `prepare_pages_domain`

1. Ensure the configured Pages project exists.
2. Ensure `noter.md` is attached as a Pages custom domain.
3. Poll until the Pages domain status is `active`.
4. Capture `validation_data` and `verification_data` in audit output if the
   domain is pending or blocked.

#### `deploy_frontend_on_cloudflare`

1. Patch Pages project environment so the frontend uses
   `VITE_CONVEX_URL=https://api.noter.md`.
2. Trigger or verify a fresh production deployment on Cloudflare Pages.
3. Verify that `https://noter.md` serves the Cloudflare-hosted app.

#### `retire_netlify`

Phase 1 recommendation:

1. Keep this phase implemented as a no-op or advisory summary unless the
   operator explicitly wants destructive Netlify automation.
2. Record current Netlify site state for rollback.
3. Treat final teardown as manual or later-phase automation.

This avoids coupling the critical forward cutover to Netlify-specific cleanup.

## Audit, Identity, And Safety Model

### Operator identity

Use the authenticated Noter user as the actor of record, with these rules:

1. The user's Google email is the primary identity anchor.
2. GitHub username is stored only as supplemental context.
3. Only allowlisted admin operators can call `platform.write` tools.

### Mutation audit tables

Recommended new tables:

1. `platformOperationRuns`
2. `platformOperationAudit`

Suggested run shape:

```ts
platformOperationRuns: defineTable({
  targetSlug: v.string(),
  toolName: v.string(),
  phase: v.string(),
  requestedByUserId: v.id('users'),
  requestedByEmail: v.string(),
  status: v.union(
    v.literal('running'),
    v.literal('completed'),
    v.literal('failed'),
  ),
  inputJson: v.string(),
  summary: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

Suggested step-audit shape:

```ts
platformOperationAudit: defineTable({
  runId: v.id('platformOperationRuns'),
  provider: v.union(
    v.literal('cloudflare'),
    v.literal('convex'),
    v.literal('netlify'),
    v.literal('internal'),
  ),
  operation: v.string(),
  resource: v.string(),
  beforeJson: v.optional(v.string()),
  afterJson: v.optional(v.string()),
  resultJson: v.optional(v.string()),
  error: v.optional(v.string()),
  createdAt: v.number(),
}).index('by_run', ['runId'])
```

Audit requirements:

1. Every provider mutation must produce a step audit row.
2. Capture before and after state where practical.
3. Capture the operator email snapshot on the run row.
4. Return audit IDs in MCP tool results so the operator can correlate changes.

### Confirmation model

Phase 1 recommendation:

1. Use MCP scope plus server-side admin checks as the approval gate for
   `platform.write`.
2. Do not require a separate email round-trip for each change.
3. Send a post-change notification email or receipt later if useful.

This is stricter than raw provider CLI access, but lighter than the async
proposal flow used for production reads.

## Main Risk And Open Question

### Convex DNS target discovery is the only significant automation gap

What we know:

1. Convex APIs let us create and list custom domains.
2. Convex docs say the dashboard shows which DNS records to create.
3. The public API response does not include those DNS records.

What this means:

1. We should not hardcode DNS targets for production until we validate the
   behavior in a sandbox.
2. The likely inferred targets are the hosts already present in `convexCloudUrl`
   and `convexSiteUrl`, but this is still an inference, not a documented
   contract.

Recommendation:

1. Phase 1 implementation should support optional `convexCloudDnsTargetOverride`
   and `convexSiteDnsTargetOverride` on `platformTargets`.
2. Before production rollout, validate in a sandbox whether simple CNAMEs to the
   existing Convex hosts verify correctly.
3. If that inference is invalid, use a temporary manual or Playwright bridge for
   this one step until Convex exposes DNS instructions by API.

## Rollout Plan

### Phase 0: platform config + status

1. Add `platformTargets`.
2. Add platform status readers.
3. Add `platform.get_noter_cutover_status`.

### Phase 1: planner + audit scaffolding

1. Add `platform.plan_noter_cutover`.
2. Add platform operation run and audit tables.
3. Add narrow admin and scope checks for platform ops.

### Phase 2: Cloudflare domain mutations

1. Add Cloudflare DNS upsert helpers.
2. Add Pages custom domain helpers.
3. Validate polling and idempotency against the real Cloudflare API.

### Phase 3: Convex domain mutations

1. Add custom-domain create and list helpers.
2. Add canonical URL updates.
3. Validate DNS target inference in a sandbox before production use.

### Phase 4: public apply tool

1. Add `platform.apply_noter_cutover`.
2. Implement `prepare_convex_domains`.
3. Implement `prepare_pages_domain`.
4. Implement `deploy_frontend_on_cloudflare`.

### Phase 5: production cutover

1. Run the plan tool until no blockers remain.
2. Execute phases in order.
3. Leave Netlify in place as rollback capacity.
4. Retire Netlify only after stability is confirmed.

## Acceptance Criteria

1. Codex can call one Noter MCP tool to read current cutover status.
2. Codex can call one Noter MCP tool to generate the current execution plan.
3. Codex can apply each cutover phase without touching the Cloudflare UI.
4. `api.noter.md` verifies as a Convex custom domain and becomes the canonical
   `CONVEX_CLOUD_URL`.
5. `actions.noter.md` verifies as a Convex custom domain and becomes the
   canonical `CONVEX_SITE_URL`.
6. `noter.md` becomes active on Cloudflare Pages.
7. Every mutation is logged with actor email and provider step details.
8. Re-running the same phase is safe and produces no duplicate resources.

## Validation Strategy

1. Unit test the planner so drift and noop behavior are deterministic.
2. Unit test DNS upsert logic against mocked Cloudflare list/create/update
   responses.
3. Unit test Convex domain planner behavior for verified and unverified states.
4. Integration test the platform audit rows for successful and failed phases.
5. Run a sandbox rehearsal before production, specifically to validate the
   Convex DNS-target assumption.
6. After production cutover, run a manual or Playwright smoke check against
   `https://noter.md`.

## References

- Convex custom domains:
  - https://docs.convex.dev/production/hosting/custom
- Convex deployment API authentication:
  - https://docs.convex.dev/deployment-api/convex-deployment-api
- Convex update canonical URL:
  - https://docs.convex.dev/deployment-api/update-canonical-url
- Convex management API create custom domain:
  - https://docs.convex.dev/management-api/create-custom-domain
- Convex management OpenAPI:
  - https://api.convex.dev/v1/openapi.json
- Cloudflare Pages custom domains:
  - https://developers.cloudflare.com/pages/configuration/custom-domains/
- Cloudflare Pages domains API:
  - https://developers.cloudflare.com/api/resources/pages/subresources/projects/subresources/domains/methods/create/
- Cloudflare DNS records API:
  - https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/
