---
name: research-to-implementation
description:
  Convert codebase or workflow research into scoped implementation decisions. Use when a task starts
  with ambiguous architecture, source-of-truth comparison, thread or incident review, template
  extraction, context-pack design, or uncertainty that should be resolved by evidence and small
  probes before changing code.
---

# Research To Implementation

Use this when research should drive a decision, not become the deliverable by default.

## Research Shape

- Compare source artifacts directly. Avoid replacing local evidence with generic engineering
  taxonomy.
- Separate evidence, decisions, and open questions.
- Record user corrections as first-class evidence and update the hypothesis they invalidate.
- Avoid survivorship bias when sampling threads, incidents, pinned items, or search results. Explain
  why the sample is representative enough for the current decision.
- Prefer small code, script, fixture, or subagent probes when they resolve uncertainty faster than
  prose.
- Stop researching when the product question has enough evidence to choose a next implementation
  step.

## Implementation Handoff

- Name the invariant that should survive extraction before moving code or docs.
- Identify which behavior is portable, which belongs in a repo/app overlay, and which is only
  operator preference.
- If implementation already matches the requested architecture, harden tests, provenance,
  documentation, or deletion boundaries rather than replacing it.
- Keep prompt drafts and messy research out of generated product output unless the product
  explicitly needs them.
- Re-open the research note when later experiments contradict the split.

## Research Notes

Derived from `research/2026-05-23-agent-context-experiment-results-5.md`.
