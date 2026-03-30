import { PersonIcon } from "@radix-ui/react-icons";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { MonacoEditorSurface } from "@/components/MonacoEditorSurface";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";

export type FileViewMonacoDragVisualMode = "fileview-monaco-drag";

const FIXTURE_DOCUMENT = `export function describePaneDrag(direction: "left" | "right") {
  const sidebar = direction === "left" ? "review" : "files";
  return [
    "Monaco keeps vertical editor behavior on mobile.",
    "Horizontal touch drags should move the workspace shell.",
    "Mouse drag selection should stay local to the editor.",
    \`Dragging toward \${direction} reveals the \${sidebar} pane.\`,
  ].join("\\n");
}

export const fixtureNotes = {
  left: "Drag right for files",
  main: "Wrap long lines and keep taps local",
  right: "Drag left for review",
};`;

const FIXTURE_VAULT_KEY = "fixture-monaco-pane-drag-vault";

export function FileViewMonacoDragVisualFixture({
  mode: _mode,
}: {
  mode: FileViewMonacoDragVisualMode;
}) {
  return (
    <SidebarProvider
      defaultOpen={true}
      defaultRightOpen={true}
      className="h-[720px] min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="fileview-monaco-drag-shell"
        headerTestId="fileview-monaco-drag-header"
        leftSidebarHeader={
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
        }
        leftSidebarContent={
          <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
            <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Files
            </div>
            <div className="grid gap-2 p-3 text-sm">
              <div className="border border-border/50 bg-background px-3 py-2">
                src/mobile-pane-drag.ts
              </div>
              <div className="border border-border/50 bg-background px-3 py-2 text-muted-foreground">
                src/notes.ts
              </div>
            </div>
          </div>
        }
        rightSidebarContent={
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Review
            </div>
            <div className="grid gap-2 p-3 text-sm text-muted-foreground">
              <div>Mode: Monaco</div>
              <div>Swipe left for details, right for files.</div>
            </div>
          </div>
        }
        headerTitle="src/mobile-pane-drag.ts"
        headerRight={
          <div className="font-mono text-xs text-muted-foreground">4c7e190</div>
        }
        onQuickOpen={() => {}}
        contentClassName="min-h-0 p-0"
      >
        <div
          data-testid="fileview-monaco-drag-visual-fixture"
          className="flex h-full min-h-0 flex-col bg-muted/10"
        >
          <div className="border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
            Drag horizontally from the Monaco surface to move the mobile
            workspace panes.
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="corner-notch-1 min-h-full border bg-background p-3">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Monaco
              </div>
              <div
                data-testid="fileview-monaco-drag-surface"
                className="h-[420px] min-h-0"
              >
                <MonacoEditorSurface
                  branch="main"
                  defaultValue={FIXTURE_DOCUMENT}
                  filePath="src/mobile-pane-drag.ts"
                  onMount={() => {}}
                  showMobileLineNumbers={false}
                  syncError={null}
                  vaultKey={FIXTURE_VAULT_KEY}
                />
              </div>
            </div>
          </div>
        </div>
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
