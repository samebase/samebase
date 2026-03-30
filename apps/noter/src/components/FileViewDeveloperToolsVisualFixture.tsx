import { PersonIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import {
  FileViewDeveloperTools,
  type FileViewMode,
} from "@/components/FileViewDeveloperTools";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { SidebarProvider } from "@/components/sidebar";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "@/lib/fileViewSidebarLayout";

export type FileViewDeveloperToolsVisualMode =
  | "file-view-developer-tools-collapsed"
  | "file-view-developer-tools-graph";

function getFixtureViewMode(
  mode: FileViewDeveloperToolsVisualMode,
): FileViewMode {
  return mode === "file-view-developer-tools-graph" ? "graph" : "editor";
}

export function FileViewDeveloperToolsVisualFixture({
  mode,
}: {
  mode: FileViewDeveloperToolsVisualMode;
}) {
  const viewMode = getFixtureViewMode(mode);
  const showEditorActions = viewMode === "editor";
  const sidebarHeader = (
    <SidebarAccountSection>
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
  );
  const sidebarContent = (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
      <div className="border-b p-3 text-xs text-muted-foreground">
        noter-md/noter
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 text-xs text-muted-foreground">
        File tree
      </div>
    </div>
  );
  const emptySidebarContent = (
    <div aria-hidden="true" className="min-h-0 flex-1 bg-background" />
  );

  return (
    <SidebarProvider
      defaultOpen={FILE_VIEW_TREE_SIDEBAR_SIDE === "left"}
      defaultRightOpen={true}
      shortcutSidebarSide={FILE_VIEW_TREE_SIDEBAR_SIDE}
      className="h-[780px] min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="file-view-developer-tools-visual-fixture"
        headerTitle="src/components/FileView.tsx"
        headerRight={
          <div className="font-mono text-xs text-muted-foreground">74f9c18</div>
        }
        onQuickOpen={() => {}}
        contentClassName="flex-1 min-h-0 p-0"
        leftSidebarHeader={sidebarHeader}
        leftSidebarContent={
          FILE_VIEW_TREE_SIDEBAR_SIDE === "left"
            ? sidebarContent
            : emptySidebarContent
        }
        rightSidebarHeader={null}
        rightSidebarContent={
          FILE_VIEW_TREE_SIDEBAR_SIDE === "right" ? (
            sidebarContent
          ) : (
            <div className="min-h-0 flex-1 bg-background" />
          )
        }
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="max-w-none flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="mb-0.5 font-mono text-[11px] text-muted-foreground">
                  feat/graph-toggle
                </div>
                <h2 className="text-base font-medium md:text-sm">
                  src/components/FileView.tsx
                </h2>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="rounded-ui bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    Up to date
                  </div>
                  {showEditorActions ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                      >
                        Review Changes
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                  >
                    Create Draft PR
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs text-orange-600 hover:text-orange-700"
                  >
                    Reset to GitHub
                  </Button>
                </div>
                <FileViewDeveloperTools
                  open={viewMode === "graph"}
                  onOpenChange={() => {}}
                  viewMode={viewMode}
                  onViewModeChange={() => {}}
                >
                  {null}
                </FileViewDeveloperTools>
              </div>
            </div>

            <div className="relative flex-1 min-h-0 corner-notch-1 border bg-background">
              {viewMode === "editor" ? (
                <div className="flex h-full min-h-[420px] flex-col">
                  <div className="border-b px-4 py-3 text-sm font-medium">
                    Editor surface
                  </div>
                  <div className="grid flex-1 gap-2 p-4 font-mono text-xs text-muted-foreground">
                    <div className="rounded-ui bg-muted/60 px-3 py-2">
                      export function FileViewInner() {"{"}
                    </div>
                    <div className="rounded-ui bg-muted/40 px-3 py-2">
                      {"  "}const daytonaPaused = true;
                    </div>
                    <div className="rounded-ui bg-muted/40 px-3 py-2">
                      {"  "}return {"<RepositoryEditor />"};
                    </div>
                    <div className="rounded-ui bg-muted/60 px-3 py-2">
                      {"}"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="relative min-h-[420px] overflow-hidden bg-[linear-gradient(180deg,rgba(148,163,184,0.12),rgba(148,163,184,0.02))]">
                  <div className="absolute inset-x-10 top-24 h-px bg-border" />
                  <div className="absolute left-12 top-12 w-56 rounded-ui border bg-background p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Agent file
                    </div>
                    <div className="mt-2 text-sm font-medium">AGENTS.md</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Root instructions and operator workflow
                    </div>
                  </div>
                  <div className="absolute right-12 top-36 w-56 rounded-ui border bg-background p-4 shadow-sm">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                      Tool config
                    </div>
                    <div className="mt-2 text-sm font-medium">tools.json</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Runtime wiring for agent tools
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
