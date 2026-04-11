import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  WorkspaceLayoutV2PaneFrame,
  type WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import { WorkspaceLayoutV2ResizeHandle } from "./WorkspaceLayoutV2ResizeHandle";

const WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX = 3 * 16;
const WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX = 18 * 16;
const WORKSPACE_LAYOUT_V2_PANEL_MOBILE_DEFAULT_HEIGHT_RATIO = 0.35;

export type WorkspaceLayoutV2BottomPanelProps =
  WorkspaceLayoutV2PaneFrameProps & {
    onOpenChange?: (isOpen: boolean) => void;
    open?: boolean;
  };

function clampNumber(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(value, maxValue));
}

function getWorkspaceLayoutV2PanelMaxHeightPx(viewportHeightPx: number) {
  if (viewportHeightPx <= 0) {
    return WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX;
  }

  return Math.max(
    WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX,
    Math.floor(viewportHeightPx),
  );
}

function clampWorkspaceLayoutV2PanelHeight(args: {
  heightPx: number;
  viewportHeightPx: number;
}) {
  return clampNumber(
    Math.round(args.heightPx),
    WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX,
    getWorkspaceLayoutV2PanelMaxHeightPx(args.viewportHeightPx),
  );
}

function getDefaultWorkspaceLayoutV2PanelHeight(args: {
  isMobile: boolean;
  viewportHeightPx: number;
}) {
  if (args.viewportHeightPx <= 0) {
    return WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX;
  }

  const preferredHeight = args.isMobile
    ? Math.floor(
        args.viewportHeightPx *
          WORKSPACE_LAYOUT_V2_PANEL_MOBILE_DEFAULT_HEIGHT_RATIO,
      )
    : WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX;

  return clampWorkspaceLayoutV2PanelHeight({
    heightPx: preferredHeight,
    viewportHeightPx: args.viewportHeightPx,
  });
}

function WorkspaceLayoutV2PanelToggleButton({
  onClick,
}: {
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="icon"
      aria-label="Open bottom panel"
      data-testid="workspace-layout-v2-panel-toggle"
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
export function WorkspaceLayoutV2MainViewportWithPanel({
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
  panel?: WorkspaceLayoutV2BottomPanelProps;
  viewportHeightPx: number;
}) {
  const hasPanel = panel !== undefined;
  const isPanelOpenControlled = panel?.open !== undefined;
  const [uncontrolledPanelOpen, setUncontrolledPanelOpen] = useState(hasPanel);
  const [panelHeightPx, setPanelHeightPx] = useState(
    WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX,
  );
  const panelHeightCustomizedRef = useRef(false);
  const panelOpen = panel?.open ?? uncontrolledPanelOpen;
  const setPanelOpen = (isOpen: boolean) => {
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
        return getDefaultWorkspaceLayoutV2PanelHeight({
          isMobile,
          viewportHeightPx,
        });
      }

      return clampWorkspaceLayoutV2PanelHeight({
        heightPx: currentHeightPx,
        viewportHeightPx,
      });
    });
  }, [hasPanel, isMobile, viewportHeightPx]);

  const renderedPanel =
    panel === undefined || !panelOpen ? null : (
      <div
        data-testid="workspace-layout-v2-pane-panel"
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
        <WorkspaceLayoutV2ResizeHandle
          ariaLabel="Resize bottom panel"
          currentSizePx={panelHeightPx}
          dataTestId="workspace-layout-v2-panel-resize"
          maxSizePx={getWorkspaceLayoutV2PanelMaxHeightPx(viewportHeightPx)}
          minSizePx={WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX}
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
          <WorkspaceLayoutV2PaneFrame
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
                  onClick={() => {
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
        data-testid="workspace-layout-v2-pane-main"
        className="min-h-0 flex-1 overflow-hidden bg-background"
      >
        {mainContent}
      </div>
      {renderedPanel}
      {hasPanel && !panelOpen ? (
        <WorkspaceLayoutV2PanelToggleButton
          onClick={() => {
            if (!panelHeightCustomizedRef.current) {
              setPanelHeightPx(
                getDefaultWorkspaceLayoutV2PanelHeight({
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
