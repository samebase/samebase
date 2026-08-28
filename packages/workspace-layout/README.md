# @samebase/workspace-layout

This package provides an unstyled React workspace frame with optional left and right panes. It owns
pane geometry, mobile scroll snapping, resizing, merge state, accessibility, SSR markup, and
prehydration. The consumer owns visible styling, text, and durable state storage.

The public API follows Base UI conventions. Components render canonical DOM with stable part and
state attributes. The package does not depend on Base UI.

## Use the layout

```tsx
import { WorkspaceLayoutV2 } from "@samebase/workspace-layout";
import { WorkspaceLayoutV2PaneFrame } from "@samebase/workspace-layout/pane-frame";
import {
  WorkspacePaneRuntimeProvider,
  useWorkspaceLayoutPresentation,
  useWorkspacePaneActions,
} from "@samebase/workspace-layout/runtime";

function MobilePaneEscape() {
  const { isMobile, mobilePane } = useWorkspaceLayoutPresentation();
  const { setMobilePane } = useWorkspacePaneActions();

  if (!isMobile || mobilePane === "main") return null;

  return (
    <button type="button" onClick={() => setMobilePane("main")}>
      Show main workspace
    </button>
  );
}

<WorkspacePaneRuntimeProvider controller={paneController}>
  <WorkspaceLayoutV2
    addressChrome={
      <>
        <AddressBar />
        <MobilePaneEscape />
      </>
    }
    left={<WorkspaceLayoutV2PaneFrame content={<FileTree />} />}
    main={<WorkspaceLayoutV2PaneFrame content={<Editor />} />}
    resizeHandleLabels={{
      left: "Resize navigation pane",
      right: "Resize details pane",
    }}
    right={<WorkspaceLayoutV2PaneFrame content={<Inspector />} />}
    formatResizeHandleValueText={({ widthPx }) => `${widthPx} pixels wide`}
  />
</WorkspacePaneRuntimeProvider>;
```

Both resize labels are required because the resize separators have no visible text. The value-text
formatter is optional. Without it, the package omits `aria-valuetext` and keeps the numeric ARIA
value.

Keep a visible action that returns to the main pane on mobile. Put it in persistent chrome or in
each side pane so it stays reachable when a side pane covers the main pane.

`useWorkspacePaneActions` exposes only `openRightPane`, `setMobilePane`, `toggleLeftPane`, and
`toggleRightPane`. `useWorkspaceLayoutPresentation` provides read-only presentation state:
`isMobile`, `mobilePane`, `mobilePaneScrollProgress`, and `mobileMergeProgress`. Merge progress is
available during a resize and after a merge settles.

## Load the structural CSS

`WorkspaceLayoutV2` imports its required structural CSS. Build tools can also resolve the same file
through `@samebase/workspace-layout/structure.css`.

Do not replace the structural rules. Runtime geometry and prehydration depend on the canonical pane
order, overflow, scroll snap, separator position, and resize hit areas.

## Style parts and states

The structural stylesheet contains no colors, shadows, radii, typography, focus-ring theme, or
resize-grip artwork. Style those items with the part and state attributes.

```css
[data-workspace-layout-part="root"],
[data-workspace-layout-part="pane"],
[data-workspace-layout-part="pane-surface"],
[data-workspace-layout-part="pane-frame"] {
  background: var(--app-background);
}

[data-workspace-layout-part="pane"][data-pane-side="left"]::after,
[data-workspace-layout-part="pane"][data-pane-side="right"]::before,
[data-workspace-layout-v2-mobile-separator-pane]::before,
[data-workspace-layout-v2-mobile-separator-pane]::after {
  background: var(--app-border);
}

[data-workspace-layout-part="resize-handle"]:focus-visible {
  outline: 1px solid var(--app-focus-ring);
}

[data-workspace-layout-part="resize-grip-indicator"] {
  color: color-mix(in srgb, var(--app-foreground) 70%, transparent);
}

[data-workspace-layout-part="resize-grip-indicator"]::before {
  width: 3px;
  height: 3px;
  border-radius: 9999px;
  background: currentColor;
  box-shadow:
    0 -7px 0 currentColor,
    0 7px 0 currentColor;
  content: "";
}

[data-workspace-layout-part="resize-handle"][data-resizing]
  [data-workspace-layout-part="resize-grip-indicator"] {
  border: 1px solid var(--app-border);
  background: var(--app-background);
}
```

Stable parts are `root`, `address-chrome`, `viewport`, `carousel`, `pane`, `pane-surface`,
`resize-track`, `resize-handle`, `resize-grip-indicator`, `pane-frame`, `pane-header`,
`pane-scrollport`, `pane-content`, and `pane-footer`.

Stable state attributes are `data-mobile-pane`, `data-workspace-layout-v2-mobile-merged-side`,
`data-pane-side`, `data-desktop-open`, `data-active-resize`, `data-transition-enabled`,
`data-resize-side`, `data-resize-mode`, `data-resizing`, and `data-viewport-measured`.

The runtime writes these read-only geometry variables:

- `--workspace-layout-v2-left-mobile-width`
- `--workspace-layout-v2-main-mobile-width`
- `--workspace-layout-v2-right-mobile-width`
- `--workspace-layout-v2-left-desktop-width`
- `--workspace-layout-v2-right-desktop-width`

## Store and prehydrate pane state

The runtime accepts a `WorkspaceSidebarStateController`. A consumer can keep this state in memory,
browser storage, a server store, or a combination. The package does not select storage. It marks
width writes as `width_deferred` and all other durable state changes as `immediate`.

Prehydration builders accept a self-contained
`readState(): WorkspaceLayoutV2PrehydrationState | null` function. The package serializes this
function into the generated script. The function must not close over module variables. It can read
and validate the consumer's selected storage format. The package does not know the storage key,
envelope, or version.
