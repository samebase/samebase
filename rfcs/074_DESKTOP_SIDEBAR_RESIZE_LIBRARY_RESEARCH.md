# 074 Desktop Sidebar Resize Library Research

## Document Control

- Status: Proposed
- Owner: Noter frontend
- Last updated: 2026-03-30
- Depends on:
  - `apps/noter/src/components/EditorChatDock.tsx`
  - `apps/noter/src/components/WorkspaceSidebarShell.tsx`
  - `apps/noter/src/components/sidebar.tsx`
  - `rfcs/073_INDEPENDENT_RIGHT_SIDEBAR_SPEC.md`
  - `specs/072_MOBILE_SIDEBAR_INTERACTIVE_DRAG_SPEC.md`
  - `specs/073_FILE_VIEW_PROSEMARK_MOBILE_PANE_DRAG_SPEC.md`
  - `specs/074_FILE_VIEW_MONACO_MOBILE_PANE_DRAG_SPEC.md`

## Summary

The exact linked X post is not a sidebar-resize library. It showcases DOM-free
text layout and text measurement work, which is interesting for magazine-like
layout engines, but it does not solve Noter's future desktop sidebar dragging
problem.

There is also a separate Cheng Lou drag demo (`https://chenglou.me/demo_drag/`),
but that demo is handwritten DOM event code rather than a reusable package. It
is a good reminder of how messy cross-browser drag code gets when we own it
ourselves, not a strong candidate to copy into product code.

For Noter's actual need, adding desktop-only draggable sidebar widths without
rebuilding the current mobile carousel, the best fit is
`react-resizable-panels`, ideally through the shadcn `Resizable` wrapper so the
integration matches existing repo conventions.

## Current Need

Noter's real requirement is narrower than "generic dragging":

1. Keep the current mobile sidebar model intact.
2. Add desktop sidebar resizing later without hand-rolling the drag system.
3. Support left and right sidebars around one center workspace.
4. Preserve the current shell structure where header and body stay aligned
   across columns.
5. Avoid introducing a library that fights our existing responsive shell or
   demands a full product-wide layout rewrite.
6. Keep future width persistence compatible with repo guidance to store
   user-visible UI state in Convex rather than localStorage.

Relevant current implementation:

- `apps/noter/src/components/sidebar.tsx` hard-codes desktop sidebar width to
  `16rem`.
- `apps/noter/src/components/WorkspaceSidebarShell.tsx` already owns a custom
  mobile left/main/right carousel with scroll snap and delegated editor drag.
- `apps/noter/src/components/EditorChatDock.tsx` already contains a separate
  handwritten vertical resize handle for the bottom chat dock.

That means the future sidebar work is specifically about desktop horizontal pane
resizing. We do not need to replace the shipped mobile drag model to get there.

## What The Linked Post Covers

The exact linked post (`https://x.com/_chenglou/status/2037713766205608234`)
describes a text-layout system that avoids DOM reads and synchronous reflow for
text measurement. That is conceptually adjacent to UI layout, but it targets a
different class of problem:

- computing and rendering text layout
- flowing text around shapes and other content
- avoiding repeated DOM measurement work

That does not map cleanly to Noter's sidebar-resize work, where the core problem
is:

- draggable horizontal separators
- min/max/collapsible pane constraints
- keyboard accessibility for splitters
- preserving widths across desktop viewport changes
- coexisting with our already-shipped mobile carousel

If the intended reference was Cheng Lou's separate draggable-card demo
(`https://chenglou.me/demo_drag/`), that also does not change the
recommendation. The demo is useful as evidence that bespoke drag logic quickly
turns into:

- separate mouse and touch handling
- browser-specific input quirks
- manual animation scheduling
- custom hit testing and gesture ownership

That is exactly the sort of interaction code we should avoid owning unless the
product truly needs novel drag physics.

## Evaluation Criteria

Any library we adopt for future sidebar dragging should satisfy the following:

1. Work well in React 18.
2. Support a horizontal three-pane desktop layout: left sidebar, main, right
   sidebar.
