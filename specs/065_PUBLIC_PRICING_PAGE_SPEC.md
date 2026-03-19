# 065 Public Pricing Page Spec

## Document Control

- Status: Proposed
- Owner: Noter product
- Last updated: 2026-03-20
- Related specs:
  - `specs/033_POLAR_BILLING_SPEC.md`
  - `specs/034_POLAR_BILLING_PHASED_ROLLOUT_SPEC.md`
  - `specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md`
- Related files:
  - `apps/noter/src/App.tsx`
  - `apps/noter/src/SignInForm.tsx`
  - `apps/noter/src/components/PricingPage.tsx`
  - `apps/noter/src/lib/pageMetadata.ts`
  - `apps/noter/src/lib/pricingContent.ts`

## Summary

Add a public, indexable pricing page that reflects the current founder-led
commercial motion:

1. `Free` is the default plan.
2. The only paid option shown publicly is `$4.99/month`.
3. The paid path is transparent and invite-first: users request access rather
   than checking out.

This spec is about the public pricing surface and route architecture first. It
does not require immediate checkout automation.

## Why This Spec Exists

The current product surface does not match the pricing story:

- `/pricing` is currently authenticated-only.
- The current UI still presents `Pro` at `$20/mo`, annual pricing, and a future
  `Team` tier.
- The self-serve checkout framing does not match the trust-first startup motion.

We need the public site to explain pricing truthfully before sign-in.

## Goals

1. Make pricing visible to signed-out visitors at a canonical public route.
2. Present `Free` as the default plan.
3. Present one paid plan only: `$4.99/month`.
4. Make the paid CTA honest: the next step is private access entry, not checkout.
5. Separate public pricing discovery from authenticated billing-management UI.
6. Remove public-facing references to annual billing and team pricing.
7. Keep early access transparent while scaling remains controlled.

TODO(2026-04-20): Replace manual founder-invite onboarding with intro-call
booking after we are confident in stability and can support broader manual scheduling.

## Non-Goals

1. Launching a full automated checkout today.
2. Deciding final payment collection implementation for `$4.99/month`.
3. Launching team pricing.
4. Launching annual billing.
5. Reworking the underlying Polar entitlement engine in this same slice.
6. Implementing post-checkout operations.
7. Releasing intro-call onboarding before 2026-04-20.

## Product Model

### Free

- Price: `Free`
- Positioning: default, self-serve entrypoint
- Intended use:
  - explore Noter
  - use the public landing and email milestone updates
  - avoid private repo operations before trust verification
- Primary CTA label: `Start free`

### Private Code Access

- Price: `$4.99/month`
- Positioning: private-code access for trusted/manual onboarding
- Requirements:
  - invite-first onboarding during the initial trust phase
  - paid CTA captures interest and milestones updates
  - founder validation before adding Noter to a private GitHub organization
  - direct private-repo work only after trust confirmation
- Primary CTA label: `Join private access list`
- Required supporting copy:
  - `Private access is currently invite-only while we validate private-code workflows.`
  - `We use a founder-led private onboarding flow before GitHub org invite.`
- TODO(2026-04-20): Reintroduce explicit intro-call language once the process is live.

The public page must not imply that clicking the paid CTA starts an immediate
subscription checkout.

## Route And Information Architecture

### Public route

Canonical pricing route: `/pricing`

Requirements:

1. `/pricing` must render for signed-out visitors.
2. `/pricing` must be indexable (`robots: index,follow`).
3. `/pricing` must be reachable from the public landing experience.
4. The page content must be the same core pricing story for both signed-out and
   signed-in viewers.
5. Public copy must show invite-first paid onboarding status.

### Authenticated billing-management route

Authenticated billing management moves to `/billing`.

Requirements:

1. `/billing` is for account-level subscription state and billing operations.
2. `/billing` remains non-indexed.
3. Existing authenticated surfaces that are about managing a subscription should
   link to `/billing`, not `/pricing`.
4. Upsell surfaces about plan discovery may still link to `/pricing`.

This separation keeps `/pricing` clean and public without coupling it to the
current authenticated Polar UI.

## Content Contract

The public page should use only two plan cards.

### Card 1

- Heading: `Free`
- Price label: `Free`
- Badge: `Default`
- Example bullets:
  - `Try Noter before granting any private repo access.`
  - `No intro call required for Free.`
  - `Best for exploring and planning milestone progress.`
- CTA: `Start free`

### Card 2

- Heading: `Private Code Access`
- Price label: `$4.99/month`
- Badge: `Invite-first`
- Example bullets:
  - `Invite-only for now, while we validate direct private-code work.`
  - `Sign up for milestone updates and private access instructions.`
  - `Noter can inspect private code only after founder confirmation.`
- CTA: `Join private access list`

### Removed public elements

The public page must not show:

- annual/monthly toggle
- `Pro` as the public plan name
- `Team` card
- `Coming soon` team billing copy
- immediate checkout or customer-portal CTAs

## CTA Behavior

### Start free

- Leads into the existing public landing and sign-in/waitlist path.
- Preferred destination: `/`.

### Join private access list

- Opens one explicit destination for founder-led intake (example: milestones intake
  endpoint or explicit email).
- The implementation must use one exact URL, not a fallback chain.
- No checkout should occur from `/pricing` in this phase.

## Metadata And SEO

Add dedicated public metadata for `/pricing`:

- Title: `Pricing | Noter`
- Description:
  `Free by default. $4.99/month for private-code access with transparent invite-based onboarding.`
- Canonical path: `/pricing`
- Robots: `index,follow`

`/billing` should continue to use private-app metadata:

- Title: `Billing | Noter`
- Robots: `noindex,nofollow`

## Implementation Outline

1. Add a dedicated public pricing component for `/pricing`.
2. Move the current authenticated billing-management component off `/pricing`
   onto `/billing`.
3. Replace the public pricing content model:
   - remove annual toggle requirements from the public page
   - remove the public `Team` card
   - replace `$20/mo` display copy with `$4.99/month`
   - show invite-first and milestone messaging on the private plan CTA
4. Update page metadata so `/pricing` is public SEO content and `/billing` is
   private app content.
5. Add a pricing link from the public landing experience.
6. Update existing authenticated `Pricing` links that mean `manage billing` to
   point at `/billing`.
7. Add a dated implementation TODO with `2026-04-20` to revisit intro-call flow.

## Relationship To Existing Polar Billing

The current Polar implementation remains useful as a private billing-management
mechanism, but it is no longer the public source of truth for pricing copy.

For this slice:

1. Public `/pricing` does not start Polar checkout.
2. Public `/pricing` does not expose customer-portal actions.
3. Existing Polar actions and entitlement logic can remain behind `/billing`
   until the manual `$4.99/month` operational flow is finalized.
4. Public pricing copy must remain founder-first and transparent while scaling.

This keeps public pricing messaging accurate without forcing immediate backend
billing rework in the same patch.

## Acceptance Criteria

1. A signed-out visitor can open `/pricing` directly and see the pricing page.
2. The page is indexable and has public pricing metadata.
3. `Free` is visually presented as the default entrypoint.
4. The only public paid price shown is `$4.99/month`.
5. The paid option clearly states invite-first private onboarding status.
6. The public page contains no annual toggle, no `Team` card, and no `$20/mo`
   copy.
7. Authenticated billing-management operations remain available at `/billing`.
