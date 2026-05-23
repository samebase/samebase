# Agent Context Live AGENTS Router Slice

## Document Control

- Status: First live routing slice
- Date: 2026-05-23
- Related:
  - `AGENTS.md`
  - `packages/agent-context/manifests/noter.md`
  - `research/2026-05-23-agent-context-agents-migration-map.md`

## Decision

The first live `AGENTS.md` modularization slice should add a pointer to the extracted package and
the migration map, but not remove existing always-loaded rules yet.

This makes the candidate context bundle discoverable from live repo guidance while preserving the
rules that still need guaranteed loading:

- startup and worktree setup
- source priority and "remember this" persistence
- Convex production-read safety
- workflow shortcut recognition
- task-specific routing pointers
- compact shadcn and generated-guidance reminders

## Why Not Shrink More Yet

The package has passed focused validations, but `packages/agent-context/manifests/noter.md` still
states that it does not replace live `AGENTS.md` routing. Removing broad AGENTS sections before the
runtime guarantees core, skill, and overlay loading would risk losing exactly the behavior this
extraction is trying to preserve.

## Next Safe Shrink

The next AGENTS reduction should be one section at a time:

1. choose a section whose replacement is already packaged, documented, or accepted
2. prove the replacement is reachable before the relevant task starts
3. keep a compact always-loaded pointer for recognition-critical commands and safety rules
4. update the migration map in the same change
