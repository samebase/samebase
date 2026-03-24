import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { FileTree } from "@/components/FileTree";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";

export type FileViewCompareVisualMode = "file-view-compare-sidebar";

const COMPARED_TREE_ITEMS = [
  {
    path: "docs/pr-guide.md",
    originalPath: "docs/pr-guide.md",
    type: "blob" as const,
    status: "deleted" as const,
    deleted: true,
  },
  {
    path: "src/components/FileView.tsx",
    originalPath: "src/components/FileView.tsx",
    type: "blob" as const,
    status: "modified" as const,
    deleted: false,
  },
  {
    path: "src/lib/queryParams.ts",
    originalPath: "src/lib/queryParams.ts",
    type: "blob" as const,
    status: "renamed" as const,
    deleted: false,
  },
] as const;

export function FileViewCompareVisualFixture({
  mode,
}: {
  mode: FileViewCompareVisualMode;
}) {
  return (
    <div
      data-testid="file-view-compare-visual-fixture"
      data-mode={mode}
      className="min-h-screen bg-slate-100 p-8 text-slate-900"
    >
      <div className="mx-auto max-w-5xl corner-notch-1 border border-slate-300 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <GitHubLogoIcon className="h-3 w-3" />
          noter-md/noter
        </div>

        <div className="mt-3">
          <ToggleGroup type="single" size="sm" value="compare">
            <ToggleGroupItem value="simple" className="h-7 px-2 text-xs">
              Simple View
            </ToggleGroupItem>
            <ToggleGroupItem value="all" className="h-7 px-2 text-xs">
              All Files
            </ToggleGroupItem>
            <ToggleGroupItem value="compare" className="h-7 px-2 text-xs">
              Changed Files
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="mt-5 corner-notch-1 border border-slate-200">
          <FileTree
            items={[...COMPARED_TREE_ITEMS]}
            selectedFile="docs/pr-guide.md"
            restoringFilePath={null}
            folderExpansionStates={[]}
            autoExpandedPaths={["docs", "src", "src/components", "src/lib"]}
            forceAutoExpandedPaths={true}
            onFileRestore={() => {}}
          />
        </div>
      </div>
    </div>
  );
}
