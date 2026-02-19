# Skill: Create High-Quality PRs

## Goal
Create a PR that accurately reflects the actual changes, is easy to review, and calls out any risk or migration needs.

## When To Use
Use when asked to create a PR, update a PR, or improve PR quality.

## Steps
1. Confirm the current branch and worktree.
2. Review the actual diff with `git status -sb` and `git diff --stat`.
3. Compare the PR title/body with the real changes. Remove stale or incorrect items.
4. Summarize user-facing changes, breaking changes, and migrations.
5. Record tests: note what ran, and explicitly say if tests were not run.
6. Push the branch and create or update the PR using `gh` CLI.
7. Set a precise PR title and concise bullet summary.

## Output Template
Title: <concise change summary>

Summary:
- <what changed and why>
- <important removals or migrations>
- <user-facing behavior changes>

Testing:
- `pnpm lint` (pass/fail)
- `pnpm test` (pass/fail)

Risks:
- <any known risk or data migration>
