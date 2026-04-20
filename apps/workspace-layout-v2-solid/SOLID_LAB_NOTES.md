# WorkspaceLayoutV2 Solid Lab Notes

## Current Contract

1. This lab is a literal `left | main | right` shell.
2. Desktop is a plain three-column flex layout.
3. Mobile is a native horizontal overflow carousel with CSS scroll snap.
4. Sidebars shrink-wrap to their content with a floor and a cap.
5. The main pane stays phone-width, so opening a sidebar still leaves a visible
   strip of the main pane.
6. The only behavior code left is the initial mobile jump to the main pane.

## Non-Goals

1. No custom swipe math.
2. No drag thresholds or velocity tracking.
3. No resize handles.
4. No queue model or add-pane experiment.
5. No editor fixtures, route chrome, or app state.

## Why This Version Exists

1. It isolates the carousel behavior from the real app.
2. It makes the shell contract easy to reason about in one file.
3. It shows which parts are truly required and which parts were accidental
   complexity.
