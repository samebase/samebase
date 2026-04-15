# Private File Share Fixture Experiments

## Status

- Date: April 16, 2026
- Scope: `apps/noter`
- Type: exploratory fixture research

## Prompt We Are Answering

How should Noter expose a single allowed file from a private GitHub repository,
starting with `slogans.md`, while keeping the implementation easy to read,
accessible, and fast to extend?

## Constraints Saved From This Discussion

These rules came directly from the operator request and should guide follow-up
work:

- Start from `WorkspaceLayoutV2` instead of inventing a separate public-page
  shell first.
- Add Tailwind only when it is explicitly needed for spacing, contrast, or
  layout. Do not make it the content model.
- Optimize for code easiness over clever rendering pipelines.
- Keep the output readable for humans and assistive technology first.
- Treat the feature as an accessibility aid as much as a sharing feature.
- Prefer shapes that make later features faster to build instead of more
  abstract.

## Fixture Modes Added

The visual fixture now includes three experiments:

1. `private-file-share-ssr`
2. `private-file-share-spa`
3. `private-file-share-progressive`

All three use the same shared page model:

- a literal allowlist with one public path
- a semantic article for the public document
- minimal utility classes only for layout and contrast
- real `slogans.md` content so the exercise stays concrete

## What The Experiments Suggest

### 1. HTML-first beats renderer-first

The cleanest baseline is not "which markdown renderer should we use?" but "can
we return a readable article immediately?" Once the shared page is already
semantic HTML, both SSR and SPA variants become easier to reason about.

### 2. SSR is the smallest honest fast path

If the public file needs to feel instant and stand alone, request-time HTML is
the easiest story:

- fetch one allowed blob
- render one article
- return one page

That keeps auth, caching, and visibility policy separate from UI complexity.

### 3. SPA is still viable if it stays plain

A SPA route can still work if it only loads one file payload and renders the
same semantic article shape. The risk is not "SPA" by itself. The risk is
letting the public page inherit a full editor-style rendering stack before that
complexity is necessary.

### 4. Progressive enhancement is the safest expansion path

If later we need richer markdown handling, it should attach to a working HTML
baseline. That keeps the shared page accessible even when enhancement fails and
prevents the renderer from becoming the feature's core dependency too early.

## Current Recommendation

If we build this beyond fixtures, the default recommendation is:

1. Start with a literal per-repo allowlist for public files.
2. Ship a semantic HTML public page for the allowed file.
3. Prefer SSR when the page should stand alone and feel instant.
4. If we stay in the SPA temporarily, keep the first paint identical to the SSR
   shape.
5. Add renderer-level upgrades only for concrete content needs such as tables,
   callouts, or syntax highlighting.
6. Treat `/?dev` as the author-mode switch for the same shared page instead of
   splitting read and edit across different routes too early.

## Follow-up Direction

This fixture note captures the rendering experiments only. The current product
direction has moved toward saving a publish record in Convex when the owner
clicks `Publish`, then resolving a stable public link from that record.

See
[2026-04-16-convex-published-file-links.md](/Users/nicu/.codex/worktrees/664a/noter/research/2026-04-16-convex-published-file-links.md:1)
for the current recommendation.

## Why This Fits The Product

This direction keeps the code understandable in code review, gives screen
readers a simpler target, and keeps future work incremental:

- metadata and canonical share URLs can layer onto the same page
- richer markdown can remain optional
- the public feature can stay narrow instead of turning into a public editor
- single-file sharing can later expand into a small explicit allowlist without
  changing the baseline contract