3. Allow pixel-oriented defaults close to the current `16rem` sidebar width.
4. Allow one panel to preserve relative size while sidebars preserve a stable
   visual width.
5. Expose accessible splitter semantics and keyboard controls.
6. Let us keep the current mobile implementation instead of forcing one shared
   drag engine everywhere.
7. Be flexible enough that Noter keeps its own visual styling and shell markup
   decisions.

## Options

### 1. Use the linked text-layout work directly

Recommendation: no.

Why it does not fit:

- It is solving text measurement and text flow, not panel resizing.
- It does not offer a React split-pane API.
- It would still leave us implementing resize handles, panel constraints, and
  accessibility ourselves.
- Adopting it would add conceptual complexity in an area where our need is much
  simpler than the library's thesis.

Possible future value:

- If Noter ever ships custom document/page layout, DOM-free rich text
  measurement, or canvas-rendered editorial surfaces, the linked work could
  become relevant.
- That is separate from desktop sidebar dragging.

### 2. Copy ideas from Cheng Lou's drag demo

Recommendation: no.

Why it does not fit:

- It is a standalone demo, not a maintained package.
- The code is intentionally low-level and browser-workaround-heavy.
- It would still make Noter responsible for the hard parts the request is trying
  to avoid implementing.

The demo is useful only as evidence that "we can just wire the drag ourselves"
is more expensive than it looks.

### 3. `react-resizable-panels` via shadcn `Resizable`

Recommendation: yes. This is the best fit.

Why it fits:

- It is a React-native pane-resize library with active maintenance.
- shadcn already exposes a `Resizable` wrapper built on top of it, which aligns
  with repo conventions.
- The library supports keyboard-accessible separators.
- Panel sizes can be expressed in percentages, pixels, `rem`, and viewport
  units.
- Panels can be collapsible.
- Panels support `groupResizeBehavior`, including `preserve-pixel-size`, which
  is a strong match for sidebar widths that should stay visually stable while
  the main content flexes.
- The imperative APIs (`setLayout`, `resize`, `collapse`, `expand`) are enough
  for future shell integration and persistence.

Why it fits Noter specifically:

- We can adopt it only for desktop and keep `WorkspaceSidebarShell` as-is on
  mobile.
- We can keep the center pane as the owner of our existing header/body grid and
  only resize the outer columns.
- We can make sidebars independent without reintroducing a drawer model.
- The shadcn wrapper gives us a path that does not require product code to
  import raw library primitives everywhere.

Tradeoffs:

- The desktop shell will need some structural refactoring to let panel and
  separator nodes become direct children of the panel group.
- We still need Noter-owned persistence and responsive rules. The library
  handles resizing, not product decisions.
- We should decide explicitly whether collapsed sidebars preserve their previous
  width or reset to default width on reopen.

### 4. `allotment`

Recommendation: possible, but second choice.

Pros:

- Mature enough to be credible.
- Supports pixel `preferredSize`, `minSize`, `maxSize`, snap, and programmatic
  resize/reset.
- Dynamic pane add/remove is built in.

Cons for Noter:

- It brings a more opinionated split-view model and a required stylesheet
  import.
- Its default look-and-feel is intentionally close to VS Code, which is not a
  natural fit for our shell.
- It is browser-only, which is a less clean fit than a library already used by
  shadcn and documented in our component ecosystem.
- It feels more like adopting a split-view system wholesale than layering a
  resize primitive into our existing shell.

### 5. `react-resplit`

Recommendation: interesting, but third choice.

Pros:

- Explicitly follows the W3C window splitter pattern.
- Unstyled by default, which matches Noter's preference for app-owned styling.
- Uses a simple compound-component API.

Cons for Noter:

- Smaller ecosystem and lower adoption.
- The sizing model is more grid/fraction oriented than the shadcn path.
- It would be a fresh dependency choice without any benefit from existing repo
  conventions.

`react-resplit` is a respectable fallback if we reject `react-resizable-panels`,
but it is harder to justify as the first pick in this codebase.

## Recommendation

When we add desktop sidebar dragging, use shadcn's `Resizable` component, which
is built on `react-resizable-panels`.

