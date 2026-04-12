import { MagnifyingGlassIcon } from "@radix-ui/react-icons";
import { useState } from "react";
import { SidebarHomeAccountHeader } from "@/components/SidebarHomeAccountHeader";
import { SidebarProvider, SidebarTrigger } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import {
  WorkspaceLayoutV2JustPanes,
  WorkspaceLayoutV2ViewportFrame,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import { WorkspaceLayoutV2PaneFrame } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "@/lib/fileViewSidebarLayout";
import { TestRouterProvider } from "@/test/TestRouterProvider";

export type FileViewLayoutVisualMode =
  | "fileview-layout"
  | "fileview-layout-persistence";

export function FileViewLayoutVisualFixture({
  mode,
}: {
  mode: FileViewLayoutVisualMode;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [bodyClickCount, setBodyClickCount] = useState(0);
  const scrollRows = Array.from({ length: 40 }, (_, index) => index + 1);

  mode satisfies FileViewLayoutVisualMode;

  const sidebarHeader = (
    <div
      data-testid="fileview-layout-account-section"
      className="flex h-full w-full items-center px-2"
    >
      <SidebarHomeAccountHeader userDisplayName="nicu@noter.md" />
    </div>
  );
  const sidebarContent =
    mode === "fileview-layout" ? (
      <div
        data-testid="fileview-layout-sidebar-body"
        className="h-full min-h-0 bg-muted/10"
      />
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
        <div
          data-testid="fileview-layout-sidebar-scroll"
          className="min-h-0 flex-1 overflow-auto"
        >
          <div className="grid gap-2 p-3">
            {scrollRows.map((row) => (
              <div
                key={row}
                className="border border-border/50 bg-background px-3 py-2 text-sm"
              >
                File {row}
              </div>
            ))}
          </div>
        </div>
      </div>
    );

  const leftPane = (
    <WorkspaceLayoutV2PaneFrame
      header={sidebarHeader}
      content={
        FILE_VIEW_TREE_SIDEBAR_SIDE === "left" ? (
          sidebarContent
        ) : (
          <div
            aria-hidden="true"
            className="h-full min-h-0 bg-background"
            data-testid="fileview-layout-left-sidebar-body"
          />
        )
      }
    />
  );

  const mainPane = (
    <WorkspaceLayoutV2PaneFrame
      header={
        <div
          data-testid="fileview-layout-header"
          className="flex h-full items-center gap-2 px-2"
          style={{ scrollSnapStop: "always" }}
        >
          <div className="flex shrink-0 items-center gap-2">
            <SidebarTrigger
              className="sr-only h-8 w-8 md:not-sr-only md:inline-flex"
              side="left"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => {}}
              title="Quick Open (Cmd+P)"
              aria-label="Quick Open"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
            </Button>
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-sm font-medium">/</span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="font-mono text-xs text-muted-foreground">
              e4c2a91
            </div>
            <SidebarTrigger
              className="sr-only h-8 w-8 md:not-sr-only md:inline-flex"
              side="right"
            />
          </div>
        </div>
      }
      content={
        <div
          data-testid="fileview-layout-body"
          className="h-full min-h-0 bg-muted/10 p-3"
        >
          <div className="flex flex-col items-start gap-3">
            <Button
              data-testid="fileview-layout-body-button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setBodyClickCount((currentCount) => currentCount + 1)
              }
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
      }
    />
  );

  // Keep the fixture's synthetic left-header/right-tree content arrangement,
  // but mount it on the real v2 pane shell so layout regressions follow the
  // shipped workspace primitives instead of the removed route wrapper.
  const rightPane = (
    <WorkspaceLayoutV2PaneFrame
      header={null}
      content={
        FILE_VIEW_TREE_SIDEBAR_SIDE === "right" ? (
          <div
            data-testid="fileview-layout-right-sidebar-body"
            className="flex h-full min-h-0 flex-col bg-muted/10"
          >
            {sidebarContent}
          </div>
        ) : (
          <div
            data-testid="fileview-layout-right-sidebar-body"
            className="h-full min-h-0 bg-background"
          />
        )
      }
    />
  );

  return (
    <TestRouterProvider>
      <SidebarProvider
        defaultOpen={FILE_VIEW_TREE_SIDEBAR_SIDE === "left"}
        defaultRightOpen={true}
        shortcutSidebarSide={FILE_VIEW_TREE_SIDEBAR_SIDE}
        className="h-[720px] min-h-0 bg-background text-foreground"
      >
        <WorkspaceLayoutV2ViewportFrame>
          <WorkspaceLayoutV2JustPanes
            dataTestId="fileview-layout-visual-fixture"
            left={leftPane}
            main={mainPane}
            right={rightPane}
          />
        </WorkspaceLayoutV2ViewportFrame>
      </SidebarProvider>
    </TestRouterProvider>
  );
}
