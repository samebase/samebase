# Agent Context Extraction Experiment Patterns

## Sampling Matrix

Use a small but varied sample before promoting any rule:

| Slice                        | Why It Matters                                                               |
| ---------------------------- | ---------------------------------------------------------------------------- |
| ordinary implementation      | catches boring defaults, source routing, test selection, and handoff         |
| review or CI failure         | exposes PR, check, and external-feedback behavior                            |
| UI or browser task           | tests route fidelity, visual proof, and interaction validation               |
| backend or provider boundary | tests safety, typing, production-read, and generated-file rules              |
| cleanup or archive           | tests fail-closed resource proof                                             |
| corrected thread             | shows how agents should handle user corrections and bad assumptions          |
| pinned/high-salience thread  | stress-tests important workflows without treating them as frequency evidence |

## Context Variant Prompts

When using subagents, isolate the variable being tested:

```text
You are validating a candidate agent-context artifact. Use only the attached/context-listed files
and local repo evidence. Do not infer missing rules from general knowledge. Report whether the
artifact is sufficient for the task, what it made easy, what it made risky, and what guidance belongs
in core, a triggerable skill, an overlay, docs/specs, or a follow-up.
```

For edit-capable probes:

```text
Work in this isolated worktree. You are not alone in the repo; do not revert unrelated changes.
Own only the listed files. Make the smallest patch that proves whether the context artifact supports
the task. List changed paths, commands run, and missing guidance.
```

For read-only comparison probes:

```text
Compare these workflow samples against the packaged context. Do not edit files. Identify whether the
sample changes the layer split, merely confirms existing guidance, or suggests a recurrence candidate
that should not be promoted yet.
```

## Scoring Rubric

Score the resulting behavior, not whether the agent praised the artifact:

- chose the correct source-of-truth files
- preserved the important invariant or safety boundary
- avoided unsupported type assertions, speculative wrappers, or fake compatibility paths
- used real route, provider, cleanup, or PR evidence when relevant
- selected checks proportional to risk
- respected user or parallel-agent changes
- produced a concise handoff with remaining risk

Failure means the missing rule needs a better layer decision. Do not automatically stuff it into
always-loaded context.

## Anti-Survivorship Rules

- Treat pinned threads as stress tests, not as the main sample.
- Include boring, failed, corrected, and abandoned work when possible.
- Record why a sample is good enough for the current decision.
- Promote a niche practice only after recurrence outside the high-salience set.

## Short Method Note Outline

Use this when the user wants the process explained like a simple paper:

1. **Problem:** agent behavior lived in a large live instruction file and tacit workflow memory.
2. **Method:** sample real work, classify rules into layers, run context-variant experiments, then
   package only surviving guidance.
3. **Findings:** some rules are portable skills, some are repo overlays, and some must stay
   always-loaded because they route later context.
4. **Threats to validity:** pinned-thread bias, local operator preferences, subagent leakage,
   validation tasks that are too close to the training examples.
5. **Result:** package, manifest, migration map, and next safe shrink step.
