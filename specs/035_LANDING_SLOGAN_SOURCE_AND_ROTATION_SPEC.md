# 035 Landing Slogan Source And Rotation Spec

## Document Control

- Status: Proposed
- Owner: Noter product
- Last updated: 2026-03-04
- Related files:
  - `slogans.md`
  - `apps/noter/src/SignInForm.tsx`
  - `TODO.md`

## Summary

Define a markdown-first source of truth for landing slogans so copy can be
updated without touching code, and prepare rotation behavior for future
implementation.

## Why This Spec Exists

Landing copy should be easy to evolve. Right now, the headline is hard-coded. We
want slogan management to be content-first:

1. edit one markdown file,
2. keep slogans short and memorable,
3. rotate over time once rendering logic is wired.

## Goals

1. Keep slogans in a single markdown file with one slogan per line.
2. Make slogan updates possible with no code changes.
3. Support future time-based rotation from that file.
4. Preserve the existing landing headline as one of the options.

## Non-Goals (This Step)

1. Implementing rendering logic in the frontend.
2. Finalizing the exact rotation interval.
3. Building admin UI for slogan editing.

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

## Rotation Strategy (Decision Deferred)

The exact interval is intentionally deferred. Candidate options:

1. Rotate on each page load (simplest).
2. Rotate every 4 hours.
3. Rotate every 8 hours.
4. Rotate daily.

Recommended first implementation when we start coding:

1. Read slogans from `slogans.md`.
2. Choose one slogan deterministically by time bucket (to avoid flicker).
3. Keep one slogan visible per visitor at a time.

## UX Constraints

1. Slogan changes must not require deploy-time code edits.
2. Landing should still work if file has one slogan (no rotation needed).
3. If parsing fails, fall back to current static headline.

## Acceptance Criteria

1. A non-technical edit to `slogans.md` can add/remove slogans.
2. The file contains only line-based slogans and stays human-readable.
3. Landing integration can be implemented later without changing file format.
