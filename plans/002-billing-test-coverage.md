# Plan 002: Add test coverage for the Polar billing money path

> **Executor instructions**: Follow this plan step by step. Run every verification command and
> confirm the expected result before moving to the next step. If anything in the "STOP conditions"
> section occurs, stop and report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat b75f8480a..HEAD -- apps/noter/convex/billing.ts apps/noter/convex/polarWebhooks.ts`
> If either file changed since this plan was written, compare the "Current state" excerpts against
> the live code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `b75f8480a`, 2026-06-11

## Why this matters

Billing is the only money-touching path in the app and has **zero test coverage**: neither
`billing.ts` nor `polarWebhooks.ts` has any test file. `deriveBillingFromCustomerState` decides
whether a user is `pro/active` or `free/inactive`, and `applyPolarCustomerState` writes that
decision onto the user row that gates paid features. A regression here silently downgrades or
upgrades users. These are pure functions plus one small internal mutation — the cheapest high-value
tests in the codebase.

This plan adds **characterization tests of current behavior only**. It makes no production code
changes.

## Current state

All paths relative to the repo root. There is no `billing.test.ts`, no `billing.convex.test.ts`, and
no `polarWebhooks.test.ts` (verified at the planned-at commit).

- `apps/noter/convex/billing.ts`:
  - `POLAR_PRODUCTS` (lines 66–79): product IDs are **empty-string placeholders** for both sandbox
    and production. `readOptionalProductId` (line ~83) trims and returns `null` for empty strings.
    Consequence: the pro-matching loop in `deriveBillingFromCustomerState` can never match today, so
    every derivation with a valid customer currently lands on `plan: "free", status: "inactive"`.
    Your tests must characterize exactly this behavior — do NOT "fix" the product IDs.
  - `deriveBillingFromCustomerState` (exported, lines 365–430). Behavior as written:
    - `customerState` not a record → `null`
    - `customerState.customer` not a record → `null`
    - `external_id` read from `customerState.external_id`, falling back to `customer.external_id`;
      neither present → `null`
    - `active_subscriptions` not an array →
      `{ externalCustomerId, plan: "free", status: "inactive" }`
    - subscriptions whose `product_id` matches a configured pro product →
      `{ plan: "pro", status: "active", currentPeriodEndAt? }` where `currentPeriodEndAt` is
      `Date.parse(current_period_end)` when finite, else `undefined` — **unreachable today** (empty
      product config)
    - otherwise (loop falls through) → `{ externalCustomerId, plan: "free", status: "inactive" }`
  - `applyPolarCustomerState` internal mutation (lines 230–254):

    ```ts
    export const applyPolarCustomerState = internalMutation({
      args: vPolarApplyStateArgs,
      returns: nullValue(),
      handler: async (ctx, args) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_polar_external_customer_id", (q) =>
            q.eq("billingPolarExternalCustomerId", args.externalCustomerId),
          )
          .unique();
        if (!user) {
          return null;
        }

        await ctx.db.patch(user._id, {
          billingProvider: "polar",
          billingPlan: args.plan,
          billingStatus: args.status,
          billingUpdatedAt: Date.now(),
          billingCurrentPeriodEndAt: args.currentPeriodEndAt,
        });

        return null;
      },
    });
    ```

    Check `vPolarApplyStateArgs` in the live file for the exact arg names and allowed literals
    (`plan`/`status` are validator-constrained literals).

- `apps/noter/convex/polarWebhooks.ts` — the webhook httpAction. Its helpers
  (`readExternalCustomerIdFromEvent`, `inferPolarServer`, `getPolarApiBaseUrl`) are module-private.
  Do NOT export them for tests; the repo guardrails forbid reshaping production code for tests. The
  webhook's decision logic is covered transitively via `deriveBillingFromCustomerState` +
  `applyPolarCustomerState`.

- Repo test conventions:
  - Pure-function tests: see `apps/noter/convex/fileStaging.test.ts` — plain
    `import { describe, expect, it } from "vite-plus/test"` and direct imports from the module under
    test.
  - Convex-backend tests: see `apps/noter/convex/users.convex.test.ts` — `makeConvexTest()` from
    `./test.setup`, `t.run(...)` to seed rows, `t.mutation(internal....)` / `t.query(api....)` to
    call functions.
  - The `users` table has the `by_polar_external_customer_id` index on
    `billingPolarExternalCustomerId` (see `apps/noter/convex/schema.ts`, users table) — seed that
    field directly with `t.run`.

## Commands you will need

| Purpose              | Command                          | Expected on success |
| -------------------- | -------------------------------- | ------------------- |
| Install              | `pnpm install --frozen-lockfile` | exit 0              |
| Typecheck + lint     | `pnpm check:ci`                  | exit 0              |
| Convex project tests | `pnpm test:convex`               | exit 0, all pass    |
| All tests            | `pnpm test`                      | exit 0, all pass    |

## Scope

**In scope** (the only files you should create/modify):

- `apps/noter/convex/billing.test.ts` (create — pure function tests)
- `apps/noter/convex/billing.convex.test.ts` (create — mutation tests)

**Out of scope** (do NOT touch):

- `apps/noter/convex/billing.ts` and `apps/noter/convex/polarWebhooks.ts` — no production changes in
  this plan; in particular do not fill in `POLAR_PRODUCTS` and do not export private helpers.
- `createPolarCheckoutSession` / `syncViewerBillingFromPolar` actions — they call external Polar
  APIs; out of this plan's scope.

## Git workflow

- Branch: `advisor/002-billing-test-coverage`
- One commit; subject e.g. `Add billing derivation and apply-state tests`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Pure tests for `deriveBillingFromCustomerState`

Create `apps/noter/convex/billing.test.ts` modeled on `fileStaging.test.ts`. Import
`deriveBillingFromCustomerState` from `./billing`. Cases (one `it` each, both `server: "sandbox"`
unless noted):

1. non-record input (`null`) → `null`
2. `{ customer: "nope" }` → `null`
3. customer record without any `external_id` → `null`
4. `external_id` present on the root `customerState` → used
5. `external_id` only on `customer` → fallback used
6. valid customer, `active_subscriptions` missing →
   `{ externalCustomerId, plan: "free", status: "inactive" }`
7. valid customer,
   `active_subscriptions: [{ product_id: "prod_x", current_period_end: "2026-01-01T00:00:00Z" }]` →
   still `free/inactive` (product IDs are unconfigured placeholders — add a one-line comment in the
   test naming this constraint, e.g.
   `// POLAR_PRODUCTS ships empty product ids, so no subscription can match "pro" yet`)
