# 035 Landing Slogan Source And Build-Time Selection Spec

## Document Control

- Status: Accepted
- Owner: Samebase product
- Last updated: 2026-05-29
- Related files:
  - `slogans.md`
  - `apps/samebase/dev/landingSlogan.ts`
  - `apps/samebase/vite.config.ts`
  - `apps/samebase/src/lib/noterBuildConfig.ts`
  - `apps/samebase/src/publicSite/landingPageContent.ts`
  - `specs/102_SAMEBASE_PRODUCTION_WORKERS_TANSTACK_START_SPEC.md`

## Summary

Define a markdown-first source of truth for landing slogans so copy can be updated without touching
app code, and select one slogan during the static build/prerender step.

## Why This Spec Exists

Landing copy should be easy to evolve. The headline variants live as content, while production
selection happens at build time:

1. edit one markdown file,
2. keep slogans short and memorable,
3. pick one slogan for the generated landing HTML.

This supersedes the older per-request slogan rotation. Static Site Generation is the intended middle
ground for the public landing route: cheaper than request-time SSR, but faster on first load than a
basic SPA shell because exact `/` has useful prerendered HTML.

## Goals

1. Keep slogans in a single markdown file with one slogan per Markdown bullet.
2. Make slogan updates possible with no code changes.
3. Select one slogan at build/prerender time.

## Non-Goals (This Step)

1. Building admin UI for slogan editing.
2. Per-user targeting of slogan variants.
3. Dynamic runtime editing from the browser UI.
4. Browser-refresh or client-navigation slogan rotation.

## Source Of Truth

Path: `slogans.md` at repository root.

Format contract:

1. One slogan per Markdown bullet item (`- slogan text`).
2. No frontmatter.
3. Empty lines are ignored by parser logic.
4. Keep slogans concise; target 3-7 words when possible.

## Selection Strategy

The current implementation selects one slogan from the app build identity:

1. Read slogans from `slogans.md`.
2. Parse Markdown bullet items (`- slogan`) into a slogan array.
3. Fail the build if no slogans are available.
4. Hash the app build identity and select `slogans[hash % slogans.length]` inside Vite config/build
   code.
5. Inject the selected slogan into the app bundle through the typed build config constant.
6. Render all SPA and prerendered landing surfaces from that same build constant.

The browser must not read `slogans.md`, run slogan selection, or refresh the slogan during
hydration, reload, client navigation, or route-loader execution.

## UX Constraints

1. Slogan changes must not require app code edits.
2. Landing should still work if file has one slogan.
3. If the file has no usable slogan lines, fail the build.

## Acceptance Criteria

1. A non-technical edit to `slogans.md` can add/remove slogans.
2. The file contains only line-based slogans and stays human-readable.
3. The selected slogan varies between builds, not between browser refreshes.
4. The SPA runtime uses the same selected slogan as the prerendered exact-root HTML.
