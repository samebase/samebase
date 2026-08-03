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
3. If you are proactively opening an implementation PR, default it to ready/non-draft once the
   branch has a meaningful reviewable checkpoint. Use a draft PR only when the work is still in
   progress, the user asks for draft, or the first checkpoint exists only to preserve/bootstrap the
   branch before reviewable scope is ready.
4. Follow a repo PR template exactly when one exists.
5. Otherwise use this repo's default sections:
   - `Why`
   - `Summary`
   - `Validation`
6. For research or automation PRs that started from Samebase or Codex, also add:
   - `First Message`
   - `Requested Codex Runtime`
7. Explain why the change exists, not just what changed.
8. Keep validation concise. Summaries are good; raw CI logs are not.
9. Add screenshots only when the change is user-facing UI.
10. In this repo, `create pr` means create or update a ready PR with the current `v<N>:` title
    label. Use a draft PR only when the user explicitly says `create draft` or otherwise asks to
    keep it draft.
11. Before creating, editing, marking ready, or reporting a PR complete, fetch latest `origin/main`
    and compute the projected app build label:
    ```bash
    main_count="$(git rev-list --count origin/main)"
    next_version="v$((main_count + 1))"
    ```
12. Prefix the PR title with `${next_version}:`, replacing any existing leading `v<number>:` label.
    A Samebase PR is not complete until the current GitHub PR title starts with that freshly
    computed label.
13. Update the PR title and body when scope changes materially.
14. Use `gh` with `--body-file` or heredoc input so real newlines are preserved.

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
- Keep `docs/agent-workflows.md` as the detailed source for Samebase build-label, draft/ready, and
  merge-title rules.
