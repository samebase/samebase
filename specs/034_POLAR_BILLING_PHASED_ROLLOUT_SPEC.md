# 034 Polar Billing Phased Rollout Spec

## Document Control

- Status: In progress (Phase 1 complete)
- Owner: Noter platform
- Last updated: 2026-03-02
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `rfcs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/033_POLAR_BILLING_SPEC.md`

## Summary

Roll out Polar billing in phases so we can:

1. Validate billing state, checkout, portal, and webhook plumbing without blocking member
   onboarding.
2. Keep Noter-managed vault creation available to approved members while early app creation is being
   tested.
3. Make entitlements transparent and correct (webhook-driven, reconciled).
4. Leave a clean path for guardrails, credits, and metering later without redoing the billing core.

## Why This Spec Exists

Billing will eventually affect core product flows (vault creation and managed infra). A phased
rollout reduces risk by sequencing:

- entitlement correctness first (backend + webhook),
- then UX polish and operational hardening,
- then guardrails, metering, and credits.

## Goals

1. Polar-backed Pro subscription flow (checkout redirect + customer portal).
2. Webhook-driven entitlements (redirect success is never authority).
3. Minimal configuration surface:
   - server-side Convex env vars only (`POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`)
   - infer sandbox vs production from `CONVEX_DEPLOYMENT`
4. Keep current app creation gated by member access and provider readiness, not billing state.

## Non-Goals (For This Rollout Plan)

1. Usage-based billing enforcement / credits deductions (later phases).
2. Team/seat billing.
3. Public pricing page (pricing remains authenticated-only for now).

## Design Constraints (Locked)

1. No frontend Polar secrets (no Vite env vars for Polar).
2. Entitlements are computed from Polar canonical customer state (not event payload fields).
3. Webhook processing must be idempotent.
4. Prefer additive schema changes.
5. Strict TypeScript: no `any`, no type assertions.

## Execution Plan (Phased)

## Implementation Progress

- [x] Phase 1 complete: Polar scaffold + Paddle removal
- [ ] Phase 2 complete: Sandbox end-to-end validation
- [ ] Phase 3 complete: Production hardening + operational readiness
- [ ] Phase 4 complete: Config moved out of code (DB-backed billing config)
- [ ] Phase 5 complete: Metering + credits foundation (transparent usage)
- [ ] Phase 6 complete: Credits enforcement + top-ups / overage handling
- [ ] Phase 7 complete: Team billing

### Phase 1: Polar scaffold + Paddle removal (complete)

- [x] Add Polar billing module (checkout session + customer portal session).
- [x] Add Polar webhook endpoint + signature verification.
- [x] Add billing fields to `users` + index by external customer id.
- [x] Keep `vaultActions.createRepository` independent of billing state for the member rollout.
- [x] Update `/pricing` to call Polar actions and remove Paddle client/config.
- [x] Remove Paddle specs/implementation from repo.

Exit criteria:

- [x] Codebase compiles, `pnpm lint` + `pnpm test` pass.
- [x] Pricing page loads for authenticated users.
- [x] Checkout/session creation is wired but requires product IDs to be set.

### Phase 2: Sandbox end-to-end validation

- [ ] Create Polar sandbox product(s) for Pro (monthly; annual optional).
- [ ] Fill sandbox product IDs in code (temporarily) so checkout can start.
- [ ] Set Convex dev deployment env vars:
  - [ ] `POLAR_ACCESS_TOKEN`
  - [ ] `POLAR_WEBHOOK_SECRET`
- [ ] Configure Polar webhook target:
  - [ ] `POST <convex-site-url>/webhooks/polar`
- [ ] Manual validation:
  - [ ] Start checkout from `/pricing` redirects to Polar sandbox checkout.
  - [ ] Completing checkout triggers webhook and upgrades user to Pro in Convex.
  - [ ] Customer portal opens and returns to `/pricing`.
  - [ ] Approved members can create Noter-managed vaults with connected providers regardless of
        billing state.

Exit criteria:

- [ ] Entitlements flip correctly via webhook within expected time.
- [ ] No manual DB edits are required for normal flow validation.

### Phase 3: Production hardening + operational readiness

- [ ] Create Polar production product(s); fill production product IDs.
- [ ] Set Convex prod deployment env vars:
  - [ ] `POLAR_ACCESS_TOKEN`
  - [ ] `POLAR_WEBHOOK_SECRET`
- [ ] Verify return URL allowlist is correct for prod (`https://noter.md`).
- [ ] Expand billing status derivation beyond "active vs inactive":
  - [ ] map cancellations / past-due states (without breaking free tier).
- [ ] Add a periodic reconciliation action (manual or scheduled) to self-heal:
  - [ ] ensure users can be downgraded if subscription ends.
- [ ] Add structured log lines for webhook processing + Polar API failures.

Exit criteria:

- [ ] Sandbox and production are both supported via deployment inference.
- [ ] Subscription lifecycle changes converge correctly (webhook + reconciliation).

### Phase 4: Config moved out of code (DB-backed billing config)

Goal: avoid code deploys for product ID changes and add transparent plan metadata.

- [ ] Add a `billingConfig` table keyed by `environment` (sandbox/production).
- [ ] Store:
  - [ ] product IDs for Pro monthly/annual
  - [ ] displayed prices (string) and plan descriptions
- [ ] Add internal admin-only mutation to update billing config.
- [ ] Update billing module to read from DB config (fallback to safe defaults).

Exit criteria:

- [ ] Product IDs and display copy can be updated without redeploying.

### Phase 5: Metering + credits foundation (transparent usage)

Goal: make usage transparent even before enforcement.

- [ ] Define a metering model (tokens, provider costs, Noter compute units).
- [ ] Persist usage events per vault/user (append-only).
- [ ] Build a basic usage page that explains:
  - [ ] what was consumed
  - [ ] by which action (agent run, deployment, etc.)
  - [ ] approximate cost basis

Exit criteria:

- [ ] Users can see a truthful breakdown of usage over time.

### Phase 6: Credits enforcement + top-ups / overage handling

- [ ] Add a credits ledger (grants, consumption, refunds).
- [ ] Decide enforcement boundary:
  - [ ] block new managed actions when out of credits
  - [ ] or allow overage and invoice later (requires product support)
- [ ] Add purchase flow for credits (or upgrade plan boundaries).

Exit criteria:

- [ ] Enforcement is consistent and explainable with on-screen usage data.

### Phase 7: Team billing

- [ ] Define team entity and membership.
- [ ] Team subscription maps to team entitlements/credits.
- [ ] Seat or shared credits behavior is explicit and tested.

Exit criteria:

- [ ] Team billing is stable without impacting personal billing flows.

## Validation Checklist (Always-On)

- [ ] Webhook endpoint validates signatures and ignores invalid deliveries.
- [ ] Redirect-based success is not treated as entitlement authority.
- [ ] Billing gating is enforced only where intended:
  - [x] do not gate Noter-managed create (`createRepository`) during member rollout
  - [x] do not gate BYO connect (`connectRepository`)
- [ ] No billing secrets leak to the client.
- [ ] All changes remain type-safe (no `any`, no assertions).

## Acceptance Criteria

- [ ] A user can subscribe to Pro via Polar and become entitled without manual intervention.
- [ ] A user can cancel and lose entitlement reliably.
- [ ] Approved members can create apps without a Pro entitlement until the guardrail/metering
      rollout defines enforcement.
