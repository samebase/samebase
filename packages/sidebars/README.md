# @samebase/sidebars

`@samebase/sidebars` is the unstyled React sidebar layout that [samebase.com](https://samebase.com)
uses for its workspace layout. It supports optional left and right panes and owns pane geometry,
mobile scroll snapping, resizing, merge state, accessibility, SSR markup, and prehydration. The
consumer owns visible styling, text, and durable state storage.

> This repository is an automated export of `packages/sidebars` from the Samebase monorepo. The
> monorepo is the source of truth. Do not edit exported files directly. Use
> [GitHub Issues](https://github.com/samebase/sidebars/issues) to report a problem or request a
> change.

The public API follows Base UI conventions. Components render canonical DOM with stable part and
state attributes. The package does not depend on Base UI.

## Install

```sh
pnpm add @samebase/sidebars
```

## Use the layout

```tsx
import { SidebarLayout } from "@samebase/sidebars/SidebarLayout";
import { PaneFrame } from "@samebase/sidebars/PaneFrame";
import {
  SidebarRuntimeProvider,
  useSidebarLayoutPresentation,
  useSidebarActions,
} from "@samebase/sidebars/SidebarRuntime";

function MobilePaneEscape() {
  const { isMobile, mobilePane } = useSidebarLayoutPresentation();
  const { setMobilePane } = useSidebarActions();

  if (!isMobile || mobilePane === "main") return null;

  return (
    <button type="button" onClick={() => setMobilePane("main")}>
      Show main content
    </button>
  );
}

<SidebarRuntimeProvider controller={paneController}>
  <SidebarLayout
    addressChrome={
      <>
        <AddressBar />
        <MobilePaneEscape />
      </>
    }
    left={<PaneFrame content={<FileTree />} />}
    main={<PaneFrame content={<Editor />} />}
    resizeHandleLabels={{
      left: "Resize navigation pane",
      right: "Resize details pane",
    }}
    right={<PaneFrame content={<Inspector />} />}
    formatResizeHandleValueText={({ widthPx }) => `${widthPx} pixels wide`}
  />
</SidebarRuntimeProvider>;
```

Both resize labels are required because the resize separators have no visible text. The value-text
formatter is optional. Without it, the package omits `aria-valuetext` and keeps the numeric ARIA
value.

Keep a visible action that returns to the main pane on mobile. Put it in persistent chrome or in
each side pane so it stays reachable when a side pane covers the main pane.

`useSidebarActions` exposes only `setMobilePane`, `toggleLeftPane`, and `toggleRightPane`.
`useSidebarLayoutPresentation` provides read-only presentation state: `isMobile`, `mobilePane`,
`leftDesktopOpen`, `rightDesktopOpen`, `mobilePaneScrollProgress`, and `mobileMergeProgress`. Merge
progress is available during a resize and after a merge settles. The desktop open fields let
consumer-owned toggle buttons expose their current state.

## Load the structural CSS

`SidebarLayout` imports its required structural CSS. Build tools can also resolve the same file
through `@samebase/sidebars/structure.css`.

Do not replace the structural rules. Runtime geometry and prehydration depend on the canonical pane
order, overflow, scroll snap, separator position, and resize hit areas.

## Style parts and states

The structural stylesheet contains no consumer theme colors, shadows, radii, typography, or
resize-grip artwork. It uses the system `Highlight` color only as a keyboard-focus fallback. Style
the package with its parts, states, and focus-outline variable.

```css
[data-sidebar-layout-part="root"],
[data-sidebar-layout-part="pane"],
[data-sidebar-layout-part="pane-surface"],
[data-sidebar-layout-part="pane-frame"] {
  background: var(--app-background);
}

[data-sidebar-layout-part="root"] {
  --sidebar-layout-focus-outline: 1px solid var(--app-focus-ring);
}

[data-sidebar-layout-part="pane"][data-pane-side="left"],
[data-sidebar-layout-part="pane"][data-pane-side="right"] {
  border-color: var(--app-border);
}

[data-sidebar-layout-part="pane"]::before,
[data-sidebar-layout-part="pane"]::after {
  background: var(--app-border);
}

[data-sidebar-layout-part="resize-grip-indicator"] {
  color: color-mix(in srgb, var(--app-foreground) 70%, transparent);
}

[data-sidebar-layout-part="resize-grip-indicator"]::before {
  width: 3px;
  height: 3px;
  border-radius: 9999px;
  background: currentColor;
  box-shadow:
    0 -7px 0 currentColor,
    0 7px 0 currentColor;
  content: "";
}

[data-sidebar-layout-part="resize-handle"][data-resizing]
  [data-sidebar-layout-part="resize-grip-indicator"] {
  border: 1px solid var(--app-border);
  background: var(--app-background);
}
```

Stable parts are `root`, `address-chrome`, `viewport`, `carousel`, `pane`, `pane-surface`,
`resize-track`, `resize-handle`, `resize-grip-indicator`, `pane-frame`, `pane-header`,
`pane-scrollport`, `pane-content`, and `pane-footer`.

Stable state attributes are `data-mobile-pane`, `data-mobile-min-resize-behavior`,
`data-sidebar-layout-mobile-merged-side`, `data-pane-side`, `data-desktop-open`,
`data-active-resize`, `data-transition-enabled`, `data-resize-side`, `data-resize-mode`,
`data-resizing`, `data-viewport-measured`, and `data-carousel-scroll-locked`.

The package uses `2px solid Highlight` as the default resize-handle focus outline. Consumers can
theme it with `--sidebar-layout-focus-outline` on the layout root.

The runtime writes these read-only geometry variables:

- `--sidebar-layout-left-mobile-width`
- `--sidebar-layout-main-mobile-width`
- `--sidebar-layout-right-mobile-width`
- `--sidebar-layout-left-desktop-width`
- `--sidebar-layout-right-desktop-width`

## Store and prehydrate pane state

The runtime accepts a `SidebarLayoutStateController`. A consumer can keep this state in memory,
browser storage, a server store, or a combination. The package does not select storage. It marks
width writes as `width_deferred` and all other durable state changes as `immediate`.

Prehydration builders accept a self-contained `readState(): SidebarLayoutPrehydrationState | null`
function. The package serializes this function into the generated script. The function must not
close over module variables. It can read and validate the consumer's selected storage format. The
package does not know the storage key, envelope, or version.

Render the desktop script and then the mobile script immediately after the matching layout markup.
Give each concurrently rendered layout a unique `desktopStyleElementId`. The desktop script measures
and scopes that layout only. Call `clearSidebarLayoutDesktopPrehydrationStyle` after the client
state takes ownership.

## Development

Use Node 24.11.0 or later and pnpm 11.18.0 or later.

```sh
pnpm install --frozen-lockfile
pnpm check
```

The package check formats and lints the source, checks TypeScript, runs the package tests, builds
the ESM and declaration outputs, and installs the packed tarball in a temporary consumer.
