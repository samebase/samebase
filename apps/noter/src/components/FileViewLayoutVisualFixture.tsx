import { useState } from "react";
import { PersonIcon } from "@radix-ui/react-icons";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";

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

  return (
    <SidebarProvider
      defaultOpen={true}
      defaultRightOpen={true}
      className="h-[720px] min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="fileview-layout-visual-fixture"
        headerTestId="fileview-layout-header"
        leftSidebarHeader={
          <SidebarAccountSection dataTestId="fileview-layout-account-section">
            <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
              <span className="block min-w-0 truncate">nicu@noter.md</span>
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-ui md:h-6 md:w-6"
              >
                <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
                <span className="sr-only">Open user menu</span>
              </Button>
            </div>
          </SidebarAccountSection>
        }
        leftSidebarContent={
          mode === "fileview-layout" ? (
            <div
              data-testid="fileview-layout-sidebar-body"
              className="min-h-0 flex-1 bg-muted/10"
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
              <div className="border-b border-border/50 p-3">
                <Button
                  data-testid="fileview-layout-counter-button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    setClickCount((currentCount) => currentCount + 1)
                  }
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
          )
        }
        rightSidebarContent={
          <div
            data-testid="fileview-layout-right-sidebar-body"
            className="min-h-0 flex-1 bg-background"
          />
        }
        headerTitle="/"
        headerRight={
          <div className="font-mono text-xs text-muted-foreground">e4c2a91</div>
        }
        onQuickOpen={() => {}}
        contentClassName="flex-1 min-h-0 p-0"
      >
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
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
