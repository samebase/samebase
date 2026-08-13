# 033 Polar Billing Spec

## Document Control

- Status: Superseded
- Owner: Samebase platform
- Last updated: 2026-08-02
- Accepted replacement: `specs/119_POLAR_MONTHLY_BILLING_SPEC.md`
- Superseded rollout plan: `archive/098_POLAR_MONTHLY_BILLING_LAUNCH_PLAN.md`

Do not use this document for current product or implementation decisions. Use spec 119 for the
accepted billing contract. The remaining content is historical context.

## Historical Status

This spec records experimental Polar plumbing that exists in the app. It is not an enforceable
product billing decision. Until a future accepted billing spec says otherwise, billing fields,
`free`/`pro` labels, checkout, portal, and webhook state are descriptive only and must not block
member app creation or retries.

## Goal

Implement Polar billing so that:

- Billing state, checkout, portal, and webhooks can be exercised without blocking member onboarding.
- Approved members can create Samebase-managed vaults regardless of current billing state while the
  early app-creation flow is being validated.
- Billing state is webhook-driven (never trust client redirects as the authority).

This spec is focused on a minimal billing plumbing spike. Guardrails, credits, metering, plan names,
and any enforcement boundary require a separate future decision.

## Non-Goals (V1)

- Usage-based billing / credits enforcement.
- Team plan / seat-based billing.
- Public pricing page (keep authenticated-only for now).
- Any app-creation limit based on billing state.

## Polar Model (What We Use)

- Checkout Sessions: server-side creation returns a checkout URL to redirect to.
- `external_customer_id`: a stable Samebase-generated identifier, stored on the user record, used to
  reconcile Polar state back to the Convex user.
- Webhooks: signature-validated inbound events; we treat customer state as the source of truth for
  billing state.
- Customer Portal Sessions: server-side creation returns a customer portal URL.

## Environment Strategy

Infer Polar environment from Convex deployment:

- `prod:*` => Polar production (`https://api.polar.sh/v1`)
- otherwise => Polar sandbox (`https://sandbox-api.polar.sh/v1`)

No frontend environment variables are used for Polar.

## Required Convex Env Vars

Set these in each Convex deployment (dev and prod):

- `POLAR_ACCESS_TOKEN` (server-side only; never exposed to the browser)
- `POLAR_WEBHOOK_SECRET` (webhook signature verification secret)

## Product IDs

For now, keep product IDs in code as constants (later we can move to DB).

The current experimental labels are:

- Pro monthly product ID
- Pro annual product ID (optional; can be left empty and treated as disabled)

## Data Model

Extend `users` with billing fields:

- `billingProvider`: `"polar"` (optional)
- `billingPlan`: `"free" | "pro"` (optional; experimental label only)
- `billingStatus`: `"inactive" | "active" | "past_due" | "canceled" | "unknown"`
- `billingUpdatedAt`: number (ms since epoch)
- `billingCurrentPeriodEndAt`: optional number (ms since epoch)
- `billingPolarExternalCustomerId`: optional string (indexed)

Index:

- `users.by_polar_external_customer_id` on `billingPolarExternalCustomerId`

## Backend API (Convex)

Create `apps/samebase/convex/billing.ts`:

Access status:

- The target billing API is member-facing after approval. Keep viewer billing status plus checkout
  and portal session actions at `access_dashboard` so the authenticated `/pricing` route can load
  for approved members.

Queries

- `getViewerBillingStatus`: returns viewer billing summary (plan/status). This status is not an app
  creation gate.

Actions

- `createPolarCheckoutSession`
  - Input: billing interval (`monthly`/`annual`), `successUrl`, `returnUrl`
  - Ensures the viewer has `billingPolarExternalCustomerId` (generate if missing)
  - Calls Polar `POST /v1/checkouts` with:
    - `products: [<productId>]`
    - `external_customer_id: <billingPolarExternalCustomerId>`
    - `customer_email` and `customer_name` from viewer profile when available
    - `success_url`, `return_url`
  - Output: `{ url }`

- `createPolarCustomerPortalSession`
  - Input: `returnUrl`
  - Calls Polar `POST /v1/customer-sessions` with:
    - `external_customer_id: <billingPolarExternalCustomerId>`
    - `return_url`
  - Output: `{ url }` (normalized from `customer_portal_url`)

Internal helpers

- `ensurePolarExternalCustomerId` (mutation)
- `applyPolarCustomerState` (mutation): updates user billing fields based on canonical customer
  state.

## Webhooks

Create `apps/samebase/convex/polarWebhooks.ts` + route it in `apps/samebase/convex/http.ts`:

- Route: `POST /webhooks/polar`
- Validate signature using Polar SDK helper (`validateEvent`) against `POLAR_WEBHOOK_SECRET`.
- From the validated event, extract the `external_customer_id` (via customer).
- Fetch canonical state: `GET /v1/customers/external/{external_id}/state`
- Derive billing state:
  - Pro is active if any `active_subscriptions[].product_id` matches the Pro product(s) for the
    current environment.
- Persist billing fields via `applyPolarCustomerState`.

Idempotency strategy:

- Webhook deliveries may be repeated or out of order.
- We always compute from canonical customer state and apply the same update, so repeated processing
  is safe.

## Feature Gating

Do not gate `vaultActions.createRepository` on Polar billing state in the current member rollout:

- Approved members may create Samebase-managed vaults without paying during the current onboarding
  validation phase.
- Billing fields remain available for checkout/status experiments.
- Future app-creation guardrails belong in a separate accepted rollout that defines quota, rate
  limit, credit, or plan semantics explicitly.
- Until that rollout exists, billing specs and billing fields are not authorization inputs.

Do not gate `vaultActions.connectRepository` (free tier flow).

## Frontend (Pricing Page)

Update `apps/samebase/src/components/PricingPage.tsx`:

- Keep the 3-tier UI (Free, Pro, Team).
- Pro CTA:
  - calls `createPolarCheckoutSession`
  - redirects browser to returned checkout URL
- If already Pro:
  - show \"Manage subscription\" which calls `createPolarCustomerPortalSession`
  - redirects to portal URL

## Manual Validation Checklist

- Dev deployment uses Polar sandbox base URL.
- Clicking Pro CTA redirects to Polar checkout.
- Completing checkout triggers webhook -> the user's billing state is updated in Convex.
- `createRepository` succeeds for approved members with connected providers, regardless of billing
  state.
- Customer portal link opens and returns to `/pricing`.
