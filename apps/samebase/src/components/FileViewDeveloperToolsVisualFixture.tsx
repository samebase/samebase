import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { Button } from "@/components/ui/button";
import {
  FileViewDeveloperTools,
  type FileViewEditorOverride,
} from "@/components/FileViewDeveloperTools";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";

export type FileViewDeveloperToolsVisualMode =
  | "file-view-developer-tools-collapsed"
  | "file-view-developer-tools-codemirror";

function getFixtureDeveloperToolsOpen(mode: FileViewDeveloperToolsVisualMode): boolean {
  return mode !== "file-view-developer-tools-collapsed";
}

function getFixtureEditorOverride(mode: FileViewDeveloperToolsVisualMode): FileViewEditorOverride {
  return mode === "file-view-developer-tools-codemirror" ? "codemirror" : "default";
}

export function FileViewDeveloperToolsVisualFixture({
  mode,
}: {
  mode: FileViewDeveloperToolsVisualMode;
}) {
  const developerToolsOpen = getFixtureDeveloperToolsOpen(mode);
  const editorOverride = getFixtureEditorOverride(mode);
  const sidebarContent = (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
      <div className="border-b p-3 text-xs text-muted-foreground">samebase/samebase</div>
      <div className="flex min-h-0 flex-1 items-center justify-center p-3 text-xs text-muted-foreground">
        File tree
      </div>
    </div>
  );
  return (
    <WorkspaceLayoutV2FixtureFrame
      shortcutPaneSide="left"
      left={{
        header: null,
        content: sidebarContent,
      }}
      main={{
        headerAccessory: (
          <RepositoryWorkspacePaneHeader
            title="src/components/FileView.tsx"
            right={<div className="font-mono text-xs text-muted-foreground">74f9c18</div>}
            onQuickOpen={() => {}}
          />
        ),
        content: (
          <div className="flex h-full min-h-0 flex-col">
            <div className="max-w-none flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="mb-0.5 font-mono text-[11px] text-muted-foreground">
                    feat/editor-engine
                  </div>
                  <h2 className="text-base font-medium pointer-fine:text-sm">
                    src/components/FileView.tsx
                  </h2>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-ui bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                      Up to date
                    </div>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                      Review Changes
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
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
                    open={developerToolsOpen}
                    onOpenChange={() => {}}
                    editorOverride={editorOverride}
                    onEditorOverrideChange={() => {}}
                  />
                </div>
              </div>

              <div className="relative flex-1 min-h-0 corner-notch-1 border bg-background">
                <div className="flex h-full min-h-[420px] flex-col">
                  <div className="border-b px-4 py-3 text-sm font-medium">Editor surface</div>
                  <div className="grid flex-1 gap-2 p-4 font-mono text-xs text-muted-foreground">
                    <div className="rounded-ui bg-muted/60 px-3 py-2">
                      export function FileViewInner() {"{"}
                    </div>
                    <div className="rounded-ui bg-muted/40 px-3 py-2">
                      {"  "}const editorEngine = "auto";
                    </div>
                    <div className="rounded-ui bg-muted/40 px-3 py-2">
                      {"  "}return {"<RepositoryEditor />"};
                    </div>
                    <div className="rounded-ui bg-muted/60 px-3 py-2">{"}"}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ),
      }}
    />
  );
}
