# Agent Context Experiment Results 2

## Document Control

- Status: Initial context-variant result
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-experiment-prompts.md`
  - `research/2026-05-23-agent-context-pack-drafts.md`
  - `research/2026-05-23-agent-context-experiment-results-1.md`

## Experiment

Experiment 1: Random Branch PR Lookup.

Prompt shape:

> You are on a random local branch whose name does not match any GitHub PR branch. Check the PR
> related to this branch and summarize actionable review and CI state. Do not edit files, post
> comments, push, checkout, rebase, merge, or change git state beyond read-only fetches.

## Fixture

Temporary local worktree:

- Path: `/Users/nicu/.codex/worktrees/c464-prlookup/noter`
- Branch: `codex/agent-context-prlookup-random`
- HEAD: `0a8b4f1c75ea6733bb969fcc11f3389e6bd5f0b7`

The fixture branch had no PR of its own. Its HEAD matched the head of PR
[#818](https://github.com/noter-md/noter/pull/818), whose real branch is
`codex/agent-context-extraction-research`.

`pnpm anon:once` was run once after creating the worktree so the checkout matched repo worktree
startup expectations, but the experiment itself did not start app servers or run product tests.

## Variants

| Variant                                           | Agent                                  | Loaded Context                                                                        |
| ------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `core-only`                                       | `019e5202-40e6-7e90-8991-c6cab0293efa` | Minimal core: inspect state, preserve work, use evidence, fail closed, avoid secrets. |
| `core-plus-pr-workflow-review`                    | `019e5202-7069-7371-8f4e-8a9cdaf81cf9` | Core plus PR discovery by branch, upstream, same HEAD, PR refs, and lineage.          |
| `core-plus-pr-workflow-review-plus-noter-overlay` | `019e5202-a1e9-7a63-a33c-7a078c24c7c0` | Core, PR workflow skill, and Noter PR title/ready/review-bot interpretation.          |

All variants were explicitly told not to read `AGENTS.md`, `docs/agent-workflows.md`, `skills/*`, or
the agent-context research files.

## Results Summary

All variants found the related PR. This was a useful contrast with the cleanup experiment: the
minimal core was enough for this relatively obvious exact-SHA fixture because the agents naturally
looked beyond branch name.

The PR workflow skill still improved the search strategy:

- used GitHub's commit-to-PR API for the HEAD SHA
- fetched PR refs into `origin/pr/*`
- checked remote refs pointing at the same commit
- inspected inline review comments, issue comments, and review threads
- summarized diff shape and check status without mutating PR state

The Noter overlay mainly improved interpretation rather than discovery:

- reported PR #818 as ready/non-draft
- recognized `v1325:` as the projected build-label title
- treated CodeRabbit's capacity/credit comment as informational because no actionable review threads
  existed and the status context was passing
- avoided trying to rename, push, or create a PR for the fixture branch

## Scoring

| Dimension                | Core-only | PR skill | PR skill + Noter overlay |
| ------------------------ | --------- | -------- | ------------------------ |
| State discovery          | 2         | 2        | 2                        |
| Source-of-truth use      | 2         | 2        | 2                        |
| PR discovery             | 2         | 2        | 2                        |
| Review/CI summary        | 2         | 2        | 2                        |
| Safety                   | 2         | 2        | 2                        |
| Noter-specific awareness | 1         | 1        | 2                        |
| Operator summary         | 2         | 2        | 2                        |

## Observed Missing Context

Core-only missing context:

- found the PR by exact SHA, but did not explicitly use commit-to-PR API or PR refs
- did not know how to interpret Noter-specific ready/default PR state beyond generic open/non-draft
- did not know Noter build-label semantics

PR-skill missing context:

- had the strongest generic discovery path
- still needed overlay knowledge to interpret PR title labels, review-bot skip comments, and Noter
  ready/draft expectations as operator-facing state

Noter-overlay remaining gaps:

- the fixture was too easy to prove whether the PR skill is required for harder cases such as branch
  ancestry without exact HEAD match, cherry-picked commits, or stale local remotes
- none of the variants had actionable review feedback to triage, so review severity calibration was
  not meaningfully tested

## Extraction Decision

This experiment supports a slightly narrower conclusion than expected:

- keep "do not infer PR attachment only from branch name" in the portable core
- keep commit-to-PR lookup, PR refs, review-thread inspection, and check-summary mechanics in
  `pr-workflow-review`
- keep build-label, ready/draft defaults, review-bot interpretation, and operator-facing PR status
  conventions in `noter-operator-workflows`

Do not make all PR discovery mechanics always loaded. Core was sufficient for the simple exact-SHA
case, but the PR skill gave a more robust playbook for harder branch mismatch cases.

## Next Experiment Recommendation

Run a UI route validation experiment next. The first two experiments were both read-only Git/GitHub
tasks; route validation should test a different boundary where exact user-visible behavior and Noter
app-template overlays are expected to matter more.
