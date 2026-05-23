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
- For implementation or PR-update workflows, fetch and rebase when the repo expects current base
  state. For read-only triage, do not rebase, push, rerun jobs, post comments, or update PR text.

## Read-Only PR Triage

- Use read-only evidence for "what is blocking?" requests: local status, branch tracking, active PR,
  mergeability, check status, review state, review comments, and PR comments.
- Treat bot statuses carefully. A green or skipped status can still mean "review skipped", rate
  limited, disabled, or not run; report that separately from actionable blockers.
- Treat unresolved actionable bot comments as blockers even when the aggregate review decision is
  empty or the bot check itself is green.
- Prefer commands such as `git status --short --branch`, `git branch -vv`, `gh pr view --json ...`,
  `gh pr checks --watch=false`, and read-only PR comment APIs.
- If flat PR comments are not enough to prove whether review threads are resolved, use the repo's
  read-only GraphQL or connector path for thread-level state when available.
- End with the current blocker decision: no actionable blocker, blocked by named check, blocked by
  requested changes, blocked by mergeability, or ambiguous because evidence is missing.

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
