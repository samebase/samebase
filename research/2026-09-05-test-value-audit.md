# Test value audit, 2026-09-05

## Result

The audit supports a bounded cleanup, not a large test purge. The strongest findings are tests that
keep unused code alive, a stored repository file list, and duplicate browser checks. The
organization rollout remains complete. This audit does not add another rollout phase.

The review used three independent checks: recent CI cost, browser contract ownership, and
unit/component/backend contract ownership. Source searches and removal history confirmed the unused
code. The existing [test policy](../.agents/skills/samebase-test-policy/SKILL.md) controls test
selection. No new test framework or production behavior is needed.

## Evidence

The latest three completed main CI runs were
[33932549562](https://github.com/samebase/samebase/actions/runs/33932549562),
[33928743514](https://github.com/samebase/samebase/actions/runs/33928743514), and
[33927277069](https://github.com/samebase/samebase/actions/runs/33927277069).

- All three unit jobs passed: 353 files, 2,672 passing tests, and one skipped test. Test steps took
  49 to 52 seconds.
- Browser test steps used 321 to 332 runner-seconds across three shards. The slowest test step took
  135 to 140 seconds.
- Each browser shard repeated dependency installation, Convex setup, app build, and browser
  installation. Those steps took 9 to 12, 8 to 10, 21 to 24, and 18 to 60 seconds, respectively.
- The same two screenshot expectations failed in all three runs. This is repeated-failure evidence,
  not evidence of a flaky test.

These are observed run costs. They do not establish how much time a different CI design would save.

## Cleanup decisions

| Target                                              | Decision and reason                                                                                                                                                                             | Surviving owner or obsolete behavior                                                                                                                                                                                                                                                                                                                      | Observed cost before cleanup                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Simple-view file list and updater                   | Delete the 682-line path list, its updater, and repeated full-tree checks. The list checked only that old paths remained visible.                                                               | [Direct configuration cases](../apps/samebase/src/repository/editor/simpleView.test.ts#L302) still read the real root configuration. Inclusion, exclusion, folder pruning, pattern rules, preference compatibility, and the [live tracked-spec naming guard](../apps/samebase/src/repository/editor/simpleView.test.ts#L20) remain.                       | Whole file: 551 to 777 ms in CI. One local before/after pair: 451 ms for 34 tests, then 31 ms for 29 tests. |
| Old workspace sidebar model and test                | Delete both. Only the test imports the model after [the old shell was removed](https://github.com/samebase/samebase/commit/e4e512bbb26b08e54a92b1846c37b347de810db0).                           | Current [geometry](../packages/sidebars/test/geometry.test.ts#L64), [mobile layout](../packages/sidebars/test/layoutMobile.test.tsx#L402), and [browser carousel](../apps/samebase/e2e/workspace-sidebar-drag.spec.ts#L310) tests remain. The old velocity thresholds are obsolete, not current package rules.                                            | Ten removed tests: 2 to 3 ms.                                                                               |
| Old pull-request filter control, helpers, and tests | Delete the three unused frontend files. [The dashboard removed the caller](https://github.com/samebase/samebase/commit/f62fb16b6682c727fca86decd5e37fa218bd53dd).                               | [Spec090](../specs/090_DASHBOARD_TANSTACK_STORE_STATE_SPEC.md#document-control) already marks the control historical. The [provider-page test](../apps/samebase/src/repository/dashboard/useRepositoryPullRequests.test.tsx#L265) retains pagination and draft visibility coverage. Stored preferences and registered backend functions remain unchanged. | Eight removed tests: 3 to 4 ms.                                                                             |
| Cloudflare Worker versions helper and its test      | Delete the unused plain helper, return type, and one wrapper test. [The last runtime caller was removed](https://github.com/samebase/samebase/commit/81145b7d2a32186823452c7515b2d5ba2d79b350). | The [provider-schema test](../apps/samebase/convex/cloudflareApi/client.test.ts#L308) retains the exact nullable-envelope and version URL check. Generated provider schemas and registered functions remain unchanged.                                                                                                                                    | Individual test time unavailable. The original 65-test resource file took 73 to 83 ms.                      |
| Route-editor Escape check                           | Delete the duplicate test.                                                                                                                                                                      | The [retained-search replacement test](../apps/samebase/e2e/route-url-editor-next.spec.ts#L1424) performs the same route fill, Escape, display-value, and final URL checks, with an additional retained-search condition.                                                                                                                                 | 0.597 to 0.630 seconds.                                                                                     |
| Two gesture debug-overlay browser tests             | Move to the existing `@opt-in` suite. Keep all assertions.                                                                                                                                      | The [debug tests](../apps/samebase/e2e/workspace-sidebar-drag.spec.ts#L768) own development/local-host tools. Default browser tests still own mobile carousel, resize, and gesture behavior.                                                                                                                                                              | Together: 2.1 to 2.3 seconds.                                                                               |

Confidence is high for these decisions. The default browser reduction is about 2.7 to 2.9
runner-seconds in the observed runs. It is not a large critical-path improvement. Removing unused
code and maintenance work is the main benefit.

## Keep the screenshot owners

The
[latest browser artifact](https://github.com/samebase/samebase/actions/runs/33932549562/artifacts/9959117364)
shows two stale expectations:

- MCP consent sign-in: 796 pixels differ in the social-link row. The actual links match the
  intentional link changes in [PR1588](https://github.com/samebase/samebase/pull/1588). The route,
  auth controls, legal links, and geometry checks remain useful.
- Phone sidebar: 18,501 pixels differ. The fixture imports Spec072 as editor text. File-path changes
  from [PR1587](https://github.com/samebase/samebase/pull/1587) and
  [PR1589](https://github.com/samebase/samebase/pull/1589) changed wrapping. The coarse-pointer
  layout check remains useful.

Both captures were stable in the CI logs. The artifacts do not show a layout defect. This cleanup
does not change either baseline.

```text
Test-health handoff
- Test: public-landing-shell.spec.ts, "mcp consent sign-in keeps legal links in the sidebar rail"; sidebar-layout-status-bar.spec.ts, "keeps mobile sidebars lightly peeked around main"
- Source task: codex-test-contract-cleanup
- Exact command: pnpm test:visual:linux -- public-landing-shell.spec.ts sidebar-layout-status-bar.spec.ts -g 'mcp consent sign-in keeps legal links in the sidebar rail|keeps mobile sidebars lightly peeked around main'
- First error: toHaveScreenshot mismatches, 796 and 18,501 pixels respectively
- Artifact: https://github.com/samebase/samebase/actions/runs/33932549562/artifacts/9959117364
- Ownership: unrelated to this cleanup patch
- Evidence: the same failures occur in three main runs; diffs match prior intentional link and document-path changes
- Merge impact: non-blocking for this PR because browser jobs run only on push; the main browser suite still fails
```

## Validation

- `pnpm run dev --once`, `pnpm run check`, and `pnpm run build:ci` passed on the combined patch.
  Convex validation used the worktree's anonymous local deployment, not production.
- The combined patch passed 183 focused unit, component, and backend tests in eight files.
- The retained route-editor and mobile-carousel browser checks passed on Linux ARM64: two tests, 4.6
  seconds including browser-runner setup.
- Both debug-overlay tests passed through the existing opt-in command on Linux ARM64: two tests, 4.5
  seconds including browser-runner setup.
- Test discovery confirmed that the default sidebar suite contains 11 tests and excludes the two
  debug tests. The opt-in sidebar suite selects both debug tests.
- No screenshot baseline or test expectation was weakened to address the two existing main failures.

## Further work with a clear purpose

1. Use fixed representative editor content for layout screenshots. Importing a live spec makes
   documentation edits change a layout baseline. Preserve the real editor and touch behavior.
2. For CI speed, measure shared setup and build reuse before deleting more fast unit tests. Include
   artifact transfer and worker isolation in that comparison.
3. Apply the existing test policy during feature removal: check runtime callers, remove unused code
   with its tests, and name the surviving test before deleting duplicate coverage.

These are recommendations, not an open-ended list of approved phases.