This gives us the best balance of:

- not reimplementing drag math ourselves
- keeping accessibility and keyboard splitter behavior in a maintained library
- matching React and shadcn usage already familiar in the repo
- allowing pixel-stable sidebar widths
- keeping our current mobile carousel model untouched

The linked X post should not drive the implementation choice for this feature.
It is valuable research in text layout, but it is not the right tool for desktop
sidebar resizing.

## Proposed Integration Shape

### 1. Limit the first adoption to desktop

Do not replace `WorkspaceSidebarShell`'s mobile carousel or delegated editor
drag. The first resize-library adoption should be desktop-only.

This keeps the shipped mobile behavior stable and avoids mixing two separate
problem spaces into one refactor.

### 2. Keep one Noter-owned shell API

`WorkspaceSidebarShell` should remain the app-facing abstraction.

Internally, it can branch:

- mobile: keep today's scroll-snap carousel
- desktop: render a `ResizablePanelGroup`-backed horizontal shell

That preserves current call sites in dashboard and file view while letting the
desktop implementation evolve.

### 3. Make only the outer columns resizable

The center workspace should continue owning the internal header/body structure.

Recommended desktop shape:

1. left sidebar panel
2. resize handle
3. center workspace panel
4. resize handle
5. right sidebar panel

Inside the center panel, keep the existing two-row header/body composition. That
lets us add resizing without entangling the center workspace internals with pane
math.

### 4. Use pixel-stable sidebars

Initial desktop direction:

- left sidebar default size: current `16rem` equivalent
- right sidebar default size: current `16rem` equivalent
- sidebars: `groupResizeBehavior="preserve-pixel-size"`
- main pane: `preserve-relative-size`

That better matches how users think about sidebars than percentage-only
behavior.

### 5. Persist widths in Convex if we decide to persist them

If sidebar widths become user-visible persistent state, store them in Convex
alongside other dashboard/editor layout preferences rather than in cookies or
localStorage.

The resize library can tell us when layout changes. Noter should still own:

- whether widths persist at all
- whether widths are global or per-workspace
- whether collapsed panels remember their last width

### 6. Keep chat dock resizing separate in the first slice

`EditorChatDock` already owns a vertical resize interaction. Do not try to merge
that bottom-dock behavior into the sidebar-resize library adoption.

That can be revisited later if the product wants a more unified desktop layout
system, but it is not required to unblock sidebar dragging.

## Expected Implementation Steps

1. Add shadcn `Resizable` via `npx shadcn@latest add resizable` from
   `apps/noter`.
2. Expose an app-owned wrapper outside `components/ui/*` if Noter needs shared
   styling or defaults.
3. Update desktop `WorkspaceSidebarShell` to use a horizontal panel group.
4. Keep mobile logic unchanged.
5. Add focused visual coverage for desktop left/main/right widths.
6. Add interaction coverage for dragging each divider and reopening collapsed
   sidebars.

## Risks

1. Desktop shell refactor could accidentally regress header/body alignment if we
   mix panel-group structure with the existing grid too aggressively.
2. Persisting widths too early could create product debt if we do not decide
   whether widths are global, per-route, or per-vault.
3. If right-sidebar product ownership changes soon, we should avoid baking in
   assumptions about its default content while doing the resize work.

## Decision

The linked Cheng Lou post is not the right library for sidebar dragging.

When Noter adds desktop sidebar dragging, prefer shadcn `Resizable` /
`react-resizable-panels`, keep the current mobile shell, and treat this as a
desktop shell enhancement rather than a full drag-system rewrite.

## Sources

- Linked X post: `https://x.com/_chenglou/status/2037713766205608234`
- Cheng Lou drag demo: `https://chenglou.me/demo_drag/`
- shadcn `Resizable` docs:
  `https://ui.shadcn.com/docs/components/radix/resizable`
- `react-resizable-panels`: `https://github.com/bvaughn/react-resizable-panels`
- `allotment`: `https://github.com/johnwalley/allotment`
- `react-resplit`: `https://github.com/KenanYusuf/react-resplit`
