# 028 Paddle Managed Billing Spec

## Document Control

- Status: Proposed
- Owner: Noter platform
- Last updated: 2026-02-27
- Related specs:
  - `specs/003_VAULT_INFRA_PROVISIONING_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`

## Summary

Introduce Paddle billing for noter-managed vault creation so users pay before
creating managed infrastructure. Billing entitlement should be driven by
subscription webhooks, not checkout redirect callbacks.

## Goals

1. Gate `vaultActions.createRepository` behind an active Paddle entitlement.
2. Keep billing state in Convex with idempotent webhook processing.
3. Offer self-serve billing management via Paddle customer portal.
4. Preserve existing behavior for `connectRepository` (non-managed repos).

## Non-goals

1. Replacing existing provider OAuth flows.
2. Pricing strategy design (tiers/amounts remain product decision).
3. Migrating legacy Paddle Classic.

## Product Behavior

1. User starts checkout from dashboard when not entitled.
2. Access is granted only after webhook-confirmed subscription activation.
3. If subscription becomes past due/canceled, managed creation is blocked.
4. Existing managed vaults are not auto-deleted by billing status changes.

## Entitlement Contract (Canonical)

Use one shared helper (`getBillingEntitlement`) for all access decisions.
Webhook processing and `vaultActions.createRepository` gating must use the same
contract:

1. Allowed states: `active`, `trialing`
2. Blocked states: `past_due`, `paused`, `canceled`, `inactive`
3. Grace policy for `past_due`: none in v1 (blocked immediately)
4. Helper output must include:
   - `allowed` (boolean)
   - `state` (normalized state)
   - `graceRemainingMs` (always `0` in v1)
   - `currentPeriodEndsAt` (optional)

Webhook handlers should store normalized state and timestamps used by the helper
so entitlement reads and writes stay consistent.

## Convex Data Model Additions

Add tables to `apps/noter/convex/schema.ts` using explicit Convex validators and
indexes (matching existing schema conventions):

1. `billingCustomers`
   - fields:
     - `userId: v.id("users")`
     - `paddleCustomerId: v.string()`
     - `email: v.optional(v.string())` (only if required)
     - `createdAt: v.number()`
     - `updatedAt: v.number()`
   - indexes:
     - `by_user` on `userId`
     - `by_paddle_customer` on `paddleCustomerId`
2. `billingSubscriptions`
   - define a validator-first status contract (for example
     `BillingSubscriptionStatus = v.union(...)`)
   - fields:
     - `userId: v.id("users")`
     - `paddleSubscriptionId: v.string()`
     - `paddleCustomerId: v.string()`
     - `status: BillingSubscriptionStatus`
     - `planPriceId: v.string()`
     - `currentPeriodEndsAt: v.optional(v.number())`
     - `canceledAt: v.optional(v.number())`
     - `updatedAt: v.number()`
   - indexes:
     - `by_user` on `userId`
     - `by_paddle_subscription` on `paddleSubscriptionId`
     - `by_status` on `status`
3. `billingEvents`
   - fields:
     - `eventId: v.string()` (idempotency key)
     - `eventType: v.string()`
     - `occurredAt: v.number()`
     - `processedAt: v.optional(v.number())`
     - `status: v.union(v.literal("processed"), v.literal("ignored"), v.literal("failed"))`
     - `error: v.optional(v.string())`
   - indexes:
     - `by_event_id` on `eventId`
     - `by_status` on `status`
   - idempotency rule:
     - query by `eventId` before insert, skip if already processed

## Backend Integration

### HTTP Routes

Add routes in `apps/noter/convex/http.ts`:

1. `POST /webhooks/paddle`
2. Optional: `GET /billing/paddle/return` for post-checkout UX redirect only
   (never used as entitlement authority)

### Webhook Handling

Implement `apps/noter/convex/paddleWebhooks.ts`:

1. Verify `Paddle-Signature` using endpoint secret and raw request body.
   - read raw body first (`const rawBody = await request.text()`)
   - verify signature against `rawBody`
   - only then parse JSON (`JSON.parse(rawBody)`)
2. Reject invalid signatures with `401`.
3. Ensure idempotency with `billingEvents.eventId`.
4. Process key events:
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
   - optional support signals: `subscription.past_due`, `transaction.completed`
5. Normalize and persist entitlement state using the canonical contract.
6. Persist customer/subscription records with query-then-insert-or-patch (Convex
   has no native upsert).

### Actions/Queries

Implement `apps/noter/convex/billingActions.ts`:

1. `startManagedCheckout`
   - public `action`
   - explicit `args` and `returns` validators
   - creates Paddle transaction/checkout with `custom_data` containing Noter
     `userId`
   - returns checkout URL/token for frontend
2. `createCustomerPortalSession`
   - public `action`
   - explicit `args` and `returns` validators
   - creates short-lived portal session URL
3. `getBillingEntitlement`
   - public `query`
   - explicit `args` and `returns` validators
   - single source of truth for managed entitlement checks
   - returns `allowed` plus normalized metadata (`state`, `graceRemainingMs`,
     `currentPeriodEndsAt`)
4. Internal write helpers (for webhooks) should be `internalMutation`s with
   validator-first argument contracts.

### Managed Creation Gate

Update `apps/noter/convex/vaultActions.ts`:

1. Before `createRepository`, verify active entitlement.
2. Keep `connectRepository` unchanged.
3. Return explicit actionable error message when billing is required.

## Frontend Integration

Update `apps/noter/src/components/VaultDashboard.tsx`:

1. Show `Upgrade` CTA when user lacks managed entitlement.
2. Show `Manage billing` CTA (customer portal) when subscribed.
3. Keep existing provider connection gating behavior.

## Security and Reliability Requirements

1. Webhooks must be signature-verified.
2. Webhook processing must be idempotent and safe for out-of-order delivery.
3. API key scope must be least privilege.
4. Use server-side API key only in Convex actions/http actions.
5. Never trust client redirect events for entitlement writes.
6. Minimize PII in `billingCustomers`; store billing email only when required.
7. Define retention/deletion policy for billing PII and event error payloads.
8. Do not log raw webhook payloads that include customer identifiers.

## Rollout Plan

1. Phase 1: schema + webhook ingestion in shadow mode.
2. Phase 2: dashboard billing CTAs and checkout flow.
3. Phase 3: enable `createRepository` billing gate behind feature flag.
4. Phase 4: enforce gate for all new managed vault creation.

## Validation Checklist

1. Webhook signature verification passes with Paddle simulator and fails on
   tampered payloads.
2. Duplicate webhook deliveries do not produce duplicate state transitions.
3. `createRepository` blocks when no active entitlement.
4. `createRepository` succeeds immediately after entitlement becomes active.
5. Customer portal session opens and returns safely.

## References

1. https://developer.paddle.com/build/subscriptions/provision-access-webhooks
2. https://developer.paddle.com/webhooks/signature-verification
3. https://developer.paddle.com/webhooks/respond-to-webhooks
4. https://developer.paddle.com/build/transactions/custom-data
5. https://developer.paddle.com/api-reference/transactions/create-transaction
6. https://developer.paddle.com/paddlejs/methods/paddle-checkout-open
7. https://developer.paddle.com/paddlejs/client-side-tokens
8. https://developer.paddle.com/build/customers/integrate-customer-portal
9. https://developer.paddle.com/api-reference/customer-portals/create-customer-portal-session
10. https://developer.paddle.com/build/lifecycle/subscription-renewal-dunning
11. https://github.com/PaddleHQ/paddle-node-sdk
