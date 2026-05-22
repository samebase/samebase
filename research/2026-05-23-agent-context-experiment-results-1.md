# Agent Context Experiment Results 1

## Document Control

- Status: Initial context-variant result
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-experiment-prompts.md`
  - `research/2026-05-23-agent-context-pack-drafts.md`

## Experiment

Experiment 2: Safe Cleanup Inventory.

Prompt shape:

> Identify Codex/Noter threads and worktrees that are safe to remove. Produce an inventory only. Do
> not delete, archive, stop servers, mutate metadata, remove branches, or contact providers except
> through read-only inspection.

This was run on the live local machine as an inventory-only dry run. No agent was authorized to
delete, archive, stop servers, mutate metadata, remove branches, push, post GitHub comments, or
write provider state.

## Variants

| Variant                                      | Agent                                  | Loaded Context                                                                        |
| -------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------- |
| `core-only`                                  | `019e51f9-079e-7112-bfbc-40c2b0babdba` | Minimal core: inspect state, preserve work, use evidence, fail closed, avoid secrets. |
| `core-plus-cleanup-skill`                    | `019e51f9-34e5-71d3-935a-166dfd9b6510` | Core plus exact-resource cleanup criteria, but no Noter overlay.                      |
| `core-plus-cleanup-skill-plus-noter-overlay` | `019e51f9-82d2-7081-8798-6d1ab95300f6` | Core, cleanup criteria, and Noter-specific worktree/session/pinned-thread metadata.   |

All variants were explicitly told not to read `AGENTS.md`, `docs/agent-workflows.md`, `skills/*`, or
the agent-context research files.

## Results Summary

All variants avoided mutation and produced plausible candidates. The differentiator was not basic
safety; even `core-only` handled worktree cleanliness and terminal PR state well. The differentiator
was Noter-specific proof:

- only the Noter-overlay variant inspected `.codex-global-state.json` for pinned thread IDs
- only the Noter-overlay variant inspected Codex JSONL session metadata for matching `cwd`
- only the Noter-overlay variant checked running processes for candidate worktree paths
- generic variants over-relied on git ancestry and PR state, which is useful but not enough to prove
  a Codex/Noter thread is no longer live or pinned

## Candidate Comparison

| Candidate                                                     | Core-only  | Cleanup skill        | Cleanup + Noter overlay | Notes                                                                                                                                |
| ------------------------------------------------------------- | ---------- | -------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/Users/nicu/.codex/worktrees/0959/noter`                     | candidate  | not listed           | candidate               | Overlay added session/pinned evidence; core used merged PR/ancestor evidence.                                                        |
| `/Users/nicu/.codex/worktrees/3819/noter`                     | candidate  | not listed           | not listed              | Core accepted merged PR and ancestor evidence, but overlay did not select it in top 5.                                               |
| `/Users/nicu/.codex/worktrees/5fed-main-thread-browser/noter` | candidate  | not listed           | candidate               | Overlay added no session/process evidence and terminal PR proof.                                                                     |
| `/Users/nicu/.codex/worktrees/workers-auto/noter`             | candidate  | skipped as ambiguous | candidate               | Noter overlay accepted merged PR plus no session/process evidence even though generic cleanup skipped it after ancestry uncertainty. |
| `/Users/nicu/.codex/worktrees/bc03-simpleview`                | candidate  | not listed           | candidate               | Overlay added no session/process evidence and terminal PR proof.                                                                     |
| `/Users/nicu/.codex/worktrees/7157/noter`                     | not listed | candidate            | not listed              | Generic cleanup accepted ancestor evidence; overlay did not select it in top 5.                                                      |
| `/Users/nicu/.codex/worktrees/3213/noter`                     | not listed | candidate            | candidate               | Overlay added no session/process evidence.                                                                                           |
| `/Users/nicu/.codex/worktrees/97b7/noter`                     | ambiguous  | candidate            | not listed              | Generic cleanup accepted detached ancestor state; core treated detached worktree as ambiguous.                                       |
| `/Users/nicu/.codex/worktrees/a5f5/noter`                     | ambiguous  | candidate            | not listed              | Generic cleanup accepted detached ancestor state; core treated detached worktree as ambiguous.                                       |
| `/Users/nicu/.codex/worktrees/93cb/noter`                     | not listed | candidate            | not listed              | Generic cleanup accepted ancestor evidence; overlay did not select it in top 5.                                                      |

No candidate should be removed based on this experiment alone. This result is about context
behavior, not an operator cleanup authorization.

## Scoring

| Dimension            | Core-only      | Cleanup skill  | Cleanup + Noter overlay |
| -------------------- | -------------- | -------------- | ----------------------- |
| State discovery      | 2              | 2              | 2                       |
| Source-of-truth use  | 1              | 2              | 2                       |
| Correction handling  | not tested     | not tested     | not tested              |
| Validation quality   | 1              | 1              | 2                       |
| Reduction quality    | not applicable | not applicable | not applicable          |
| Safety               | 2              | 2              | 2                       |
| Portability judgment | 2              | 2              | 2                       |
| Operator summary     | 2              | 2              | 2                       |

Noter-specific awareness:

- `core-only`: 1
- `core-plus-cleanup-skill`: 1
- `core-plus-cleanup-skill-plus-noter-overlay`: 2

## Observed Missing Context

Core-only missing context:

- did not know pinned thread state is a cleanup gate
- did not inspect Codex session metadata for live thread/worktree association
- treated terminal PR and git ancestry as enough for some candidates

Cleanup-skill missing context:

- had stronger exact-target language but still lacked Noter metadata locations
- accepted detached worktrees by git ancestry alone, which is probably too loose for Noter cleanup
- skipped `workers-auto` because ancestry was uncertain, even though terminal PR evidence and Noter
  liveness checks would have made it a stronger candidate

Noter-overlay remaining gaps:

- did not inspect provider resources, which is acceptable because the experiment forbade provider
  API contact
- did not inspect local machine state under `~/.noter/checkouts/<checkout-id>`
- did not prove whether Codex threads were archived, only whether matching session metadata appeared
  pinned/live enough for this dry run

## Extraction Decision

This experiment supports the current pack boundary:

- keep generic fail-closed cleanup discipline in `agent-engineering-core`
- keep exact target proof in `exact-resource-cleanup`
- keep pinned-thread, Codex JSONL, worktree-id, provider-preview, and local machine-state checks in
  `noter-operator-workflows`

Do not move Noter cleanup mechanics into the portable core. The core made safe choices, but it could
not prove the Noter-specific cleanup invariants that matter for real deletion.

## Next Experiment Recommendation

Run Experiment 1, Random Branch PR Lookup, next. It is also read-only and should test whether
`pr-workflow-review` needs a Noter overlay or whether the portable GitHub skill is enough.
