# 098 Polar Monthly Billing Launch Plan

## Document Control

- Status: Active implementation tracker
- Owner: Samebase platform
- Last updated: 2026-08-02
- Accepted contract: `specs/119_POLAR_MONTHLY_BILLING_SPEC.md`
- Integration branch: `codex-polar-monthly-billing`
- Lifecycle: Update this file during the rollout. Archive it after production launch.

## Current State

The goal is one working monthly offer and the first paying customer. The accepted product is Free at
5 Workers and 5 Convex projects, and Pro at $4 per month for 40 of each.

The repository has an old Polar scaffold, but billing is not ready for a customer:

- [x] The current product contract is accepted and recorded.
- [x] The compaction-safe rollout tracker exists.
- [x] Checkout has a configured Sandbox monthly product.
- [ ] Checkout has the production monthly product ID wired at the final gate.
- [x] Webhook field handling matches the installed Polar SDK.
- [x] Canonical subscription-list parsing matches the current Polar response.
- [x] Billing state is safe for duplicate, out-of-order, invalid, and malformed events.
- [x] The account page shows plan, usage, billing dates, and the correct action.
- [x] The public pricing page shows the accepted Free and Pro offer.
- [x] All Worker and Convex project attachment paths enforce 5 and 40.
- [x] Automated tests cover the billing lifecycle and quota boundaries.
- [x] The required local Polar Sandbox lifecycle has passed.
- [ ] Production configuration and the first real checkout are complete.

The Sandbox lifecycle is complete for checkout, signed webhooks, portal access, cancellation, and
entitlement end. The Polar `past_due` provider simulation is still unresolved. All production
configuration stays pending until the operator gives explicit approval.

The final simplicity pass uses one rule: prefer a visible failure and a short operator procedure to
a complex automatic recovery system.

- [x] Process signed webhooks directly, return an error on provider or write failure, and rely on
      Polar delivery retries.
- [x] Keep only issued and applied observation revisions to reject stale provider reads.
- [x] Remove the webhook coordinator, local retry ladder, leases, watchdogs, and period-based
      downgrade jobs.
- [x] Keep only `pending` and `open` checkout markers. Do not clear ambiguous provider work by time.
- [x] Remove resource-capacity reservations and recovery jobs. Keep bounded preflight checks and
      final transactional attachment checks.
- [x] Finish the checkout marker repair mutations and clear verified terminal checkouts.
- [x] Preserve quota and provider-orphan cleanup instructions through managed provisioning.
- [x] Complete the final cross-review after these small fixes.

- [ ] Remove `billingPolarStateChangedAt` only after production rows are verified or migrated. It
      remains an optional compatibility field until that check is complete.

Old specs 033 and 034 are historical input. They do not override the accepted contract in spec 119.

## Decisions

- Monthly only, at $4 USD per month.
- No annual plan, usage billing, trial, FileView, add-ons, team plan, or seat billing.
- Cancellation keeps Pro until the paid period ends.
- Payment recovery keeps Pro while Polar grants entitlement.
- Entitlement end changes the plan to Free.
- A downgrade never removes existing resources. It blocks new attachments above the Free limit.
- Checkout return state is informational. Verified Polar state controls entitlement.
- Visible failures and manual repair are preferred to automatic recovery coordinators.
- Local development uses Polar Sandbox and CLI webhook forwarding.
- Pull request previews do not use real Polar checkout or webhooks.
- Production work stays last and requires operator approval.

## Workstreams

### 1. Contract and progress tracking

- [x] Record the accepted monthly plan and lifecycle rules.
- [x] Create this active tracker.
- [x] Archive or clearly supersede old Polar specs and update direct references.

### 2. Polar backend

- [x] Remove annual and unused billing paths.
- [x] Pin and verify the Polar SDK version.
- [x] Add the Sandbox monthly product mapping.
- [ ] Add the production monthly product mapping only after operator approval.
- [x] Fix webhook event field handling.
- [x] Fix canonical subscription-list parsing and active entitlement derivation.
- [x] Keep checkout redirects separate from entitlement changes.
- [x] Make webhook processing idempotent and safe for provider errors.
- [x] Add a trusted reconciliation path for missed events.
- [x] Use the existing compare-and-swap marker mutations for a stuck checkout after manual Polar
      inspection.
- [x] Keep account deletion cancellation fail-closed.
- [x] Review trusted customer IP forwarding before production checkout. Convex cannot provide a
      documented trusted buyer IP. The hosted checkout requires the customer to confirm country. A
      later trusted Cloudflare request boundary can improve country and currency prefill.

### 3. Resource limits

- [x] Count authoritative Worker and Convex project attachments separately.
- [x] Enforce the active plan limit in every server attachment path.
- [x] Keep the final local attachment count and insert in one transaction.
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
- [x] Run the repository validation commands required by the changed surfaces.
- [x] Complete independent backend, quota, frontend, and security reviews.
- [x] Resolve the final actionable review findings.

## Validation Matrix

