# Onboarding Video Click System Reset

Date: 2026-04-21

## Why This Note Exists

The current onboarding-video branch already has a pushed checkpoint, so future
work on click handling does not need to preserve local-only experiments. The
operator explicitly asked for a reset in approach:

- do not preserve backwards compatibility with broken or low-value click code
- feel free to delete spaghetti code instead of layering more fixes onto it
- optimize for a good-looking final video, not for keeping every current code
  path alive

## Current Branch Safety

As of this note, the branch already has pushed checkpoints on GitHub, so we can
refactor aggressively without risking loss of the previous state.

## Operator Guidance

- Prefer one coherent click-highlighting system over multiple partially-working
  paths.
- Do not keep compatibility shims for experimental click-rendering code if they
  make the system harder to reason about.
- Treat "it sort of works on some clicks" as a failure, not as acceptable
  progress.
- The success metric is visual quality and consistency in the final MP4.

## Reported Regression Pattern

Observed in the current rendered video:

1. click GitHub tab: circle is good
2. click GitHub page: circle appears and stays at a lower radius
3. click Convex tab: circle appears but stops at a lower radius; bigger than
   step 2
4. click Convex page: circle does not appear
5. click Cloudflare tab: circle is good
6. click Cloudflare page: circle is good
7. click Codex tab: circle stops before the end; radius is bigger than step 2
8. click Codex page: circle does not appear
9. click GitHub tab: circle is good

## Acceptance Criteria For The Replacement System

- Every click uses the same timing model.
- Every click ring reaches its intended maximum radius instead of freezing at a
  smaller one.
- No click ring disappears entirely for page clicks.
- Cursor movement, click timing, and click-ring visibility should read as a
  single human action:
  - move to target
  - settle
  - click
  - keep the cursor still while the ring is visible
  - then move to the next target

## Implementation Preference

If the cleanest fix is to remove or replace the current overlay pipeline, do
that instead of preserving existing code paths out of inertia.
