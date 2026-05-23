---
name: agent-context-extraction-lab
description:
  Extract, validate, and package reusable agent workflow context from an existing repo,
  organization, or long-running operator workflow. Use when large AGENTS.md files, local skills,
  docs, specs, thread history, or implicit practices need to become portable skills, overlays,
  manifests, or a safe migration plan using empirical review and context experiments.
---

# Agent Context Extraction Lab

Use this when the goal is to preserve how effective agent work happens, not merely to summarize
instructions.

## Output Contract

Produce a reviewable extraction trail:

- source map for `AGENTS.md`, local skills, docs, specs, CI/workflow files, PR conventions, and
  thread history
- sampled-work evidence with explicit survivorship-bias notes
- layer decisions for core context, triggerable skills, repo/app overlays, operator overlays,
  docs/spec pointers, live keep-short routers, and follow-up candidates
- validation results from representative tasks or context experiments
- packaged artifacts such as `SKILL.md`, overlays, references, and a manifest
- migration map before deleting live guidance

## Protocol

1. **Find the live rules.** Inspect current repo guidance and workflow files before inventing
   categories. Treat code/tests and accepted specs as stronger evidence than exploratory notes.
2. **Sample real work.** Review ordinary, failed, corrected, and high-salience threads. Use pinned
   threads as stress cases, not as frequency evidence.
3. **Turn rules into hypotheses.** For each candidate rule, ask whether it belongs in always-loaded
   core, a triggerable portable skill, a repo-specific overlay, an operator overlay, an existing doc
   or spec, a compact live router, or a follow-up candidate.
4. **Test the boundary.** Prefer small probes over long debate. Give validation agents only the
   context variant being tested, not your intended answer. For edit-capable probes, use isolated
   worktrees and disjoint write scopes.
5. **Score behavior, not prose.** A context variant is good only if it leads agents to choose the
   right sources, preserve invariants, avoid unsafe shortcuts, pick useful verification, and hand
   off cleanly.
6. **Package after evidence.** Keep `SKILL.md` concise. Move heavy examples, prompt templates, and
   scoring details into references. Add a manifest when core, skills, overlays, and repo docs
   compose together.
7. **Migrate live guidance slowly.** Do not shrink `AGENTS.md` or equivalent live routing until each
   removed rule has a reachable replacement. Recognition-critical shortcuts and safety rules usually
   need a compact always-loaded pointer until a loader guarantee exists.

## Layer Taxonomy

- **Core context:** baseline agent behavior that should be loaded before task routing.
- **Triggerable skill:** reusable workflow for a task family that can be recognized from the user
  request.
- **Repo/app overlay:** product-specific rules that portable skills should not inherit.
- **Operator overlay:** local commands, PR defaults, cleanup rules, and response preferences.
- **Docs/spec pointer:** narrow policy that already has a durable source of truth.
- **Keep-short router:** compact always-loaded text needed before optional context can be loaded.
- **Follow-up candidate:** recurring-looking practice that lacks enough evidence to promote.

## Validation Patterns

Use `references/experiment-patterns.md` when designing subagent prompts, sampling matrices, scoring
rubrics, or a short method-note writeup.

## Handoff

End with:

- what was packaged and where
- which rules intentionally stayed always-loaded
- which practices were rejected or deferred, and why
- validation commands or agent runs
- the next safe migration slice
