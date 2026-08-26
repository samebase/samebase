import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { PanelLeft, PanelRight } from "lucide-react";
import {
  WorkspaceLayoutV2PaneFrame,
  type WorkspaceLayoutV2PaneFrameProps,
} from "./WorkspaceLayoutV2PaneFrame";
import { type WorkspaceLayoutV2MobileMinResizeBehavior } from "./WorkspaceLayoutV2Geometry";
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

      {/* Keep route-level header actions visible on mobile. The shell route
          selects the viewport visibility for each sidebar toggle. */}
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

export function WorkspaceLayoutV2FullPage({
  addressChrome,
  dataTestId,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  right,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  addressChrome: ReactNode;
  dataTestId?: string;
  left?: WorkspaceLayoutV2PaneFrameProps;
  main: WorkspaceLayoutV2PaneFrameProps;
  mobileMinResizeBehavior?: WorkspaceLayoutV2MobileMinResizeBehavior;
  right?: WorkspaceLayoutV2PaneFrameProps;
  leftToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
  rightToggleVisibility?: WorkspaceLayoutV2ToggleVisibility;
}) {
  const effectiveLeftToggleVisibility = left ? leftToggleVisibility : "hidden";
  const effectiveRightToggleVisibility = right ? rightToggleVisibility : "hidden";
  const hasDesktopHeaderToggle =
    effectiveLeftToggleVisibility !== "hidden" || effectiveRightToggleVisibility !== "hidden";
  const hasMobileHeaderToggle =
    effectiveLeftToggleVisibility === "all" || effectiveRightToggleVisibility === "all";
  const shouldRenderMainHeader = !!main.header || hasDesktopHeaderToggle || hasMobileHeaderToggle;
  const mainHeaderVisibility =
    !main.header && !hasMobileHeaderToggle && hasDesktopHeaderToggle ? "desktop" : "all";

  return (
    <WorkspaceLayoutV2
      addressChrome={addressChrome}
      left={left ? <WorkspaceLayoutV2PaneFrame {...left} /> : undefined}
      main={
        <WorkspaceLayoutV2PaneFrame
          {...main}
          headerTestId={main.headerTestId ?? WORKSPACE_LAYOUT_V2_MAIN_PANE_HEADER_TEST_ID}
          headerVisibility={main.headerVisibility ?? mainHeaderVisibility}
          scrollRestorationId="workspace-layout-v2-main"
          header={
            shouldRenderMainHeader ? (
              <WorkspaceLayoutV2MainPaneHeader
                leftToggleVisibility={effectiveLeftToggleVisibility}
                rightToggleVisibility={effectiveRightToggleVisibility}
              >
                {main.header}
              </WorkspaceLayoutV2MainPaneHeader>
            ) : undefined
          }
        />
      }
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      right={right ? <WorkspaceLayoutV2PaneFrame {...right} /> : undefined}
      dataTestId={dataTestId}
    />
  );
}
