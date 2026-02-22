# Skill: Create High-Quality PRs

## Goal

Create a concise PR that matches the repo's PR template and reviewer
expectations, without noisy CI/CD output.

## When To Use

Use when asked to create a PR, update a PR, or improve PR quality.

## Steps

1. Confirm the current branch and worktree.
2. Review the actual diff with `git status -sb` and `git diff --stat`.
3. If a PR template exists in the repo, follow it exactly (headings/order). Fill
   with concise, relevant content and use `N/A` when appropriate.
4. If no template exists, write a short Summary that explains what changed and
   why.
5. Add screenshots only if the change is user-facing UI.
6. Testing: include a short test summary only if the template requires it or the
   user explicitly asks. Otherwise omit testing.
7. Never paste raw CI/CD output in the PR description.
8. Push the branch and create or update the PR using `gh` CLI.

## Output Template (when no repo template exists)

Title: <concise change summary>

Summary:

- <what changed and why>
- <user-facing behavior changes, if any>

Notes:

- <risk, migration, or follow-ups if any>

Testing (only if required by template or user request):

- <short summary, no raw logs>
