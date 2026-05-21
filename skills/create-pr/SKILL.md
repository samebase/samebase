# Skill: Create High-Quality PRs

## Goal

Create or update a concise PR that matches this repo's review expectations and keeps the running
narrative accurate without dumping raw CI output into GitHub.

## When To Use

Use when asked to create a PR, update a PR, improve PR quality, or keep a PR description in sync
with the current branch.

## Steps

1. Confirm the current branch and worktree.
2. Review the actual diff with `git status -sb` and `git diff --stat`.
3. If you are proactively opening an early implementation PR before the user has asked for a PR
   state, use a draft PR instead of waiting until the end. If GitHub requires a diff first, make a
   minimal checkpoint commit after bootstrap.
4. Follow a repo PR template exactly when one exists.
5. Otherwise use this repo's default sections:
   - `Why`
   - `Summary`
   - `Validation`
6. For research or automation PRs that started from Noter or Codex, also add:
   - `First Message`
   - `Requested Codex Runtime`
7. Explain why the change exists, not just what changed.
8. Keep validation concise. Summaries are good; raw CI logs are not.
9. Add screenshots only when the change is user-facing UI.
10. In this repo, `create pr` means create or update a ready PR. Use a draft PR only when the user
    explicitly says `create draft` or otherwise asks to keep it draft.
11. Update the PR title and body when scope changes materially.
12. Use `gh` with `--body-file` or heredoc input so real newlines are preserved.

## Default Body Shape

```md
## Why

<why this change exists>

## Summary

- <key change>
- <key change>

## Validation

- `<command>`
- `<command>`
```

## Repo-Specific Notes

- Mention the PR number as a clickable link when reporting back to the user.
- Do not mirror full chat transcripts or raw tool-by-tool logs into the PR.
- Treat the PR description as the canonical current summary when the branch is actively in flight.
