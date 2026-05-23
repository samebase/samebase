---
name: pr-workflow-review
description:
  Handle pull request discovery, review, CI interpretation, and PR narrative updates. Use when asked
  to review code, inspect or fix PR feedback, summarize checks, create or update a PR body,
  reconcile branch and PR state, or calibrate actionable review-bot comments versus non-blocking
  context.
---

# PR Workflow Review

Use this for Git and GitHub work where branch state, review state, and CI evidence matter.

## Discovery

- Confirm the repository root, current branch, upstream, dirty state, and relevant remote state.
- Discover the active PR from more than branch name when needed: upstream branch, same head commit,
  open PR refs, commit lineage, or explicit PR number.
- Inspect the diff shape before reviewing or updating PR narrative.
- Fetch and rebase onto the appropriate base before implementation or PR workflows when the repo
  expects current base state.

## Review Stance

- Lead review responses with actionable findings ordered by severity.
- Cite precise file and line locations for findings.
- Distinguish blocking correctness, security, data-loss, and test-coverage issues from future design
  comments.
- Calibrate severity after user correction or new evidence.
- If no issues are found, say so and name residual test gaps or risks.

## CI And PR Narrative

- Summarize check status without hiding failures or dumping raw logs.
- Use failing job names, first actionable errors, and rerun status when reporting CI.
- Keep PR title and body aligned with current scope when scope changes.
- PR descriptions should explain why the change exists, not only what changed.
- Keep repo-specific build labels, draft defaults, branch prefixes, shortcut meanings, and final
  client directives in an overlay.

## Research Notes

Derived from `research/2026-05-23-agent-context-experiment-results-2.md`.
