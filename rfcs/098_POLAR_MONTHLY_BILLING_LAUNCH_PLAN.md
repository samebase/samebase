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
- [x] Webhook field handling matches the installed Polar SDK.
- [x] Customer-state parsing matches the current Polar response.
- [x] Billing state is safe for duplicate, out-of-order, invalid, and malformed events.
- [x] The account page shows plan, usage, billing dates, and the correct action.
- [x] The public pricing page shows the accepted Free and Pro offer.
- [x] All Worker and Convex project attachment paths enforce 5 and 40.
- [ ] Automated tests cover the billing lifecycle and quota boundaries. Quota boundaries are
      complete; billing lifecycle coverage is in progress.
- [ ] A complete local Polar Sandbox flow has passed.
- [ ] Production configuration and the first real checkout are complete.

The first independent quota review failed on 2026-08-02. The follow-up fix is active:

- [ ] Reserve Worker capacity before a Cloudflare provider create call.
- [ ] Reserve Convex project capacity before a Convex provider create call.
- [ ] Keep final transactional attachment checks and safe reservation cleanup.
- [ ] Match and consume a retained provider-created reservation when the same external resource is
      attached after local record failure.
- [ ] Report usage above 41 honestly, either as an exact count or an explicit `41+` value.

The first independent backend review found four required fixes on 2026-08-02:

- [ ] Fence delayed webhooks against a newer canonical reconciliation result.
- [ ] Remove equal-millisecond webhook ordering ambiguity.
- [ ] Prevent concurrent or repeated open checkout sessions from creating duplicate subscriptions.
- [ ] Let pending users manage existing billing, but require approved dashboard access to buy Pro.

The second independent backend review found additional hardening work on 2026-08-02:

- [ ] Never issue a second checkout create after an ambiguous provider result without provider
      idempotency.
- [ ] Track issued and successfully applied provider observations separately so a failed later read
      cannot discard a valid earlier result.
- [ ] Fetch and validate a stored open checkout by provider ID before reuse, and do not store its
      access URL.
- [ ] Require exactly one configured Pro product in a recovered checkout.
- [ ] Coalesce duplicate webhook reconciliation work without losing a change that arrives during a
      provider read.
- [ ] Use `canStartCheckout` in Settings so a pending user does not see an action that the server
      rejects.

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

- [x] Remove annual and unused billing paths.
- [x] Pin and verify the Polar SDK version.
- [ ] Add one Sandbox and one production monthly product mapping.
- [x] Fix webhook event field handling.
- [x] Fix canonical customer-state parsing and active entitlement derivation.
- [x] Keep checkout redirects separate from entitlement changes.
- [x] Make webhook processing idempotent and safe for provider errors.
- [x] Add a trusted reconciliation path for missed events.
- [x] Keep account deletion cancellation fail-closed.
- [x] Review trusted customer IP forwarding before production checkout. Convex cannot provide a
      documented trusted buyer IP. The hosted checkout requires the customer to confirm country. A
      later trusted Cloudflare request boundary can improve country and currency prefill.

### 3. Resource limits

- [x] Count authoritative Worker and Convex project attachments separately.
- [x] Enforce the active plan limit in every server attachment path.
- [x] Make concurrent and multi-resource attachment attempts transactional.
- [x] Keep existing over-limit resources usable after downgrade.
- [x] Return one clear limit error for the UI.

### 4. Customer UI

- [x] Replace outdated public pricing copy with Free 5/5 and Pro 40/40 at $4 monthly.
- [x] Add the account Billing section.
- [x] Show separate current usage and limits.
- [x] Add the monthly Upgrade action for Free.
- [x] Add the Manage subscription action for Pro and payment recovery.
- [x] Show checkout return and pending confirmation states without granting Pro.
- [x] Add or update route-level screenshot coverage.

### 5. Automated validation and review

- [x] Test successful checkout request construction without calling Polar.
- [x] Test signed, duplicate, out-of-order, invalid, and malformed webhooks.
- [x] Test active, canceled-at-period-end, payment recovery, and ended entitlement states.
- [x] Test 5/6 and 40/41 boundaries for both resource types.
- [x] Test downgrade while above the Free limit.
- [x] Test account billing UI states and actions.
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
- [ ] Simulate a failed renewal and confirm that Polar exposes payment recovery as an active
      entitlement before Samebase relies on the `past_due` mapping.
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

## Integrated Checkpoints

- `089474ac`: accepted monthly billing contract and launch tracker.
- `6bde3c9c3`: server-side Worker and Convex project quotas, usage query, and quota tests.
- `43ca553ac`: quota completion recorded in the rollout tracker.
- `b957830b`: first independent quota review findings recorded.
- `f0d456d8`: monthly Polar billing core and lifecycle tests.
- `d4babaf9`: billing core completion recorded in the rollout tracker.
- `fdd859f5`: backend race review findings recorded.
- `a655c0e5`: pricing and Settings billing UI, tests, and Linux visual baselines.
