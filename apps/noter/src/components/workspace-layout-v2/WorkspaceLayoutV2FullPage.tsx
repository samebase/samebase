import { type ReactNode } from "react";
import { Button } from "#src/components/ui/button.tsx";
import { useIsMobile } from "#src/hooks/use-mobile.tsx";
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
import { WorkspaceLayoutV2 } from "./WorkspaceLayoutV2";
import { useWorkspacePaneActions } from "./WorkspacePaneRuntime";

/**
 * all = shows sidebar toggle on mobile an desktop
 *
 * desktop = shows sidebar toggle on desktop only
 *
 * hidden = hides sidebar toggle on both desktop and mobile
 */
type WorkspaceLayoutV2ToggleVisibility = "all" | "desktop" | "hidden";

const TOGGLE_BUTTON_CLASS_NAMES = {
  all: "h-8 w-8 rounded-none",
  desktop: "hidden h-8 w-8 md:inline-flex",
} as const satisfies Record<
  Exclude<WorkspaceLayoutV2ToggleVisibility, "hidden">,
  string
>;

function WorkspaceLayoutV2MainPaneHeader({
  children,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  children: ReactNode;
  leftToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
}) {
  const { toggleLeftPane, toggleRightPane } = useWorkspacePaneActions();
  const leftToggleButtonClassName =
    leftToggleVisibility === "hidden"
      ? null
      : TOGGLE_BUTTON_CLASS_NAMES[leftToggleVisibility];
  const rightToggleButtonClassName =
    rightToggleVisibility === "hidden"
      ? null
      : TOGGLE_BUTTON_CLASS_NAMES[rightToggleVisibility];

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
          onClick={toggleLeftPane}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Keep route-level header actions visible on mobile; only the sidebar
          toggles stay desktop-only in the v2 main pane shell. */}
      <div className="min-w-0 flex-1">{children}</div>

      {rightToggleButtonClassName !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Toggle Right Sidebar"
          className={rightToggleButtonClassName}
          onClick={toggleRightPane}
        >
          <PanelRight className="h-4 w-4 rotate-180" />
        </Button>
      ) : null}
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
  leftToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
  showMobileResizeGripDots?: boolean;
}) {
  const isMobile = useIsMobile();

  const hasDesktopHeaderToggle =
    (left && leftToggleVisibility !== "hidden") ||
    (right && rightToggleVisibility !== "hidden");

  const hasMobileHeaderToggle =
    (left && leftToggleVisibility === "all") ||
    (right && rightToggleVisibility === "all");

  const hideMainHeader = isMobile
    ? !main.header && !hasMobileHeaderToggle
    : !main.header && !hasDesktopHeaderToggle;

  return (
    <WorkspaceLayoutV2
      left={left ? <WorkspaceLayoutV2PaneFrame {...left} /> : undefined}
      main={
        <WorkspaceLayoutV2PaneFrame
          {...main}
          header={
            hideMainHeader ? undefined : (
              <WorkspaceLayoutV2MainPaneHeader
                leftToggleVisibility={left ? leftToggleVisibility : "hidden"}
                rightToggleVisibility={right ? rightToggleVisibility : "hidden"}
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
      right={right ? <WorkspaceLayoutV2PaneFrame {...right} /> : undefined}
      showMobileResizeGripDots={showMobileResizeGripDots}
      dataTestId={dataTestId}
    />
  );
}
