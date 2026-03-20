# 066 Logo Auto-Rotation Query Stutter Findings

## Document Control

- Status: Investigating
- Owner: Noter frontend/logo preview
- Last updated: 2026-03-21

## Summary

On `/logo`, enabling the `Auto` button currently rewrites the URL query string
on nearly every animation frame. In snapped view mode, that URL sync feeds back
into snapped state rehydration, so the page alternates between an unsnapped
transient rotation and the snapped query-param value. The result is visible
stutter and heavy same-document navigation churn.

## Scope

This note captures the current behavior and root cause only. It does not choose
the final product fix yet.

## Reproduction

1. Open `/logo`
2. Click `Auto`
3. Watch the URL and logo movement while the default snapped view is enabled

Control case:

1. Open `/logo?freeView`
2. Click `Auto`
3. Compare URL behavior and motion against snapped mode

## Measured Behavior

### Default `/logo`

- In a 300ms Playwright sample after clicking `Auto`, `history.replaceState` ran
  72 times
- The URL alternated between:
  - `...?vox=...`
  - `...?vox=...&rot=45.x`
- The scene stayed pinned at the snapped pose instead of progressing smoothly

### `/logo?freeView`

- In the same 300ms sample, `history.replaceState` ran 36 times
- The URL still changed continuously, but `rot` advanced normally instead of
  bouncing back to `45`
- This confirms the stutter is amplified by snap rehydration, not caused by
  Three.js rendering alone

## Root Cause

### 1. Auto-rotation updates React state every frame

`LogoPreviewPage` starts a `requestAnimationFrame` loop when `isAutoRotating` is
enabled and calls `setRotationDegrees(...)` each frame.

Source:

- `apps/noter/src/components/LogoPreviewPage.tsx`

Relevant lines:

- animation loop: `530-559`

### 2. View state is mirrored back into query params on every change

A separate effect rebuilds the search string from the current local state and
calls `setSearchParams(nextSearch, { replace: true })` whenever it differs from
the current query string.

Source:

- `apps/noter/src/components/LogoPreviewPage.tsx`

Relevant lines:

- search-param builder: `296-355`
- URL sync effect: `441-473`

### 3. Query-param rehydration re-snaps the transient auto angle

When `searchParams` change, the component re-reads the view via
`readLogoPreviewView(searchParams)`. That path resolves the view through
`resolveLogoViewState(...)`, which applies the shared landing-page snap config
when snap mode is enabled.

Sources:

- `apps/noter/src/components/LogoPreviewPage.tsx`
- `apps/noter/src/components/logoViewDrag.ts`
- `apps/noter/src/lib/publicLandingLogo.ts`

Relevant lines:

- rehydrate from query params: `425-439`
- snapped view read path: `257-270`
- snap resolution: `109-135`
- landing snap config: `41-55`

### 4. Snap thresholds pull `45.x` back to `45`

The landing logo config uses 45-degree rotation snap targets with a 4-degree
threshold. During auto-rotation near the default starting angle, the transient
rotation values stay within the snap window, so the rehydrated state returns to
`45`.

This creates a loop:

1. Animation frame computes `45.x`
2. URL sync writes `rot=45.x`
3. Query-param rehydrate snaps it back to `45`
4. Next frame computes `45.x` again

## Secondary Observation

The route also canonicalizes `/logo` to include `vox=...` on load because the
page always writes voxel state into the URL. That is not the main stutter, but
it shows the route currently treats the query string as a continuously owned
state sink rather than a user-committed shareable state.

## Likely Fix Directions

These are the most plausible directions based on the current code:

1. Stop syncing query params on every auto-rotation frame
2. Debounce or commit view params only when auto-rotation stops
3. Keep auto-rotation out of snapped query-state rehydration while `Auto` is
   running
4. Separate live scene state from shareable URL state so the URL only tracks
   stable user-committed poses

## Recommendation

Treat this as a state-ownership bug in `LogoPreviewPage`, not a rendering bug in
`NLogoScene`. The primary fix should start by breaking the per-frame URL-update
loop before making any rendering-level changes.
