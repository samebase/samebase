import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "#src/components/input.tsx";
import { Button } from "#src/components/ui/button.tsx";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "#src/components/sheet.tsx";
import {
  Dialog,
  DialogContent as DialogContentUI,
  DialogHeader,
  DialogTitle,
} from "#src/components/dialog.tsx";
import { useIsMobile } from "#src/hooks/use-mobile.tsx";
import { cn } from "#src/lib/utils.ts";
import { fuzzyMatch, highlightMatches } from "#src/lib/fuzzySearch.tsx";

interface FileTreeItem {
  path: string;
  type: "tree" | "blob";
  size?: number;
}

interface FilteredFolder extends FileTreeItem {
  score: number;
  matches: number[];
}

interface FolderCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFolderPath: string;
  onFolderCreate: (folderPath: string, folderName: string) => void;
  folders: FileTreeItem[]; // All available folders for search
}

export function FolderCreationDialog({
  isOpen,
  onClose,
  initialFolderPath,
  onFolderCreate,
  folders,
}: FolderCreationDialogProps) {
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [folderInputValue, setFolderInputValue] = useState(initialFolderPath);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [selectedFolderIndex, setSelectedFolderIndex] = useState(0);

  const isMobile = useIsMobile();
  const folderInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter and sort folders based on fuzzy search
  const filteredFolders = useMemo(() => {
    const query = folderInputValue.trim();
    if (!query || !showFolderDropdown) {
      return folders
        .filter((folder) => folder.type === "tree")
        .slice(0, 20)
        .map((folder) => ({ ...folder, score: 0, matches: [] }));
    }

    const results = folders
      .filter((folder) => folder.type === "tree")
      .map((folder) => {
        const match = fuzzyMatch(query, folder.path);
        return { ...folder, ...match } as FilteredFolder;
      })
      .filter((folder) => folder.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    return results;
  }, [folders, folderInputValue, showFolderDropdown]);

  // Reset selection when dropdown results change
  useEffect(() => {
    setSelectedFolderIndex(0);
  }, [filteredFolders]);

  // Handle clicking outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        folderInputRef.current &&
        !folderInputRef.current.contains(event.target as Node)
      ) {
        setShowFolderDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFolderCreateSubmit = () => {
    if (!newFolderName.trim()) return;

    setIsCreatingFolder(true);
    try {
      onFolderCreate(folderInputValue, newFolderName.trim());
      setNewFolderName("");
      onClose();
    } catch (error) {
      console.error("Failed to create folder:", error);
    } finally {
      setIsCreatingFolder(false);
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFolderInputValue(value);
    // setShowFolderDropdown(true);
  };

  const handleFolderInputFocus = () => {
    setShowFolderDropdown(true);
  };

  const handleFolderKeyDown = (e: React.KeyboardEvent) => {
    if (!showFolderDropdown) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedFolderIndex((prev) =>
          Math.min(prev + 1, filteredFolders.length - 1),
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedFolderIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredFolders[selectedFolderIndex]) {
          const selectedPath = filteredFolders[selectedFolderIndex].path;
          setFolderInputValue(selectedPath);
          setShowFolderDropdown(false);
        }
        break;
      case "Escape":
        setShowFolderDropdown(false);
        break;
    }
  };

  const handleFolderSelect = (folderPath: string) => {
    setFolderInputValue(folderPath);
    setShowFolderDropdown(false);
  };

  const handleFolderCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFolderCreateSubmit();
    } else if (e.key === "Escape") {
      onClose();
      setNewFolderName("");
    }
  };

  const handleCancel = () => {
    onClose();
    setNewFolderName("");
    setShowFolderDropdown(false);
    setFolderInputValue(initialFolderPath); // Reset to initial path
  };

  // Reset state when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNewFolderName("");
      setIsCreatingFolder(false);
      setShowFolderDropdown(false);
      setFolderInputValue(initialFolderPath); // Reset to initial path
      onClose();
    }
  };

  const dialogContent = (
    <div className="space-y-4">
      {/* The Sheet component automatically focuses first element */}
      {/* https://github.com/shadcn-ui/ui/issues/2181 */}
      <span tabIndex={0}></span>

      {/* Folder Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Location</label>
        <div className="relative">
          <Input
            ref={folderInputRef}
            placeholder="/"
            value={folderInputValue}
            onChange={handleFolderInputChange}
            onFocus={handleFolderInputFocus}
            onKeyDown={handleFolderKeyDown}
            className="text-sm"
          />

          {/* Dropdown */}
          {showFolderDropdown && (
            <div
              ref={dropdownRef}
              className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto corner-notch-1 border bg-popover text-popover-foreground shadow-md"
            >
              {filteredFolders.map((folder, index) => (
                <div
                  key={folder.path}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                    index === selectedFolderIndex &&
                      "bg-accent text-accent-foreground",
                  )}
                  onClick={() => handleFolderSelect(folder.path)}
                >
                  {folderInputValue.trim()
                    ? highlightMatches(folder.path, folder.matches)
                    : folder.path}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Folder Name Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Folder name</label>
        <Input
          placeholder="new-folder"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={handleFolderCreateKeyDown}
          className="text-sm"
          autoFocus
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleFolderCreateSubmit}
          disabled={!newFolderName.trim() || isCreatingFolder}
        >
          {isCreatingFolder ? "Creating..." : "Create Folder"}
        </Button>
      </div>
    </div>
  );

  // Mobile Sheet for Folder Creation
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Create New Folder</SheetTitle>
          </SheetHeader>
          {dialogContent}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop Dialog for Folder Creation
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContentUI className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Folder</DialogTitle>
        </DialogHeader>
        {dialogContent}
      </DialogContentUI>
    </Dialog>
  );
}
