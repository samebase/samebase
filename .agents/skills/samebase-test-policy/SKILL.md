---
name: samebase-test-policy
description: >
  Choose the smallest useful Samebase tests, review test ownership and cost, validate feature
  changes, and triage unrelated unit, Convex, CI, or Playwright failures. Use when Codex adds or
  reviews tests, validates a feature, refactor, or bug fix, handles a test failure, or decides
  between focused and full Playwright runs in this repository.
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
- Run opt-in research suites only when the related research surface changes.

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
3. Report the test file and title, exact command, first actionable error, artifact location,
   ownership evidence, and whether it blocks CI.
4. Recommend a separate suite-health task.

An unrelated failure can block a merge. It must not expand every feature task into the same repair.

## Review test-heavy changes

For a pull request with substantial test additions, report each new or materially expanded test
group with:

- file and test title
- focused runtime, or command runtime when the runner has no per-test time
- distinct product contract
- existing owner checked
- recommendation: keep, merge, or delete

Do not use added line count as proof of value. Use it only to identify expensive review targets.

## Report completion

List the changed product contracts, their owner tests, focused commands and results, and measured
browser-test runtime. List any unrelated failures with the separate-task handoff. Do not claim that
the full suite passed when it did not run.
