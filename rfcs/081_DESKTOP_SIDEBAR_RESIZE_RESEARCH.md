# 081 Desktop Sidebar Resize Research

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-04-01
- Depends on:
  - `apps/noter/src/components/workspace-layout/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/sidebar.tsx`
  - `apps/noter/src/components/workspace-layout/RepositoryWorkspaceFrame.tsx`
  - `apps/noter/src/components/EditorChatDock.tsx`
  - `rfcs/073_INDEPENDENT_RIGHT_SIDEBAR_SPEC.md`
  - `rfcs/080_SHARED_WORKSPACE_LAYOUT_REFACTOR_PLAN.md`

## Summary

We want a desktop affordance that lets people drag the left or right sidebar
edge to make the sidebar wider or narrower.

After reviewing the current workspace shell and the main external libraries, the
best first slice is:

1. keep the current shared shell
2. add desktop-only resize handles inside that shell using the same drag
   interaction pattern as `EditorChatDock`
3. store desktop widths separately from future mobile width decisions

If we later decide we want a broader resizable layout system beyond the two
workspace sidebars, `react-resizable-panels` is the strongest library option.
For this specific slice, though, a custom desktop implementation fits the code
we already have better than introducing a new panel tree.

## Current Layout Findings

### 1. Desktop and mobile already share one shell tree

`WorkspaceSidebarShell` currently owns both:

- the desktop three-column grid
- the mobile left/main/right carousel

The same component switches between those modes by changing
`gridTemplateColumns`, width, and overflow behavior. On desktop, sidebars are
collapsed by changing the grid columns to `0px`; on mobile, the same structure
becomes a horizontal track whose total width includes the left and right pane
widths.

That centralization is good for this work because desktop resize belongs in the
shell, not in FileView or dashboard route code.

### 2. Sidebar width is still one shared CSS variable

`SidebarProvider` currently sets one `--sidebar-width` custom property with a
default of `16rem`. `WorkspaceSidebarShell` then maps both
`--workspace-left-sidebar-width` and `--workspace-right-sidebar-width` to that
same value.

That means there is not yet any notion of:

- separate left vs right desktop widths
- separate desktop vs mobile widths
- persisted width state

The current code is already close to what we need, though: the shell is
consuming width through CSS variables, so resize can stay local to layout state
instead of rewriting route content.

### 3. The shell is a two-row layout, not a simple panel stack

The workspace layout is not just `sidebar | main | sidebar`.

It is a two-row grid with:

- sidebar header cells
- sidebar body cells
- shared main header
- shared main body

Because of that, any library that expects a flat tree of direct `Panel` or
`Pane` children will require more restructuring than a normal split-view page.

### 4. We already have a local accessibility pattern for resize handles

`EditorChatDock` already ships a `role="separator"` handle with:

- pointer capture
- keyboard arrow resizing
- `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`
- a shared visual grip via `ResizeGripLines`

That gives us a repo-native drag model to mirror for sidebar resizing instead of
inventing a second interaction pattern from scratch.

## Requirements For The First Slice

The desktop-only slice should:

- let users drag either visible sidebar edge
- preserve the existing open/close behavior
- restore the last width when a sidebar is reopened
- keep the main pane from collapsing into unusable width
- expose an accessible separator with keyboard support
- avoid changing current mobile carousel behavior

This slice does not need to solve mobile width persistence. That can stay a
follow-up.

## Options

### Option A. Custom desktop resize in the existing shell

Implementation shape:

- add desktop width state to `SidebarProvider`, for example:
  - `leftDesktopWidthPx`
  - `rightDesktopWidthPx`
- keep mobile on the existing measured-width path for now
- change desktop `WorkspaceSidebarShell` columns to use the per-side desktop
  width variables instead of the single shared width token
- render desktop-only resize separators between:
  - left sidebar and main pane
  - main pane and right sidebar
- reuse the same `EditorChatDock` separator pattern:
  - pointer capture for drag lifecycle
  - keyboard arrow resizing
  - `ResizeGripLines` as the visible affordance
- keep the last width in memory even when a sidebar is closed

