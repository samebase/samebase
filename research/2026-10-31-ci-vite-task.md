# Vite Task adoption and test-value review

Date: 2026-10-31. Base: `f6d8f109b180aecef62be23fdcd699aacb19d6b4`. The identity broker and hub
implementation are outside this work. No tests were removed.

## Decision

Use the installed Vite Task runner. Express task order and caching through its existing features.
The first change runs independent checks concurrently and cancels superseded PR CI runs. Package
manifests still own package checks. No custom task scheduler or dependency graph is added.

## Local evidence

One sequential before-and-after run of `pnpm check:ci` passed in the same linked worktree. The
previous command took 59.76 seconds. Vite Task took 34.95 seconds, about 25 seconds less. Both runs
reported the same 47 package test files, 353 passed tests, and one skipped test. The root unit suite
and Playwright were not run for this comparison.

This is one local sample after worktree bootstrap. It does not measure CI runner speed, queue time,
or push-to-green time. Windows can remain the longest PR job. These results do not establish a
reduction in merge wait time.

The first Remotion cache experiment took 3.46 seconds, followed by 0.62 seconds with two cache hits.
Adding a new TypeScript file with `export const viteTaskProbe: string = 1` exposed a false success.
The cached `tsgo` task replayed its old result. A direct `tsgo` invocation failed with TS2322.

Explicit source and configuration inputs fixed this case. After a successful cached run, adding the
same file caused `pnpm check:ci` to miss the cache and exit with status 1. Restoring the source
allowed the cached success again. The probe file is not part of this change.

An error added to an existing Remotion source file also invalidated the cache and failed. An invalid
`strict` value in the shared TypeScript configuration did the same. Both files were restored
exactly. A layout cache hit restored both `.tsbuildinfo` files byte-for-byte after their output
directory was moved aside. These checks exercise additions, edits, shared inputs, failure
propagation, and output restoration.

The cache is local to a checkout. Cross-run GitHub Actions cache reuse remains unconfigured until
its transfer cost and invalidation behavior are measured. The immediate CI gain comes from task
concurrency. The existing 1,000-run audit also found eight overlapping PR runs with up to 48
runner-minutes after a newer push. That number is an upper bound on avoidable work.

## Test-removal discussion

The requested X search was read in Chrome because web fetch returned 403 and the shared browser
required sign-in. [Sherwood's post](https://x.com/shcallaway/status/2106142042405453879) reports
800,000 deleted unit-test lines and presents three hypotheses about maintenance, time, and cost. The
post says results will follow. It does not provide before-and-after defect data.
[Lachlan Donald's post](https://x.com/lox/status/2108679515333603343) reports finding about 6% of
Buildkite's unit tests unhelpful. These are different reported experiences, not a removal target.

A separate read-only subagent reviewed Samebase test ownership and the cached CI logs. The
recommendations below need focused deliberate-defect checks before any removal.

## First small batch for review

| Candidate                                                                                       | Retained contract owner                                                                                                                                    | Observed cost                                                           | Recommendation                                                                      |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `public-landing-shell.spec.ts`, `build identity does not link to the private source repository` | Move real build-value assertions into `public landing renders the routed landing UI directly`. The existing component link-list test owns allowed anchors. | 1.6 s for the separate browser case                                     | Merge the repeated navigation. Keep actual build-value assertions.                  |
| `AppSidebarMetaSection.test.tsx`, `omits the landing preview path link and language shortcut`   | `renders only the allowed public links before and after hydration` already asserts the complete anchor list.                                               | 138 ms for the whole eight-case file. Individual case time unavailable. | Delete the narrower case after unwanted-anchor mutations fail the retained owner.   |
| `appBuild.test.ts`, label fallback input matrix                                                 | The numeric helper owns the full invalid-input matrix. The label owner retains a `v?` example.                                                             | 2 ms for the whole six-case file. Individual case time unavailable.     | Merge the repeated matrix. Prove numeric validation and prefix failures separately. |

The browser case ran in main workflow 41127573877. The unit timings came from the same workflow. Its
revision predates the source review. These are observed costs, not proven net savings. Playwright
currently skips PRs, so the browser consolidation saves no current PR time. No matching failure
marker was found in the cached logs. That absence does not prove a test has never found a defect,
and it is not the reason for these recommendations.

The separate review retained first-paint, browser geometry, cursor-style, asset-drift, and manifest
tests. Security and data-integrity boundaries remain covered. The Convex teardown race is a cleanup
defect, not test-removal evidence. PR 1817 fixes one file, and other late work still needs
diagnosis.

Source owners at the reviewed revision:

- [Landing browser cases](https://github.com/samebase/samebase/blob/f6d8f109b180aecef62be23fdcd699aacb19d6b4/apps/samebase/e2e/public-landing-shell.spec.ts#L323)
- [Complete sidebar link list](https://github.com/samebase/samebase/blob/f6d8f109b180aecef62be23fdcd699aacb19d6b4/apps/samebase/src/components/AppSidebarMetaSection.test.tsx#L135)
- [Build-number and label tests](https://github.com/samebase/samebase/blob/f6d8f109b180aecef62be23fdcd699aacb19d6b4/apps/samebase/src/lib/appBuild.test.ts#L1)
- [Successful main run with timings](https://github.com/samebase/samebase/actions/runs/41127573877)

## Summary

Vite Task reduced local check time without a custom execution engine. A deliberate error exposed an
unsafe automatic-cache assumption, which now has explicit inputs. The independent test review
supports three small consolidations. It provides no evidence for a large deletion or a material PR
speedup from test removal.
