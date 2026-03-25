import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { FileTree } from "@/components/FileTree";
import { MediaUploadDialog } from "@/components/MediaUploadDialog";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";
import { SidebarProvider } from "@/components/sidebar";

const TREE_ITEMS = [
  {
    path: "README.md",
    originalPath: "README.md",
    type: "blob" as const,
  },
  {
    path: "assets",
    originalPath: "assets",
    type: "tree" as const,
  },
  {
    path: "assets/cover.png",
    originalPath: "assets/cover.png",
    type: "blob" as const,
  },
  {
    path: "assets/hero.png",
    originalPath: "assets/hero.png",
    type: "blob" as const,
  },
];

const FOLDER_EXPANSION_STATES = [
  {
    folderPath: "assets",
    isExpanded: true,
  },
];

export type SidebarMediaUploadVisualMode = "sidebar-media-upload";

export function SidebarMediaUploadVisualFixture() {
  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col">
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

      <div className="flex-1 overflow-auto">
        <FileTree
          items={TREE_ITEMS}
          selectedFile="assets/cover.png"
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
    <SidebarProvider
      defaultOpen={true}
      className="h-screen min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="sidebar-media-upload-visual-fixture"
        sidebarContent={sidebarContent}
        headerTitle="assets"
      >
        <div className="flex h-full min-h-0 flex-col p-6">
          <div className="mb-3">
            <div className="text-sm font-medium text-foreground">
              Upload target review
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              The dialog stays tap-first on mobile and asks before replacing an
              existing path.
            </div>
          </div>
        </div>
      </RepositoryWorkspaceFrame>
      <MediaUploadDialog
        isOpen={true}
        onClose={() => {}}
        fileName="cover.png"
        initialFolderPath="assets"
        folders={TREE_ITEMS}
        existingFilePaths={["assets/cover.png"]}
        onSubmit={() => {}}
      />
    </SidebarProvider>
  );
}
