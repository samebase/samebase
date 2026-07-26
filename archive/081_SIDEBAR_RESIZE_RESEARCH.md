# 081 Workspace Pane Resize Research And MVP

> Archived 2026-07-26: current workspace layout contracts supersede this research, and its bottom
> panel assumptions no longer exist.

## Document Control

- Status: Implemented in [#404](https://github.com/noter-md/noter/pull/404)
- Owner: Noter frontend
- Last updated: 2026-04-01
- Depends on:
  - `apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/sidebar.tsx`
  - `apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/EditorChatDock.tsx`
  - `archive/073_INDEPENDENT_RIGHT_SIDEBAR_SPEC.md`
  - `archive/080_SHARED_WORKSPACE_LAYOUT_REFACTOR_PLAN.md`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`

## Summary

We want the workspace to behave like a simpler VS Code workbench:

- left sidebar
- center main view
- right sidebar
- bottom panel

The bottom panel already has that resize model today through `EditorChatDock`. This branch brings
the same seam-resize usability to the left and right sidebars on both desktop and mobile.

After reviewing the current workspace shell and the main external libraries, the best first slice
is:

1. keep the current shared shell
2. add dedicated resize handles inside that shell using the same drag interaction pattern as
   `EditorChatDock`
3. support separate left/right widths for desktop and mobile from the start

If we later decide we want a broader resizable layout system beyond the two workspace sidebars,
`react-resizable-panels` is the strongest library option. For this specific slice, though, a custom
shell-native implementation fits the code we already have better than introducing a new panel tree.

## Implementation Update

This branch ships the MVP described above:

- `SidebarProvider` now owns separate left/right width state for desktop and mobile
- `WorkspaceSidebarShell` now clamps desktop widths against a minimum main-pane width, while
  allowing each desktop sidebar to grow up to the smaller of `1000px` and `70%` of the shell width
- `WorkspaceSidebarShell` now clamps mobile widths so an open sidebar can range from `40px` up to
  `viewport width - 40px`
- `WorkspaceSidebarResizeHandle` mirrors the existing `EditorChatDock` separator pattern:
  - pointer capture
  - keyboard resizing
  - `ResizeGripLines`
- desktop uses draggable sidebar seams
- mobile uses a dedicated resize handle on the currently open sidebar so the rest of the shell keeps
  the existing swipe navigation
- the existing bottom panel remains the shared interaction model for the bottom seam, so the overall
  layout now behaves much more like a simplified VS Code workspace
- the visual fixtures now expose both left and right sidebar affordances in the shared dashboard
  shell, and the mobile swipe debug panel no longer sits on top of the top-left shell controls

Follow-up work still deferred:

- durable per-user persistence for pane widths
- any broader conversion from the current shell into a more generalized panel framework

## Current Layout Findings

### 1. Desktop and mobile already share one shell tree

`WorkspaceSidebarShell` currently owns both:

- the desktop three-column grid
- the mobile left/main/right carousel

The same component switches between those modes by changing `gridTemplateColumns`, width, and
overflow behavior. On desktop, sidebars are collapsed by changing the grid columns to `0px`; on
mobile, the same structure becomes a horizontal track whose total width includes the left and right
pane widths.

That centralization is good for this work because sidebar resize belongs in the shell, not in
FileView or dashboard route code.

### 2. Sidebar width is still one shared CSS variable

`SidebarProvider` currently sets one `--sidebar-width` custom property with a default of `16rem`.
`WorkspaceSidebarShell` then maps both `--workspace-left-sidebar-width` and
`--workspace-right-sidebar-width` to that same value.

That means there is not yet any notion of:

- separate left vs right desktop widths
- separate desktop vs mobile widths
- persisted width state

The current code is already close to what we need, though: the shell is consuming width through CSS
variables, so resize can stay local to layout state instead of rewriting route content.

### 3. Mobile already has width-aware pane math

On mobile, `WorkspaceSidebarShell` already measures sidebar lane widths so the carousel can snap to
concrete pane widths, and `workspaceSidebar.ts` already uses left/right width inputs to compute pane
anchors and settling.

That means mobile resize is not alien to the current architecture. The main change is that
user-controlled mobile widths need to become the source of truth instead of passive measurements
from rendered content.

### 4. The shell is a two-row layout, not a simple panel stack

The workspace layout is not just `sidebar | main | sidebar`.

It is a two-row grid with:

- sidebar header cells
- sidebar body cells
- shared main header
- shared main body

Because of that, any library that expects a flat tree of direct `Panel` or `Pane` children will
require more restructuring than a normal split-view page.

### 5. We already have a local accessibility pattern for resize handles

`EditorChatDock` already ships a `role="separator"` handle with:

- pointer capture
- keyboard arrow resizing
- `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`
- a shared visual grip via `ResizeGripLines`

That gives us a repo-native drag model to mirror for sidebar resizing instead of inventing a second
interaction pattern from scratch.

## Requirements For The First Slice

The first shipped slice should:

- let users drag either visible sidebar edge on desktop
- let users resize an open sidebar on mobile
- preserve the existing open/close behavior
- restore the last width when a sidebar is reopened
- keep the main pane visible and usable on both desktop and mobile
- expose an accessible separator with keyboard support
- preserve the current mobile carousel and pane-swipe behavior outside the dedicated resize handle
- use distinct width values for desktop and mobile instead of one shared value

## Options

### Option A. Custom resize in the existing shell

Implementation shape:

- add explicit width state to `SidebarProvider`:
  - desktop:
    - `leftDesktopWidthPx`
    - `rightDesktopWidthPx`
  - mobile:
    - `leftMobileWidthPx`
    - `rightMobileWidthPx`
- change desktop `WorkspaceSidebarShell` columns to use the per-side desktop width variables instead
  of the single shared width token
- drive mobile pane widths and snap anchors from the mobile width values rather than passive content
  measurement alone
- render desktop resize separators between:
  - left sidebar and main pane
  - main pane and right sidebar
- render a mobile resize handle inside the currently open sidebar edge so resize has its own touch
  target and the rest of the surface keeps the current carousel pan behavior
- reuse the same `EditorChatDock` separator pattern:
  - pointer capture for drag lifecycle
  - keyboard arrow resizing
  - `ResizeGripLines` as the visible affordance
- keep the last width in memory even when a sidebar is closed

Pros:

- best fit for the current architecture
- smallest DOM and CSS churn
- no new dependency
- preserves the existing mobile carousel semantics while still enabling mobile width control
- keeps desktop and mobile sizing independent so one breakpoint does not force awkward defaults onto
  the other

Cons:

- we own the pointer math and clamping logic
- we need to define a clean mobile handle placement and gesture boundary
- we need to add our own persistence later if we want it

Why it fits Noter:

- the current shell already owns the desktop grid columns
- the current shell already owns the mobile pane width and snap math
- the current provider already owns sidebar state
- the repo already has an accessible resize-handle implementation to copy

This is the recommended path.

### Option B. `react-resizable-panels` via shadcn `Resizable`

Relevant docs:

- [shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)

What it gives us:

- stack-aligned shadcn wrapper via `pnpm dlx shadcn@latest add resizable`
- visible handles through shadcn's `withHandle` prop
- keyboard-accessible separators
- size APIs that now support percentages, pixels, and other CSS units
- `onLayoutChanged` hooks for persistence

Why it is not the best first slice:

- the underlying library expects `Group`, `Panel`, and `Separator` elements as direct children
- our current workspace shell is a two-row spanning grid, not a flat row of independent panels
- while the library supports resizable handles well, our current mobile sidebar interaction is a
  width-aware carousel rather than a standard `PanelGroup`
- we would still need custom work to preserve the current mobile pan and snap semantics even if
  desktop adopted the library

Verdict:

- best external library candidate
- not the lowest-risk way to ship this exact cross-device usability fix

### Option C. `react-resplit`

Relevant docs:

- [react-resplit](https://github.com/KenanYusuf/react-resplit)
- [WAI-ARIA Window Splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)

What it gives us:

- explicit guidance from the WAI window-splitter pattern
- unstyled primitives
- splitter sizing in `px` or `fr`
- a model that feels closer to CSS grid than many older split-pane libraries

Why it is still a weaker fit than Option A:

- it still wants a `Root` / `Pane` / `Splitter` composition
- we would still need to bridge that model into the current shared desktop + mobile workspace shell
- the ecosystem and existing team familiarity are both smaller than the shadcn plus
  `react-resizable-panels` path

Verdict:

- viable if we want an external but low-style primitive
- still more integration work than a custom desktop handle in the existing shell

### Option D. `react-split-pane`

Relevant docs:

- [react-split-pane](https://github.com/tomkp/react-split-pane)

What it gives us:

- controlled and uncontrolled panes
- keyboard-accessible divider behavior
- built-in persistence helpers for `localStorage` or `sessionStorage`
- snap points and custom divider support

Why it is a weaker fit:

- it introduces another full layout model rather than extending the shell we already have
- it requires explicit parent sizing and would still need custom integration with our two-row
  header/body structure
- it does not buy much for mobile because we would still keep the current carousel semantics there

Verdict:

- capable library
- lower fit than Option A or Option B for this workspace layout

### Looked At But Not Shortlisted: `allotment`

Relevant docs:

- [allotment](https://github.com/johnwalley/allotment)

`allotment` has a polished VS Code-like feel, pane min/max sizing, snap, and an imperative API. It
is still a weaker fit here because it requires its own CSS, expects browser-only usage in some
setups, and is more opinionated than we need for a narrow sidebar-width change.

## Recommendation

Implement sidebar resize directly in the current shared shell for desktop and mobile.

That means:

1. Add width state to `SidebarProvider` and `SidebarContext`.
2. Keep width state separate per side and per mode (`desktop` and `mobile`).
3. Render a desktop `role="separator"` handle for each visible sidebar edge.
4. Render a dedicated mobile resize handle inside the active sidebar edge.
5. Mirror the `EditorChatDock` drag interaction model and reuse `ResizeGripLines`.
6. Drive mobile snap anchors from the explicit mobile width values.
7. Decide separately whether those width values should be persisted.

## Suggested Implementation Notes

### State shape

The cleanest next step is to make width state explicit instead of overloading the current
`--sidebar-width` token:

- `leftDesktopWidthPx`
- `rightDesktopWidthPx`
- `leftMobileWidthPx`
- `rightMobileWidthPx`

Mobile should not reuse the desktop values. Mobile sidebar width also controls how much of the main
view remains visible during drag and where the carousel snaps, so the mobile widths should be
first-class state immediately.

If we later persist widths, these four values should stay independent.

### Resize behavior

The resize handles should:

- clamp to a per-side minimum and maximum width
- preserve a minimum main-pane width
- keep the sidebar width when toggled closed, so reopening restores the last size
- follow the same pointer-capture lifecycle the chat resize handle already uses
- support arrow-key resize in both directions
- ideally support `Home` / `End` shortcuts to jump to min/max, since that lines up with the WAI
  splitter guidance

Mobile-specific behavior:

- the drag must start from a dedicated resize handle, not from any arbitrary horizontal swipe in the
  sidebar
- swiping outside that handle should keep the current pane-navigation behavior
- the mobile handle should resize the currently active sidebar only
- touch hit area should be generous enough that resize feels intentional rather than finicky

### Visual design

The shipped affordance can stay minimal:

- a thin vertical seam
- expanded hit area on hover/focus
- existing `ResizeGripLines`
- no new chrome when the sidebar is closed

On mobile, the handle can sit inside the visible sidebar edge rather than outside the shell. That
keeps the handle discoverable without stealing the whole carousel gesture surface.

That matches the repo's additive-minimalism guidance and keeps the layout from feeling heavier.

## Decision

This PR implements Option A in the existing shared shell.

Keep `react-resizable-panels` as the fallback if we later decide we want a larger panel-system
refactor that goes beyond the two workspace sidebars.

## External References

- [shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [react-resplit](https://github.com/KenanYusuf/react-resplit)
- [react-split-pane](https://github.com/tomkp/react-split-pane)
- [allotment](https://github.com/johnwalley/allotment)
- [WAI-ARIA Window Splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)
