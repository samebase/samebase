# Workspace Session Pane State Research

## Summary

The current dashboard-to-repository transition feels like a reload because Noter
still treats the dashboard and file view as separate top-level route scenes. The
better long-term model is a single mutable workspace route backed by
Convex-persisted pane state, not a growing set of long URLs that try to encode
every open pane.

That workspace should be the durable top-level product object: a lightweight
folder of GitHub repositories, closer to a simplified GitHub team or
organization than to a single repository route.

This keeps the URL short, lets the workspace reopen exactly as the user left it,
and makes "open this branch to the right" or "replace the main pane with the
file view" a pane-state transition instead of a route-scene remount.

## Current Findings

- The dashboard and repository view already use the same outer
  `WorkspaceLayoutV2FullPage` shell, but they mount as separate route scenes.
- The workspace already persists some shell state in Convex, so storing richer
  pane/session state in Convex fits the current architecture.
- The accepted workspace model is already effectively four regions: left pane,
  main pane, right pane, and bottom panel.
- Adding more state to the URL would make links harder to read, share, debug,
  and maintain. The URL should identify the workspace, not serialize the full
  workbench.

## Recommended Direction

Use one short workspace route, for example `/w/:workspaceId`, then store the
full pane arrangement in Convex.

The route should answer:

- which durable workspace/session to load
- which workspace to restore
- optional shareable overrides for deep links

Convex should answer:

- which panes are open
- which pane is focused
- which content each pane shows
- how panes are arranged
- any restorable sizing/open-state details

## Workspace Identity

The durable unit should be a workspace, not a page.

An initial workspace model can stay narrow:

```ts
type Workspace = {
  id: string;
  slug: string;
  name: string;
  repositoryFullNames: string[];
};
```

This keeps the product mental model simple:

- one workspace is a folder of repos
- the dashboard is the default view inside that workspace
- opening a repo or branch changes pane state inside the workspace instead of
  navigating to a different app surface
- creating "another dashboard" later can mean saving another view for the same
  workspace rather than inventing another top-level route

## Pane State Shape

An initial model can stay simple:

```ts
type WorkspaceSession = {
  workspaceId: string;
  focusedPaneId: string | null;
  panes: {
    id: string;
    slot: "left" | "main" | "right" | "bottom";
    kind: "dashboard" | "tree" | "file" | "chat";
    open: boolean;
    repositoryFullName?: string;
    branch?: string;
    filePath?: string;
  }[];
};
```

This is intentionally small. The first slice should avoid speculative pane
grids, nested layouts, or a generic window manager.

## URL Contract

The URL should remain canonical and short.

Good examples:

- `/w/noter-md`
- `/w/<workspaceId>`

Possible additive deep-link overrides:

- `?open=<share-token>`
- `?file=<encoded canonical file link>`

The URL should not become the source of truth for every pane, width, tab, and
focus state. Shared deep links can still resolve to a concrete repository/file
inside the session, but the durable workbench belongs in Convex.

In practice, the URL should identify the workspace first and only optionally
override what to focus. The workspace session itself should reopen from Convex.

## Four-Region Model

We do not need four desktop columns as the first target.

The practical workspace model is:

1. left pane
2. main pane
3. right pane
4. bottom panel

That is already enough for the intended Noter workflow:

- dashboard or navigation on the left
- active file/editor in the main pane
- tree or secondary details on the right
- chat/agent/output in the bottom panel

If the product later needs more flexible arrangements, that should be a later
decision after the session model is proven.

## Recommended First Implementation Slice

Build the session model first, then ship mobile pane navigation before resize.

Recommended order:

1. Add a Convex-backed `workspaceSessions` model for pane composition and
   focused-pane state.
2. Add one workspace route that can render dashboard, tree, file, and chat as
   pane kinds from that session state.
3. Support open/close and replace-in-slot behavior for `left`, `main`, `right`,
   and `bottom`.
4. Ship mobile left/main/right pane dragging without resize changes.
5. Add desktop open/close polish and only then tackle resizing.

The key product shift in that slice is that dashboard, repository tree, file
editor, and chat become pane kinds inside one workspace shell instead of
separate route scenes.

## Why Mobile Before Resize

Mobile left/right dragging is the sharper proof that this is one mutable
workspace instead of separate pages.

Reasons to prefer that slice first:

- it validates pane identity and pane transitions before width math complicates
  the implementation
- it forces the team to define the real slot model (`left/main/right/bottom`)
- it delivers the "not a reload, just a pane change" feeling most directly
- desktop open/close can reuse the same session state once the slot model is in
  place

Resize is valuable, but it should follow the session model and basic pane
navigation rather than lead them.

## Explicit Non-Goals For The First Slice

- arbitrary multi-column desktop layouts
- user-authored pane tiling systems
- tabbed panes
- per-pane resizing
- serializing the entire workbench into the URL

## Decision

The next implementation step should be:

1. define the persistent workspace session shape
2. render one workspace route from that shape
3. ship mobile left/main/right dragging with fixed widths

That is the smallest slice that proves the product direction without trapping
the app in another route-local workaround.
