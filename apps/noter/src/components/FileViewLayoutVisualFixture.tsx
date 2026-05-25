import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileViewMainHeader } from "@/components/FileView/FileViewMainHeader";
import { SidebarHomeAccountHeader } from "@/components/SidebarHomeAccountHeader";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import type { WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "@/lib/fileViewSidebarLayout";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type FileViewLayoutVisualMode =
  | "fileview-layout"
  | "fileview-layout-merge"
  | "fileview-layout-persistence"
  | "fileview-layout-slide";

export function FileViewLayoutVisualFixture({ mode }: { mode: FileViewLayoutVisualMode }) {
  const [clickCount, setClickCount] = useState(0);
  const [bodyClickCount, setBodyClickCount] = useState(0);
  const scrollRows = Array.from({ length: 40 }, (_, index) => index + 1);

  const sidebarHeader = <SidebarHomeAccountHeader userDisplayName="nicu@noter.md" />;
  const sidebarContent =
    mode === "fileview-layout" ? (
      <div data-testid="fileview-layout-sidebar-body" className="h-full min-h-0 bg-muted/10" />
    ) : (
      <div className="flex h-full min-h-0 flex-col bg-muted/10">
        <div className="border-b border-border/50 p-3">
          <Button
            data-testid="fileview-layout-counter-button"
            variant="secondary"
            size="sm"
            onClick={() => setClickCount((currentCount) => currentCount + 1)}
          >
            Increment
          </Button>
          <span
            data-testid="fileview-layout-counter-value"
            className="ml-3 text-sm text-foreground"
          >
            {clickCount}
          </span>
        </div>
        <div data-testid="fileview-layout-sidebar-scroll" className="min-h-0 flex-1 overflow-auto">
          <div className="grid gap-2 p-3">
            {scrollRows.map((row) => (
              <div key={row} className="border border-border/50 bg-background px-3 py-2 text-sm">
                File {row}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  const sidebarFooter = (
    <div className="border-t border-border/50 bg-background px-3 py-2 text-xs text-muted-foreground">
      Upload area
    </div>
  );
  const inactiveSidebar: WorkspaceLayoutV2PaneFrameProps = {};
  const activeSidebar: WorkspaceLayoutV2PaneFrameProps = {
    header: sidebarHeader,
    content:
      FILE_VIEW_TREE_SIDEBAR_SIDE === "right" ? (
        <div
          data-testid="fileview-layout-right-sidebar-body"
          className="flex h-full min-h-0 flex-col bg-muted/10"
        >
          {sidebarContent}
        </div>
      ) : (
        sidebarContent
      ),
    footer: sidebarFooter,
  };

  return (
    <TestRouterProvider>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId="fileview-layout-visual-fixture"
        mobileMinResizeBehavior={
          mode === "fileview-layout-slide" ? "min_resize_to_slide" : undefined
        }
        shortcutPaneSide={FILE_VIEW_TREE_SIDEBAR_SIDE}
        showMobileResizeGripDots={true}
        left={
          FILE_VIEW_TREE_SIDEBAR_SIDE === "left"
            ? activeSidebar
            : {
                content: (
                  <div data-testid="fileview-layout-left-sidebar-links" className="flex flex-col">
                    <Link to={DASHBOARD_ROUTE}>Home</Link>
                    <Link to="/machines">Machines</Link>
                    <Link to="/add">Connect repository</Link>
                    <Link to="/pricing">Pricing</Link>
                  </div>
                ),
              }
        }
        main={{
          headerAccessory: (
            <div
              data-testid="fileview-layout-header"
              className="h-full"
              style={{ scrollSnapStop: "always" }}
            >
              <FileViewMainHeader headerTitle="/" onQuickOpen={() => {}} />
            </div>
          ),
          content: (
            <div data-testid="fileview-layout-body" className="min-h-full bg-muted/10 p-3">
              <div className="flex flex-col items-start gap-3">
                <Button
                  data-testid="fileview-layout-body-button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setBodyClickCount((currentCount) => currentCount + 1)}
                >
                  Main action
                </Button>
                <span
                  data-testid="fileview-layout-body-counter"
                  className="text-sm text-foreground"
                >
                  {bodyClickCount}
                </span>
              </div>
            </div>
          ),
        }}
        right={FILE_VIEW_TREE_SIDEBAR_SIDE === "right" ? activeSidebar : inactiveSidebar}
      />
    </TestRouterProvider>
  );
}
