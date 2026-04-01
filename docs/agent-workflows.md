# Agent Workflows

This document holds deeper workflow rules that are too conditional or verbose
for `AGENTS.md`, but should still live in-repo as durable guidance.

## Worktree Bootstrap

1. Confirm the current root and branch.

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

2. In a git worktree, run `make anon-once` once after checkout, then use
   `make anon` as the normal startup path.
3. In the primary local checkout, use `make run`.
4. Do not replace worktree startup with `pnpm dev` or `npx convex dev`.
5. Do not run `npx convex dev --env-file` pointing at another checkout's
   `.env.local`; it rewrites the current worktree's env and breaks local anon
   bootstrapping.
6. Before starting implementation on an existing work branch or worktree, run
   `git fetch origin` and rebase onto the latest `origin/main`.

## Temporary Vault Naming

Temporary Noter-managed repos created for manual or Playwright validation from a
worktree must use the prefix `tmp-<worktree-id>-<intent>`.

- For Codex worktrees under `~/.codex/worktrees/<id>/...`, use that folder id as
  the worktree id.
- `clean vaults` must only target vaults with that exact prefix and only if they
  are Noter-managed.

## Git Shorthand Commands

These are the intended meanings for the repo shorthand commands:

| Command        | Meaning                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `commit`       | Stage and create a concise commit on the current branch                |
| `push`         | Commit if needed, then push                                            |
| `create pr`    | Push if needed, then create or update a draft PR                       |
| `ready`        | Mark the current PR ready                                              |
| `wait`         | Watch CI and report status                                             |
| `ship`         | Commit, push, refresh PR state, clear review feedback, and wait for CI |
| `archive`      | Remove the current worktree/local branch after confirming a PR exists  |
| `clean vaults` | Delete matching temporary Noter-managed vaults safely                  |
| `clean`        | Run `clean vaults`, then remove the shipped worktree and branch        |
| `status`       | Report branch, local changes, and PR state                             |

## PR Body Standard

Unless a repo template says otherwise, PR descriptions should use this shape:

1. `Why`
2. `Summary`
3. `Validation`

Add these sections when the PR represents research or automation initiated from
Noter or Codex:

1. `First Message`
2. `Requested Codex Runtime`

Rules:

- Explain why the change exists, not just what changed.
- Use concise validation summaries, not raw CI logs.
- Use `gh pr create --body-file ...` or `gh pr edit --body-file ...` so real
  newlines are preserved.
- Keep the PR description updated when scope changes.

## Draft PR Timing

- For implementation work, open or update a draft PR early rather than waiting
  until the end.
- If GitHub requires a diff before the first draft PR, create a minimal
  checkpoint commit after bootstrap.
- Keep PRs draft by default unless the user explicitly asks to mark them ready.

## Review And Ship

- Inspect the diff shape with `git diff --stat` before `commit`, `create pr`, or
  `ship`.
- Do not request CodeRabbit or Codex review automatically for a startup draft PR
  or obvious early work-in-progress branch. Request review when the PR is ready
  or when the user explicitly asks for draft-state review.
- Request fresh CodeRabbit and Codex review after pushing fixes for active PR
  review feedback.
- Treat actionable Greptile, CodeRabbit, and Codex comments as required fixes.
- Do not merge while CI is red or while required review tooling is still in
  progress.
- Immediately before merge, run `git fetch origin` and rebase onto the latest
  `origin/main`.
- Prefer squash merge unless there is an explicit reason to preserve the full
  intermediate commit history.

## Archive And Clean

- `archive` requires an existing GitHub PR whose head branch is the current
  branch. A draft PR is sufficient.
- `archive` removes only the current non-`main` worktree and the local branch.
  It leaves the remote branch and PR intact.
- `clean` is only for shipped or merged work. Run `clean vaults` first, then
  remove the current non-`main` worktree, delete the local branch, and delete
  the remote branch if it still exists.

## Route-First UI Regression Policy

For interaction bugs involving scroll, touch, drag, focus, selection, pane
layout, or route-shell behavior:

1. Reproduce the issue on the real route first.
2. Add a failing real-route or honest production-component Playwright repro.
3. Only add a narrower fixture after the real repro exists.

If a fixture is used, it must mount the exact shipped component tree without
invented layout or placeholder chrome.
