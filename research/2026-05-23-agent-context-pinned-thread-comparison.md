# Agent Context Pinned Thread Comparison

## Document Control

- Status: Pinned comparison pass
- Date: 2026-05-23
- Related:
  - `research/2026-05-23-agent-context-thread-sample.md`
  - `research/2026-05-23-agent-context-manual-review-pass-1.md`
  - `packages/agent-context/`

## Purpose

This pass checks whether pinned/high-salience Codex threads add materially different workflow
practices from the non-pinned/manual baseline. Pinned threads are useful stress cases, but they are
also biased toward current identity work, active PR handoffs, and meta-work about this extraction.

## Sample

The review sampled pinned thread ids from `/Users/nicu/.codex/.codex-global-state.json`.

Deep sample:

- `019d8793` mobile keyboard behavior
- `019dca2f` lowercase Convex key correction
- `019e5121-b8a5` logo transition research
- `019e5121-a6e8` Chrome/X bookmark archive
- `019dcf85` permissions
- `019e51ce` agent-context extraction
- `019e519d` logo stripes
- `019e5121-ff16` URL editor
- `019e50d1` logo seams
- `019e4c03` Founders research

Spot-checked pinned Noter threads:

- `019ddc1e`
- `019dfd06`
- `019e260e`
- `019e40cb`
- `019e4e9f`
- `019e5029`
- `019e51f4`
- `019e5119`
- `019e51c7`
- `019e51e8`

## Result

The pinned set does not change the main package split. It amplifies existing practices that already
have homes:

- exact route and visual validation belongs in `route-ui-validation`
- branch/PR preservation belongs in `pr-workflow-review` and `noter-operator-workflows`
- user correction handling and evidence-first reasoning belongs in `agent-engineering-core`
- typed state boundaries and delete-first refactors belong in `typed-product-engineering`
- Convex/provider safety belongs in `noter-convex`
- exact cleanup proof belongs in `exact-resource-cleanup`

Examples:

- mobile keyboard work validated real `visualViewport` behavior and preserved PR handoff
- lowercase Convex key showed correction handling after overfitting to Noter assumptions
- permissions work removed an over-clever `useEffect`
- URL editor work separated route reality from local draft state
- logo seam and stripe work used before/after screenshots and Linux visual baselines

## New Candidate

The Chrome/X bookmark archive thread suggests one niche candidate that is not yet represented by the
package: private authenticated browser-data archival.

Candidate rules:

- keep private browser captures under ignored local paths
- report counts and coverage during scraping instead of private content
- prefer hybrid artifacts and manifest coverage maps over raw browser HTML dumps
- use verifiers for archive completeness
- reject black, blank, modal-covered, or otherwise unusable screenshots before accepting frames

Do not promote this to core from pinned evidence alone. Track it as a possible triggerable skill
only if the workflow recurs outside the pinned set.

## Survivorship Bias Guard

Pinned threads should be treated as "important workflows that must still work," not as a frequency
sample of all work. The non-pinned/manual baseline remains the primary weighting source for deciding
core, skill, overlay, and docs boundaries.