| Area                              | Automated               | Local Sandbox     | Pull request preview  | Production        |
| --------------------------------- | ----------------------- | ----------------- | --------------------- | ----------------- |
| Checkout request and redirect     | Yes, mocked provider    | Yes, real Sandbox | No real Polar         | Final smoke check |
| Signed webhook and reconciliation | Yes                     | CLI forwarding    | No real Polar         | Stable webhook    |
| Account and pricing UI            | Yes                     | Yes               | Yes, controlled state | Yes               |
| 5/40 resource enforcement         | Yes                     | Yes               | Yes                   | Yes               |
| Portal and cancellation           | Provider boundary tests | Yes, real Sandbox | No real Polar         | Final smoke check |

## Sandbox

Current state on 2026-08-02: The Polar Sandbox organization is `Samebase`, with slug `samebasecom`.
It has one private product named `Samebase Pro Monthly` at $4 USD per month. The product ID is
`cfe54f3c-2e34-48b9-9a32-6b6a8a3ea0bd`. The product has no trial, benefits, or metadata. The Sandbox
organization, product, app organization token, server-side product mapping, and local webhook
signing secret are configured.

- [x] Create the Sandbox organization `Samebase` with slug `samebasecom`.
- [x] Create one private Sandbox product named `Samebase Pro Monthly` at $4 per month.
- [x] Set product ID `cfe54f3c-2e34-48b9-9a32-6b6a8a3ea0bd` in the server-side Sandbox mapping.
- [x] Set the Sandbox app organization token on the local Convex deployment.
- [x] Start Samebase with `pnpm dev`.
- [x] Forward Sandbox webhooks with Polar CLI to the printed local Convex site URL at
      `/webhooks/polar`.
- [x] Set the CLI webhook signing secret on the local Convex deployment.
- [x] Complete one $4 monthly checkout with Polar's Sandbox test card.
- [x] Confirm that a signed webhook changes Free to Pro without a database edit.
- [x] Open and confirm the hosted customer portal.
- [ ] Simulate a failed renewal and confirm that Polar exposes payment recovery as an active
      entitlement before Samebase relies on the `past_due` mapping.
- [x] Cancel at period end and confirm that Pro stays active and the UI shows `Access ends`.
- [x] Use an immediate Sandbox revoke to confirm that a signed webhook changes Pro to Free, shows
      quotas of 5 Workers and 5 Convex projects, and does not require a database edit.
- [x] Record the validation result and date in this section.

Validation result on 2026-08-02:

- One $4 monthly checkout completed. A signed webhook changed Samebase from Free to Pro without a
  database edit.
- The hosted customer portal opened and showed the active subscription.
- Cancel at period end kept Pro active and showed the `Access ends` date in Samebase.
- An immediate Sandbox revoke sent a signed webhook. Samebase changed to Free and showed quotas of 5
  Workers and 5 Convex projects without a database edit.
- The Polar provider simulation for `past_due` is still unresolved.

The live run found three bugs. Each bug has a fix on the integration branch:

- `f0e599ea` makes Polar webhook signature verification work in the Convex V8 runtime.
- `a96b0b82` validates return and success URLs when Samebase recovers an open checkout.
- `11673376` waits for Convex authentication and makes checkout return reconciliation reliable.

Sandbox runbook notes:

- The Polar CLI login token and the app organization token are different tokens. Use the app
  organization token for the Samebase server connection.
- A new Polar CLI listener can provide a new webhook signing secret. If it does, set the new secret
  on the current local Convex deployment before the next webhook test.

Never store an access token or webhook secret in this file, a commit, test output, or screenshot.

## Operator Repair

Use these procedures only after the normal provider call or Polar retry did not resolve the state.
If any identifier or provider result is uncertain, leave the local state unchanged.

### Failed webhook delivery

1. Open the failed delivery in Polar and read the exact customer external ID from its payload.
2. Read the Convex log for `/webhooks/polar` at the same delivery time and identify the failure.
3. Inspect that customer and its `Samebase Pro Monthly` subscription in Polar.
4. Fix the provider, credential, or data problem that caused the non-2xx response.
5. Run the internal `polarBillingState:reconcileCustomerFromPolar` action with the exact external
   customer ID.
6. Verify the user billing row and the Settings Billing section.
7. If Polar disabled the webhook endpoint, re-enable it after the repair.

### Account deletion billing failure

1. Open the failed run in `/admin/account-deletions` and read its run ID and user ID.
2. Find `billing:polar:account_deletion_cancellation_failed` in the server log for that run ID.
3. Read `billingPolarExternalCustomerId` from the exact active user row. Inspect that customer and
   all of its subscriptions in Polar, then fix the provider, credential, or subscription problem.
4. Retry the same run from `/admin/account-deletions`.
5. Verify that the billing outcome succeeds before the run completes.

### Stuck checkout marker

1. Read the user ID, `billingPolarExternalCustomerId`, and `billingPolarCheckoutAttempt` from the
   exact user row.
2. Inspect the same customer in Polar. Match the product ID and the checkout metadata fields
   `source`, `plan`, and `samebase_checkout_attempt_id`.
