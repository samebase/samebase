import { useEffect, useState } from "react";
import { FilePlusIcon, GitHubLogoIcon, PersonIcon, PlusIcon } from "@/lib/radixIcons";
import { SidebarAccountSection } from "@/components/SidebarAccountSection";
import { FileTree } from "@/components/FileTree";
import { FileViewDeveloperTools } from "@/components/FileViewDeveloperTools";
import { FileViewPushActions } from "@/components/FileViewPushActions";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { VaultSyncStatusContent } from "@/components/VaultSyncStatus";
import { CodeMirrorFileSurface } from "@/components/CodeMirrorFileSurface";
import { linkStyle } from "@/components/styles";
import { FILE_VIEW_TREE_SIDEBAR_SIDE } from "@/lib/fileViewSidebarLayout";
import type { WorkspaceLayoutV2PaneFrameProps } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PaneFrame";
import type { FolderExpansionState } from "@/lib/fileTreeState";
import { isKeyOf } from "@noter-md/dependent";

export type FileViewProsemarkHeightVisualMode = "fileview-prosemark-flex-height";

type FixtureSidebarMode = "all" | "compare" | "simple";

const FIXTURE_BRANCH = "main";
const FIXTURE_COMMIT_SHA = "df1098f";
const FIXTURE_NOW = Date.UTC(2026, 3, 1, 19, 54, 40);
const FIXTURE_OWNER = "nicu-chiciuc";
const FIXTURE_REPOSITORY_NAME = "tmp-cda7-prosemark-scroll";
const FIXTURE_REPOSITORY_FULL_NAME = `${FIXTURE_OWNER}/${FIXTURE_REPOSITORY_NAME}`;

const README_DOCUMENT = `# Noter Starter Template

This project is the seeded baseline for newly created noter-managed repositories.

## Stack

- React + Vite
- Convex backend
- Tailwind CSS
- shadcn/ui primitives

## Scripts

\`\`\`bash
pnpm install
pnpm run dev
pnpm run build
\`\`\`

## Notes

${Array.from({ length: 160 }, (_, index) => {
  return `- Scroll regression line ${index + 1}: the shipped file view should keep wheel and touch scrolling working on the real markdown surface.`;
}).join("\n")}
`;

const AGENTS_DOCUMENT = `# AGENTS.md

## Worktree

- run \`pnpm dev:worktree:once\` before local workflows in a git worktree
- use \`pnpm dev:worktree\` for day-to-day startup inside the worktree
- keep the file-view shell aligned with the shipped route

## Visual coverage

- fixtures should exercise the actual shared workspace components
- regressions should fail on the same surface users interact with
`;

const SCROLLING_DOCUMENT = `# Scrolling Notes

- keep the workspace shell as the shared scroll owner
- let prose views inherit the same route layout
- only delegate horizontal drags back to the mobile pane carousel
`;

const APP_DOCUMENT = `export function describeScrollSurface() {
  return [
    "Keep the route shell honest.",
    "Keep the prose surface shared.",
    "Keep the fixture close to the shipped file view.",
  ].join("\\n");
}
`;

const FIXTURE_DOCUMENTS = {
  "README.md": README_DOCUMENT,
  "AGENTS.md": AGENTS_DOCUMENT,
  "docs/scrolling.md": SCROLLING_DOCUMENT,
  "src/app.tsx": APP_DOCUMENT,
} satisfies Record<string, string>;

const FIXTURE_TREE_ITEMS = [
  {
    originalPath: "README.md",
    path: "README.md",
    size: README_DOCUMENT.length,
    type: "blob",
  },
  {
    originalPath: "AGENTS.md",
    path: "AGENTS.md",
    size: AGENTS_DOCUMENT.length,
    type: "blob",
  },
  {
    originalPath: "docs",
    path: "docs",
    type: "tree",
  },
  {
    originalPath: "docs/scrolling.md",
    path: "docs/scrolling.md",
    size: SCROLLING_DOCUMENT.length,
    type: "blob",
  },
  {
    originalPath: "src",
    path: "src",
    type: "tree",
  },
  {
    originalPath: "src/app.tsx",
    path: "src/app.tsx",
    size: APP_DOCUMENT.length,
    type: "blob",
  },
] satisfies Array<{
  originalPath: string;
  path: string;
  size?: number;
  type: "blob" | "tree";
}>;

