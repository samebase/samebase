import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AppDialogContent } from "@/components/AppDialogContent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { fuzzyMatch, highlightMatches } from "@/lib/fuzzySearch.tsx";

type FolderItem = {
  path: string;
  type: "tree" | "blob";
  size?: number;
};

type FilteredFolder = {
  path: string;
  label: string;
  matches: number[];
  score: number;
};

function normalizeFolderPath(folderPath: string): string {
  const trimmed = folderPath.trim().replace(/^\/+|\/+$/g, "");
  return trimmed;
}

function buildTargetPath(folderPath: string, fileName: string): string {
  const normalizedFolderPath = normalizeFolderPath(folderPath);
  return normalizedFolderPath.length > 0 ? `${normalizedFolderPath}/${fileName}` : fileName;
}

export function MediaUploadDialog({
  isOpen,
  onClose,
  fileName,
  initialFolderPath,
  folders,
  existingFilePaths,
  isSubmitting = false,
  submitError,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  fileName: string;
  initialFolderPath: string;
  folders: FolderItem[];
  existingFilePaths: string[];
  isSubmitting?: boolean;
  submitError?: string | null;
  onSubmit: (args: { folderPath: string; replaceExisting: boolean; targetPath: string }) => void;
}) {
  const isMobile = useIsMobile();
  const locationInputId = useId();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [folderInputValue, setFolderInputValue] = useState(initialFolderPath);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [selectedFolderIndex, setSelectedFolderIndex] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFolderInputValue(initialFolderPath);
    setShowFolderDropdown(false);
    setSelectedFolderIndex(0);
  }, [initialFolderPath, isOpen]);

  useEffect(() => {
    if (isSubmitting) {
      setShowFolderDropdown(false);
    }
  }, [isSubmitting]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!(event.target instanceof Node)) {
        return;
      }

      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        folderInputRef.current &&
        !folderInputRef.current.contains(event.target)
      ) {
        setShowFolderDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const folderChoices = useMemo(() => {
    return [
      { path: "", label: "/", matches: [], score: 0 },
      ...folders
        .filter((folder) => folder.type === "tree")
        .map((folder) => ({
          path: folder.path,
          label: folder.path,
          matches: [],
          score: 0,
        })),
    ];
  }, [folders]);

  const filteredFolders = useMemo(() => {
    const query = folderInputValue.trim();
    if (!query || !showFolderDropdown) {
      return folderChoices.slice(0, 20);
    }

    return folderChoices
      .map((folder) => {
        const match = fuzzyMatch(query, folder.label);
        const filteredFolder: FilteredFolder = { ...folder, ...match };
        return filteredFolder;
      })
      .filter((folder) => folder.score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 20);
  }, [folderChoices, folderInputValue, showFolderDropdown]);

  useEffect(() => {
    setSelectedFolderIndex(0);
  }, [filteredFolders]);

  const targetPath = buildTargetPath(folderInputValue, fileName);
  const replaceExisting = existingFilePaths.includes(targetPath);

  const handleFolderInputFocus = () => {
    setShowFolderDropdown(true);
  };

  const handleFolderInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFolderInputValue(event.target.value);
    setShowFolderDropdown(true);
  };

  const handleFolderSelect = (folderPath: string) => {
    if (isSubmitting) {
      return;
    }
    setFolderInputValue(folderPath);
    setShowFolderDropdown(false);
  };

  const handleFolderKeyDown = (event: React.KeyboardEvent) => {
    if (isSubmitting) {
      event.preventDefault();
      return;
    }

    if (!showFolderDropdown) {
      if (event.key === "Enter") {
        event.preventDefault();
        onSubmit({
          folderPath: normalizeFolderPath(folderInputValue),
          replaceExisting,
          targetPath,
        });
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setSelectedFolderIndex((current) => Math.min(current + 1, filteredFolders.length - 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setSelectedFolderIndex((current) => Math.max(current - 1, 0));
        break;
      case "Enter":
        event.preventDefault();
        if (filteredFolders[selectedFolderIndex]) {
          handleFolderSelect(filteredFolders[selectedFolderIndex].path);
        }
        break;
      case "Escape":
        setShowFolderDropdown(false);
        break;
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && !isSubmitting) {
      onClose();
    }
  };

  const dialogContent = (
    <div className="space-y-4" data-testid="media-upload-dialog-form">
      <div className="space-y-2">
        <label className="text-sm font-medium">File</label>
        <div className="corner-notch-1 border px-3 py-2 text-sm text-muted-foreground">
          {fileName}
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor={locationInputId} className="text-sm font-medium">
          Location
        </label>
        <div className="relative">
          <Input
            id={locationInputId}
            ref={folderInputRef}
            placeholder="/"
            value={folderInputValue}
            onChange={handleFolderInputChange}
            onFocus={handleFolderInputFocus}
            onKeyDown={handleFolderKeyDown}
            className="text-base"
            disabled={isSubmitting}
            autoFocus
          />
          {showFolderDropdown ? (
            <div
              ref={dropdownRef}
              className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto corner-notch-1 border bg-popover text-popover-foreground shadow-md"
            >
              {filteredFolders.map((folder, index) => (
                <div
                  key={`${folder.path || "/"}`}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    index === selectedFolderIndex && "bg-accent text-accent-foreground",
                  )}
                  onClick={() => handleFolderSelect(folder.path)}
                >
                  {folderInputValue.trim()
                    ? highlightMatches(folder.label, folder.matches)
                    : folder.label}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Target path</label>
        <div className="corner-notch-1 border px-3 py-2 font-mono text-xs text-muted-foreground">
          {targetPath}
        </div>
      </div>

      {replaceExisting ? (
        <div className="corner-notch-1 border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          This replaces the existing file at `{targetPath}`.
        </div>
      ) : null}

      {submitError ? (
        <div className="corner-notch-1 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {submitError}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() =>
            onSubmit({
              folderPath: normalizeFolderPath(folderInputValue),
              replaceExisting,
              targetPath,
            })
          }
          disabled={isSubmitting}
        >
          {isSubmitting ? "Uploading..." : replaceExisting ? "Replace" : "Upload"}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" data-testid="media-upload-dialog-content">
          <SheetHeader>
            <SheetTitle>Upload Image</SheetTitle>
          </SheetHeader>
          {dialogContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <AppDialogContent data-testid="media-upload-dialog-content">
        <DialogHeader>
          <DialogTitle>Upload Image</DialogTitle>
        </DialogHeader>
        {dialogContent}
      </AppDialogContent>
    </Dialog>
  );
}
