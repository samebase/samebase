# 037 Monaco Mobile Full Bleed Spec

## Document Control

- Status: Proposed
- Owner: Noter frontend/editor UX
- Last updated: 2026-03-04
- Related files:
  - `apps/noter/src/components/FileView.tsx`
  - `apps/noter/src/components/CodeEditor.tsx`
  - `apps/noter/src/components/MonacoEditor.tsx`

## Summary

Improve mobile editing ergonomics for Monaco-backed files by reclaiming horizontal space where it
matters most:

1. remove mobile side gutters around the editor surface,
2. hide the right-side Monaco scrollbar on mobile,
3. support a boolean toggle to show/hide mobile line numbers for width tradeoff testing.

Desktop behavior should remain unchanged.

## Problem Statement

On narrow viewports, Monaco currently loses useful text width to three factors:

1. parent layout horizontal padding around the editor container,
2. Monaco vertical scrollbar column on the right,
3. Monaco line-number/gutter spacing on the left.

The result is earlier soft-wrapping and reduced code readability on phones.

## Goals

1. Make Monaco editor content span full phone width (edge-to-edge inside the viewport) while
   preserving surrounding UI spacing.
2. Remove mobile-only right scrollbar width overhead.
3. Add a prop-driven mobile line-number toggle to compare readability vs width.
4. Preserve existing desktop/tablet editor behavior.

## Non-Goals

1. Redesign of the file-view header/controls layout.
2. New persisted user settings UX for editor display preferences.
3. Changes to ProseMark/CodeMirror editor surfaces.

## Proposed Design

### Layout (Monaco wrapper)

1. Keep existing container padding for controls/metadata.
2. Apply mobile-only full-bleed treatment using negative horizontal margin on the Monaco wrapper.
3. Scope the full-bleed treatment to Monaco-backed files only.

### Monaco Runtime Options

On mobile viewport widths:

1. hide vertical scrollbar (`vertical: "hidden"` and size `0`),
2. hide overview ruler lanes,
3. conditionally disable line numbers based on a new boolean prop,
4. reduce left gutter spacing when line numbers are enabled.

On non-mobile viewports:

1. keep existing Monaco defaults/behavior.

### API Surface

Add optional prop:

1. `showMobileLineNumbers?: boolean` (default `false`).

Prop is threaded from `CodeEditorWrapper` to `MonacoEditor`.

## Implementation Plan

1. Add `showMobileLineNumbers` prop to `CodeEditorWrapper` and `MonacoEditor`.
2. Detect mobile viewport in `MonacoEditor` with shared `useIsMobile()`.
3. Build Monaco `options` object with mobile-conditional scrollbar/gutter behavior.
4. Update `MonacoEditor` wrapper styles to become mobile full-bleed.
5. Run lint/typecheck for touched app code.
6. Validate manually in mobile viewport using Playwright.

## Validation Checklist

Mobile viewport (example: 390x844):

1. editor content reaches near full viewport width with no side gutters,
2. no visible right scrollbar strip,
3. line numbers off by default on mobile,
4. when toggled on via prop, content still gains width from full-bleed layout.

Desktop viewport:

1. no visual regressions in editor layout,
2. line numbers remain enabled,
3. standard Monaco scrolling behavior remains.

## Acceptance Criteria

1. Monaco editor is full-bleed on mobile in editor mode.
2. Right vertical scrollbar width is removed on mobile.
3. `showMobileLineNumbers` prop exists and controls mobile line number display.
4. No TypeScript/lint regressions in touched files.
