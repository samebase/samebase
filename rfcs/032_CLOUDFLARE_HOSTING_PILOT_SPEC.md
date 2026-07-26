# 032 Cloudflare Hosting Pilot Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-03-02
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `rfcs/016_FRONTEND_HOSTING_PROVIDER_SELECTION_SPEC.md`
  - `rfcs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `archive/038_RAILWAY_REMOVAL_AND_DATA_CLEANUP_SPEC.md`
  - `rfcs/031_CLOUDFLARE_MCP_OAUTH_LOGIN_SPEC.md`

## Summary

Add Cloudflare as a hosting provider option for noter-managed vault apps, alongside Netlify, using
Cloudflare Pages as the initial target.

Roll this out as a pilot, gated behind a feature flag, with incremental phases:

1. Read-only Cloudflare inventory reads (safe validation of OAuth scopes).
2. Minimal Cloudflare Pages provisioning (create a “project/app”).
3. Wire Cloudflare into the existing hosting-provider selection UX.
4. Expand to previews/domains only after the pilot is stable.

This spec intentionally does not require an immediate scope upgrade: users can connect Cloudflare
with read-only access first, and reconnect later with write access when provisioning is ready.

## Why this spec exists

- Noter already supports provider-specific hosting through a strict boundary.
- Cloudflare Pages is a strong fit for static Vite apps, and helps address Netlify deploy-credit
  constraints documented in `specs/016_...`.
- Cloudflare connection UX is now available via MCP OAuth (`specs/031_...`), enabling a practical
  path to managed Cloudflare hosting.

## Goals

1. Add `cloudflare` as a hosting provider implementation behind the existing hosting boundary (no
   Netlify regressions).
2. Allow selecting Cloudflare in the vault create flow (dropdown) when the pilot flag is enabled.
3. Provision a noter-managed vault to a working Cloudflare Pages URL.
4. Provide a safe, read-only “inventory/status” surface to validate credentials without writing
   resources.
5. Keep rollout reversible (flag off → no new Cloudflare provisions).

## Non-goals

1. Migrating existing vaults to Cloudflare.
2. Removing Netlify.
3. Custom domains, DNS automation, or preview deployments in the first pilot slice (these become
   later phases).
4. Over-specifying Cloudflare’s final long-term role before pilot evidence.

## Design Constraints (locked)

1. Keep hosting provider logic as function modules (no provider classes).
2. Maintain strict discriminated unions by `provider` in schema and types.
3. No `any` / no type assertions (`as SomeType`).
4. Pilot gating must be simple and operationally safe (env var + existing runtime checks).

## Environment / Flags

Introduce a new env flag for rollout control:

- `CLOUDFLARE_HOSTING_PILOT_ENABLED` (`true`/`false`)

Behavior:

- When disabled (default): Cloudflare is hidden from create-flow hosting selection and cannot be
  chosen for new vault provisions.
- When enabled: Cloudflare appears as an option alongside Netlify.

OAuth redirect requirements are already defined in `specs/031_...`:

- `PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL`

## Auth + Access Model

### Provider connection

Cloudflare access is represented as a `providerConnections(kind="cloudflare")` row with:

- `auth.method = "mcp_oauth"`
- `auth.credential` (access token)
- `auth.refreshCredential`
- `auth.credentialExpiresAt`
- `auth.clientId`

### Read-only first

The pilot should support an initial “read-only credential” mode:

- Read-only access is sufficient for Phase 1 (inventory/status reads).
- Provisioning phases should detect “missing write access” and return a clear, actionable error
  telling the user to disconnect/reconnect Cloudflare with broader permissions.

### Account selection

Cloudflare is account-scoped. We should add a first-class flow to store an `accountId` for
Cloudflare connections:

1. After connect, run a read-only inventory call (list accessible accounts).
2. If more than one account is accessible, prompt the user to pick one.
3. Persist selection on `providerConnections.accountId` for Cloudflare.

This keeps vault provisioning deterministic and avoids guessing.

## Data Model / Types (additive)

Extend hosting provider unions to include `cloudflare`:

- `HostingProvider = "netlify" | "cloudflare"`

Add a Cloudflare hosting state branch (exact fields may change as we learn the minimum required
identifiers):

- `CloudflareHostingState` (provider = `"cloudflare"`)
  - `accountId` (required)
  - `projectId` or `projectName` (required)
  - `productionUrl` (optional initially; resolved after first deploy)

## Hosting Provider Boundary (Cloudflare implementation)

Implement Cloudflare as another backend behind the existing hosting boundary used by Netlify:

1. Provision (create Pages project + connect to repo)
2. Resolve production URL
3. Read status/logs/inventory for approval-first prod-read tools (read-only)
4. Teardown (delete project/resources)

Open question (resolve during implementation): whether Pages provisioning should use “GitHub source
integration” vs “direct upload” workflows. The pilot should start with the lowest-friction path that
is compatible with how Noter already deploys today.

## Execution Plan (phased)

## Implementation Progress

- [x] Phase 0 complete: Cloudflare MCP OAuth provider connection
- [ ] Phase 1 complete: Cloudflare inventory reads (safe, read-only)
- [ ] Phase 2 complete: Account selection + persistence
- [ ] Phase 3 complete: Cloudflare hosting implementation (Pages provisioning)
- [ ] Phase 4 complete: Create-flow provider dropdown + pilot gating
- [ ] Phase 5 complete: Pilot hardening (errors, retries, teardown)
- [ ] Phase 6 complete: Preview deployments + domain strategy (optional)
- [ ] Phase 7 complete: Pilot evaluation and decision

### Phase 0: Cloudflare provider connection (already shipped in this PR)

Exit criteria:

- [x] User can connect/disconnect Cloudflare and see stable connection state.
- [x] OAuth callback works reliably in dev.

### Phase 1: Cloudflare inventory reads (safe validation)

Work:

- Add a minimal Cloudflare MCP client wrapper that can perform read calls.
- Implement “list accounts” and “list pages projects/apps” reads.
- Add approval-first prod-read tools for Cloudflare inventory reads, consistent with other provider
  read tooling patterns.

Exit criteria:

- [ ] Connected user can fetch Cloudflare inventory without creating resources.
- [ ] Read-only tokens succeed for inventory; missing scope is surfaced clearly.

### Phase 2: Account selection + persistence

Work:

- Add a UI flow for selecting an account after connect (or on first provisioning attempt).
- Persist `providerConnections.accountId` for Cloudflare.
- Ensure disconnect clears any derived account selection.

Exit criteria:

- [ ] Cloudflare connection has a deterministic `accountId` stored.

### Phase 3: Cloudflare Pages provisioning (create an “application”)

Work:

- Add a `cloudflare` branch in the hosting provider boundary.
- Provisioning should:
  - create a Pages project/app
  - configure it for the vault repo (build settings, production branch)
  - wait for a stable production URL and persist it in hosting state
- Teardown should delete Cloudflare resources idempotently.

Exit criteria:

- [ ] A noter-managed vault provisions to a working Cloudflare Pages URL.
- [ ] Retry is safe and idempotent.

### Phase 4: Create-flow provider dropdown + pilot gating

Work:

- Add `cloudflare` to the create-flow “hosting provider” dropdown.
- Gate visibility + selection behind `CLOUDFLARE_HOSTING_PILOT_ENABLED`.
- Keep default provider unchanged (Netlify) until pilot evidence supports expanding.

Exit criteria:

- [ ] When the flag is off, Cloudflare cannot be selected.
- [ ] When on, Cloudflare can be selected and provisions through the boundary.

### Phase 5: Pilot hardening

Work:

- Improve errors for “connected but insufficient scopes” (reconnect CTA).
- Add small-footprint logs and status reads to support debugging.
- Ensure delete-vault teardown behavior remains safe (Cloudflare cleanup is non-destructive beyond
  the project it created).

Exit criteria:

- [ ] Pilot users can provision + teardown repeatedly without manual cleanup.

### Phase 6: Preview deployments + domain strategy (optional)

Work (only after Phase 5 is stable):

- Add preview deployments for worktree branches (if desired).
- Align with `vaultDomains` mapping and existing domain strategy.

Exit criteria:

- [ ] Preview URLs are stable and mapped to branches safely.

### Phase 7: Pilot evaluation and decision

Decide one of:

- keep Netlify/Cloudflare side-by-side long-term
- switch default hosting provider for noter-managed vaults
- keep Cloudflare as opt-in only
- rollback Cloudflare hosting path

Exit criteria:

- [ ] Decision documented with measurable pilot outcomes.

## Validation Checklist

- [ ] Netlify create/provision/retry/delete still works.
- [ ] Cloudflare connect/disconnect is stable.
- [ ] Cloudflare provisioning is gated behind flag and requires an explicit provider selection.
- [ ] No `any` / no class-based provider implementations.

## Open Questions

1. Exact Cloudflare MCP “write” permissions required for Pages provisioning.
2. Best Pages integration approach:
   - GitHub source integration vs direct upload
3. How to surface account selection when multiple accounts exist.
4. Whether to require write access only when provisioning is requested (preferred).
