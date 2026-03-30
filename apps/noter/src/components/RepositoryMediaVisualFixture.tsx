import { FileTree } from "@/components/FileTree";
import { SidebarProvider } from "@/components/sidebar";
import { GitHubLogoIcon } from "@radix-ui/react-icons";
import {
  RepositoryMediaPreviewPanel,
  type RepositoryMediaAsset,
} from "@/components/RepositoryMediaViewer";
import { RepositoryWorkspaceFrame } from "@/components/RepositoryWorkspaceFrame";

export type RepositoryMediaVisualMode = "media-png" | "media-svg" | "media-vox";

const FIXTURE_BY_MODE: Record<
  RepositoryMediaVisualMode,
  {
    selectedFile: string;
    asset: Extract<RepositoryMediaAsset, { found: true }>;
  }
> = {
  "media-png": {
    selectedFile: "assets/lumina_icon.png",
    asset: {
      found: true,
      kind: "image",
      mimeType: "image/png",
      url: "/lumina_icon.png",
      fileName: "lumina_icon.png",
    },
  },
  "media-svg": {
    selectedFile: "assets/media-visual-fixture.svg",
    asset: {
      found: true,
      kind: "image",
      mimeType: "image/svg+xml",
      url: "/media-visual-fixture.svg",
      fileName: "media-visual-fixture.svg",
    },
  },
  "media-vox": {
    selectedFile: "assets/monu10.vox",
    asset: {
      found: true,
      kind: "vox",
      mimeType: "application/octet-stream",
      url: "/repository-media-fixtures/monu10.vox",
      fileName: "monu10.vox",
    },
  },
};

export function RepositoryMediaVisualFixture({
  mode,
}: {
  mode: RepositoryMediaVisualMode;
}) {
  const fixture = FIXTURE_BY_MODE[mode];
  const folderExpansionStates = [
    {
      folderPath: "assets",
      isExpanded: true,
    },
  ];
  const sidebarHeader = (
    <div className="border-b border-border/50 p-3">
      <div className="text-sm font-medium text-foreground">Noter</div>
      <div className="mt-1 text-xs text-muted-foreground">
        Fixture Workspace
      </div>
    </div>
  );

  const sidebarContent = (
    <>
      <div className="border-b border-border/50 p-3">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
          <span className="truncate text-xs font-medium text-muted-foreground">
            noter-md/media-preview-fixture
          </span>
        </div>
        <div className="mt-2 text-[11px] text-muted-foreground">
          Branch: <span className="font-mono text-foreground">main</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <FileTree
          items={[
            {
              path: "README.md",
              originalPath: "README.md",
              type: "blob",
              deleted: false,
            },
            {
              path: "assets/lumina_icon.png",
              originalPath: "assets/lumina_icon.png",
              type: "blob",
              deleted: false,
            },
            {
              path: "assets/media-visual-fixture.svg",
              originalPath: "assets/media-visual-fixture.svg",
              type: "blob",
              deleted: false,
            },
            {
              path: "assets/monu10.png",
              originalPath: "assets/monu10.png",
              type: "blob",
              deleted: false,
            },
            {
              path: "assets/monu10.vox",
              originalPath: "assets/monu10.vox",
              type: "blob",
              deleted: false,
            },
          ]}
          selectedFile={fixture.selectedFile}
          folderExpansionStates={folderExpansionStates}
        />
      </div>
    </>
  );

  return (
    <SidebarProvider
      defaultOpen={true}
      defaultRightOpen={true}
      className="h-screen min-h-0 bg-background text-foreground"
    >
      <RepositoryWorkspaceFrame
        dataTestId="repository-media-visual-fixture"
        leftSidebarHeader={sidebarHeader}
        leftSidebarContent={sidebarContent}
        rightSidebarHeader={null}
        rightSidebarContent={<div className="min-h-0 flex-1 bg-background" />}
        headerTitle={
          fixture.selectedFile.split("/").slice(0, -1).join("/") || "/"
        }
      >
        <div className="max-w-none h-full flex flex-col">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-medium md:text-sm">
              <span className="block truncate text-foreground">
                {fixture.selectedFile}
              </span>
            </h2>
            <div className="text-xs text-muted-foreground">
              Read-only media preview
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <RepositoryMediaPreviewPanel
              asset={fixture.asset}
              fallbackLabel={fixture.selectedFile}
              testId="repository-media-preview-panel"
            />
          </div>
        </div>
      </RepositoryWorkspaceFrame>
    </SidebarProvider>
  );
}
