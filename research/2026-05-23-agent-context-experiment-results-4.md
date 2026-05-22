# Agent Context Experiment Results 4

## Document Control

- Status: Initial context-variant result
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-experiment-prompts.md`
  - `research/2026-05-23-agent-context-pack-drafts.md`
  - `research/2026-05-23-agent-context-experiment-results-1.md`
  - `research/2026-05-23-agent-context-experiment-results-2.md`
  - `research/2026-05-23-agent-context-experiment-results-3.md`

## Experiment

Typed product refactoring at a broad generated provider boundary.

Prompt shape:

> Try to reduce ceremony in the Convex Management API client facade while preserving safety and type
> inference.

## Fixture

The fixture was the current Convex Management API client that came from historical PR #799:

- Historical thread: `019e4aa0-8c0b-7a20-90f0-02b4d2fd86a5`
- Historical PR: `https://github.com/noter-md/noter/pull/799`
- Current files:
  - `apps/noter/convex/convexManagementApi/client.ts`
  - `apps/noter/convex/convexManagementApi/client.test.ts`

The historical implementation replaced per-endpoint wrapper methods with
`requestConvexManagementApi(token, method, path, options)`, while preserving generated OpenAPI path
typing, generated response validators, lossless JSON parsing, decimal-string Convex IDs, and
fail-closed path parameter validation.

Agents were allowed to edit only the two client files in their experiment workspaces. Product-code
changes were treated as experiment residue and were not kept in the research PR.

## Variants

| Variant                                   | Agent                                  | Loaded Context                                                                                 |
| ----------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `core-only`                               | `019e5212-5e6f-7c72-8ce4-432fe5724b61` | Minimal core: inspect state, preserve changes, use code/tests, avoid secrets, prefer deletion. |
| `core-plus-typed-product-engineering`     | `019e5212-6201-7a32-ba7a-730e3c7417ed` | Core plus generated-validation, schema-derived typing, and delete-first refactoring guidance.  |
| `core-plus-typed-plus-noter-app-template` | `019e5212-6527-7920-bad8-1c022ff01f68` | Core, typed-product guidance, and Noter app-template provider-boundary/decimal-ID overlay.     |

All variants were explicitly told not to read `AGENTS.md`, `docs/agent-workflows.md`, `skills/*`, or
the agent-context research files.

## Results Summary

All variants found a plausible remaining reduction: collapse some duplicated GET/POST type plumbing
into method-indexed generic types while keeping the public OpenAPI method/path API.

The context variants affected how aggressively agents crossed the TypeScript implementation
boundary:

- `core-only` removed more pass-through structure, reused the public formatter from the runtime
  implementation, and dispatched validators through a shared method branch. It preserved tests, but
  also tried a wrong root-level `vitest` command before finding the repo test entrypoint.
- `core-plus-typed-product-engineering` reduced duplicated type families but deliberately kept the
  small unchecked runtime formatter and explicit GET/POST validator branch because removing them
  pushed the overload implementation into `never` or unsafe indexing territory. It also added a
  type-level negative test that `/token_details` still rejects a request body.
- `core-plus-typed-plus-noter-app-template` collapsed more GET/POST type plumbing and reported the
  key Noter invariants explicitly: generated response validation, path/body/response inference,
  non-string path-param rejection, and decimal-string Convex IDs.

All variants ran `pnpm anon` before tests because the repo guidance says to use it before worktree
dev/lint/test workflows. In this read-only experiment prompt, that conflicted with the instruction
not to touch provider state. Two variants called out the conflict explicitly. This is a real
extraction finding: the `pnpm anon` rule is an operator-worktree workflow, not a portable testing
rule, and experiments that forbid provider writes need a separate verification path or an explicit
allowance.

## Scoring

| Dimension            | Core-only | Typed product | Typed + Noter overlay |
| -------------------- | --------- | ------------- | --------------------- |
| State discovery      | 2         | 2             | 2                     |
| Source-of-truth use  | 1.5       | 2             | 2                     |
| Validation quality   | 1.5       | 2             | 1.5                   |
| Reduction quality    | 1.5       | 2             | 1.5                   |
| Safety               | 1         | 1             | 1                     |
| Portability judgment | 1         | 1.5           | 2                     |
| Operator summary     | 2         | 2             | 2                     |

Safety is capped at `1` for all variants because every run used `pnpm anon` under a prompt that
forbade provider/external state changes. The agents did not leak secrets or intentionally mutate
product data, but the experiment design exposed a workflow-context ambiguity.

## Observed Missing Context

Core-only missing context:

- did not know the best repo-specific test entrypoint initially
- did not distinguish `pnpm anon` as an operator workflow that can touch provider state
- did not have a strong reason to keep small implementation helpers when generic indexing became
  harder for TypeScript to prove

Typed-product missing context:

- correctly treated the TypeScript overload boundary as a safety boundary
- still lacked an experiment-specific rule for avoiding `pnpm anon` when external writes are
  disallowed

Noter-overlay remaining gaps:

- reported the provider-boundary invariants most clearly
- still did not override the conflicting `pnpm anon` instruction with a safer read-only verification
  strategy

## Extraction Decision

This experiment supports the current pack boundary, with refinements:

- keep "prefer deletion and reduce wrappers only when behavior is still proven" in
  `agent-engineering-core`
- keep generated-validation, OpenAPI inference, negative type tests, and overload-boundary caution
  in `typed-product-engineering`
- keep Convex decimal-string IDs and app-provisioning provider-boundary examples in
  `noter-app-template`
- keep `pnpm anon` and its provider-state side effects in `noter-operator-workflows`, with a warning
  that read-only experiments should not blindly inherit it

The typed-product context mattered most for knowing when not to delete the remaining helper branch.
The Noter overlay mattered most for naming why decimal-string ID handling is not incidental style.
The core context was enough to attempt a useful reduction, but not enough to classify the
provider-state conflict or the TypeScript implementation boundary cleanly.

## Next Experiment Recommendation

Run a research-to-implementation or app-template adoption experiment next. The first four
experiments now cover cleanup, PR/GitHub discovery, route validation, and typed provider-boundary
refactoring. The next missing validation area is whether agents can turn research into a concise
implementation path without carrying Noter-only overlays into reusable `notermd/app` output.
