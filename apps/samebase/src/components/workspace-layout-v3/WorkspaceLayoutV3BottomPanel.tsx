import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  WorkspaceLayoutV3PaneFrame,
  type WorkspaceLayoutV3PaneFrameProps,
} from "./WorkspaceLayoutV3PaneFrame";
import {
  WORKSPACE_LAYOUT_V3_PANEL_DEFAULT_HEIGHT_PX,
  WORKSPACE_LAYOUT_V3_PANEL_MIN_HEIGHT_PX,
  clampWorkspaceLayoutV3PanelHeight,
  getDefaultWorkspaceLayoutV3PanelHeight,
  getWorkspaceLayoutV3PanelMaxHeightPx,
} from "./WorkspaceLayoutV3PanelGeometry";
import { WorkspaceLayoutV3ResizeHandle } from "./WorkspaceLayoutV3ResizeHandle";

/**
 * Optional route-owned bottom panel. The previous chat-FAB use of this panel is
 * deprecated, so new/default route chrome should omit chat panels unless a
 * route explicitly opts into reviving that surface.
 */
export type WorkspaceLayoutV3BottomPanelProps = WorkspaceLayoutV3PaneFrameProps & {
  closeDisabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  open?: boolean;
};

function WorkspaceLayoutV3PanelToggleButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      size="icon"
      aria-label="Open bottom panel"
      data-testid="workspace-layout-v3-panel-toggle"
      className="absolute bottom-3 right-3 z-20 h-10 w-10"
      onClick={onClick}
    >
      <span aria-hidden="true" className="h-4 w-4 bg-current" />
    </Button>
  );
}

/**
 * Keep the optional bottom panel isolated from the sidebar math so the main
 * workspace shell still only reasons about left/main/right pane geometry.
 */
export function WorkspaceLayoutV3MainViewportWithPanel({
  activeResizeSide,
  isMobile,
  mainContent,
  onPanelResizeEnd,
  onPanelResizeStart,
  panel,
  viewportHeightPx,
}: {
  activeResizeSide: "left" | "right" | "top" | null;
  isMobile: boolean;
  mainContent: ReactNode;
  onPanelResizeEnd: () => void;
  onPanelResizeStart: () => void;
  panel?: WorkspaceLayoutV3BottomPanelProps;
  viewportHeightPx: number;
}) {
  const hasPanel = panel !== undefined;
  const isPanelOpenControlled = panel?.open !== undefined;
  const [uncontrolledPanelOpen, setUncontrolledPanelOpen] = useState(hasPanel);
  const [panelHeightPx, setPanelHeightPx] = useState(WORKSPACE_LAYOUT_V3_PANEL_DEFAULT_HEIGHT_PX);
  const panelHeightCustomizedRef = useRef(false);
  const panelOpen = panel?.open ?? uncontrolledPanelOpen;
  const closeDisabled = panel?.closeDisabled ?? false;
  const setPanelOpen = (isOpen: boolean) => {
    if (!isOpen && closeDisabled) {
      return;
    }
    if (!isPanelOpenControlled) {
      setUncontrolledPanelOpen(isOpen);
    }
    panel?.onOpenChange?.(isOpen);
  };

  useEffect(() => {
    if (!isPanelOpenControlled) {
      setUncontrolledPanelOpen(hasPanel);
    }
  }, [hasPanel, isPanelOpenControlled]);

  const {
    closeDisabled: _ignoredCloseDisabled,
    onOpenChange: _ignoredOnOpenChange,
    open: _ignoredOpen,
    ...panelFrameProps
  } = panel ?? {};

  useEffect(() => {
    if (!hasPanel) {
      return;
    }

    setPanelHeightPx((currentHeightPx) => {
      if (!panelHeightCustomizedRef.current) {
        return getDefaultWorkspaceLayoutV3PanelHeight({
          isMobile,
          viewportHeightPx,
        });
      }

      return clampWorkspaceLayoutV3PanelHeight({
        heightPx: currentHeightPx,
        viewportHeightPx,
      });
    });
  }, [hasPanel, isMobile, viewportHeightPx]);

  const renderedPanel =
    panel === undefined || !panelOpen ? null : (
      <div
        data-testid="workspace-layout-v3-pane-panel"
        className={cn(
          "relative min-h-0 bg-background",
          panelHeightPx >= viewportHeightPx
            ? "border-t-0"
            : activeResizeSide === "top"
              ? "border-t border-primary"
              : "border-t border-border",
          isMobile
            ? "pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex flex-col"
            : "flex shrink-0 flex-col",
        )}
        style={{ height: `${panelHeightPx}px` }}
      >
        <WorkspaceLayoutV3ResizeHandle
          ariaLabel="Resize bottom panel"
          currentSizePx={panelHeightPx}
          dataTestId="workspace-layout-v3-panel-resize"
          maxSizePx={getWorkspaceLayoutV3PanelMaxHeightPx(viewportHeightPx)}
          minSizePx={WORKSPACE_LAYOUT_V3_PANEL_MIN_HEIGHT_PX}
          onResizeStart={() => {
            panelHeightCustomizedRef.current = true;
            onPanelResizeStart();
          }}
          onResizeEnd={onPanelResizeEnd}
          onSizeChange={setPanelHeightPx}
          pointerTarget={isMobile ? "grip" : "edge"}
          positionPx={0}
          resizeFrom="top"
        />
        <div className="min-h-0 flex-1">
          <WorkspaceLayoutV3PaneFrame
            {...panelFrameProps}
            header={
              <div className="flex h-full min-w-0 items-center justify-between">
                <div className="min-w-0 flex-1">{panelFrameProps.header}</div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close bottom panel"
                  className="h-8 w-8 shrink-0"
                  disabled={closeDisabled}
                  onClick={() => {
                    if (closeDisabled) {
                      return;
                    }
                    setPanelOpen(false);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div
        data-testid="workspace-layout-v3-main-viewport"
        className="min-h-0 flex-1 overflow-hidden bg-background"
      >
        {mainContent}
      </div>
      {renderedPanel}
      {hasPanel && !panelOpen ? (
        <WorkspaceLayoutV3PanelToggleButton
          onClick={() => {
            if (!panelHeightCustomizedRef.current) {
              setPanelHeightPx(
                getDefaultWorkspaceLayoutV3PanelHeight({
                  isMobile,
                  viewportHeightPx,
                }),
              );
            }
            setPanelOpen(true);
          }}
        />
      ) : null}
    </div>
  );
}
