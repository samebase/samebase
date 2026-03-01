# 029 Paddle Pricing Page and Credits Spec

## Document Control

- Status: Proposed (sandbox-first)
- Owner: Noter product + platform
- Last updated: 2026-03-01
- Related specs:
  - `specs/028_PADDLE_MANAGED_BILLING_SPEC.md`
  - `specs/026_PROVIDER_CONNECTIONS_SPEC.md`
  - `specs/004_AI_PROD_ACCESS_POLICY_SPEC.md`

## Summary

Build a logged-in-only pricing page at `/pricing` (`https://noter.md/pricing` in
production), integrated with Paddle sandbox first. Launch with a transparent
three-tier model where:

1. `Free` is BYO (user connects their own GitHub/Convex/Railway and uses their
   own AI/providers).
2. `Pro` is a simple paid plan (`$20/month` launch default).
3. `Team` is visible as an upcoming tier (or optionally enabled later).

This spec also defines a credits-ready pricing model so we can move from a
simple subscription to transparent usage-based pricing when internal usage
metering is production-ready.

## Product Intent

1. Keep free tier economically self-sustainable:
   - no Noter-hosted AI inference included
   - no paid managed infrastructure bundled
   - users can still build successfully through BYO provider connections
2. Keep paid offer simple now:
   - one clear paid tier to start (`Pro $20/month`)
3. Move toward transparent usage:
   - introduce credits once we can reliably measure token and compute costs
   - show usage and cost drivers in-product

## Goals

1. Add `/pricing` route available only to authenticated + approved users.
2. Implement a Paddle sandbox-backed pricing page with:
   - three cards (`Free`, `Pro`, `Team`)
   - monthly/annual toggle
   - localized pricing previews
   - checkout launch from selected paid plan
3. Keep entitlement authority on webhooks (not checkout redirect/client event).
4. Define launch pricing model and credits migration path.
5. Preserve ability to start with only `Pro` sold while still presenting
   three-tier structure.

## Non-goals

1. Full billing enforcement in this change (covered by spec 028 rollout phases).
2. Full production usage metering implementation.
3. Team billing/seat management implementation.
4. Immediate migration of all vault/create flows to credits.

## External Research Findings (as of 2026-03-01)

### Paddle integration constraints

1. Paddle pricing-page tutorial is explicitly a three-tier page with monthly vs
   annual toggle and `Paddle.PricePreview()`-driven localization.
2. `Paddle.PricePreview()` returns localized totals and can auto-detect location
   if omitted.
3. `Paddle.Checkout.open()` accepts `items` and `custom data`; recurring items
   in a single checkout must share billing interval.
4. Client-side tokens are frontend-safe and limited to checkout/preview actions;
   API keys stay server-only.
5. Sandbox and live data/tokens are fully separate (`test_` vs `live_`), with
   sandbox test cards and Test Mode watermark.
6. Paddle recommends webhook-driven provisioning/data sync; signature
   verification requires raw request body and `Paddle-Signature`.

### Pricing pattern benchmarks

1. `Cursor` anchors individual paid plans around `$20/month`.
2. `Replit` uses a free plan plus paid plans that include monthly credits.
3. `GitHub Copilot` combines subscription with request allowances and paid
   overages.
4. `v0` moved from message-count to token-metered credits.
5. `Lovable` exposes monthly credits, daily allowances, rollovers, and top-ups.

Inference: market leaders are converging on hybrid models (subscription + usage
allowance + top-up), not pure unlimited.

## Recommended Pricing Model

### Phase 1 (launch simplicity)

1. `Free` — `$0`
   - BYO providers only (GitHub/Convex/Railway, user-owned AI usage)
   - no Noter-managed AI compute included
   - no Noter-managed infra entitlement
2. `Pro` — `$20/month` (launch default)
   - enables Noter-managed experience
   - initially can be flat access while metering is validated
3. `Team` — visible, `Coming soon` (or soft-enabled later)
   - keep pricing card in UI for three-tier clarity
   - no checkout button in first release unless explicitly enabled

