import { type ComponentProps, type DragEventHandler } from "react";
import { FilePlusIcon, GitHubLogoIcon, PlusIcon } from "@/lib/radixIcons";
import { FileTree } from "@/components/FileTree";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { linkStyle } from "@/components/styles";
import type { EffectiveSidebarMode } from "./fileViewShared";

type FileTreeProps = ComponentProps<typeof FileTree>;
type CompareModeSummary = {
  ariaLabel: string;
  text: string;
};

type FileViewSidebarContentProps = Pick<
  FileTreeProps,
  | "items"
  | "onFileSelect"
  | "onFileRename"
  | "onFileCreate"
  | "onMediaUploadRequest"
  | "onFileDelete"
  | "onFileRestore"
  | "restoringFilePath"
  | "selectedFile"
  | "folderExpansionStates"
  | "onFolderToggle"
  | "autoExpandedPaths"
  | "forceAutoExpandedPaths"
> & {
  owner: string;
  repoName: string;
  effectiveSidebarMode: EffectiveSidebarMode;
  isCompareRequested: boolean;
  compareModeSummary: CompareModeSummary | null;
  emptyRepository: boolean;
  onOpenFileCreation: () => void;
  onOpenFolderCreation: () => void;
  onSidebarModeChange: (value: string) => void;
};

type FileViewSidebarFooterProps = {
  mediaUploadError: string | null;
  isMediaUploadDragOver: boolean;
  isUploadingMedia: boolean;
  onRequestMediaUpload: () => void;
  onMediaUploadDragOverChange: (isDragOver: boolean) => void;
  onMediaUploadDrop: DragEventHandler<HTMLButtonElement>;
};

export function FileViewSidebarContent({
  owner,
  repoName,
  effectiveSidebarMode,
  isCompareRequested,
  compareModeSummary,
  emptyRepository,
  onOpenFileCreation,
  onOpenFolderCreation,
  onSidebarModeChange,
  items,
  onFileSelect,
  onFileRename,
  onFileCreate,
  onMediaUploadRequest,
  onFileDelete,
  onFileRestore,
  restoringFilePath,
  selectedFile,
  folderExpansionStates,
  onFolderToggle,
  autoExpandedPaths,
  forceAutoExpandedPaths,
}: FileViewSidebarContentProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border/50 p-3">
        <div className="flex items-center gap-2">
          <GitHubLogoIcon className="h-3 w-3 text-muted-foreground" />
          <a
            className={`truncate text-xs font-medium text-muted-foreground ${linkStyle}`}
            href={`https://github.com/${owner}/${repoName}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {owner}/{repoName}
          </a>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:h-6 md:w-6"
            onClick={onOpenFileCreation}
            title="Create new file"
            aria-label="Create new file"
          >
            <PlusIcon className="h-4 w-4 md:h-3 md:w-3" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 md:h-6 md:w-6"
            onClick={onOpenFolderCreation}
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
            value={effectiveSidebarMode}
            className="justify-start"
            onValueChange={(value) => {
              if (value !== undefined) {
                onSidebarModeChange(value);
              }
            }}
          >
            <ToggleGroupItem
              value="simple"
              aria-label="Simple View"
              className="h-7 px-2 text-xs"
            >
              Simple View
            </ToggleGroupItem>
            <ToggleGroupItem
              value="all"
              aria-label="All Files"
              className="h-7 px-2 text-xs"
            >
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
          {isCompareRequested && compareModeSummary ? (
            <div
              aria-label={compareModeSummary.ariaLabel}
              aria-live="polite"
              className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground"
            >
              {compareModeSummary.text}
            </div>
          ) : null}
        </div>
      </div>

      {emptyRepository ? (
        <div className="min-h-0 flex-1" />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <FileTree
            items={items}
            onFileSelect={onFileSelect}
            onFileRename={onFileRename}
            onFileCreate={onFileCreate}
            onMediaUploadRequest={onMediaUploadRequest}
            onFileDelete={onFileDelete}
            onFileRestore={onFileRestore}
            restoringFilePath={restoringFilePath}
            selectedFile={selectedFile}
            folderExpansionStates={folderExpansionStates}
            onFolderToggle={onFolderToggle}
            autoExpandedPaths={autoExpandedPaths}
            forceAutoExpandedPaths={forceAutoExpandedPaths}
          />
        </div>
      )}
    </div>
  );
}

export function FileViewSidebarFooter({
  mediaUploadError,
  isMediaUploadDragOver,
  isUploadingMedia,
  onRequestMediaUpload,
  onMediaUploadDragOverChange,
  onMediaUploadDrop,
}: FileViewSidebarFooterProps) {
  return (
    <div className="border-t border-border/50 p-3">
      {mediaUploadError ? (
        <div
          role="alert"
          className="mb-2 corner-notch-1 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {mediaUploadError}
        </div>
      ) : null}
      <button
        type="button"
        className={`flex w-full items-center justify-center border-[3px] border-dashed px-3 py-4 text-sm transition-colors ${
          isMediaUploadDragOver
            ? "border-primary bg-primary/5 text-foreground"
            : "border-foreground/45 text-foreground/80 hover:border-foreground/65 hover:text-foreground"
        }`}
        onClick={onRequestMediaUpload}
        onDragOver={(event) => {
          event.preventDefault();
          onMediaUploadDragOverChange(true);
        }}
        onDragLeave={(event) => {
          const relatedTarget = event.relatedTarget;
          if (
            !(relatedTarget instanceof Node) ||
            !event.currentTarget.contains(relatedTarget)
          ) {
            onMediaUploadDragOverChange(false);
          }
        }}
        onDrop={(event) => {
          onMediaUploadDragOverChange(false);
          onMediaUploadDrop(event);
        }}
        disabled={isUploadingMedia}
      >
        {isUploadingMedia ? "Uploading..." : "Drop file or click"}
      </button>
    </div>
  );
}
