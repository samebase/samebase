import {
  SidebarLayout,
  type SidebarLayoutResizeHandleLabels,
  type SidebarLayoutResizeHandleValueTextFormatter,
} from "@samebase/sidebars";
import type { SidebarLayoutMobileMinResizeBehavior } from "@samebase/sidebars/geometry";
import { PaneFrame, type PaneFrameProps } from "@samebase/sidebars/pane-frame";
import { useSidebarActions } from "@samebase/sidebars/runtime";
import { PanelLeft, PanelRight } from "lucide-react";
import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { APP_WORKSPACE_MAIN_SCROLL_RESTORATION_ID } from "@/lib/appWorkspaceSidebarPreferences";

/**
 * all = shows sidebar toggle on mobile and desktop
 *
 * desktop = shows sidebar toggle on desktop only
 *
 * hidden = hides sidebar toggle on both desktop and mobile
 */
type AppSidebarLayoutToggleVisibility = "all" | "desktop" | "hidden";

const TOGGLE_BUTTON_CLASS_NAMES = {
  all: "h-8 w-8 rounded-none",
  desktop: "hidden h-8 w-8 md:inline-flex",
} as const satisfies Record<Exclude<AppSidebarLayoutToggleVisibility, "hidden">, string>;
const SIDEBAR_LAYOUT_RESIZE_HANDLE_LABELS = {
  left: "Resize left sidebar",
  right: "Resize right sidebar",
} satisfies SidebarLayoutResizeHandleLabels;
const formatSidebarLayoutResizeHandleValueText: SidebarLayoutResizeHandleValueTextFormatter = ({
  widthPx,
}) => `${widthPx} pixels wide`;

function AppSidebarLayoutMainPaneHeader({
  children,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  children: ReactNode;
  leftToggleVisibility?: AppSidebarLayoutToggleVisibility;
  rightToggleVisibility?: AppSidebarLayoutToggleVisibility;
}) {
  const { toggleLeftPane, toggleRightPane } = useSidebarActions();
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

export function AppSidebarLayout({
  addressChrome,
  left,
  main,
  mobileMinResizeBehavior = "min_resize_to_merge",
  right,
  leftToggleVisibility = "desktop",
  rightToggleVisibility = "desktop",
}: {
  addressChrome: ReactNode;
  left?: PaneFrameProps;
  main: PaneFrameProps;
  mobileMinResizeBehavior?: SidebarLayoutMobileMinResizeBehavior;
  right?: PaneFrameProps;
  leftToggleVisibility?: AppSidebarLayoutToggleVisibility;
  rightToggleVisibility?: AppSidebarLayoutToggleVisibility;
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
    <SidebarLayout
      addressChrome={addressChrome}
      formatResizeHandleValueText={formatSidebarLayoutResizeHandleValueText}
      left={left ? <PaneFrame {...left} /> : undefined}
      main={
        <PaneFrame
          {...main}
          headerVisibility={main.headerVisibility ?? mainHeaderVisibility}
          scrollRestorationId={APP_WORKSPACE_MAIN_SCROLL_RESTORATION_ID}
          header={
            shouldRenderMainHeader ? (
              <AppSidebarLayoutMainPaneHeader
                leftToggleVisibility={effectiveLeftToggleVisibility}
                rightToggleVisibility={effectiveRightToggleVisibility}
              >
                {main.header}
              </AppSidebarLayoutMainPaneHeader>
            ) : undefined
          }
        />
      }
      mobileMinResizeBehavior={mobileMinResizeBehavior}
      resizeHandleLabels={SIDEBAR_LAYOUT_RESIZE_HANDLE_LABELS}
      right={right ? <PaneFrame {...right} /> : undefined}
    />
  );
}
