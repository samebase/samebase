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
3. Spawn focused sub-agents for useful lanes, especially source mapping, implementation spikes,
   verification, alternative design review, PR/CI/review process work, and noisy log or docs sweeps.
4. Prefer lower-cost lane owners when the lane is bounded, and have them fan out to Spark or other
   lower-thinking models for cheap scans, summaries, and evidence gathering before escalating.
5. Ask for compact findings with file/command evidence and recommended next actions.
6. Pull back only the conclusions needed for the current decision.

If you keep a substantial task fully local, keep the reason visible in the final handoff.

## Model Routing

Use model tiers deliberately rather than treating the main thread as the only place work happens.

- **Main thread:** owns the user's goal, scope, tradeoffs, final integration, and broad context.
- **Low-cost lane owner:** use for one focused lane with clear pass/fail criteria or a compact
  deliverable, such as source mapping, CI triage, review-thread sorting, or risk scans.
- **Spark / lower-thinking worker:** use inside a lane for bounded fan-out work: file searches, log
  sweeps, docs comparison, callsite lists, small summaries, and mechanical verification.
- **High-thinking worker:** use only when a lane finds real ambiguity, architectural risk, a hard
  bug, or implementation work that needs deeper reasoning.

Prefer a shallow tree: main thread -> focused lane owner -> Spark-style fan-out. Avoid spawning
agents just to spend model quota; each child should reduce main-thread context load or wall-clock
time with evidence the supervisor can verify.

## Delegation Shapes

- **Explorer:** read-only source map, research, risk scan, or verification plan.
- **Worker:** bounded code change with a disjoint write scope and explicit ownership.
- **Process worker:** `create pr`, `wait`, review triage, cleanup, or other workflow bureaucracy.
- **Deep worker:** xhigh agent with its own worktree for hard design, implementation, or validation
  probes.
- **Fast worker:** cheap model without a worktree for bounded searches, summaries, or evidence
  gathering.
- **Codex worker:** real Codex app thread that appears in the Codex GUI/sidebar; follow
  `skills/codex-sub-agent/SKILL.md`.

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
