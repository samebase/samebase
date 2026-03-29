import { useRef, type CSSProperties, type ReactNode } from "react";
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
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const {
    closeHandleWidthPx,
    drawerWidthPx,
    onDismissSurfaceClickCapture,
    onDismissSurfacePointerCancel,
    onDismissSurfacePointerDown,
    onDismissSurfacePointerMove,
    onDismissSurfacePointerUp,
    onDismissSurfaceTouchCancel,
    onDismissSurfaceTouchEnd,
    onDismissSurfaceTouchMove,
    onDismissSurfaceTouchStart,
    onCloseHandlePointerCancel,
    onCloseHandlePointerDown,
    onCloseHandlePointerMove,
    onCloseHandlePointerUp,
    onCloseHandleTouchCancel,
    onCloseHandleTouchEnd,
    onCloseHandleTouchMove,
    onCloseHandleTouchStart,
    revealProgress,
    trackStyle,
  } = useMobileSidebarDrag({
    enabled: hasSidebar,
    openDragRegion,
    open: openMobile,
    onOpenChange: setOpenMobile,
    viewportRef,
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
    width: `calc(100% + ${drawerWidthPx}px)`,
  } satisfies CSSProperties;

  const sidebarStyle = {
    flexBasis: `${drawerWidthPx}px`,
    flexGrow: 0,
    flexShrink: 0,
    width: `${drawerWidthPx}px`,
  } satisfies CSSProperties;

  const mainStyle = {
    flexBasis: `calc(100% - ${drawerWidthPx}px)`,
    flexGrow: 0,
    flexShrink: 0,
    width: `calc(100% - ${drawerWidthPx}px)`,
  } satisfies CSSProperties;
  const dismissibleMainStyle = openMobile
    ? ({
        ...mainStyle,
        touchAction: "pan-y",
      } satisfies CSSProperties)
    : mainStyle;

  return (
    <div
      ref={viewportRef}
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
            onTouchCancel={onCloseHandleTouchCancel}
            onTouchEnd={onCloseHandleTouchEnd}
            onTouchMove={onCloseHandleTouchMove}
            onTouchStart={onCloseHandleTouchStart}
            style={{
              touchAction: "pan-y",
              width: `${closeHandleWidthPx}px`,
            }}
          />
        </div>
        <div
          data-sidebar="mobile-viewport-main"
          className="h-full min-w-0 shrink-0"
          onClickCapture={openMobile ? onDismissSurfaceClickCapture : undefined}
          onPointerCancel={
            openMobile ? onDismissSurfacePointerCancel : undefined
          }
          onPointerDown={openMobile ? onDismissSurfacePointerDown : undefined}
          onPointerMove={openMobile ? onDismissSurfacePointerMove : undefined}
          onPointerUp={openMobile ? onDismissSurfacePointerUp : undefined}
          onTouchCancel={openMobile ? onDismissSurfaceTouchCancel : undefined}
          onTouchEnd={openMobile ? onDismissSurfaceTouchEnd : undefined}
          onTouchMove={openMobile ? onDismissSurfaceTouchMove : undefined}
          onTouchStart={openMobile ? onDismissSurfaceTouchStart : undefined}
          style={dismissibleMainStyle}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
