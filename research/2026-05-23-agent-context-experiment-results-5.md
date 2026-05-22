# Agent Context Experiment Results 5

## Document Control

- Status: Initial context-variant result
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-experiment-prompts.md`
  - `research/2026-05-23-agent-context-pack-drafts.md`
  - `research/2026-05-23-agent-context-experiment-results-1.md`
  - `research/2026-05-23-agent-context-experiment-results-2.md`
  - `research/2026-05-23-agent-context-experiment-results-3.md`
  - `research/2026-05-23-agent-context-experiment-results-4.md`

## Experiment

Research-to-implementation and app-template adoption.

Prompt shape:

> Replace the local starter template with `notermd/app`. Research just enough to decide the path,
> then outline the implementation/exporter approach.

Mid-run correction:

> Actually, no Noter-only overlays. Use the exact `notermd/app` source tree and keep the research
> concise.

## Fixture

The fixture was the real starter-template adoption surface:

- Historical thread: `019dd3fe-9a09-77f3-bb61-a1ad7337a583`
- Accepted spec: `specs/005_STARTER_TEMPLATE_STRATEGY_SPEC.md`
- Adoption research: `research/2026-04-28-notermd-app-template-adoption.md`
- Exporter: `scripts/export-notermd-app-manifest.ts`
- Runtime seeder: `apps/noter/convex/starterSeed.ts`
- Tests:
  - `apps/noter/convex/starterSeed.test.ts`
  - `apps/noter/convex/starterSeedManifest.test.ts`
- Generated manifest: `apps/noter/convex/starterSeedManifest.generated.ts`
- Artifact docs: `docs/artifacts/notermd-app/*`

Agents were not allowed to edit files, run provider-touching setup, contact providers, or read
`AGENTS.md`, `docs/agent-workflows.md`, `skills/*`, or the agent-context research files.

## Variants

| Variant                                  | Agent                                  | Loaded Context                                                                                       |
| ---------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `core-only`                              | `019e521d-05be-73f1-b563-6fb3c4a0da35` | Minimal core: inspect state, use evidence, preserve changes, avoid secrets and external writes.      |
| `core-plus-research-to-implementation`   | `019e521d-092e-7e91-9f40-fdf3aa477e0b` | Core plus concise evidence/decision/open-question separation and correction handling.                |
| `core-plus-research-plus-noter-template` | `019e521d-0c4b-7ab0-ad19-f03468b2e458` | Core, research-to-implementation, and Noter app-template exact-source/provenance/build expectations. |

## Results Summary

All variants reached the most important conclusion:

- the repo already implements the replacement architecture
- `notermd/app` is exported at maintenance/build time into `starterSeedManifest.generated.ts`
- runtime user repo creation should keep the current one-root-commit seeding path
- Noter should not add overlays, filters, generated-app wrappers, or operator workflow files on top
  of the exported source tree

The context variants affected the quality of the remaining-work judgment:

- `core-only` handled the correction better than expected. It recognized the existing
  exporter/seeder path and warned that unwanted files should be removed upstream in `notermd/app`,
  not stripped by Noter.
- `core-plus-research-to-implementation` was sharper about test ownership. It identified that
  `starterSeedManifest.test.ts` should validate provenance, shape, and integrity rather than turning
  Noter into the owner of `notermd/app` internal file choices.
- `core-plus-research-plus-noter-template` found an extra concrete hardening point: the exporter
  sorts paths bytewise for deterministic manifests, while runtime seeding still uses
  `localeCompare`. It recommended aligning runtime ordering with exporter ordering so exact snapshot
  semantics are deterministic end to end.

No variant ran `pnpm anon`, contacted providers, or modified files.

## Scoring

| Dimension            | Core-only | Research skill | Research + Noter overlay |
| -------------------- | --------- | -------------- | ------------------------ |
| State discovery      | 2         | 2              | 2                        |
| Source-of-truth use  | 2         | 2              | 2                        |
| Correction handling  | 1.5       | 2              | 2                        |
| Validation quality   | 1.5       | 2              | 2                        |
| Reduction quality    | 1.5       | 2              | 2                        |
| Safety               | 2         | 2              | 2                        |
| Portability judgment | 1.5       | 2              | 2                        |
| Operator summary     | 2         | 2              | 2                        |

## Observed Missing Context

Core-only missing context:

- did not distinguish as clearly between artifact-regeneration docs and generated-app output logic
- did not identify the test-ownership issue as directly as the research skill did
- did not notice the bytewise-ordering mismatch

Research-skill missing context:

- correctly trimmed the problem to "implementation exists, harden the boundary"
- correctly treated the mid-run correction as scope-changing evidence
- did not notice the runtime/exporter path-ordering mismatch

Noter-template remaining gaps:

- found the strongest exact-source hardening point
- still left branch policy as an open question because current evidence says the exporter defaults
  to `main` while the checked-in manifest points at `v5-tanstack-start-workers`

## Extraction Decision

This experiment supports the current pack boundary, with refinements:

- keep "recognize when the current implementation already satisfies the request" in
  `research-to-implementation`
- keep evidence/decision/open-question separation in `research-to-implementation`
- keep `notermd/app` exact-source rules in `noter-app-template`, not general TypeScript guidance
- keep "remove unwanted generated-app files upstream, never with Noter-side filtering" in
  `noter-app-template`
- keep deterministic bytewise ordering, binary/text split, file-mode preservation, branch selection,
  source commit, content hash, and generated app build command as Noter app-template invariants

The app-template overlay mattered most after the correction. It turned "no overlays" from a broad
principle into concrete ownership rules: Noter exports and seeds; `notermd/app` owns app content;
tests should prove provenance and runnable shape without freezing Noter-owned assumptions into the
template.

## Next Experiment Recommendation

Stop adding more broad experiments for the moment. The first five experiments now cover cleanup,
PR/GitHub discovery, route validation, typed provider-boundary refactoring, and
research-to-implementation/app-template adoption. The next best step is to draft actual portable
skill/package artifacts from the surviving boundaries, then use smaller targeted experiments to test
those draft artifacts.
