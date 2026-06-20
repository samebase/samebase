import { GitHubLogoIcon } from "@/lib/radixIcons";
import { Button } from "@/components/ui/button";
import { ChangedFilesLoadingState } from "@/components/ChangedFilesLoadingState";
import { FileTree } from "@/components/FileTree";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getReviewSplitDiffHighlights } from "@/lib/reviewSplitDiff";

export type FileViewCompareVisualMode = "file-view-compare-sidebar" | "file-view-compare-loading";

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
    path: "src/lib/reviewDiffControls.ts",
    originalPath: "src/lib/reviewDiffControls.ts",
    type: "blob" as const,
    status: "added" as const,
    deleted: false,
  },
] as const;

const COMPARE_TEXT_BASE = "";

const COMPARE_TEXT_NEXT = `export function shouldClearCompareOnReviewExit(args: {
  isCompareRequested: boolean;
  hasComparedSelection: boolean;
  hasComparedEditorTarget: boolean;
  hasStagedSelection: boolean;
}): boolean {
  return (
    args.isCompareRequested &&
    args.hasComparedSelection &&
    args.hasComparedEditorTarget &&
    !args.hasStagedSelection
  );
}
`;

// The fixture keeps restore visible so deleted compare rows exercise the same
// affordance as the live sidebar without introducing fixture-only behavior.
const NOOP_ON_FILE_RESTORE = () => {};

export function FileViewCompareVisualFixture({ mode }: { mode: FileViewCompareVisualMode }) {
  const isLoadingMode = mode === "file-view-compare-loading";
  const splitDiffHighlights = getReviewSplitDiffHighlights(COMPARE_TEXT_BASE, COMPARE_TEXT_NEXT);

  return (
    <div
      data-testid="file-view-compare-visual-fixture"
      data-mode={mode}
      className="min-h-screen bg-slate-100 p-8 text-slate-900"
    >
      <div className="mx-auto max-w-5xl corner-notch-1 border border-slate-300 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <GitHubLogoIcon className="h-3 w-3" />
          samebase/samebase
        </div>

        <div className="mt-3">
          <Button size="sm" variant="secondary" className="h-6 px-2 text-xs">
            Back to Editor
          </Button>
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
            {isLoadingMode ? "Loading compare..." : "PR #335 vs main"}
          </div>
        </div>

        <div className="mt-5 corner-notch-1 border border-slate-200">
          <div className="grid min-h-[640px] grid-cols-[280px_minmax(0,1fr)]">
            <div className="border-r border-slate-200">
              {isLoadingMode ? null : (
                <FileTree
                  items={[...COMPARED_TREE_ITEMS]}
                  selectedFile="src/lib/reviewDiffControls.ts"
                  restoringFilePath={null}
                  folderExpansionStates={[]}
                  autoExpandedPaths={["docs", "src", "src/components", "src/lib"]}
                  forceAutoExpandedPaths={true}
                  onFileRestore={NOOP_ON_FILE_RESTORE}
                />
              )}
            </div>

            <div className="min-w-0 bg-white">
              {isLoadingMode ? (
                <ChangedFilesLoadingState
                  elapsedLabel="00:04.8"
                  className="min-h-[640px] p-6"
                  dataTestId="file-view-compare-loading-state"
                />
              ) : (
                <>
                  <div className="border-b border-slate-200 px-4 py-3">
                    <div className="text-sm font-medium text-slate-900">
                      src/lib/reviewDiffControls.ts
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Compare-only added PR files should keep the same diff controls as staged
                      review files.
                    </div>
                  </div>

                  <div className="border-b border-slate-200 px-4 py-3">
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      <div className="flex items-center gap-2">
                        <Checkbox id="fixture-compare-show-patch" checked={false} disabled />
                        <Label
                          htmlFor="fixture-compare-show-patch"
                          className="text-xs font-medium text-slate-500"
                        >
                          Show patch
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="fixture-compare-inline-diffs" checked={false} disabled />
                        <Label
                          htmlFor="fixture-compare-inline-diffs"
                          className="text-xs font-medium text-slate-500"
                        >
                          Inline diffs
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="fixture-compare-side-by-side" checked={true} disabled />
                        <Label
                          htmlFor="fixture-compare-side-by-side"
                          className="text-xs font-medium text-slate-500"
                        >
                          Side by side
                        </Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Checkbox id="fixture-compare-syntax-deleted" checked={true} disabled />
                        <Label
                          htmlFor="fixture-compare-syntax-deleted"
                          className="text-xs font-medium text-slate-500"
                        >
                          Syntax deleted
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="min-w-0 corner-notch-1 border bg-white p-3">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-rose-700">
                          Before
                        </div>
                        <ProsemarkReadOnly
                          value={COMPARE_TEXT_BASE}
                          filePath="src/lib/reviewDiffControls.ts"
                          highlightedLineNumbers={splitDiffHighlights.oldLines}
                          lineHighlightTone="remove"
                          className="text-sm leading-6"
                        />
                      </div>
                      <div className="min-w-0 corner-notch-1 border bg-white p-3">
                        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                          After
                        </div>
                        <ProsemarkReadOnly
                          value={COMPARE_TEXT_NEXT}
                          filePath="src/lib/reviewDiffControls.ts"
                          highlightedLineNumbers={splitDiffHighlights.newLines}
                          lineHighlightTone="add"
                          className="text-sm leading-6"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