8. same as 7 with `server: "production"` → same result

**Verify**: `pnpm test:convex` → exit 0, 8 new tests pass.

### Step 2: Convex tests for `applyPolarCustomerState`

Create `apps/noter/convex/billing.convex.test.ts` modeled on `users.convex.test.ts`
(`makeConvexTest`, `t.run`, then
`await t.mutation(internal.billing.applyPolarCustomerState, {...})`). Check `vPolarApplyStateArgs`
in `billing.ts` first and pass exactly those fields. Cases:

1. **Matching user is patched**: seed a user via `t.run` with
   `billingPolarExternalCustomerId: "cust-1"` (plus minimal required user fields — copy the seed
   shape from `users.convex.test.ts`). Call the mutation with `externalCustomerId: "cust-1"`, a
   valid plan/status pair, and a `currentPeriodEndAt` number. Read the user back with `t.run` and
   assert `billingProvider === "polar"`, the plan/status/periodEnd match, and `billingUpdatedAt` is
   a number.
2. **Unknown external customer is a no-op**: call with `externalCustomerId: "cust-missing"` →
   resolves to `null`; assert the seeded user row is unchanged.

**Verify**: `pnpm test:convex` → exit 0, 2 new tests pass.

### Step 3: Full gate

**Verify**: `pnpm test` → exit 0. `pnpm check:ci` → exit 0.

## Test plan

This plan IS the test plan: 8 pure cases (Step 1) + 2 Convex cases (Step 2), following
`fileStaging.test.ts` and `users.convex.test.ts` as structural patterns.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0; `billing.test.ts` and `billing.convex.test.ts` exist and their 10 tests
      pass
- [ ] `pnpm check:ci` exits 0
- [ ] `git diff --stat` shows changes ONLY to the two new test files
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `POLAR_PRODUCTS` no longer contains empty-string product IDs (cases 7–8 would then be wrong — the
  derivation logic has been activated and the expected results must be re-derived from the live
  code).
- `deriveBillingFromCustomerState` is no longer exported from `billing.ts`, or its signature
  changed.
- `vPolarApplyStateArgs` requires fields this plan does not describe and you cannot infer safe
  values from the validator itself.
- Seeding a `users` row fails schema validation twice — the users table shape has drifted; report
  the validator error.

## Maintenance notes

- When real Polar product IDs land in `POLAR_PRODUCTS`, cases 7–8 will fail by design — replace them
  with pro-path tests (match by the configured `product_id`, assert `plan: "pro"`,
  `status: "active"`, and the parsed `currentPeriodEndAt`). Consider passing product IDs into
  `deriveBillingFromCustomerState` as an argument at that point so the pro path is testable without
  env coupling.
- The webhook httpAction (`handlePolarWebhook`) signature-validation path stays untested here (it
  delegates to `@polar-sh/sdk`'s `validateEvent`); if webhook regressions become a concern, a
  follow-up can wire a standardwebhooks-signed fixture through `t.fetch`.
