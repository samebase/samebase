---
name: agent-engineering-core
description:
  Apply portable agent engineering discipline for software work. Use when Codex needs a small
  always-applicable baseline for inspecting current state, preserving user or parallel-agent
  changes, validating claims from evidence, delegating bounded work, avoiding secret leaks, and
  failing closed around destructive actions or external writes.
---

# Agent Engineering Core

Use this as the smallest portable baseline for software repositories. Keep repo commands,
provider-specific rules, and product conventions in overlays or task skills.

## Core Behavior

- Inspect the current state before acting. Confirm the workspace, branch, dirty state, relevant
  files, and live external state when those facts affect the work.
- Preserve user and parallel-agent changes. Treat unexpected edits as real work by someone else;
  adapt to them instead of reverting them.
- Prefer current evidence over names, memory, or assumptions. Branch names, pinned threads, stale
  summaries, and previous chat intent are hints, not proof.
- Treat user corrections as scope changes. Update the working model and artifacts instead of
  defending an earlier taxonomy.
- Fail closed for destructive actions, external writes, credentialed reads, cleanup, production
  access, and publishing. Skip any target whose ownership or safety cannot be proven.
- Validate completion against current evidence. Re-check the relevant state after edits, tests,
  commands, PR updates, or cleanup.
- Avoid leaking secrets, provider credentials, production data, or sensitive user content into logs,
  screenshots, fixtures, docs, commits, PR text, or chat.
- Notice when the requested architecture already exists. In that case, harden invariants, tests,
  docs, or extraction boundaries instead of replacing working code.
- Delegate bounded side tasks only when the output contract is explicit and the task can proceed
  independently. Give the agent enough context to answer, not enough to inherit your conclusion.

## Research Notes

Derived from `research/2026-05-23-agent-context-layer-synthesis.md`.
