# 098 Polar Monthly Billing Launch Plan

## Document Control

- Status: Active implementation tracker
- Owner: Samebase platform
- Last updated: 2026-08-02
- Accepted contract: `specs/118_POLAR_MONTHLY_BILLING_SPEC.md`
- Integration branch: `codex-polar-monthly-billing`
- Lifecycle: Update this file during the rollout. Archive it after production launch.

## Current State

The goal is one working monthly offer and the first paying customer. The accepted product is Free at
5 Workers and 5 Convex projects, and Pro at $4 per month for 40 of each.

The repository has an old Polar scaffold, but billing is not ready for a customer:

- [x] The current product contract is accepted and recorded.
- [x] The compaction-safe rollout tracker exists.
- [ ] Checkout has a configured Sandbox monthly product.
- [ ] Checkout has the production monthly product ID wired at the final gate.
- [ ] Webhook field handling matches the installed Polar SDK.
- [ ] Customer-state parsing matches the current Polar response.
- [ ] Billing state is safe for duplicate, out-of-order, invalid, and malformed events.
- [ ] The account page shows plan, usage, billing dates, and the correct action.
- [ ] The public pricing page shows the accepted Free and Pro offer.
- [ ] All Worker and Convex project attachment paths enforce 5 and 40.
- [ ] Automated tests cover the billing lifecycle and quota boundaries.
- [ ] A complete local Polar Sandbox flow has passed.
- [ ] Production configuration and the first real checkout are complete.

Old specs 033 and 034 are historical input. They do not override the accepted contract in spec 118.

## Decisions

- Monthly only, at $4 USD per month.
- No annual plan, usage billing, trial, FileView, add-ons, team plan, or seat billing.
- Cancellation keeps Pro until the paid period ends.
- Payment recovery keeps Pro while Polar grants entitlement.
- Entitlement end changes the plan to Free.
- A downgrade never removes existing resources. It blocks new attachments above the Free limit.
- Checkout return state is informational. Verified Polar state controls entitlement.
- Local development uses Polar Sandbox and CLI webhook forwarding.
- Pull request previews do not use real Polar checkout or webhooks.
- Production work stays last and requires operator approval.

## Workstreams

### 1. Contract and progress tracking

- [x] Record the accepted monthly plan and lifecycle rules.
- [x] Create this active tracker.
- [ ] Archive or clearly supersede old Polar specs and update direct references.

### 2. Polar backend

- [ ] Remove annual and unused billing paths.
- [ ] Pin and verify the Polar SDK version.
- [ ] Add one Sandbox and one production monthly product mapping.
- [ ] Fix webhook event field handling.
- [ ] Fix canonical customer-state parsing and active entitlement derivation.
- [ ] Keep checkout redirects separate from entitlement changes.
- [ ] Make webhook processing idempotent and safe for provider errors.
- [ ] Add a trusted reconciliation path for missed events.
- [ ] Keep account deletion cancellation fail-closed.
- [ ] Review trusted customer IP forwarding before production checkout.

### 3. Resource limits

- [ ] Count authoritative Worker and Convex project attachments separately.
- [ ] Enforce the active plan limit in every server attachment path.
- [ ] Make concurrent attachment attempts safe.
- [ ] Keep existing over-limit resources usable after downgrade.
- [ ] Return one clear limit error for the UI.

### 4. Customer UI

- [ ] Replace outdated public pricing copy with Free 5/5 and Pro 40/40 at $4 monthly.
- [ ] Add the account Billing section.
- [ ] Show separate current usage and limits.
- [ ] Add the monthly Upgrade action for Free.
- [ ] Add the Manage subscription action for Pro and payment recovery.
- [ ] Show checkout return and pending confirmation states without granting Pro.
- [ ] Add or update route-level screenshot coverage.

### 5. Automated validation and review

- [ ] Test successful checkout request construction without calling Polar.
- [ ] Test signed, duplicate, out-of-order, invalid, and malformed webhooks.
- [ ] Test active, canceled-at-period-end, payment recovery, and ended entitlement states.
- [ ] Test 5/6 and 40/41 boundaries for both resource types.
- [ ] Test downgrade while above the Free limit.
- [ ] Test account billing UI states and actions.
- [ ] Run the repository validation commands required by the changed surfaces.
- [ ] Complete independent backend, quota, frontend, and security reviews.
- [ ] Resolve all actionable review findings.

## Validation Matrix

| Area                              | Automated               | Local Sandbox     | Pull request preview  | Production        |
| --------------------------------- | ----------------------- | ----------------- | --------------------- | ----------------- |
| Checkout request and redirect     | Yes, mocked provider    | Yes, real Sandbox | No real Polar         | Final smoke check |
| Signed webhook and reconciliation | Yes                     | CLI forwarding    | No real Polar         | Stable webhook    |
| Account and pricing UI            | Yes                     | Yes               | Yes, controlled state | Yes               |
| 5/40 resource enforcement         | Yes                     | Yes               | Yes                   | Yes               |
| Portal and cancellation           | Provider boundary tests | Yes, real Sandbox | No real Polar         | Final smoke check |

## Sandbox

- [ ] Create one private Sandbox product named `Samebase Pro Monthly` at $4 per month.
- [ ] Record its product ID in the server-side Sandbox mapping.
- [ ] Set the Sandbox access token on the local Convex deployment.
- [ ] Start Samebase with `pnpm dev`.
- [ ] Forward Sandbox webhooks with Polar CLI to the printed local Convex site URL at
      `/webhooks/polar`.
- [ ] Set the CLI webhook signing secret on the local Convex deployment.
- [ ] Complete checkout with Polar's Sandbox test card.
- [ ] Confirm that a signed webhook changes Free to Pro without a database edit.
- [ ] Open the hosted customer portal.
- [ ] Cancel and confirm that Pro remains through the paid period.
- [ ] Confirm that entitlement end changes Pro to Free and applies the downgrade resource rule.
- [ ] Record the validation result and date in this section.

Never store an access token or webhook secret in this file, a commit, test output, or screenshot.

## Production Gate

Do not start this section until all automated work, independent reviews, and local Sandbox checks
are complete.

- [ ] Ask the operator to approve the exact production changes.
- [ ] Use the existing private production product `Samebase Pro Monthly` at $4 per month.
- [ ] Verify production product ID `efa4a7a9-ff34-4871-ac04-0c8a9355b751`.
- [ ] Set production Polar credentials only on the production Convex deployment.
- [ ] Register the stable production webhook endpoint and verify its signing secret.
- [ ] Verify the stable Samebase checkout and portal return URLs.
- [ ] Confirm Polar account approval, tax handling, and payouts are ready.
- [ ] Complete a controlled production smoke check without changing a customer record manually.
- [ ] Monitor the first real customer checkout, webhook, entitlement, and portal access.
- [ ] Reduce spec 118 to shipped contract details if necessary, then archive this tracker.

## Continuation Protocol

After a context compaction or handoff:

1. Read `specs/118_POLAR_MONTHLY_BILLING_SPEC.md` and this tracker first.
2. Check the integration branch, open pull request, active agents, commits, and working trees.
3. Continue the first incomplete workstream that is not blocked.
4. Keep the main task on coordination and acceptance. Delegate implementation, research, tests, and
   independent review to bounded agents in isolated worktrees.
5. Update this tracker after each merged checkpoint, completed validation, new defect, or blocker.
6. Do not reopen accepted decisions unless code, provider behavior, or the operator makes them
   impossible.
7. Leave all production changes until the Production Gate.
8. Stop for operator input only when access, a secret, production approval, or a new product
   decision is required.
