import { FileTree } from "@/repository/editor/FileTree";
import { GitHubLogoIcon } from "@/lib/radixIcons";
import { RepositoryWorkspacePaneHeader } from "@/repository/editor/RepositoryWorkspacePaneHeader";
import {
  RepositoryMediaPreviewPanel,
  type RepositoryMediaAsset,
} from "@/repository/editor/RepositoryMediaViewer";
import { SidebarLayoutFixtureFrame } from "@/appShell/SidebarLayoutFixtureFrame";

export type RepositoryMediaVisualMode = "media-png" | "media-svg" | "media-vox";

const FIXTURE_BY_MODE: Record<
  RepositoryMediaVisualMode,
  {
    selectedFile: string;
    asset: Extract<RepositoryMediaAsset, { found: true }>;
  }
> = {
  "media-png": {
    selectedFile: "assets/icon-512.png",
    asset: {
      found: true,
      kind: "image",
      mimeType: "image/png",
      url: "/icon-512.png",
      fileName: "icon-512.png",
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

export function RepositoryMediaVisualFixture({ mode }: { mode: RepositoryMediaVisualMode }) {
  const fixture = FIXTURE_BY_MODE[mode];
  const folderExpansionStates = [
    {
      folderPath: "assets",
      isExpanded: true,
    },
  ];
  const sidebarHeader = (
    <div className="flex h-full items-center px-3 text-sm font-medium text-foreground">
      Samebase
    </div>
  );

  const sidebarContent = (
    <>
      <div className="border-b border-border/50 p-3">
        <div className="text-xs text-muted-foreground">Fixture Workspace</div>
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
          <span className="truncate text-xs font-medium text-muted-foreground">
            samebase/media-preview-fixture
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
              path: "assets/icon-512.png",
              originalPath: "assets/icon-512.png",
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
    <SidebarLayoutFixtureFrame
      left={{
        header: sidebarHeader,
        content: sidebarContent,
      }}
      main={{
        headerAccessory: (
          <RepositoryWorkspacePaneHeader
            title={fixture.selectedFile.split("/").slice(0, -1).join("/") || "/"}
          />
        ),
        content: (
          <div className="max-w-none h-full flex flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-medium pointer-fine:text-sm">
                <span className="block truncate text-foreground">{fixture.selectedFile}</span>
              </h2>
              <div className="text-xs text-muted-foreground">Read-only media preview</div>
            </div>
            <div className="min-h-0 flex-1">
              <RepositoryMediaPreviewPanel
                asset={fixture.asset}
                fallbackLabel={fixture.selectedFile}
                testId="repository-media-preview-panel"
              />
            </div>
          </div>
        ),
      }}
    />
  );
}
