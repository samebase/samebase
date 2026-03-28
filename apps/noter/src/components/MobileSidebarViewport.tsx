import { type CSSProperties, type ReactNode } from "react";
import { useMobileSidebarDrag } from "@/hooks/use-mobile-sidebar-drag";
import { useSidebar } from "@/hooks/use-sidebar";

/**
 * Keeps the mobile sidebar and workspace on one wider track so opening the
 * drawer translates the whole surface instead of shrinking the main pane.
 */
export function MobileSidebarViewport({
  dataTestId,
  openDragRegion,
  sidebar,
  children,
}: {
  dataTestId?: string;
  openDragRegion?: "edge" | "viewport";
  sidebar: ReactNode;
  children: ReactNode;
}) {
  const { openMobile, setOpenMobile } = useSidebar();
  const hasSidebar = sidebar !== null && sidebar !== undefined;

  const {
    closeHandleWidthPx,
    drawerWidthPx,
    onCloseHandlePointerCancel,
    onCloseHandlePointerDown,
    onCloseHandlePointerMove,
    onCloseHandlePointerUp,
    revealProgress,
    trackStyle,
    viewportWidthPx,
  } = useMobileSidebarDrag({
    enabled: hasSidebar,
    openDragRegion,
    open: openMobile,
    onOpenChange: setOpenMobile,
  });

  if (!hasSidebar) {
    return (
      <div data-testid={dataTestId} className="flex h-full w-full">
        {children}
      </div>
    );
  }

  const sidebarIsVisible = revealProgress > 0;
  const translatedTrackStyle = {
    ...trackStyle,
    // The track is wider than the viewport by the drawer width, which lets the
    // main pane keep its full layout width while sliding right to reveal the
    // sidebar.
    width: `${viewportWidthPx + drawerWidthPx}px`,
  } satisfies CSSProperties;
  const sidebarStyle = {
    flex: `0 0 ${drawerWidthPx}px`,
    width: `${drawerWidthPx}px`,
  } satisfies CSSProperties;
  const mainStyle = {
    flex: `0 0 ${viewportWidthPx}px`,
    width: `${viewportWidthPx}px`,
  } satisfies CSSProperties;

  return (
    <div
      data-testid={dataTestId}
      className="relative h-full w-full overflow-hidden"
    >
      <div
        data-sidebar="mobile-viewport-track"
        className="flex h-full min-w-0 will-change-transform"
        style={translatedTrackStyle}
      >
        <div
          aria-hidden={!sidebarIsVisible}
          className="relative h-full shrink-0"
          style={sidebarStyle}
        >
          {sidebar}
          <div
            aria-hidden="true"
            className="absolute inset-y-0 right-0 z-10"
            onPointerCancel={onCloseHandlePointerCancel}
            onPointerDown={onCloseHandlePointerDown}
            onPointerMove={onCloseHandlePointerMove}
            onPointerUp={onCloseHandlePointerUp}
            style={{
              touchAction: "pan-y",
              width: `${closeHandleWidthPx}px`,
            }}
          />
        </div>
        <div
          data-sidebar="mobile-viewport-main"
          className="h-full min-w-0 shrink-0"
          style={mainStyle}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