### Why `$20` for launch

1. It aligns with established developer-tool price anchors.
2. It is high enough to avoid underpricing before usage telemetry is mature.
3. It keeps conversion friction moderate while preserving margin room for
   credits transition.

### Optional temporary offer

If conversion needs a stronger early push, add a time-boxed `Founding Pro` at
`$10/month` with clear expiry/grandfathering terms. Do not make this default
until cost telemetry confirms sustainability.

### Phase 2 (credits, transparency-first)

1. Keep base subscription (`Pro`) and include monthly credit allowance.
2. Define explicit credit formula and publish it in app.
3. Add paid top-ups.
4. Show per-action usage ledger and remaining balance.

Proposed billing contract:

1. `creditsIncludedMonthly`: fixed allowance on plan.
2. `creditBalance`: remaining usable credits.
3. `creditEvents`: immutable ledger entries (grant, consume, adjustment,
   rollover, top-up).
4. `consumptionPolicy`: block or degrade when credits exhausted.

## `/pricing` UX Contract

1. Route: `/pricing`
2. URL expectation: `https://noter.md/pricing` in prod.
3. Access: authenticated + approved users only (same gate as dashboard).
4. Layout:
   - hero + concise “how billing works” copy
   - monthly/annual toggle
   - 3 pricing cards
   - feature/comparison table (compact)
   - transparent usage disclosure panel (“How credits will work”)
5. Card actions:
   - Free: “Current plan” or “Use BYO providers”
   - Pro: “Start with Paddle” (sandbox checkout in phase 1)
   - Team: “Coming soon” or waitlist CTA
6. Status messaging:
   - show sandbox badge in non-production billing mode
   - post-checkout: “Processing subscription status…” (webhook-authoritative)

## Route and Auth Integration in Existing App

Use existing app structure in `apps/noter/src/App.tsx`:

1. Add `<Route path="/pricing" element={<PricingPage />} />` inside
   `<Authenticated><ApprovalGate>`.
2. Keep unauthenticated behavior unchanged (`<SignInForm />`).
3. Add navigation entry points:
   - dashboard CTA (near create/manage controls)
   - optional user menu item (“Pricing”)

This guarantees `/pricing` is not visible to anonymous users and remains
consistent with waitlist approval gating.

## Paddle Sandbox Technical Design

### Frontend

1. Add a pricing page component, e.g.
   `apps/noter/src/components/PricingPage.tsx`.
2. Add Paddle client bootstrap utility (single init), e.g.
   `apps/noter/src/lib/paddleClient.ts`.
3. Initialize Paddle exactly once per page lifecycle; use `Paddle.Update()` for
   callback/customer updates when needed.
4. In sandbox mode:
   - call `Paddle.Environment.set("sandbox")`
   - initialize with sandbox client-side token (`test_...`)
5. Request localized display prices with `Paddle.PricePreview()` using plan
   price IDs.
6. On CTA click, open checkout via `Paddle.Checkout.open()` with:
   - selected price ID (monthly or annual)
   - `customer.email` prefill when viewer email exists
   - `customData` containing Noter user ID and selected plan metadata
7. Register `eventCallback` to capture `checkout.*` events for analytics and
   troubleshooting.

### Backend (minimal in phase 1)

1. No entitlement writes from frontend callback/redirect.
2. Keep webhook processing as source of truth (phase from spec 028).
3. Prepare webhook endpoint + signature verification for sandbox testing.

## Configuration Contract

Environment variables (phase 1):

1. `VITE_PADDLE_ENV` = `sandbox` | `live`
2. `VITE_PADDLE_CLIENT_TOKEN` = client-side token for current environment
3. `VITE_PADDLE_PRICE_PRO_MONTHLY`
4. `VITE_PADDLE_PRICE_PRO_ANNUAL`
5. `VITE_PADDLE_PRICE_TEAM_MONTHLY` (optional until Team enabled)
6. `VITE_PADDLE_PRICE_TEAM_ANNUAL` (optional until Team enabled)

Environment variables (phase 2+, backend):

