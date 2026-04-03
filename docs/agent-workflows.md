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

## Worktree Machine Linking

Use `link machine` when the operator wants the current checkout or worktree to
run the real `noter.js` connected-machine flow without re-explaining the details
each time.

- Treat `link machines` as an alias for `link machine`.
- Never reuse the default `~/.noter` install for a local repo checkout under
  active development; keep that default config available for the stable
  machine/phone flow.
- Keep every local repo checkout isolated with
  `--state-dir ~/.noter/checkouts/<checkout-id>`.
- For Codex worktrees under `~/.codex/worktrees/<id>/...`, use that folder id as
  `<checkout-id>`.
- For the primary local checkout or any other non-Codex checkout, use the
  checkout directory leaf as `<checkout-id>`.
- `link machine` should use the current checkout's `noter.js` URL, run `connect`
  with the matching state dir, complete the browser approval flow, then run
  `noter-sync run` with that same state dir.
- Never overwrite the default `~/.noter/config.json` when linking a local repo
  checkout.

## Git Shorthand Commands

These are the intended meanings for the repo shorthand commands:

| Command        | Meaning                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `commit`       | Stage and create a concise commit on the current branch                                                           |
| `push`         | Commit if needed, then push                                                                                       |
| `create pr`    | Push if needed, then create or update a ready PR                                                                  |
| `create draft` | Push if needed, then create or update a draft PR                                                                  |
| `ready`        | Mark the current PR ready                                                                                         |
| `wait`         | Watch CI and report status                                                                                        |
| `ship`         | Commit, push, ensure a ready PR exists, clear actionable review feedback, and wait for CI                         |
| `squash`       | Squash-merge the current PR                                                                                       |
| `archive`      | Remove the current worktree/local branch after confirming a PR exists                                             |
| `link machine` | Run the current checkout's `noter.js` machine-link flow with worktree isolation when needed                       |
| `clean vaults` | Delete matching temporary Noter-managed vaults safely                                                             |
| `clean`        | Run `clean vaults`, remove the current worktree's local machine link, then remove the shipped worktree and branch |
| `status`       | Report branch, local changes, and PR state                                                                        |

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

## PR Timing

- Do not leave a meaningful non-`main` work branch with implementation, docs, or
  research work without a GitHub PR. Before the agent concludes the task, create
  or update the branch PR unless the user explicitly says not to open one.
- Default proactive PR state is ready/non-draft so the branch is preserved in
  GitHub. Use a draft PR only when the work is still in progress or the user
  explicitly asks to keep it draft.
- If GitHub requires a diff before that first proactive PR, create a minimal
  checkpoint commit after bootstrap.
- When the user says `create pr`, create or update a ready non-draft PR.
- When the user says `create draft`, create or update a draft PR.
- If the user explicitly asks to keep the PR draft, respect that.
- `ship` must end with an updated ready PR before waiting on CI.

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
- When the user says `squash`, squash-merge the current PR through the CLI after
  confirming CI is green and rebasing on the latest `origin/main`.
- Immediately before merge, run `git fetch origin` and rebase onto the latest
  `origin/main`.
- Prefer squash merge unless there is an explicit reason to preserve the full
  intermediate commit history.

## Agent-Owned End-To-End Validation

For meaningful PRs, the agent should prefer at least one end-to-end validation
path that it can execute itself outside CI before concluding the work.

Intent:

1. prove the shipped change was exercised by the agent, not only inferred from
   code or unit tests
2. keep a manual validation path that is easy to translate into narrower
   automated tests later
3. make the PR validation section reflect real product behavior, not just build
   health

Guidelines:

1. treat this as a first-class manual test path, not a CI requirement
2. prefer real-route or real-surface validation over fixture-only checks when
   the route can be exercised locally
3. include the concrete end-to-end path in the PR validation summary
4. when a manual end-to-end check reveals stable seams, follow up with the
   narrowest useful unit, integration, or Playwright coverage that can run in CI
5. if the agent cannot run the full path because of missing auth, external
   dependencies, or environment limits, say exactly what was blocked and what
   local or automated evidence was used instead

## Archive And Clean

- `archive` requires an existing GitHub PR whose head branch is the current
  branch. A draft PR is sufficient.
- `archive` removes only the current non-`main` worktree and the local branch.
  It leaves the remote branch and PR intact.
- `clean` is only for shipped or merged work. Run `clean vaults` first.
- If the current checkout has a linked machine install, stop that exact
  checkout-local `noter-sync run` process before deleting its state dir.
- `clean` should remove only the current checkout's isolated
  `~/.noter/checkouts/<checkout-id>` state dir and never the default `~/.noter`
  install.
- After machine-link cleanup, remove the current non-`main` worktree, delete the
  local branch, and delete the remote branch if it still exists.

## Route-First UI Regression Policy

For interaction bugs involving scroll, touch, drag, focus, selection, pane
layout, or route-shell behavior:

1. Reproduce the issue on the real route first.
2. Add a failing real-route or honest production-component Playwright repro.
3. Only add a narrower fixture after the real repro exists.

If a fixture is used, it must mount the exact shipped component tree without
invented layout or placeholder chrome.
