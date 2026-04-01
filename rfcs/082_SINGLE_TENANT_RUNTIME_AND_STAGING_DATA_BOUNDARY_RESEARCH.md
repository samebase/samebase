# 082 Single-Tenant Runtime And Staging Data Boundary Research

## Document Control

- Status: Research note
- Owner: Noter product/backend
- Last updated: 2026-04-02
- Related specs:
  - `specs/015_BYO_CONVEX_OAUTH_AND_WORKTREE_PROVISIONING_SPEC.md`
  - `specs/055_STAGING_REBASE_CONFLICT_RESOLUTION_SPEC.md`
  - `specs/069_GITHUB_MEDIA_UPLOADS_SPEC.md`

## Purpose

Capture two linked strategic product thoughts that should guide future
architecture decisions:

1. Noter should eventually have an open-source single-tenant runtime that lets
   one Noter server run on-prem or otherwise under a customer's control.
2. The main compliance blocker in the current hosted model is that staged file
   data lives in Noter's own Convex/database layer instead of staying entirely
   inside the customer's Convex instance.

This is a strategy note, not an accepted implementation plan.

## Strategic Product Boundary

The intended long-term boundary is:

- open source: a single-tenant Noter backend/runtime that a customer can run
  themselves, including on-prem
- closed source: the Noter-managed multi-tenant control plane and any
  architecture that lets many customer workspaces share one hosted Noter backend
  operated by us

That boundary is acceptable product-wise because users are still free to manage
Noter themselves if they want full control. What is not promised is a packaged
open-source version of Noter's own shared multi-tenant hosted service.

Another way to say it:

- "Run your own Noter server" should eventually be possible.
- "Run our exact multi-tenant hosted backend on one shared Convex instance" does
  not need to be provided as an open product.

## Why This Matters For Compliance

Using Convex as a vendor helps only for the parts of the system that Convex
operates. It does not remove Noter from the compliance scope when customer data
still passes through and is stored in Noter's own application backend.

The most important current example is staged file data.

Today, when staged content is stored in Noter's Convex/database layer:

- customer repository content is copied into infrastructure that we operate
- we become responsible for the security and compliance posture of that staged
  content path
- "Convex has SOC 2" is helpful vendor evidence, but it does not mean Noter can
  inherit compliance automatically

So the main compliance issue is not merely that Convex is involved. The issue is
that staged customer data is resident in our backend at all.

## Architectural Implication

If the staging/backend layer were exported so it runs inside the customer's own
Convex instance, then the data boundary changes materially:

- staged repository data stays on their Convex instance
- the most sensitive uncommitted working state does not need to be copied into
  Noter's hosted database
- Noter can act more like a product/UI/control layer over customer-owned state
  instead of the custodian of that state

This is the strongest architecture direction if the goal is to improve the
compliance story around staged data residency.

## Main Tension

The problem with "export the backend as a Convex component" is that the
component would likely contain most or all of the real backend logic.

That creates an obvious product/IP tradeoff:

- the more complete the exported component is, the better the compliance and
  data-boundary story becomes
- but the more complete the exported component is, the easier it becomes for
  someone to copy the backend behavior

So the architecture question is not only "how do we keep customer data in their
tenant?" It is also "what is the smallest backend surface we can export without
accidentally giving away the whole hosted product?"

## Current Direction

For now, the clearest strategic stance is:

1. eventual open-source self-hosted Noter should target the single-tenant case
2. Noter's shared hosted multi-tenant backend can remain proprietary
3. staged data location is the core compliance lever, not merely vendor branding
4. exporting backend logic into the customer's Convex tenant improves the data
   boundary, but may expose too much of the backend to be the right packaging
   shape

## Open Questions

1. Which data classes must stay customer-local to make the compliance story
   meaningfully better:
   - `fileStaging`
   - collaborative editing state
   - chat/thread state
   - background job history
2. Can Noter keep a thin hosted control plane while pushing tenant data and
   tenant-executed logic into customer-owned Convex?
3. Is a Convex component actually the right packaging boundary, or should the
   self-hosted single-tenant runtime be distributed in a different form so the
   product boundary stays clearer?
4. Which hosted-only capabilities remain differentiated even if single-tenant
   runtime becomes open source?

## Working Principle

If we want a credible compliance story, the first question should be:

"Whose database stores the user's uncommitted work?"

As long as the answer is "Noter's hosted backend," compliance pressure remains
primarily ours. If the answer becomes "the customer's own Convex instance," the
product boundary gets much cleaner.
