---
name: samebase-test-policy
description: >
  Choose the smallest useful Samebase tests, review test ownership and cost, validate feature
  changes, and triage unrelated unit, Convex, CI, or Playwright failures. Use when Codex adds or
  reviews tests, validates a feature, refactor, or bug fix, handles a test failure, decides between
  focused and full Playwright runs, asks whether a flaky test is relevant, prepares a test-health
  handoff, or runs a dedicated flaky-test investigation in this repository.
---

# Samebase Test Policy

## Core rule

Test each current product contract once at the lowest useful layer. A feature task owns failures
caused by its change. It does not own unrelated suite health.

For Samebase, use this skill as the source of truth for test admission, run scope, and failure
ownership. Use other testing skills for details such as locators, waits, and fixtures. Ignore a
general skill's full-suite or repeat-all-tests rule unless the user explicitly requests that scope.

## Select coverage

Before adding or expanding a test:

1. Name the current product contract that changed.
2. Search for the test that already owns that contract.
3. Update the existing owner when possible. Do not add a second owner for the same behavior.
4. Use the lowest layer that can prove the contract:
   - Use a unit test for pure logic and state changes.
   - Use a Convex test for data, authorization, and lifecycle rules.
   - Use a component interaction test for component integration that does not need a browser.
   - Use one real-route Playwright test for browser APIs, auth, history, storage, focus, touch,
     layout ownership, or route-shell behavior.
   - Use a screenshot assertion only when the rendered appearance is the contract.
5. Remove weaker duplicate coverage when a stronger existing test proves the same contract.

Do not add a test only because a component or file moved. When several routes share one component,
test the component behavior once and test only each route's distinct integration boundary. Do not
keep an inactive product route public only to satisfy a test.

For browser tests that change stored data, create isolated user, organization, and vault data. Clean
it up when the test can do so safely. Do not mutate a shared Playwright account and depend on test
order.

## Choose the run scope

- Run the focused tests that own the changed contracts during a feature task.
- Let pull request CI run its configured unit and Convex suites.
- Run `pnpm test:visual:linux -- <affected-spec>` for affected browser coverage.
- Run the unmodified `pnpm test:visual:linux` only for main CI, a dedicated Playwright suite-health
  task, or an explicit user request.
- Run `pnpm test:logo-research` only when logo research changes.
- Run `pnpm test:opt-in` only when an admin-only, dormant, or operator-owned surface changes.

A focused pass proves only the named tests. Report that scope exactly. The Linux wrapper remains the
required environment for accepted screenshot baselines.

## Classify a failure

Use one short ownership check before changing code:

1. Read the failure message and its first useful artifact.
2. Run the exact failing test once in isolation.
3. Check whether the branch changed the asserted contract or a dependency that directly controls
   it. Use base or main evidence when it is already available.
4. Stop the ownership check after five minutes if the cause is still unclear.

The five minutes cover classification from the first inspection to the ownership decision. They are
not open-ended research time and do not include the later fix for an owned failure.

Classify the failure as follows:

- **Owned:** The branch changed the asserted contract, or evidence shows a direct branch cause. Fix
  it in the current task and rerun the focused test.
- **Unrelated:** The failure also exists on base or main, depends on unrelated shared state or
  infrastructure, or has no causal link to the change.
- **Unclear:** The short check found no direct cause. Treat it as unrelated to the current task.

File distance alone does not decide ownership. For example, an authorization change can own an
unchanged test that asserts the changed authorization rule.

For an unrelated or unclear failure:

1. Do not change production code or weaken an expectation.
2. Do not rerun the full suite.
3. Emit every field in the required test-health handoff below.
4. Continue or finish the feature task. Do not investigate the unrelated failure further.

An unrelated failure can block a merge. It must not expand every feature task into the same repair.
The exact isolated run from the ownership check is the last allowed run in the feature task. Repeat
runs and comparison with main belong to the separate suite-health task.

## Hand off an unrelated failure

Give the user one ready-to-paste block:

```text
Investigate this test failure as a dedicated suite-health task. Use the samebase-test-policy skill.
Do not run the full suite. Diagnose first, and do not change code unless I also ask for a fix.

Test-health handoff
- Test: <file and exact title>
- Source task: <branch, pull request, or task URL>
- Exact command: <focused command>
- First error: <first actionable error>
- Artifact: <trace, screenshot, log, or none>
- Ownership: <unrelated or unclear>
- Evidence: <why the feature task does not own it>
- Merge impact: <non-blocking or blocks the pull request>
```

The feature-task response is incomplete without the full block. Do not replace it with a prose
summary or another investigation plan. Fill an unknown field with `not provided` so the missing
evidence remains visible.

If the user explicitly asks to start a separate task and a task-creation tool is available, create
that user-owned task with the block. Otherwise, print the block without asking the user to reconstruct
the failure context.

## Investigate one flaky test

In a dedicated suite-health task:

1. Read the handoff and the first failure artifact.
2. Name the current product contract that the test claims to protect.
3. Run only the exact test. Use up to five isolated runs when repeat evidence is necessary.
   Call the test flaky only when equivalent runs or recent CI evidence show both pass and fail
   outcomes.
4. Compare with main or a known-good commit when ownership or reproducibility is unclear.
5. Read the test history and find lower-layer or stronger browser owners.
6. Record focused runtime from the run or recent CI evidence.
7. Recommend exactly one result: `keep and fix`, `move lower`, `merge`, `delete`, `opt-in`, or
   `runner/infrastructure fix`.

Do not run the full suite to diagnose one flaky test. Do not change product behavior to satisfy an
obsolete or unrelated assertion. A research-only request stops after the evidence and recommendation.
Implement a change only when the user also asks for a fix or cleanup.

## Review test-heavy changes

For a pull request with substantial test additions, report each new or materially expanded test
group with:

- file and test title
- focused runtime, or command runtime when the runner has no per-test time
- distinct product contract
- existing owner checked
- recommendation: keep, merge, or delete

Do not use added line count as proof of value. Use it only to identify expensive review targets.

## Audit the existing suite

Use a dedicated suite-health task for a suite-wide audit. Do not run the complete suite only to
collect timing when recent main CI logs already contain the evidence.

When parallel read-only work is available, use three lanes:

1. Collect per-file and per-test runtime, repeated failure titles, and setup cost from recent main
   runs.
2. Map Playwright tests to current browser contracts and existing lower-layer owners.
3. Map unit, component, and Convex tests to current contracts and stronger existing owners.

Require every merge, delete, or opt-in recommendation to name the current contract, measured cost,
existing owner or obsolete product surface, and confidence. Rank browser time and repeated main
failures before line count. Keep security and data-integrity contracts unless a stronger test proves
the same boundary.

Group several high-confidence browser-cost reductions into one reviewable suite-health pull
request when they use the same ownership rule and validation method. Split the work only when a
change has a different risk boundary, such as security or data integrity. Record the measured cost
before and after the combined change.

## Report completion

List the changed product contracts, their owner tests, focused commands and results, and measured
browser-test runtime. List any unrelated failures with the separate-task handoff. Do not claim that
the full suite passed when it did not run.
