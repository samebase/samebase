import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSidebar } from "@/hooks/use-sidebar";
import { PanelLeft, PanelRight } from "lucide-react";
import {
  WorkspaceLayoutV2PaneFrame,
  type WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import { type WorkspaceLayoutV2BottomPanelProps } from "./WorkspaceLayoutV2BottomPanel";
import {
  DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  type WorkspaceLayoutV2MobileMinResizeBehavior,
} from "./WorkspaceLayoutV2Geometry";
import { WorkspaceLayoutV2JustPanes } from "./WorkspaceLayoutV2";

type WorkspaceLayoutV2LeftToggleVisibility = "all" | "desktop" | "hidden";
type WorkspaceLayoutV2RightToggleVisibility = "desktop" | "hidden";

const LEFT_TOGGLE_BUTTON_CLASS_NAMES = {
  all: "h-8 w-8 rounded-none",
  desktop: "hidden h-8 w-8 md:inline-flex",
} as const satisfies Record<
  Exclude<WorkspaceLayoutV2LeftToggleVisibility, "hidden">,
  string
>;

function WorkspaceLayoutV2MainPaneHeader({
  children,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  children: ReactNode;
  leftToggleVisibility?: WorkspaceLayoutV2LeftToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2RightToggleVisibility;
}) {
  const { toggleLeftSidebar, toggleRightSidebar } = useSidebar();
  const leftToggleButtonClassName =
    leftToggleVisibility === "hidden"
      ? null
      : LEFT_TOGGLE_BUTTON_CLASS_NAMES[leftToggleVisibility];

  return (
    <div className="flex h-full items-center gap-2">
      {leftToggleButtonClassName !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={
            leftToggleVisibility === "desktop"
              ? "Toggle Left Sidebar"
              : "Toggle sidebar"
          }
          className={leftToggleButtonClassName}
          onClick={toggleLeftSidebar}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Keep route-level header actions visible on mobile; only the sidebar
          toggles stay desktop-only in the v2 main pane shell. */}
      <div className="min-w-0 flex-1">{children}</div>

      {rightToggleVisibility === "desktop" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Toggle Right Sidebar"
          className="hidden h-8 w-8 md:inline-flex"
          onClick={toggleRightSidebar}
        >
          <PanelRight className="h-4 w-4 rotate-180" />
        </Button>
      ) : null}
    </div>
  );
}

/**
 * V2 owns one contained workspace viewport inside the normal page shell rather
 * than asking the app-level frame to lock the whole document.
 */
function WorkspaceLayoutV2ViewportFrame({
  children,
  dataTestId,
}: {
  children: ReactNode;
  dataTestId?: string;
}) {
  return (
    <div
      data-testid={dataTestId}
      className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {children}
    </div>
  );
}

export function WorkspaceLayoutV2FullPage({
  dataTestId,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  mobilePanePeekWidthPx = DEFAULT_MOBILE_PANE_PEEK_WIDTH_PX,
  panel,
  right,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
  showMobileResizeGripDots,
}: {
  dataTestId?: string;
  left?: WorkspaceLayoutV2PaneFrameProps;
  main: WorkspaceLayoutV2PaneFrameProps;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  mobilePanePeekWidthPx?: number;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
  leftToggleVisibility?: WorkspaceLayoutV2LeftToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2RightToggleVisibility;
  showMobileResizeGripDots?: boolean;
}) {
  const hasLeftPane = left !== undefined;
  const hasRightPane = right !== undefined;
  const isMobile = useIsMobile();
  // A mobile left toggle is always also a desktop toggle. Routes opt into
  // `all` only when their main pane can swallow the drag-to-reopen gesture.
  const hasMainHeaderContent =
    main.header !== undefined && main.header !== null;
  const hasDesktopHeaderToggle =
    (hasLeftPane && leftToggleVisibility !== "hidden") ||
    (hasRightPane && rightToggleVisibility !== "hidden");
  const hasMobileHeaderToggle = hasLeftPane && leftToggleVisibility === "all";
  const shouldHideMainHeader = isMobile
    ? !hasMainHeaderContent && !hasMobileHeaderToggle
    : !hasMainHeaderContent && !hasDesktopHeaderToggle;

  return (
    <WorkspaceLayoutV2ViewportFrame dataTestId={dataTestId}>
      <WorkspaceLayoutV2JustPanes
        left={
          hasLeftPane ? <WorkspaceLayoutV2PaneFrame {...left} /> : undefined
        }
        main={
          <WorkspaceLayoutV2PaneFrame
            {...main}
            header={
              shouldHideMainHeader ? undefined : (
                <WorkspaceLayoutV2MainPaneHeader
                  leftToggleVisibility={
                    hasLeftPane ? leftToggleVisibility : "hidden"
                  }
                  rightToggleVisibility={
                    hasRightPane ? rightToggleVisibility : "hidden"
                  }
                >
                  {main.header}
                </WorkspaceLayoutV2MainPaneHeader>
              )
            }
          />
        }
        mobileMinResizeBehavior={mobileMinResizeBehavior}
        mobilePanePeekWidthPx={mobilePanePeekWidthPx}
        panel={panel}
        right={hasRightPane ? <WorkspaceLayoutV2PaneFrame {...right} /> : null}
        showMobileResizeGripDots={showMobileResizeGripDots}
      />
    </WorkspaceLayoutV2ViewportFrame>
  );
}