1. `PADDLE_API_KEY`
2. `PADDLE_WEBHOOK_SECRET`

## Plan Matrix (initial product definition)

1. Free
   - price: `$0`
   - billing: none
   - includes:
     - connect GitHub/Convex/Railway with user credentials
     - run BYO workflows
   - excludes:
     - Noter-managed paid infrastructure/agent credits
2. Pro
   - price: `$20/month` (plus optional annual SKU)
   - billing: Paddle subscription
   - includes:
     - managed premium experience toggle
     - future monthly credits (phase 2)
3. Team
   - price: TBD (displayed as “Coming soon” in phase 1)
   - billing: deferred
   - includes: shared credits/admin controls (future)

## Credits Data Model (forward plan)

Add when metering starts:

1. `billingCreditBalances`
   - `userId`
   - `plan`
   - `balance`
   - `updatedAt`
2. `billingCreditLedger`
   - `userId`
   - `eventType` (`grant_monthly` | `consume` | `topup` | `adjust`)
   - `creditsDelta`
   - `costUsd` (optional, for transparency)
   - `source` (action identifier)
   - `occurredAt`
3. `billingUsageSamples`
   - normalized usage snapshots for analytics and pricing calibration

Credit formula (target):

`creditsConsumed = ceil((llmCostUsd + infraCostUsd + thirdPartyCostUsd) / usdPerCredit)`

Where `usdPerCredit` is fixed and shown to users in pricing/billing UI.

## Rollout Plan

1. Phase A: Logged-in `/pricing` page with sandbox checkout
   - three cards and toggle
   - localized previews
   - Pro checkout enabled
   - Team card disabled/coming-soon
2. Phase B: webhook-backed entitlement activation (spec 028 integration)
3. Phase C: usage capture + read-only transparency UI
4. Phase D: enforce credits + top-ups

## Validation Checklist

1. Anonymous users cannot access `/pricing` (see sign-in view instead).
2. Approved logged-in users can access `/pricing`.
3. Monthly/annual toggle updates displayed localized amounts.
4. Sandbox checkout opens for Pro and can complete with test cards.
5. No entitlement is granted from client callback alone.
6. Webhook signature verification rejects tampered payloads.
7. Sandbox/live token mismatch shows expected “Test Mode”/environment behavior.

## Risks and Mitigations

1. Risk: underpricing before cost visibility.
   - Mitigation: launch at `$20`, defer `$10` until telemetry validates margin.
2. Risk: customer confusion about free vs managed.
   - Mitigation: explicit “BYO vs managed” copy on each card.
3. Risk: checkout success race condition.
   - Mitigation: treat webhook state as entitlement authority.
4. Risk: poor trust in usage billing.
   - Mitigation: ship transparent ledger before hard enforcement.

## Open Product Decisions

1. Should Team be visible as “Coming soon” or hidden until sellable?
2. Annual discount percentage for Pro.
3. Whether to run temporary `$10` founding price and for how long.
4. Credits rollover policy (none / limited / full).
5. Over-limit behavior (hard stop vs controlled overage billing).

## References

### Paddle (official)

1. https://developer.paddle.com/build/checkout/build-pricing-page
2. https://developer.paddle.com/paddlejs/client-side-tokens
3. https://developer.paddle.com/paddlejs/include-paddlejs
4. https://developer.paddle.com/paddlejs/methods/paddle-initialize
5. https://developer.paddle.com/paddlejs/methods/paddle-pricepreview
6. https://developer.paddle.com/paddlejs/methods/paddle-checkout-open
7. https://developer.paddle.com/build/checkout/build-overlay-checkout
8. https://developer.paddle.com/build/tools/sandbox
9. https://developer.paddle.com/build/subscriptions/provision-access-webhooks
10. https://developer.paddle.com/webhooks/signature-verification

### Pricing benchmarks (official)

1. https://www.cursor.com/en/pricing
2. https://github.com/features/copilot/plans
3. https://replit.com/pricing
4. https://vercel.com/blog/updated-v0-pricing
5. https://lovable.dev/pricing
