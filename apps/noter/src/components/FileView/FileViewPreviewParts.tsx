import { Checkbox } from "@/components/checkbox";
import { Label } from "@/components/label";
import { ProsemarkReadOnly } from "@/components/ProsemarkReadOnly";
import type { CommitPreviewFile } from "./fileViewShared";
import { getPatchLineClassName } from "./fileViewShared";

type FileViewInlinePreviewControlsProps = {
  controlsIdPrefix: string;
  patchAvailable: boolean;
  showPatch: boolean;
  allowInlineDiffs: boolean;
  showSideBySide: boolean;
  syntaxHighlightDeletions: boolean;
  onShowPatchChange: (nextValue: boolean) => void;
  onAllowInlineDiffsChange: (nextValue: boolean) => void;
  onSideBySideChange: (nextValue: boolean) => void;
  onSyntaxHighlightDeletionsChange: (nextValue: boolean) => void;
};

type FileViewSplitPreviewProps = {
  beforeValue: string;
  afterValue: string;
  beforeFilePath: string;
  afterFilePath: string;
  oldHighlightedLineNumbers: number[];
  newHighlightedLineNumbers: number[];
};

function renderFileViewPatchLines(patch: string) {
  return patch.split("\n").map((line, index) => (
    <div
      key={`${index}:${line}`}
      className={`whitespace-pre-wrap corner-notch-1 px-1 ${getPatchLineClassName(line)}`}
    >
      {line.length > 0 ? line : " "}
    </div>
  ));
}

export function FileViewPatchText({ patch }: { patch: string }) {
  return (
    <div className="p-3 font-mono text-xs leading-5">
      {renderFileViewPatchLines(patch)}
    </div>
  );
}

export function FileViewPatchPreview({
  file,
}: {
  file: Pick<CommitPreviewFile, "patch" | "patchTruncated">;
}) {
  return (
    <div>
      {file.patchTruncated ? (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Patch output is truncated for this file.
        </div>
      ) : null}
      <FileViewPatchText patch={file.patch ?? ""} />
    </div>
  );
}

export function FileViewInlinePreviewControls({
  controlsIdPrefix,
  patchAvailable,
  showPatch,
  allowInlineDiffs,
  showSideBySide,
  syntaxHighlightDeletions,
  onShowPatchChange,
  onAllowInlineDiffsChange,
  onSideBySideChange,
  onSyntaxHighlightDeletionsChange,
}: FileViewInlinePreviewControlsProps) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2">
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${controlsIdPrefix}-show-patch`}
          checked={showPatch}
          disabled={!patchAvailable}
          onCheckedChange={(checked) => {
            onShowPatchChange(checked === true);
          }}
        />
        <Label
          htmlFor={`${controlsIdPrefix}-show-patch`}
          className="text-xs font-medium text-muted-foreground"
        >
          Show patch
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${controlsIdPrefix}-allow-inline-diffs`}
          checked={allowInlineDiffs}
          onCheckedChange={(checked) => {
            onAllowInlineDiffsChange(checked === true);
          }}
        />
        <Label
          htmlFor={`${controlsIdPrefix}-allow-inline-diffs`}
          className="text-xs font-medium text-muted-foreground"
        >
          Inline diffs
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${controlsIdPrefix}-side-by-side`}
          checked={showSideBySide}
          onCheckedChange={(checked) => {
            onSideBySideChange(checked === true);
          }}
        />
        <Label
          htmlFor={`${controlsIdPrefix}-side-by-side`}
          className="text-xs font-medium text-muted-foreground"
        >
          Side by side
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${controlsIdPrefix}-syntax-deletions`}
          checked={syntaxHighlightDeletions}
          onCheckedChange={(checked) => {
            onSyntaxHighlightDeletionsChange(checked === true);
          }}
        />
        <Label
          htmlFor={`${controlsIdPrefix}-syntax-deletions`}
          className="text-xs font-medium text-muted-foreground"
        >
          Syntax deleted
        </Label>
      </div>
    </div>
  );
}

export function FileViewSplitPreview({
  beforeValue,
  afterValue,
  beforeFilePath,
  afterFilePath,
  oldHighlightedLineNumbers,
  newHighlightedLineNumbers,
}: FileViewSplitPreviewProps) {
  return (
    <div className="grid gap-3 p-3 md:grid-cols-2">
      <div className="min-w-0 corner-notch-1 border bg-background p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-rose-700 dark:text-rose-300">
          Before
        </div>
        <ProsemarkReadOnly
          value={beforeValue}
          filePath={beforeFilePath}
          highlightedLineNumbers={oldHighlightedLineNumbers}
          lineHighlightTone="remove"
          mobilePaneDragEnabled
          className="text-sm leading-6"
        />
      </div>
      <div className="min-w-0 corner-notch-1 border bg-background p-3">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
          After
        </div>
        <ProsemarkReadOnly
          value={afterValue}
          filePath={afterFilePath}
          highlightedLineNumbers={newHighlightedLineNumbers}
          lineHighlightTone="add"
          mobilePaneDragEnabled
          className="text-sm leading-6"
        />
      </div>
    </div>
  );
}