function getFirstVisibleFixtureFile(
  items: ReadonlyArray<(typeof FIXTURE_TREE_ITEMS)[number]>,
): keyof typeof FIXTURE_DOCUMENTS {
  for (const item of items) {
    if (item.type === "blob" && isKeyOf(FIXTURE_DOCUMENTS, item.path)) {
      return item.path;
    }
  }
  return "README.md";
}

/**
 * This fixture mirrors the shipped file-view shell closely enough that prose
 * scroll and mobile-pane regressions exercise the real workspace/editor
 * composition instead of a bespoke card nested under the header.
 */
export function FileViewProsemarkHeightVisualFixture(_props: {
  mode: FileViewProsemarkHeightVisualMode;
}) {
  const [developerToolsOpen, setDeveloperToolsOpen] = useState(false);
  const [folderExpansionStates, setFolderExpansionStates] = useState<FolderExpansionState[]>([
    {
      folderPath: "docs",
      isExpanded: true,
    },
    {
      folderPath: "src",
      isExpanded: true,
    },
  ]);
  const [selectedFile, setSelectedFile] = useState<keyof typeof FIXTURE_DOCUMENTS>("README.md");
  const [sidebarMode, setSidebarMode] = useState<FixtureSidebarMode>("all");

  const headerTitle = selectedFile.split("/").slice(0, -1).join("/") || "/";
  const selectedFileGitHubUrl = `https://github.com/${FIXTURE_REPOSITORY_FULL_NAME}/blob/${FIXTURE_BRANCH}/${selectedFile}`;
  const visibleTreeItems =
    sidebarMode === "simple"
      ? FIXTURE_TREE_ITEMS.filter((item) => item.path === "README.md" || item.path === "AGENTS.md")
      : sidebarMode === "compare"
        ? FIXTURE_TREE_ITEMS.filter(
            (item) =>
              item.type === "tree" ||
              item.path === "README.md" ||
              item.path === "docs/scrolling.md",
          )
        : FIXTURE_TREE_ITEMS;

  useEffect(() => {
    const selectionIsVisible = visibleTreeItems.some(
      (item) => item.type === "blob" && item.path === selectedFile,
    );
    if (selectionIsVisible) {
      return;
    }

    // Keep the header/editor selection aligned with the visible tree so the
    // honest fixture never renders a file state that the sidebar cannot show.
    setSelectedFile(getFirstVisibleFixtureFile(visibleTreeItems));
  }, [selectedFile, visibleTreeItems]);

  const sidebarHeader = (
    <SidebarAccountSection>
      <div className="flex w-full min-w-0 items-center justify-between gap-2 text-sm font-medium">
        <span className="block min-w-0 truncate">nicu@noter.md</span>
        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-ui md:h-6 md:w-6">
          <PersonIcon className="h-4 w-4 md:h-3 md:w-3" />
          <span className="sr-only">Open user menu</span>
        </Button>
      </div>
    </SidebarAccountSection>
  );
  const sidebarContent = (
    <>
      <div className="border-b border-border/50 p-3">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
          <a
            className={`truncate text-xs font-medium text-muted-foreground ${linkStyle}`}
            href={`https://github.com/${FIXTURE_REPOSITORY_FULL_NAME}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {FIXTURE_REPOSITORY_FULL_NAME}
          </a>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:h-6 md:w-6"
            title="Create new file"
            aria-label="Create new file"
          >
            <PlusIcon className="h-4 w-4 md:h-3 md:w-3" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:h-6 md:w-6"
            title="Create new folder"
            aria-label="Create new folder"
          >
            <FilePlusIcon className="h-4 w-4 md:h-3 md:w-3" />
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <ToggleGroup
            type="single"
            size="sm"
            value={sidebarMode}
            className="justify-start"
            onValueChange={(value) => {
              if (value === "simple" || value === "all" || value === "compare") {
                setSidebarMode(value);
              }
            }}
          >
            <ToggleGroupItem value="simple" aria-label="Simple View" className="h-7 px-2 text-xs">
              Simple View
            </ToggleGroupItem>
            <ToggleGroupItem value="all" aria-label="All Files" className="h-7 px-2 text-xs">
              All Files
            </ToggleGroupItem>
            <ToggleGroupItem
              value="compare"
              aria-label="Changed Files"
              className="h-7 px-2 text-xs"
            >
              Changed Files
            </ToggleGroupItem>
          </ToggleGroup>
          {sidebarMode === "compare" ? (
            <div
              aria-label="Showing 2 changed files"
              aria-live="polite"
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
            >
              Showing 2 changed files
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        <FileTree
          items={visibleTreeItems}
          onFileSelect={(path) => {
            if (isKeyOf(FIXTURE_DOCUMENTS, path)) {
              setSelectedFile(path);
            }
          }}
          selectedFile={selectedFile}
          folderExpansionStates={folderExpansionStates}
          onFolderToggle={(folderPath, isExpanded) => {
            setFolderExpansionStates((currentStates) => {
              const existingStateIndex = currentStates.findIndex(
                (state) => state.folderPath === folderPath,
              );
              if (existingStateIndex === -1) {
                return [
                  ...currentStates,
                  {
                    folderPath,
                    isExpanded,
                  },
                ];
              }

              const nextStates = [...currentStates];
              nextStates[existingStateIndex] = {
                folderPath,
                isExpanded,
              };
              return nextStates;
            });
          }}
          autoExpandedPaths={["docs", "src"]}
          forceAutoExpandedPaths={sidebarMode === "compare"}
        />
      </div>
    </>
  );
  const sidebarFooter = (
    <div className="shrink-0 border-t border-border/50 p-3">
      <button
        type="button"
        className="flex w-full items-center justify-center border-[3px] border-dashed border-foreground/45 px-3 py-4 text-sm text-foreground/80 transition-colors hover:border-foreground/65 hover:text-foreground"
      >
        Drop file or click
      </button>
    </div>
  );
  const inactiveSidebar: WorkspaceLayoutV2PaneFrameProps = {};
  const activeSidebar: WorkspaceLayoutV2PaneFrameProps = {
    header: sidebarHeader,
    content: sidebarContent,
    footer: sidebarFooter,
  };

  return (
    <WorkspaceLayoutV2FixtureFrame
      dataTestId="fileview-prosemark-height-fixture-frame"
      shortcutPaneSide={FILE_VIEW_TREE_SIDEBAR_SIDE}
      left={FILE_VIEW_TREE_SIDEBAR_SIDE === "left" ? activeSidebar : inactiveSidebar}
      main={{
        headerAccessory: (
          <RepositoryWorkspacePaneHeader title={headerTitle} onQuickOpen={() => {}} />
        ),
        content: (
          <div
            data-testid="fileview-prosemark-height-visual-fixture"
            className="max-w-none flex min-h-full flex-col gap-4 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="min-w-0">
                  <div className="mb-0.5 font-mono text-[11px] text-muted-foreground">
                    {FIXTURE_BRANCH}
                  </div>
                  <h2 className="text-base font-medium md:text-sm">
                    <a
                      className={`block truncate ${linkStyle}`}
                      href={selectedFileGitHubUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {selectedFile}
                    </a>
                  </h2>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <VaultSyncStatusContent
                    repositoryFullName={FIXTURE_REPOSITORY_FULL_NAME}
                    branch={FIXTURE_BRANCH}
                    owner={FIXTURE_OWNER}
                    repoName={FIXTURE_REPOSITORY_NAME}
                    commitSha={FIXTURE_COMMIT_SHA}
                    lastTreeRefreshAt={FIXTURE_NOW - 60_000}
                    now={FIXTURE_NOW}
                    showChecks={false}
                  />
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs">
                    Review Changes
                  </Button>
                  <FileViewPushActions
                    canCreateDraftPullRequest={true}
                    draftButtonLabel="draft"
                    hasChangesToCommit={false}
                    isCreatingDraftPullRequest={false}
                    isPushing={false}
                    onCreateDraftPullRequest={() => {}}
                    onManualCommit={() => {}}
                  />
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
                  onOpenChange={setDeveloperToolsOpen}
                  viewMode="editor"
                  onViewModeChange={() => {}}
                >
                  {null}
                </FileViewDeveloperTools>
              </div>
            </div>
            <div className="relative flex flex-1 min-h-0">
              <CodeMirrorFileSurface
                dataTestId="fileview-prosemark-height-surface"
                filePath={selectedFile}
                initialValue={FIXTURE_DOCUMENTS[selectedFile]}
              />
            </div>
          </div>
        ),
      }}
      right={FILE_VIEW_TREE_SIDEBAR_SIDE === "right" ? activeSidebar : inactiveSidebar}
    />
  );
}
