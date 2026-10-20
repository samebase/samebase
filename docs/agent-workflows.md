# Agent Workflows

This document holds deeper workflow rules that are too conditional or verbose for `AGENTS.md`, but
should still live in-repo as durable guidance.

Runbooks here are for procedures still being understood; once a procedure is mechanically
understood, prefer a small direct script (`scripts/pr-build-label.ts` is the model) — scripts must
get straight to the point, never enterprise-y.

## Worktree Bootstrap

1. Confirm the current root and branch.

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

2. Use `pnpm dev` as the normal startup path, including in a checkout with no `node_modules`. It
   installs dependencies when the workspace manifests or lockfile changed, then dispatches to the
   primary dev runner from the main checkout or the anonymous local runner from a linked worktree. A
   Codex environment setup command may prewarm dependencies, but startup does not depend on it.
3. In a new linked worktree, `pnpm dev` performs dependency install, local Convex startup, seed env
   sync, and local auth setup before it starts the long-running processes. Use `pnpm dev --once` to
   perform the same setup and exit. Both commands are safe to run again. A successful run records
   that the anonymous seed/auth bootstrap completed, so later `pnpm dev` starts can skip that
   one-time work. Use `pnpm dev --force-bootstrap` when normal startup should rerun it.
4. Do not replace worktree startup with direct `npx convex dev`.
5. Do not run `npx convex dev --env-file` pointing at another checkout's `.env.local`; it rewrites
   the current worktree's env and breaks local worktree bootstrapping.
6. Before starting implementation on an existing work branch or worktree, run `git fetch origin` and
   rebase onto the latest `origin/main`.

## Temporary Repository Naming

Temporary Samebase-managed repositories created for manual or Playwright validation from a worktree
must use the prefix `tmp-<worktree-id>-<intent>`.

- For Codex worktrees under `~/.codex/worktrees/<id>/...`, use that folder id as the worktree id.
- `clean repositories` must only target repositories with that exact prefix and only if they are
  Samebase-managed.

## Git Shorthand Commands

These are the intended meanings for the repo shorthand commands:

When a shorthand command is delegated, tested, or handed off for execution, preserve the operator's
terse command form exactly, such as `clean`, `wait`, `create pr`, or `ship`, and avoid adding extra
instructions or checklists.

| Command              | Meaning                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `commit`             | Stage and create a concise commit on the current branch                                                                           |
| `push`               | Commit if needed, then push                                                                                                       |
| `create pr`          | Push if needed, then create or update a ready PR whose title starts with the current `v<N>:` label                                |
| `create draft`       | Push if needed, then create or update a draft PR whose title starts with the current `v<N>:` label                                |
| `ready`              | Mark the current PR ready                                                                                                         |
| `wait`               | Watch CI and report status                                                                                                        |
| `ship`               | Commit, push, ensure a ready PR exists, clear actionable review feedback, and wait for CI                                         |
| `squash`             | Squash-merge the current PR                                                                                                       |
| `archive`            | Remove the current worktree/local branch after confirming a PR exists                                                             |
| `clean repositories` | Remove matching temporary repositories from Samebase safely                                                                       |
| `clean`              | Run `clean repositories`, confirm the branch's Convex preview is deleted, then remove the merged or closed-PR worktree and branch |
| `status`             | Report branch, local changes, and PR state                                                                                        |

`ship` and `archive` are retired from active vocabulary (unused since late April 2026); if the
operator says them, confirm intent before acting.

## Branch And Commit Hygiene

- Always use CLI tools such as `gh` and `git`, and execute requested git/GitHub workflows instead of
  describing them or pointing the user at a UI.
- Rename auto-generated random `codex/<word>-<word>-<word>` branches early, and always before
  `commit`, `create pr`, or `ship`.
- Prefer new commits over amending existing commits.
- When the user says `rebase`, treat it as `rebase` plus `push` so the local branch and
  `origin/<branch>` stay aligned after the history rewrite.

## PR Body Standard

Unless a repo template says otherwise, PR descriptions should use this shape:

1. `Why`
2. `Summary`
3. `Validation`

Add these sections when the PR represents research or automation initiated from Samebase or Codex:

1. `First Message`
2. `Requested Codex Runtime`

Rules:

