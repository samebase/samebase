# 036 Landing Editor Autosize And Mobile Rollout Spec

## Document Control

- Status: Proposed
- Owner: Noter frontend/editor UX
- Last updated: 2026-03-04
- Related files:
  - `apps/noter/src/components/ProsemarkReadOnly.tsx`
  - `apps/noter/src/SignInForm.tsx`
  - `apps/noter/src/lib/landingDevMode.ts`
  - `AGENTS.md` (mobile keyboard TODO context)

## Summary

Fix landing-page markdown overflow in dev edit mode without broad editor
behavior changes. Implement a scoped fix first (landing usage only), then
graduate to a global default after mobile keyboard behavior and test coverage
are proven.

This spec defines:

1. the immediate landing-only fix,
2. required desktop and mobile validation,
3. an explicit graduation plan for safe global adoption.

## Problem Statement

When landing copy is edited in `?dev` mode, the markdown surface can grow taller
than its wrapper and visually overlap auth controls below it.

Reproduction sample:

```md
## If Notion and Obsidian had a baby

- your notes and code live in a real repository
- collabora
-
-
- - work from desktop or mobile without context switching
- use Codex to ship small apps directly from your workspace
```

Observed behavior:

1. content height increases while typing or with malformed list lines,
2. wrapper height does not keep up,
3. next block (`Google` / password auth controls) renders underneath overflowed
   editor content.

## Root Cause (Current Implementation)

`ProsemarkReadOnly` currently resizes the wrapper on:

1. initial mount,
2. external `value` prop changes,
3. container width changes.

It does not resize on live in-editor document updates when `editable` mode is
active, so typed content can exceed wrapper height.

## Goals

1. Eliminate visual overlap between landing editor content and auth controls.
2. Keep change scoped to landing usage in the first iteration.
3. Verify behavior on desktop and mobile, including keyboard-open scenarios.
4. Define objective gates for global rollout.
5. Add durable tests so regressions are caught automatically.

## Non-Goals (This Iteration)

1. Full redesign of landing layout.
2. Markdown validation or auto-correction of malformed lists.
3. Broad refactor of all CodeMirror/Prosemark editor surfaces.
4. New persistence behavior for landing copy edits.

## Scope Decisions (Locked)

1. Iteration 1 is landing-scoped only.
2. Global behavior change is deferred until mobile and testing gates pass.
3. Fix should be implemented in a reusable way (prop-driven) so global rollout
   later is a config flip, not a rewrite.

## Proposed Design

### API change

Add an opt-in prop to `ProsemarkReadOnly`:

1. `autoResizeOnInput?: boolean` (default `false` in iteration 1).

`SignInForm` enables this prop only for landing copy usage.

### Runtime behavior

When `autoResizeOnInput` is `true`:

1. listen to editor view updates,
2. detect updates that can affect visual height (document/geometry/viewport),
3. schedule wrapper resize using existing measure path,
4. dedupe writes if computed height has not changed.

When `autoResizeOnInput` is `false`:

1. preserve existing behavior exactly.

### Mobile safety constraints

1. Do not attach global keyboard-specific listeners in iteration 1.
2. Keep update work minimal to avoid input lag during keyboard-open viewport
   shifts.
3. Ensure auth controls remain visually below editor content at narrow widths.

## Implementation Plan (Step By Step)

1. Add `autoResizeOnInput` prop to `ProsemarkReadOnly` with default `false`.
2. Add a view update listener gated by `autoResizeOnInput`.
3. Reuse `resizeToContent()`; avoid alternate measurement code paths.
4. Add a small height-change guard (`lastMeasuredHeight`) to avoid redundant DOM
   writes.
5. Wire `autoResizeOnInput={isLandingCopyEditable}` (or explicit `true`) in
   `SignInForm` landing usage.
6. Verify no behavior change in non-landing usages via spot checks.
7. Add tests (unit + focused integration) described below.
8. Run lint/typecheck and manual landing checks for desktop + mobile viewport.
9. Keep rollout to landing only; no global default changes in this PR.

## Testing Strategy

### 1) Automated unit/component tests

Add frontend-focused tests for resize trigger behavior in
`apps/noter/src/components/__tests__/ProsemarkReadOnly.test.tsx` with
`@vitest-environment jsdom`:

1. resizes on mount (existing contract),
2. with `autoResizeOnInput=false`, simulated edit updates do not trigger extra
   resize dispatch,
3. with `autoResizeOnInput=true`, doc/geometry-changing updates trigger resize,
4. dedupe logic prevents redundant height writes.

### 2) Automated integration coverage

Add a focused UI integration test in the existing test framework (or lightweight
harness test) that asserts:

1. landing editor wrapper bottom stays above auth block top after multiline edit
   expansion,
2. check performed at desktop and a mobile viewport width.

If full browser automation is not yet in CI, keep this as a documented manual
gate in iteration 1 and convert to CI automation in follow-up.

### 3) Manual validation checklist

Desktop:

1. open `/?dev`,
2. paste reproduction markdown,
3. confirm no overlap with `Google` button and password auth block.

Mobile viewport (for example 390x844):

1. open `/?dev`,
2. focus editor and type/paste multiline markdown,
3. simulate keyboard-open interaction by maintaining input focus and checking
   layout continuity,
4. confirm auth controls remain below editor and are reachable by scroll.

## Acceptance Criteria

1. Pasting the reproduction markdown in landing dev mode causes no visual
   overlap with auth controls.
2. Landing editor wrapper height tracks live content growth when enabled.
3. Non-landing `ProsemarkReadOnly` behavior is unchanged by default.
4. No TypeScript or lint regressions.
5. Test plan items are implemented or explicitly tracked as follow-up issues
   before global rollout.

## Rollout Plan

### Phase 1 (this change)

1. Ship landing-only opt-in (`autoResizeOnInput=true` for landing usage).
2. Validate with desktop + mobile manual checklist.
3. Add initial automated tests for resize trigger logic.

### Phase 2 (global graduation)

Promote `autoResizeOnInput` to default `true` for all usages only after:

1. mobile keyboard interactions are stable across target devices,
2. integration coverage exists for overlap regression,
3. no performance regressions are observed in editing-heavy views.

### Phase 3 (cleanup)

1. Remove temporary opt-in if globally safe.
2. Simplify prop surface if feature is always-on.
3. Update docs/spec references to reflect global behavior.

## Risks And Mitigations

1. Risk: extra update listener work affects typing performance. Mitigation:
   guard by update type and dedupe equal heights.
2. Risk: mobile viewport shifts trigger resize churn. Mitigation: gate writes to
   actual height changes only.
3. Risk: behavior drift across editor usages. Mitigation: keep iteration 1
   opt-in and landing-scoped.

## Follow-Ups

1. Convert mobile manual gate into reliable CI browser test coverage.
2. Revisit `AGENTS.md` mobile keyboard TODO with concrete remediation tasks.
3. Evaluate whether malformed markdown lines should receive UX hints (separate
   UX decision).
