import { useState, useMemo, useRef, useEffect } from "react";
import { Input } from "@/components/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/sheet";
import {
  Dialog,
  DialogContent as DialogContentUI,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { fuzzyMatch, highlightMatches } from "@/lib/fuzzySearch.tsx";

interface FileTreeItem {
  path: string;
  type: "tree" | "blob";
  size?: number;
}

interface FilteredFolder extends FileTreeItem {
  score: number;
  matches: number[];
}

interface FileCreationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialFolderPath: string;
  onFileCreate: (folderPath: string, fileName: string) => void;
  folders: FileTreeItem[]; // All available folders for search
}

export function FileCreationDialog({
  isOpen,
  onClose,
  initialFolderPath,
  onFileCreate,
  folders,
}: FileCreationDialogProps) {
  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);
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
    console.log("useEffect add event listener");
    const handleClickOutside = (event: MouseEvent) => {
      console.log("handleClickOutside", event);
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        folderInputRef.current &&
        !folderInputRef.current.contains(event.target as Node)
      ) {
        console.log("handleClickOutside setShowFolderDropdown(false)");
        setShowFolderDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFileCreateSubmit = () => {
    if (!newFileName.trim()) return;

    setIsCreatingFile(true);
    try {
      onFileCreate(folderInputValue, newFileName.trim());
      setNewFileName("");
      onClose();
    } catch (error) {
      console.error("Failed to create file:", error);
    } finally {
      setIsCreatingFile(false);
    }
  };

  const handleFileCreateKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFileCreateSubmit();
    } else if (e.key === "Escape") {
      onClose();
      setNewFileName("");
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setFolderInputValue(value);
    setShowFolderDropdown(true);
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

  const handleCancel = () => {
    onClose();
    setNewFileName("");
    setShowFolderDropdown(false);
  };

  // Dialog content component
  const dialogContent = (
    <div className="space-y-4">
      {/* The Sheet component automatically focuses first element */}
      {/* https://github.com/shadcn-ui/ui/issues/2181 */}
      <span tabIndex={0}></span>

      {/* Folder Selection */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Folder</label>
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

      {/* File Name Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">File name</label>
        <Input
          placeholder="filename.md"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onKeyDown={handleFileCreateKeyDown}
          className="text-sm"
          autoFocus={!showFolderDropdown}
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={handleCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleFileCreateSubmit}
          disabled={!newFileName.trim() || isCreatingFile}
        >
          {isCreatingFile ? "Creating..." : "Create"}
        </Button>
      </div>
    </div>
  );
  // Reset state when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setNewFileName("");
      setIsCreatingFile(false);
      setShowFolderDropdown(false);
      setFolderInputValue(initialFolderPath); // Reset to initial path
      onClose();
    }
  };

  // Mobile Sheet for File Creation
  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-lg">
          <SheetHeader>
            <SheetTitle>Create New File</SheetTitle>
          </SheetHeader>
          {dialogContent}
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop Dialog for File Creation
  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContentUI className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create New File</DialogTitle>
        </DialogHeader>
        {dialogContent}
      </DialogContentUI>
    </Dialog>
  );
}