- Explain why the change exists, not just what changed.
- Use concise validation summaries, not raw CI logs.
- Use `gh pr create --body-file ...` or `gh pr edit --body-file ...` so real newlines are preserved.
- Keep the PR description updated when scope changes.
- When the user says `update PR`, update the GitHub PR metadata with `gh pr edit`: title first, then
  description if scope, verification, rebase, or review status changed. This shorthand does not mean
  rewriting branch commit subjects.

## PR Timing

- For implementation, docs, or research on a meaningful non-`main` branch, commit and push
  reviewable checkpoints as coherent slices land; do not save one large local diff for the end. Do
  not send the final response until the branch has a ready GitHub PR unless the user opts out or
  asks for a draft.
- Default proactive PR state is ready/non-draft so the branch is preserved in GitHub. Use a draft PR
  only when the work is still in progress or the user explicitly asks to keep it draft.
- If GitHub requires a diff before that first proactive PR, create a minimal checkpoint commit after
  bootstrap.
- When the user says `create pr`, create or update a ready non-draft PR with the current `v<N>:`
  title label.
- When the user says `create draft`, create or update a draft PR with the current `v<N>:` title
  label.
- If the user explicitly asks to keep the PR draft, respect that.

## Review And Ship

- Inspect the diff shape with `git diff --stat` before `commit`, `create pr`, or `ship`.
- After correctness fixes are complete, inspect the actual final patch and run a separate reduction
  and readability pass. Look for pass-through helpers, one-call extraction seams, redundant
  intermediates, dense statement walls, and missing separation between reads, decisions, effects,
  and returns. Do not treat formatter success or the diff summary as a substitute for reading the
  patch.
- Do not request CodeRabbit or Codex review automatically for a startup draft PR or obvious early
  work-in-progress branch. Request review when the PR is ready or when the user explicitly asks for
  draft-state review.
- Request fresh CodeRabbit and Codex review after pushing fixes for active PR review feedback.
- Treat actionable Greptile, CodeRabbit, and Codex comments as required fixes.
- Do not merge while CI is red or while required review tooling is still in progress.
- When the user says `squash`, squash-merge the current PR through the CLI after confirming CI is
  green and rebasing on the latest `origin/main`.
- Immediately before merge, run `git fetch origin` and rebase onto the latest `origin/main`.
- Prefer squash merge unless there is an explicit reason to preserve the full intermediate commit
  history.

### Main Build Version Labels

The public app build label uses the one-based repository commit count rendered as `v<N>`. PR titles
should carry the current projected label, and the final `main` squash commit should recompute that
label immediately before merge. Branch commit subjects do not need provisional build labels during
normal PR updates.

Rules:

- Prefix every PR title with the projected app build label, for example
  `v1146: Tighten legal page padding`.
- Do not amend or rewrite branch commit subjects only to add or refresh the projected app build
  label during normal PR updates.
- GitHub's squash UI uses the commit subject as the default squash title for a one-commit PR, but
  uses the PR title for PRs with two or more commits. Account for that only during final merge prep,
  not during every PR update.
- Treat PR title labels as provisional. Overlapping PRs can share the same projected label until one
  lands and the others are refreshed.
- Do not put `v<N>` in branch names.
- Do not infer the correct PR label from existing branch commit subjects, stale PR titles, or the
  branch name; always recompute from the latest `origin/main`.
- When work implements a named or numbered phase from a spec, RFC, rollout, or accepted plan,
  include the phase label in the PR title after the build label, such as
  `v1146: Phase 2: Move app provisioning to Workflow`, so the eventual squash commit preserves the
  phase context.
- The standard way to compute and apply the label is `node ./scripts/pr-build-label.ts`: it fetches
  `origin/main`, computes the projected label from the commit count, and updates the current
  branch's PR title in place (use `--print-only` to compute without editing). The manual recipe it
  implements:
- When creating, updating, rebasing, marking a PR ready, running `ship`, or preparing `squash`,
  fetch latest `origin/main` and compute the projected label from the current main count:

```bash
main_count="$(git rev-list --count origin/main)"
next_version="v$((main_count + 1))"
```

- Do not consider `create pr`, `create draft`, proactive PR creation, PR readiness updates, `ship`,
  or `squash` complete until the current GitHub PR title starts with the freshly computed
  `next_version` value followed by a colon.
- Strip any existing leading `v<number>:` from the PR title and replace it with the freshly computed
  label:

```bash
gh pr edit <pr-number> --title "${next_version}: <current title without old version>"
```

