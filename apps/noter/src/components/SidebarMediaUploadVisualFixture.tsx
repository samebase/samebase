import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { FileTree } from "@/components/FileTree";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import { RepositoryWorkspacePaneHeader } from "@/components/RepositoryWorkspacePaneHeader";
import { WorkspaceLayoutV2FixtureFrame } from "@/components/WorkspaceLayoutV2FixtureFrame";

const SIDEBAR_MEDIA_UPLOAD_VISUAL_FIXTURE_FONT_RULES = `
  [data-sidebar-media-upload-visual-fixture-font],
  [data-sidebar-media-upload-visual-fixture-font] *,
  [data-testid="media-upload-dialog-content"],
  [data-testid="media-upload-dialog-content"] *,
  [data-testid="media-upload-dialog-form"],
  [data-testid="media-upload-dialog-form"] * {
    font-family: "IBM Plex Sans", sans-serif !important;
    font-synthesis: none;
  }
`;

const TREE_ITEMS = [
  {
    path: "README.md",
    originalPath: "README.md",
    type: "blob" as const,
  },
  {
    path: "x.png",
    originalPath: "x.png",
    type: "blob" as const,
  },
  {
    path: "img",
    originalPath: "img",
    type: "tree" as const,
  },
  {
    path: "img/y.png",
    originalPath: "img/y.png",
    type: "blob" as const,
  },
];

const FOLDER_EXPANSION_STATES = [
  {
    folderPath: "img",
    isExpanded: true,
  },
];

export type SidebarMediaUploadVisualMode = "sidebar-media-upload";

export function SidebarMediaUploadVisualFixture() {
  const sidebarHeader = (
    <>
      <div className="border-b border-border/50 p-3">
        <div className="text-sm font-medium text-foreground">Noter</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Sidebar media upload fixture
        </div>
      </div>

      <div className="border-b border-border/50 p-3">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
          <span className="truncate text-xs font-medium text-muted-foreground">
            noter-md/media-upload-fixture
          </span>
        </div>
      </div>
    </>
  );

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-auto">
        <FileTree
          items={TREE_ITEMS}
          selectedFile="x.png"
          folderExpansionStates={FOLDER_EXPANSION_STATES}
        />
      </div>

      <div className="shrink-0 border-t border-border/50 p-3">
        <button
          type="button"
          className="flex w-full items-center justify-center border-[3px] border-dashed border-foreground/45 px-3 py-4 text-sm text-foreground/80"
        >
          Drop file or click
        </button>
      </div>
    </div>
  );

  return (
    <div data-sidebar-media-upload-visual-fixture-font className="contents">
      <style>{SIDEBAR_MEDIA_UPLOAD_VISUAL_FIXTURE_FONT_RULES}</style>
      <WorkspaceLayoutV2FixtureFrame
        dataTestId="sidebar-media-upload-visual-fixture"
        defaultOpen={true}
        defaultRightOpen={false}
        left={{
          header: sidebarHeader,
          content: sidebarContent,
        }}
        main={{
          header: <RepositoryWorkspacePaneHeader title="x.png" />,
          content: (
            <div className="flex h-full min-h-0 flex-col p-6">
              <div className="mb-3">
                <div className="text-sm font-medium text-foreground">
                  Upload target review
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  The dialog stays tap-first on mobile and asks before replacing
                  an existing path.
                </div>
              </div>
            </div>
          ),
        }}
        right={{}}
      />
      <MediaUploadDialog
        isOpen={true}
        onClose={() => {}}
        fileName="x.png"
        initialFolderPath=""
        folders={TREE_ITEMS}
        existingFilePaths={["x.png"]}
        onSubmit={() => {}}
      />
    </div>
  );
}
