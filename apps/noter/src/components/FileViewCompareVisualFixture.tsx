import { GitHubLogoIcon } from "@radix-ui/react-icons";
import { FileTree } from "@/components/FileTree";
import { ProsemarkMergeEditor } from "@/components/ProsemarkMergeEditor";
import { ToggleGroup, ToggleGroupItem } from "@/components/toggle-group";

export type FileViewCompareVisualMode = "file-view-compare-sidebar";

const COMPARED_TREE_ITEMS = [
  {
    path: "docs/pr-guide.md",
    originalPath: "docs/pr-guide.md",
    type: "blob" as const,
    status: "modified" as const,
    deleted: false,
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

const COMPARE_MARKDOWN_BASE = `# PR guide

- Open the draft PR
- Verify the changed files list
- Restore deleted files from compare mode when needed
`;

const COMPARE_MARKDOWN_NEXT = `# PR guide

- Open the draft PR
- Verify the changed files list in the sidebar
- Restore deleted files from compare mode when needed
- Review markdown changes in the inline diff by default
`;

const COMPARE_INLINE_OPTIONS = {
  allowInlineDiffs: false,
  syntaxHighlightDeletions: true,
} as const;

// The fixture keeps restore visible so deleted compare rows exercise the same
// affordance as the live sidebar without introducing fixture-only behavior.
const NOOP_ON_FILE_RESTORE = () => {};

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

        <div className="mt-3 flex items-center gap-2">
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
          <div className="min-w-0 flex-1 truncate text-[11px] text-slate-500">
            PR #335 vs main
          </div>
        </div>

        <div className="mt-5 corner-notch-1 border border-slate-200">
          <div className="grid min-h-[640px] grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-r border-slate-200">
              <FileTree
                items={[...COMPARED_TREE_ITEMS]}
                selectedFile="docs/pr-guide.md"
                restoringFilePath={null}
                folderExpansionStates={[]}
                autoExpandedPaths={["docs", "src", "src/components", "src/lib"]}
                forceAutoExpandedPaths={true}
                onFileRestore={NOOP_ON_FILE_RESTORE}
              />
            </div>

            <div className="min-w-0 bg-white">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-sm font-medium text-slate-900">
                  docs/pr-guide.md
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Compare-only markdown files should use the inline diff
                  preview.
                </div>
              </div>

              <div className="p-4">
                <ProsemarkMergeEditor
                  value={COMPARE_MARKDOWN_NEXT}
                  baseValue={COMPARE_MARKDOWN_BASE}
                  options={COMPARE_INLINE_OPTIONS}
                  editable={false}
                  className="text-sm leading-6"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