- Immediately before squash merge, after fetching and rebasing on latest `origin/main`, recompute
  the label again. Prefix the squash commit subject with that final label. Prefer an explicit CLI
  subject over relying on the GitHub UI default:

```bash
gh pr merge <pr-number> --squash --subject "${next_version}: <concise scope>"
```

- If another PR lands before this merge completes, fetch and recompute the label before updating the
  PR title or merging. Never reuse a version calculated against an older `origin/main`.

## Agent-Owned End-To-End Validation

For meaningful PRs, the agent should prefer at least one end-to-end validation path that it can
execute itself outside CI before concluding the work.

Intent:

1. prove the shipped change was exercised by the agent, not only inferred from code or unit tests
2. keep a manual validation path that is easy to translate into narrower automated tests later
3. make the PR validation section reflect real product behavior, not just build health

Guidelines:

1. treat this as a first-class manual test path, not a CI requirement
2. prefer real-route or real-surface validation over fixture-only checks when the route can be
   exercised locally
3. if the feature depends on setup, onboarding, or approval state, include that real setup path in
   the validation unless a documented seed/bootstrap shortcut is intentionally used
4. for non-seeded flows, prefer exercising the actual operator path end to end, including any
   provider setup or approval step, then verify the resulting product behavior
5. for flows that start a new thread, conversation, or similar empty container, the manual path is
   not complete at the blank state; send the first real message and confirm the thread materializes
   with at least the initial user message and first product response
6. when the feature offers distinct runtime modes such as `local` and `new worktree`, exercise each
   shipped mode in the manual path unless the PR scope explicitly narrows it, and confirm the
   observable runtime context for each mode instead of only checking that the menu renders
7. include the concrete end-to-end path in the PR validation summary
8. when a manual end-to-end check reveals stable seams, follow up with the narrowest useful unit,
   integration, or Playwright coverage that can run in CI
9. if the agent cannot run the full path because of missing auth, external dependencies, or
   environment limits, say exactly what was blocked and what local or automated evidence was used
   instead

## User-Flow Validation Coverage

Each shipped feature should leave behind at least one concrete user-flow validation path.

Rationale:

If agents are expected to control the full development cycle, they must be able to manually validate
newly added features themselves. Otherwise the agent can only implement code, not truly own whether
the shipped behavior works end to end in the product.

Rules:

1. treat the user-flow as a product-level scenario, not just a component-level interaction
2. prefer saving the flow in `manual-tests/` when it is too heavy, stateful, or
   environment-dependent for normal PR CI
3. write the flow so an agent can execute it end to end and prove the shipped behavior on a real
   route or real surface
4. when the flow is stable enough to automate but still too expensive for every PR, keep it eligible
   for scheduled automation such as a daily run rather than forcing it into the default CI path
5. when a scheduled user-flow check finds a stable seam, extract the narrowest useful subset into
   unit, integration, or normal Playwright coverage that can run on every PR

## Archive And Clean

- `archive` requires an existing GitHub PR whose head branch is the current branch. A draft PR is
  sufficient.
- `archive` removes only the current non-`main` worktree and the local branch. It leaves the remote
  branch and PR intact.
- `clean` is only for branches whose PR is terminal: merged or closed. Draft PRs count as PRs: once
  any PR exists for a branch, assume a Convex preview deployment exists and must be cleaned before
  the branch is removed. Do not clean open PR previews. Run `clean repositories` first.
- Before deleting the remote branch, follow `docs/samebase-pr-preview-cleanup.md` for the current
  branch. This is an operator/Codex workflow, not a repo script. It must not change deploy behavior
  or add tagging. Missing local seed env, missing inherited credentials, or missing first-pass
  metadata is not a reason to skip preview cleanup. Resolve the credentials/resource lookup or leave
  `clean` blocked; do not delete the branch while provider preview cleanup is incomplete.
- Remove the current non-`main` worktree, delete the local branch, and delete the remote branch if
  it still exists.

## Route-First UI Regression Policy

For interaction bugs involving scroll, touch, drag, focus, selection, pane layout, or route-shell
behavior:

1. Reproduce the issue on the real route first.
2. Add or update a failing real-route or honest production-component Playwright repro. Use the
   existing test owner when it already covers the contract.
3. Only add a narrower fixture after the real repro exists.

If a fixture is used, it must mount the exact shipped component tree without invented layout or
placeholder chrome. Its ownership must also match the changed surface: a shell/sidebar fixture is
not acceptable coverage for a separate page route that happens to reuse one component.
