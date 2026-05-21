import { type ReactElement, type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  type MobilePane,
  type WorkspaceLayoutV2ActiveResizeSide,
  type WorkspaceLayoutV2MobileMergedSide,
} from "./WorkspaceLayoutV2Geometry";

type WorkspaceLayoutV2ResolvedPaneContent = {
  leftContent: ReactElement | undefined;
  mainContent: ReactElement;
  rightContent: ReactElement | undefined;
};

function getMobilePaneSeparatorClass(pane: MobilePane, activePane: MobilePane) {
  if (pane === activePane) {
    return "";
  }

  // Mobile pane ownership can change mid-gesture, but pane geometry must stay
  // exact. A 1px content-box delta can rewrap landing copy and editor text.
  return "workspace-mobile-pane-separators";
}

type WorkspaceLayoutV2DesktopViewportProps = WorkspaceLayoutV2ResolvedPaneContent & {
  activeResizeSide: WorkspaceLayoutV2ActiveResizeSide;
  desktopLeftWidthPx: number;
  desktopRightWidthPx: number;
  showLeftPane: boolean;
  showRightPane: boolean;
};

export function WorkspaceLayoutV2DesktopViewport({
  activeResizeSide,
  desktopLeftWidthPx,
  desktopRightWidthPx,
  leftContent,
  mainContent,
  rightContent,
  showLeftPane,
  showRightPane,
}: WorkspaceLayoutV2DesktopViewportProps) {
  return (
    <div className="absolute inset-0 flex min-h-0 overflow-hidden bg-background">
      {showLeftPane ? (
        <div className="h-full min-h-0 shrink-0" style={{ width: `${desktopLeftWidthPx}px` }}>
          <div
            data-testid="workspace-layout-v2-pane-left"
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden",
              desktopLeftWidthPx > 0
                ? activeResizeSide === "left"
                  ? "border-r border-primary"
                  : "border-r border-border"
                : "border-r-0",
            )}
            style={{ width: `${desktopLeftWidthPx}px` }}
          >
            {leftContent}
          </div>
        </div>
      ) : null}

      <div
        data-testid="workspace-layout-v2-pane-main"
        className="h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      >
        {mainContent}
      </div>

      {showRightPane ? (
        <div className="h-full min-h-0 shrink-0" style={{ width: `${desktopRightWidthPx}px` }}>
          <div
            data-testid="workspace-layout-v2-pane-right"
            className={cn(
              "flex h-full min-h-0 flex-col overflow-hidden",
              desktopRightWidthPx > 0
                ? activeResizeSide === "right"
                  ? "border-l border-primary"
                  : "border-l border-border"
                : "border-l-0",
            )}
            style={{ width: `${desktopRightWidthPx}px` }}
          >
            {rightContent}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type WorkspaceLayoutV2MobileViewportProps = WorkspaceLayoutV2ResolvedPaneContent & {
  carouselRef: RefObject<HTMLDivElement | null>;
  leftWidthPx: number;
  lockCarouselScroll: boolean;
  mergedSurfaceSide: WorkspaceLayoutV2MobileMergedSide | null;
  mobilePane: MobilePane;
  paneWidthPx: number;
  peekWidthPx: number;
  rightWidthPx: number;
  showLeftPane: boolean;
  showRightPane: boolean;
};

export function WorkspaceLayoutV2MobileViewport({
  carouselRef,
  leftContent,
  leftWidthPx,
  lockCarouselScroll,
  mainContent,
  mergedSurfaceSide,
  mobilePane,
  paneWidthPx,
  peekWidthPx,
  rightContent,
  rightWidthPx,
  showLeftPane,
  showRightPane,
}: WorkspaceLayoutV2MobileViewportProps) {
  function renderLeftPane(shouldSnap: boolean) {
    if (!showLeftPane) {
      return null;
    }

    return (
      <div
        data-testid="workspace-layout-v2-pane-left"
        className={cn(
          "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          shouldSnap && "snap-start snap-always",
          getMobilePaneSeparatorClass("left", mobilePane),
        )}
        style={{
          width: `${leftWidthPx}px`,
        }}
      >
        {leftContent}
      </div>
    );
  }

  function renderMainPane(shouldSnap: boolean) {
    return (
      <div
        data-workspace-layout-v2-mobile-main-pane
        className={cn(
          "h-full min-h-0 shrink-0",
          shouldSnap ? "snap-center snap-always" : "snap-none",
        )}
        style={{ width: `${paneWidthPx}px` }}
      >
        <div
          className={cn(
            "box-border h-full min-h-0 overflow-hidden bg-background",
            getMobilePaneSeparatorClass("main", mobilePane),
          )}
        >
          {mainContent}
        </div>
      </div>
    );
  }

  function renderRightPane(shouldSnap: boolean) {
    if (!showRightPane) {
      return null;
    }

    return (
      <div
        data-testid="workspace-layout-v2-pane-right"
        className={cn(
          "relative flex h-full min-h-0 shrink-0 flex-col overflow-hidden bg-background",
          shouldSnap && "snap-end snap-always",
          getMobilePaneSeparatorClass("right", mobilePane),
        )}
        style={{
          width: `${rightWidthPx}px`,
        }}
      >
        {rightContent}
      </div>
    );
  }

  const mainPane = renderMainPane(mergedSurfaceSide === null);

  return (
    <div
      ref={carouselRef}
      data-testid="workspace-layout-v2-pane-main"
      className={cn(
        "absolute inset-0 flex min-h-0 snap-x snap-mandatory overflow-y-hidden overscroll-x-contain bg-background [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        lockCarouselScroll ? "overflow-x-hidden" : "overflow-x-auto",
      )}
      style={{
        paddingLeft: `${peekWidthPx}px`,
        paddingRight: `${peekWidthPx}px`,
      }}
    >
      {mergedSurfaceSide === "left" && showLeftPane ? (
        <div
          data-workspace-layout-v2-mobile-merged-pane="left"
          className={cn(
            "flex h-full min-h-0 shrink-0 snap-start snap-always overflow-hidden bg-background",
          )}
          style={{
            width: `${leftWidthPx + paneWidthPx}px`,
          }}
        >
          {renderLeftPane(false)}
          {mainPane}
        </div>
      ) : (
        renderLeftPane(true)
      )}

      {mergedSurfaceSide === null ? mainPane : null}

      {mergedSurfaceSide === "right" && showRightPane ? (
        <div
          data-workspace-layout-v2-mobile-merged-pane="right"
          className={cn(
            "flex h-full min-h-0 shrink-0 snap-end snap-always overflow-hidden bg-background",
          )}
          style={{
            width: `${paneWidthPx + rightWidthPx}px`,
          }}
        >
          {mainPane}
          {renderRightPane(false)}
        </div>
      ) : (
        renderRightPane(true)
      )}
    </div>
  );
}
