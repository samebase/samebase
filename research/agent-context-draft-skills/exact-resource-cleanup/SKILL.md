---
name: exact-resource-cleanup
description:
  Clean up local or external resources only after exact ownership proof. Use when asked to archive,
  clean, delete, remove stale worktrees, branches, preview deployments, temporary environments,
  generated resources, machine state, or any resource whose accidental deletion could destroy user
  work or live infrastructure.
---

# Exact Resource Cleanup

Use this when cleanup is risky because the target may be shared, live, dirty, pinned, or externally
owned.

## Prove Before Delete

- Dry-run first unless the user explicitly requested deletion and the target is exact.
- Prove the current repository, branch, local dirty state, worktree existence, upstream, and remote
  branch target before deleting local Git resources.
- Prove terminal PR state when cleanup depends on PR lifecycle.
- Prove external resources match the current branch, worktree, PR, environment, or exact naming
  convention before deleting them.
- Skip resources whose ownership cannot be proven.
- Treat pinned, active, dirty, live, or ambiguous resources as exclusions unless the user explicitly
  scopes them in.

## Execution

- Prefer official CLI/API deletion paths over hand-editing state files.
- Delete in the smallest order that preserves auditability: external previews, generated resources,
  isolated machine state, local branches, then worktrees when those are all in scope.
- Stop on permission blockers, mismatched identifiers, or unexpected live state. Report residue
  explicitly with the action needed to unblock it.
- Do not invent cleanup metadata or scripts during cleanup unless the user asked for a cleanup
  implementation change.

## Overlay Hooks

Keep repo-specific cleanup rules in overlays: resource name prefixes, preview provider identities,
deployment lookup commands, machine-state paths, pinned-thread metadata, archive state, and branch
deletion policy.

## Research Notes

Derived from `research/2026-05-23-agent-context-experiment-results-1.md`.