3. Run one internal compare-and-swap mutation with the exact current identifiers:
   - Run `polarCheckout:clearPending` with the user ID and attempt ID only when Polar has no open,
     confirmed, or succeeded matching checkout.
   - Run `polarCheckout:recordOpen` with the user ID, attempt ID, and exact checkout ID when Polar
     has one open, confirmed, or succeeded matching checkout.
   - Run `polarCheckout:clearOpen` with the user ID, attempt ID, and exact checkout ID only when the
     checkout failed or expired.
4. For a confirmed or succeeded checkout, first run the canonical Polar reconciliation and verify
   that the user is Pro. The normal checkout reconciliation then clears the matching marker. If it
   does not, use `polarCheckout:clearOpen` only after that Pro check.

Each mutation returns `false` and makes no change when the current marker does not match the
expected attempt or checkout ID.

### Unattached provider resource

1. Read the Samebase error to identify the unused Worker or Convex project.
2. Verify that Samebase did not attach that exact provider resource.
3. Delete the unused resource in the provider dashboard.
4. Retry the Samebase operation after usage is below the plan limit.

## Production Gate

Do not start this section until all automated work, independent reviews, and local Sandbox checks
are complete.

Current state on 2026-08-02: All production configuration and production validation are pending. The
operator must approve the exact production changes before work starts.

- [ ] Ask the operator to approve the exact production changes.
- [ ] Use the existing private production product `Samebase Pro Monthly` at $4 per month.
- [ ] Verify production product ID `efa4a7a9-ff34-4871-ac04-0c8a9355b751`.
- [ ] Verify that no production user has the old `billingStatus` value `canceled` or `unknown`
      before the narrower schema deploys. Migrate only if such a row exists.
- [ ] Set production Polar credentials only on the production Convex deployment.
- [ ] Register the stable production webhook endpoint and verify its signing secret.
- [ ] Verify the stable Samebase checkout and portal return URLs.
- [ ] Confirm Polar account approval, tax handling, and payouts are ready.
- [ ] Complete a controlled production smoke check without changing a customer record manually.
- [ ] Monitor the first real customer checkout, webhook, entitlement, and portal access.
- [ ] Reduce spec 119 to shipped contract details if necessary, then archive this tracker.

## Continuation Protocol

After a context compaction or handoff:

1. Read `specs/119_POLAR_MONTHLY_BILLING_SPEC.md` and this tracker first.
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
- `a39682e2`: billing UI progress recorded in the rollout tracker.
- `0028b8ae`: expanded backend hardening checklist recorded.
- `844c0ee6`: quota reservation recovery review finding recorded.
- `1225cab3`: second backend hardening review findings recorded.
- `fd8c6fb5`: provider-create quota reservations, concurrency checks, and bounded usage state.
- `d983a78d`: exact provider-resource recovery consumes retained quota reservations.
- `b08651e4`: complete Cloudflare reservation identity matching and regression coverage.
- `dfbb094e`: typed bounded usage state connected to the billing UI.
- `207a800f`: quota hardening completion recorded in the rollout tracker.
- `5ad48bdc`: Polar observation fencing and checkout recovery state introduced.
- `f468f6ab`: ambiguous checkout, stored checkout, and webhook coalescing races closed.
- `c790e079`: account-deletion checkout race closed.
- `a3a2444c`: checkout eligibility enforced in Settings with updated mobile visual coverage.
- `9acb190e`: old Polar specs marked as superseded by the accepted contract and active rollout plan.
- `de1693bb`: Polar spec supersession recorded in the rollout tracker.
- `f0e599ea`: Convex V8-compatible Polar webhook signature verification.
- `a96b0b82`: recovered checkout return and success URL validation.
- `11673376`: checkout return authentication readiness and reconciliation.
- `feb8a81d`: one checkout return reconciliation with accurate pending copy.
- `6b4f95c1`: resource reservations and their recovery jobs removed.
- `7c90e1b6`: checkout state reduced to persistent `pending` and `open` markers.
- `f5bb8776`: signed webhook processing reduced to direct canonical reconciliation.
- `9959f26b`: canonical Polar subscription reads bounded to one complete page.
- `ca5a3411`: checkout eligibility uses canonical Polar subscription state.
- `9ac30915`: account deletion explains the checkout marker block.
- `651981f7`: the visible-failure and manual-repair rule recorded.
- `5f316ce3`: quota and provider-orphan guidance preserved through managed provisioning.
- `b0586150`: webhook timeout and Polar page integrity checks hardened.
- `c2f0278d`: exact checkout marker verification and terminal checkout clearing.
- `ea2dda8f`: successful checkout returns reconcile before URL cleanup.
- `0106d166`: billing reconciliation deduplicated and deletion customer ownership checked.
- `5d3c293f`: first-failure quota errors identify the exact unused provider resource.

Final automated validation on 2026-08-02 passed 44 Convex test files with 378 tests, 288 repository
test files with 2,226 tests and one skip, and 41 focused Settings tests. `pnpm check` also passed
with existing warnings. The canonical Linux browser suite passed with 208 tests and one existing
skip before the latest `main` merge. After the merge, two complete runs had unrelated timing
failures in three mobile editor or WebGL tests. Each exact failed test passed in an isolated Linux
rerun. The billing Settings browser tests passed in both complete post-merge runs.
