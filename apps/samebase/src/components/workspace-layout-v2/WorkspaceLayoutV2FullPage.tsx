import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import {
  WorkspaceLayoutV2PaneFrame,
  type WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import { type WorkspaceLayoutV2BottomPanelProps } from "./WorkspaceLayoutV2BottomPanel";
import {
  type WorkspaceLayoutV2LeftPaneMode,
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
 *
 * reserved = keeps the desktop toggle slot without exposing a control
 */
type WorkspaceLayoutV2ToggleVisibility = "all" | "desktop" | "hidden" | "reserved";

const TOGGLE_BUTTON_CLASS_NAMES = {
  all: "h-8 w-8 rounded-none",
  desktop: "hidden h-8 w-8 md:inline-flex",
  reserved: "pointer-events-none invisible hidden h-8 w-8 shrink-0 md:block",
} as const satisfies Record<Exclude<WorkspaceLayoutV2ToggleVisibility, "hidden">, string>;
const WORKSPACE_LAYOUT_V2_MAIN_PANE_HEADER_TEST_ID = "workspace-layout-v2-main-pane-header";

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
    leftToggleVisibility === "hidden" ? null : TOGGLE_BUTTON_CLASS_NAMES[leftToggleVisibility];
  const rightToggleButtonClassName =
    rightToggleVisibility === "hidden" ? null : TOGGLE_BUTTON_CLASS_NAMES[rightToggleVisibility];

  return (
    <div className="flex h-full items-center">
      {leftToggleVisibility === "reserved" ? (
        <div
          aria-hidden="true"
          data-workspace-layout-v2-toggle-spacer="left"
          className={TOGGLE_BUTTON_CLASS_NAMES.reserved}
        />
      ) : leftToggleButtonClassName !== null ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={leftToggleVisibility === "desktop" ? "Toggle Left Sidebar" : "Toggle sidebar"}
          className={leftToggleButtonClassName}
          onClick={toggleLeftPane}
        >
          <PanelLeft className="h-4 w-4" />
        </Button>
      ) : null}

      {/* Keep route-level header actions visible on mobile; only the sidebar
          toggles stay desktop-only in the v2 main pane shell. */}
      <div className="min-w-0 flex-1">{children}</div>

      {rightToggleVisibility === "reserved" ? (
        <div
          aria-hidden="true"
          data-workspace-layout-v2-toggle-spacer="right"
          className={TOGGLE_BUTTON_CLASS_NAMES.reserved}
        />
      ) : rightToggleButtonClassName !== null ? (
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
  leftPaneMode = "visible",
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  panel,
  right,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  dataTestId?: string;
  left?: WorkspaceLayoutV2PaneFrameProps;
  leftPaneMode?: WorkspaceLayoutV2LeftPaneMode;
  main: WorkspaceLayoutV2PaneFrameProps;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  panel?: WorkspaceLayoutV2BottomPanelProps;
  right?: WorkspaceLayoutV2PaneFrameProps;
  leftToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
}) {
  const hasDesktopHeaderToggle =
    (left && leftToggleVisibility !== "hidden") || (right && rightToggleVisibility !== "hidden");
  const hasMobileHeaderToggle =
    (left && leftPaneMode === "visible" && leftToggleVisibility === "all") ||
    (right && rightToggleVisibility === "all");
  const shouldRenderMainHeader = !!main.header || hasDesktopHeaderToggle || hasMobileHeaderToggle;
  const mainHeaderVisibility =
    !main.header && !hasMobileHeaderToggle && hasDesktopHeaderToggle ? "desktop" : "all";

  return (
    <WorkspaceLayoutV2
      left={left ? <WorkspaceLayoutV2PaneFrame {...left} /> : undefined}
      main={
        <WorkspaceLayoutV2PaneFrame
          {...main}
          headerTestId={main.headerTestId ?? WORKSPACE_LAYOUT_V2_MAIN_PANE_HEADER_TEST_ID}
          headerVisibility={main.headerVisibility ?? mainHeaderVisibility}
          header={
            shouldRenderMainHeader ? (
              <WorkspaceLayoutV2MainPaneHeader
                leftToggleVisibility={
                  left
                    ? leftPaneMode === "reserved"
                      ? "reserved"
                      : leftToggleVisibility
                    : "hidden"
                }
                rightToggleVisibility={right ? rightToggleVisibility : "hidden"}
              >
                {main.header}
              </WorkspaceLayoutV2MainPaneHeader>
            ) : undefined
          }
        />
      }
      leftPaneMode={leftPaneMode}
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      panel={panel}
      right={right ? <WorkspaceLayoutV2PaneFrame {...right} /> : undefined}
      dataTestId={dataTestId}
    />
  );
}
