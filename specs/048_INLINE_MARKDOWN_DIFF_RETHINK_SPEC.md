# 048 Inline Markdown Diff Rethink Spec

## Goal

Replace the current fragile custom inline markdown diff editor with a safer implementation that can:

- show inline edits inside a line, not only full-line changes
- remain editable
- handle multiple changed regions without decoration crashes
- keep styling consistent with the existing diff colors

## Current State

The current `Inline` mode is a custom layer on top of
[`ProsemarkReadOnly`](../apps/samebase/src/components/ProsemarkReadOnly.tsx) and
[`FileView`](../apps/samebase/src/components/FileView.tsx).

It currently:

- diffs source with `diffLines(...)`
- renders additions as line highlights in the current editable document
- renders removals as injected widget DOM blocks
- autosaves edits back to staging

This got us to a working first pass, but the model is still structurally weak.

## Reproduced Problems

### 1. Inline mode is line-granular, not true intraline diff

Even a one-character change inside a paragraph currently turns into an old-line block plus a
new-line highlight. It does not behave like GitHub-style inline word/character diff.

Why:

- the current implementation uses `diffLines`, not `diffWordsWithSpace` or `diffChars`
- decorations are applied at the line/widget level, not span level

### 2. Multiple changed regions can still break the renderer

Playwright repro on **March 10, 2026**:

1. Open `README.md` in review mode on mobile.
2. Switch to `Inline`.
3. Edit one changed line near the top.
4. Edit a different line later in the document.

Observed failure:

- console error: `Ranges must be added sorted by from position`
- the editor state becomes inconsistent
- the new edit does not reliably turn into a red deleted block + green added line

This confirms the current custom decoration builder is still too brittle once there are multiple
active changed regions.

### 3. Removed content is not a real editor line

Removed text is injected as widget DOM because it no longer exists in the live editable document.
That creates repeated special cases for:

- styling alignment
- block spacing
- line semantics
- selection behavior

## Root Cause Summary

The current approach is trying to simulate a unified merge editor manually using generic CodeMirror
decorations plus Prosemark rich-markdown rendering. That is possible for a prototype, but it is easy
to get wrong in edge cases:

- diff ordering
- widget ordering
- inline vs block decorations
- multiple changed regions
- mapping old/new offsets back into a single live editable document

## Research

### Official CodeMirror path

The official CodeMirror merge package already exposes a unified merge view:

- CodeMirror reference:
  [https://codemirror.net/docs/ref/#merge.unifiedMergeView](https://codemirror.net/docs/ref/#merge.unifiedMergeView)
- CodeMirror changelog entry for `@codemirror/merge 6.10.0` published on **March 6, 2025**:
  [https://codemirror.net/docs/changelog/](https://codemirror.net/docs/changelog/)

Relevant findings from the docs:

- `unifiedMergeView(...)` is designed for a single-editor diff view
- deleted content is shown inside the document via merge-view machinery
- `allowInlineDiffs?: boolean` exists and is intended to display chunks with limited inline changes
  inline in the editor

This is the closest official solution to the UX we want.

### Existing repository constraints

- `apps/samebase/package.json` currently includes `diff`, and this change adds `@codemirror/merge`
- current inline mode is hand-rolled on top of `diffLines`
- current markdown editor stack is based on `@prosemark/core`

### Fallback diff primitives

If we stay custom, the existing `diff` package supports finer-grained token diffing:

- `diffWordsWithSpace`
- `diffChars`

Source:

- [https://github.com/kpdecker/jsdiff](https://github.com/kpdecker/jsdiff)

## Options

### Option A: Rebuild inline mode on top of `@codemirror/merge`

Approach:

- add `@codemirror/merge`
- create a dedicated review-only editor extension using
  `unifiedMergeView({ original, allowInlineDiffs: true })`
- integrate it into the markdown editor surface used for review mode

Pros:

- official CodeMirror path
- built to handle unified editable diff semantics
- likely much more robust for multiple changed regions
- most likely path to real intraline diff without re-implementing merge view

Cons:

- requires dependency addition
- unclear upfront how smoothly it coexists with Prosemark rich-markdown hiding and widgets
- likely needs a spike before committing to full replacement

### Option B: Keep custom editor, add span-level diff decorations

Approach:

- keep the current editable Prosemark surface
- compute changed line pairs
- within those pairs, run `diffWordsWithSpace` or `diffChars`
- render added spans as mark decorations
- render removed spans as inline widgets anchored inside the line

Pros:

- no new major dependency
- maximum styling control

Cons:

- highest complexity
- still custom merge logic
- offset mapping and decoration ordering remain easy to break
- likely more garbage-code risk than the official merge path

### Option C: Separate “rendered review” from “editable source”

Approach:

- stop trying to make the rich inline diff itself editable
- render a GitHub-like review surface separately
- keep editing in the normal source editor

Pros:

- simpler rendering model
- easier to make beautiful

Cons:

- conflicts with the current product direction
- does not satisfy the requirement that the inline view itself be editable

## Recommendation

Do **Option A first** as a spike, not another incremental patch on the current custom decorator
stack.

Decision:

1. Build a review-only spike using `@codemirror/merge` unified merge view.
2. Test whether it can coexist with the current Prosemark markdown experience.
3. If the spike works, replace the current custom `Inline` mode.
4. Only fall back to Option B if the merge package is fundamentally incompatible with the Prosemark
   stack.

## Spike Notes

The merge spike should use the official unified merge editor directly in the review pane:

- `@codemirror/merge`
- `unifiedMergeView({ original, allowInlineDiffs: true })`
- `mergeControls: false` in product UI for now

Add temporary review-only toggles so behavior can be evaluated without further code churn. Start
with:

- `allowInlineDiffs`
- `allowMultipleSelections`
- `rectangularSelection`
- `dropCursor`
- `highlightWhitespace`
- `syntaxHighlightDeletions`
- `collapseUnchanged`

## Proposed Implementation Plan

### Phase 1: Spike

- Add `@codemirror/merge`.
- Create a local fixture/editor proof of concept with:
  - old markdown as `original`
  - staged markdown as the live document
  - `allowInlineDiffs: true`
- Validate:
  - one-character deletion inside a paragraph
  - multiple changed regions in one document
  - mobile interaction
  - no console errors

### Phase 2: Integrate

- Replace the current custom `Inline` mode in review.
- Keep existing `Rich` and `Patch` modes initially.
- Keep the current staging autosave behavior, but wire it to the new editor surface instead of the
  custom widget/decorator path.

### Phase 3: Remove fragile custom code

- Remove the current custom removed-block widget implementation.
- Remove custom inline diff decoration logic that duplicates merge-view behavior.

## Non-Goals

- Fully reproduce GitHub’s markdown AST-aware rich diff rendering in this phase.
- Change normal editor mode outside review.
- Rework patch mode.

## Acceptance Criteria

- Single-character edits inside a line display inline, not only as full-line replacement.
- Editing a second or third changed region does not throw console errors.
- Inline edits persist after autosave and show up in `Patch`.
- Deleted content styling matches the existing diff palette without separate card-like spacing.
- Mobile editing remains usable.

## Notes

The current custom path already produced two real rendering failures during manual Playwright
testing:

- `Block decorations may not be specified via plugins`
- `Ranges must be added sorted by from position`

That is enough evidence to justify a structural rethink rather than continuing to patch the current
custom decorator implementation.
