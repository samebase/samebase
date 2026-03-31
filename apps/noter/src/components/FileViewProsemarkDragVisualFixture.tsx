import { PersonIcon } from "@radix-ui/react-icons";
import { ProsemarkMergeEditor } from "@/components/ProsemarkMergeEditor";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { SidebarProvider } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { RepositoryWorkspaceFrame } from "@/components/workspace-layout/RepositoryWorkspaceFrame";

export type FileViewProsemarkDragVisualMode =
  | "fileview-prosemark-drag-editable"
  | "fileview-prosemark-drag-read-only";

const EDITOR_OPTIONS = {
  allowInlineDiffs: false,
  syntaxHighlightDeletions: true,
} as const;

const BASE_DOCUMENT = `# header 1 text

- keep taps local
- keep scroll vertical
- let the shell drive panes
- keep prose lines wrapped
`;

const NEXT_DOCUMENT = `# header 1 text

- keep taps local
- keep scroll vertical
- drag right for files
- drag left for review
- let the shell drive panes
- keep prose lines wrapped
`;

export function FileViewProsemarkDragVisualFixture({
  mode,
}: {
  mode: FileViewProsemarkDragVisualMode;
}) {
  const isEditableMode = mode === "fileview-prosemark-drag-editable";

  return (
    <SidebarProvider
      defaultOpen={true}
      defaultRightOpen={true}
      className="h-[720px] min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="fileview-prosemark-drag-shell"
        headerTestId="fileview-prosemark-drag-header"
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
                docs/mobile-pane-drag.md
              </div>
              <div className="border border-border/50 bg-background px-3 py-2 text-muted-foreground">
                docs/notes.md
              </div>
            </div>
          </div>
        }
        rightSidebarHeader={null}
        rightSidebarContent={
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            <div className="border-b border-border/50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Review
            </div>
            <div className="grid gap-2 p-3 text-sm text-muted-foreground">
              <div>Mode: {isEditableMode ? "Editable" : "Read only"}</div>
              <div>Swipe left for details, right for files.</div>
            </div>
          </div>
        }
        headerTitle="docs/mobile-pane-drag.md"
        headerRight={
          <div className="font-mono text-xs text-muted-foreground">e4c2a91</div>
        }
        onQuickOpen={() => {}}
        contentClassName="min-h-0 p-0"
      >
        <div
          data-testid="fileview-prosemark-drag-visual-fixture"
          className="flex h-full min-h-0 flex-col bg-muted/10"
        >
          <div className="border-b border-border/50 px-3 py-2 text-xs text-muted-foreground">
            Drag horizontally from the markdown surface to move the mobile
            workspace panes.
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <div className="corner-notch-1 min-h-full border bg-background p-3">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {isEditableMode ? "Editable ProseMark" : "Read-only ProseMark"}
              </div>
              <div
                data-testid="fileview-prosemark-drag-surface"
                className="text-sm leading-6"
              >
                {isEditableMode ? (
                  <ProsemarkMergeEditor
                    value={NEXT_DOCUMENT}
                    baseValue={BASE_DOCUMENT}
                    options={EDITOR_OPTIONS}
                    editable={true}
                    mobilePaneDragEnabled
                    className="text-sm leading-6"
                  />
                ) : (
                  <ProsemarkReadOnly
                    value={NEXT_DOCUMENT}
                    mobilePaneDragEnabled
                    className="text-sm leading-6"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
