# 035 Landing Slogan Source And Selection Spec

## Document Control

- Status: Proposed
- Owner: Noter product
- Last updated: 2026-03-04
- Related files:
  - `slogans.md`
  - `apps/noter/src/SignInForm.tsx`
  - `TODO.md`

## Summary

Define a markdown-first source of truth for landing slogans so copy can be updated without touching
code, and select a random slogan for each separate landing request in the sign-in view.

## Why This Spec Exists

Landing copy should be easy to evolve. Right now, the headline is hard-coded. We want slogan
management to be content-first:

1. edit one markdown file,
2. keep slogans short and memorable,
3. pick one slogan at random for each request.

## Goals

1. Keep slogans in a single markdown file with one slogan per line.
2. Make slogan updates possible with no code changes.
3. Select one slogan at random for each separate request.
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

The current implementation selects randomly per request:

1. Read slogans from `slogans.md`.
2. Parse Markdown bullet items (`- slogan`) into a slogan array.
3. Select `slogans[floor(Math.random() * slogans.length)]`.

## UX Constraints

1. Slogan changes must not require deploy-time code edits.
2. Landing should still work if file has one slogan.
3. If parsing fails, fall back to current static headline.

## Acceptance Criteria

1. A non-technical edit to `slogans.md` can add/remove slogans.
2. The file contains only line-based slogans and stays human-readable.
3. Landing integration can be implemented later without changing file format.
