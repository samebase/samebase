# 035 Landing Slogan Source And Selection Spec

## Document Control

- Status: Implemented
- Owner: Noter product
- Last updated: 2026-04-20
- Related files:
  - `slogans.md`
  - `apps/noter/vite.config.ts`
  - `apps/noter/src/lib/landingCopy.ts`
  - `apps/noter/src/lib/landingSlogans.ts`

## Summary

Define a markdown-first source of truth for landing slogans so copy can be
updated without touching code, and select one slogan at build time so each
deploy keeps a stable landing headline until the next build.

## Why This Spec Exists

Landing copy should be easy to evolve. Right now, the headline is hard-coded. We
want slogan management to be content-first:

1. edit one markdown file,
2. keep slogans short and memorable,
3. let each new build pick a fresh slogan without reshuffling on refresh.

## Goals

1. Keep slogans in a single markdown file with one slogan per line.
2. Make slogan updates possible with no code changes.
3. Select one slogan once per frontend build.
4. Preserve the existing landing headline as one of the options.

## Non-Goals (This Step)

1. Building admin UI for slogan editing.
2. Per-user targeting of slogan variants.
3. Dynamic runtime editing from the browser UI.

## Source Of Truth

Path: `slogans.md` at repository root.

Format contract:

1. One slogan per Markdown bullet item (`- slogan text`).
2. No frontmatter.
3. Empty lines are ignored by parser logic.
4. Keep slogans concise; target 3-7 words when possible.

Initial file content:

1. `- Noter is a collaborative markdown workspace on top of GitHub`
2. `- Junior devs, senior stack`
3. `- If Notion and Obsidian had a baby`

## Selection Strategy (Implemented)

The current implementation selects randomly per build:

1. During Vite config evaluation, read slogans from `slogans.md`.
2. Parse Markdown bullet items (`- slogan`) into a slogan array.
3. Select `slogans[floor(Math.random() * slogans.length)]` once.
4. Inject the selected slogan into the frontend bundle as a build constant.
5. Render the injected slogan from shared landing-copy code in both the fast
   public shell and the post-boot app.

This keeps the current SPA + fast-shell architecture from
`specs/061_FAST_PUBLIC_LANDING_BOOT_SPEC.md` while avoiding the copy reshuffle
that made the landing feel less static than intended.

## UX Constraints

1. Slogan changes must not require deploy-time code edits.
2. Reloading the same deployed landing page must keep the same slogan.
3. Landing should still work if the file has one slogan.
4. If parsing fails, fall back to the current static headline.

## Acceptance Criteria

1. A non-technical edit to `slogans.md` can add/remove slogans.
2. The file contains only line-based slogans and stays human-readable.
3. The same build keeps one stable landing slogan across refreshes.
4. A later build may pick a different slogan without changing the file format.
