import { useState } from "react";
import { FileViewMainHeader } from "@/components/FileView/FileViewMainHeader";
import { Button } from "@/components/ui/button";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import type { WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type FileViewLayoutVisualMode =
  | "fileview-layout"
  | "fileview-layout-persistence"
  | "fileview-layout-slide";

export function FileViewLayoutVisualFixture({ mode }: { mode: FileViewLayoutVisualMode }) {
  const [clickCount, setClickCount] = useState(0);
  const [bodyClickCount, setBodyClickCount] = useState(0);
  const scrollRows = Array.from({ length: 40 }, (_, index) => index + 1);

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
  const activeSidebar: WorkspaceLayoutV2PaneFrameProps = {
    header: null,
    content: sidebarContent,
    footer: sidebarFooter,
  };
  const rightSidebar: WorkspaceLayoutV2PaneFrameProps = {
    content: (
      <div
        data-testid="fileview-layout-right-pane-body"
        className="flex h-full min-h-0 flex-col bg-muted/10"
      >
        <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Details
        </div>
        <div className="min-h-0 flex-1 p-3 text-sm text-muted-foreground">
          File view secondary pane
        </div>
      </div>
    ),
  };
  const mobileMinResizeBehavior =
    mode === "fileview-layout-slide" ? "min_resize_to_slide" : undefined;

  return (
    <TestRouterProvider>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId="fileview-layout-visual-fixture"
        {...(mobileMinResizeBehavior === undefined ? {} : { mobileMinResizeBehavior })}
        shortcutPaneSide="left"
        left={activeSidebar}
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
        right={rightSidebar}
      />
    </TestRouterProvider>
  );
}
