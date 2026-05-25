---
name: delegation-orchestrator
description:
  Use when the user explicitly asks for sub-agents, delegation, parallel agent work, orchestration,
  context-preserving research, multi-agent probes, or wants substantial implementation/research work
  split so the main thread stays focused. Also use when the user references this skill by name or
  asks for a delegation tree.
---

# Delegation Orchestrator

Use this skill to keep the main thread focused on the user's goal while sub-agents handle bounded
side work.

## Core Rule

Before deep work, do a quick delegation pass.

For substantial implementation or research tasks:

1. Name the immediate critical-path task you will keep local.
2. Identify independent lanes that can run in parallel without blocking that local task.
3. Spawn sub-agents for useful lanes, especially source mapping, implementation spikes,
   verification, alternative design review, PR/CI/review process work, and noisy log or docs sweeps.
4. Ask for compact findings with file/command evidence and recommended next actions.
5. Pull back only the conclusions needed for the current decision.

If you keep a substantial task fully local, keep the reason visible in the final handoff.

## Delegation Shapes

- **Explorer:** read-only source map, research, risk scan, or verification plan.
- **Worker:** bounded code change with a disjoint write scope and explicit ownership.
- **Process worker:** `create pr`, `wait`, review triage, cleanup, or other workflow bureaucracy.
- **Deep worker:** xhigh agent with its own worktree for hard design, implementation, or validation
  probes.
- **Fast worker:** cheap model without a worktree for bounded searches, summaries, or evidence
  gathering.

For broad delegated slices, tell the sub-agent to run its own delegation pass when useful and to
include its child delegation tree in the handoff.

## Shortcut Commands

When delegating or testing shortcut/process commands, preserve the operator's command shape. Start
the sub-agent in the intended checkout or thread context and send only the exact command the
operator used, such as:

```text
clean
```

Do not expand terse commands into custom checklist prompts unless the delegated agent reports an
exception that needs supervisor intervention.

## Handoff Contract

Every substantial final handoff should include:

- delegated agents used, or `none` with the reason
- worktrees or branches they owned
- outputs integrated or rejected
- remaining blockers, approval boundaries, or policy ambiguities

Keep the main response concise. Do not paste raw logs or bulky technical detail unless the user asks
for it.