Pros:

- best fit for the current architecture
- smallest DOM and CSS churn
- no new dependency
- preserves the existing mobile shell untouched
- makes future desktop/mobile width separation straightforward

Cons:

- we own the pointer math and clamping logic
- we need to add our own persistence later if we want it

Why it fits Noter:

- the current shell already owns the desktop grid columns
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

- the underlying library expects `Group`, `Panel`, and `Separator` elements as
  direct children
- our current workspace shell is a two-row spanning grid, not a flat row of
  independent panels
- we would either need a larger desktop refactor now or a second mobile layout
  path later, because the current mobile carousel is not the same thing as a
  desktop `PanelGroup`

Verdict:

- best external library candidate
- not the lowest-risk way to ship this exact usability fix

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
- we would still need to bridge that model into the current shared desktop +
  mobile workspace shell
- the ecosystem and existing team familiarity are both smaller than the shadcn
  plus `react-resizable-panels` path

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

- it introduces another full layout model rather than extending the shell we
  already have
- it requires explicit parent sizing and would still need custom integration
  with our two-row header/body structure
- it does not buy much for mobile because we would still keep the current
  carousel semantics there

Verdict:

- capable library
- lower fit than Option A or Option B for this workspace layout

### Looked At But Not Shortlisted: `allotment`

Relevant docs:

- [allotment](https://github.com/johnwalley/allotment)

`allotment` has a polished VS Code-like feel, pane min/max sizing, snap, and an
imperative API. It is still a weaker fit here because it requires its own CSS,
expects browser-only usage in some setups, and is more opinionated than we need
for a narrow sidebar-width change.

## Recommendation

Implement desktop sidebar resize directly in the current shared shell.

That means:

1. Add width state to `SidebarProvider` and `SidebarContext`.
2. Keep width state separate per side on desktop.
3. Keep current mobile pane behavior unchanged for now.
4. Render a desktop `role="separator"` handle for each visible sidebar edge.
5. Mirror the `EditorChatDock` drag interaction model and reuse
   `ResizeGripLines`.
6. Defer persistence until we decide the desktop/mobile storage contract.

## Suggested Implementation Notes

### State shape

The cleanest next step is to make width state explicit instead of overloading
the current `--sidebar-width` token:

- `leftDesktopWidthPx`
- `rightDesktopWidthPx`

If we later want persistence plus separate mobile widths, we should not try to
reuse these same values for the mobile carousel. Mobile is a different product
constraint because pane width also controls how much of the main view remains
visible during drag.

The likely follow-up state shape is:

- desktop:
  - `leftDesktopWidthPx`
  - `rightDesktopWidthPx`
- mobile:
  - `leftMobileWidthPx`
  - `rightMobileWidthPx`

For this slice, desktop-only state is enough.

### Resize behavior

The desktop handle should:

- clamp to a per-side minimum and maximum width
- preserve a minimum main-pane width
- keep the sidebar width when toggled closed, so reopening restores the last
  size
- follow the same pointer-capture lifecycle the chat resize handle already uses
- support arrow-key resize in both directions
- ideally support `Home` / `End` shortcuts to jump to min/max, since that lines
  up with the WAI splitter guidance

### Visual design

The shipped affordance can stay minimal:

- a thin vertical seam
- expanded hit area on hover/focus
- existing `ResizeGripLines`
- no new chrome when the sidebar is closed

That matches the repo's additive-minimalism guidance and keeps the layout from
feeling heavier.

## Decision

Proceed with Option A when implementation starts.

Keep `react-resizable-panels` as the fallback if we later decide we want a
larger panel-system refactor that goes beyond the two workspace sidebars.

## External References

- [shadcn Resizable](https://ui.shadcn.com/docs/components/radix/resizable)
- [react-resizable-panels](https://github.com/bvaughn/react-resizable-panels)
- [react-resplit](https://github.com/KenanYusuf/react-resplit)
- [react-split-pane](https://github.com/tomkp/react-split-pane)
- [allotment](https://github.com/johnwalley/allotment)
- [WAI-ARIA Window Splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/)
