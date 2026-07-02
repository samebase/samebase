import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import {
  WorkspaceLayoutV3PaneFrame,
  type WorkspaceLayoutV3PaneFrameProps,
} from "./WorkspaceLayoutV3PaneFrame";
import { type WorkspaceLayoutV3BottomPanelProps } from "./WorkspaceLayoutV3BottomPanel";
import { type WorkspaceLayoutV3MobileMinResizeBehavior } from "./WorkspaceLayoutV3Geometry";
import { WorkspaceLayoutV3 } from "./WorkspaceLayoutV3";
import { useWorkspacePaneActions } from "./WorkspacePaneRuntime";

/**
 * all = shows sidebar toggle on mobile an desktop
 *
 * desktop = shows sidebar toggle on desktop only
 *
 * hidden = hides sidebar toggle on both desktop and mobile
 */
type WorkspaceLayoutV3ToggleVisibility = "all" | "desktop" | "hidden";

const TOGGLE_BUTTON_CLASS_NAMES = {
  all: "h-8 w-8 rounded-none",
  desktop: "hidden h-8 w-8 md:inline-flex",
} as const satisfies Record<Exclude<WorkspaceLayoutV3ToggleVisibility, "hidden">, string>;
const WORKSPACE_LAYOUT_V3_MAIN_PANE_HEADER_TEST_ID = "workspace-layout-v3-main-pane-header";

function WorkspaceLayoutV3MainPaneHeader({
  children,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  children: ReactNode;
  leftToggleVisibility?: WorkspaceLayoutV3ToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV3ToggleVisibility;
}) {
  const { toggleLeftPane, toggleRightPane } = useWorkspacePaneActions();
  const leftToggleButtonClassName =
    leftToggleVisibility === "hidden" ? null : TOGGLE_BUTTON_CLASS_NAMES[leftToggleVisibility];
  const rightToggleButtonClassName =
    rightToggleVisibility === "hidden" ? null : TOGGLE_BUTTON_CLASS_NAMES[rightToggleVisibility];

  return (
    <div className="flex h-full items-center">
      {leftToggleButtonClassName !== null ? (
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
          toggles stay desktop-only in the v3 main pane shell. */}
      <div className="flex h-full min-w-0 flex-1 items-center">{children}</div>

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

export function WorkspaceLayoutV3FullPage({
  addressChrome,
  dataTestId,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  panel,
  right,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  addressChrome: ReactNode;
  dataTestId?: string;
  left?: WorkspaceLayoutV3PaneFrameProps;
  main: WorkspaceLayoutV3PaneFrameProps;
  mobileMinResizeBehavior?: WorkspaceLayoutV3MobileMinResizeBehavior;
  panel?: WorkspaceLayoutV3BottomPanelProps;
  right?: WorkspaceLayoutV3PaneFrameProps;
  leftToggleVisibility?: WorkspaceLayoutV3ToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV3ToggleVisibility;
}) {
  const hasDesktopHeaderToggle =
    (left && leftToggleVisibility !== "hidden") || (right && rightToggleVisibility !== "hidden");
  const hasMobileHeaderToggle =
    (left && leftToggleVisibility === "all") || (right && rightToggleVisibility === "all");
  const shouldRenderMainHeader = !!main.header || hasDesktopHeaderToggle || hasMobileHeaderToggle;
  const mainHeaderVisibility =
    !main.header && !hasMobileHeaderToggle && hasDesktopHeaderToggle ? "desktop" : "all";

  return (
    <WorkspaceLayoutV3
      addressChrome={addressChrome}
      left={left ? <WorkspaceLayoutV3PaneFrame {...left} /> : undefined}
      main={
        <WorkspaceLayoutV3PaneFrame
          {...main}
          headerTestId={main.headerTestId ?? WORKSPACE_LAYOUT_V3_MAIN_PANE_HEADER_TEST_ID}
          headerVisibility={main.headerVisibility ?? mainHeaderVisibility}
          header={
            shouldRenderMainHeader ? (
              <WorkspaceLayoutV3MainPaneHeader
                leftToggleVisibility={left ? leftToggleVisibility : "hidden"}
                rightToggleVisibility={right ? rightToggleVisibility : "hidden"}
              >
                {main.header}
              </WorkspaceLayoutV3MainPaneHeader>
            ) : undefined
          }
        />
      }
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      panel={panel}
      right={right ? <WorkspaceLayoutV3PaneFrame {...right} /> : undefined}
      dataTestId={dataTestId}
    />
  );
}
