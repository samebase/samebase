import React, { useState, useEffect, useMemo, useRef } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FileIcon, ChevronRightIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { fuzzyMatch } from "@/lib/fuzzySearch.tsx";
import { type CommitReviewFileStatus } from "@/lib/commitReviewStatus";

interface FileItem {
  path: string;
  type: "tree" | "blob";
  size?: number;
  status?: CommitReviewFileStatus;
}

type FilteredFile = FileItem & {
  score: number;
  matches: number[];
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  files: FileItem[];
  onFileSelect: (path: string, status?: CommitReviewFileStatus) => void;
  selectedFile?: string;
}

// CommandPalette-specific highlighting with blue colors

function highlightMatches(text: string, matches: number[]): React.ReactNode {
  if (matches.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  matches.forEach((match, i) => {
    if (match > lastIndex) {
      parts.push(text.slice(lastIndex, match));
    }
    parts.push(
      <span
        key={i}
        className="bg-blue-200 text-blue-900 dark:bg-blue-700 dark:text-blue-100"
      >
        {text[match]}
      </span>,
    );
    lastIndex = match + 1;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}

export function CommandPalette({
  open,
  onOpenChange,
  files,
  onFileSelect,
  selectedFile,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter and sort files based on fuzzy search
  const filteredFiles = useMemo<FilteredFile[]>(() => {
    if (!query.trim()) {
      return files
        .filter((file) => file.type === "blob") // Only show files, not directories
        .slice(0, 50)
        .map((file) => ({ ...file, score: 0, matches: [] }));
    }

    return files
      .filter((file) => file.type === "blob")
      .map((file) => {
        const match = fuzzyMatch(query.trim(), file.path);
        return { ...file, ...match };
      })
      .filter((file) => file.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 50);
  }, [files, query]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredFiles]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
      setQuery("");
      setSelectedIndex(0);
    }
  }, [open]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!open) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) =>
            Math.min(prev + 1, filteredFiles.length - 1),
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => Math.max(prev - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onFileSelect(
              filteredFiles[selectedIndex].path,
              filteredFiles[selectedIndex].status,
            );
            onOpenChange(false);
          }
          break;
        case "Escape":
          onOpenChange(false);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, filteredFiles, selectedIndex, onFileSelect, onOpenChange]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && open) {
      const selectedElement = listRef.current.children[selectedIndex];
      if (selectedElement instanceof HTMLElement) {
        selectedElement.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, open]);

  const handleFileClick = (file: FilteredFile) => {
    onFileSelect(file.path, file.status);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="flex flex-col">
          {/* Search Input */}
          <div className="p-4 border-b">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search files..."
              className="text-lg border-none shadow-none focus-visible:ring-0 px-0"
            />
          </div>

          {/* Results */}
          <div ref={listRef} className="overflow-y-auto max-h-[400px]">
            {filteredFiles.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {query ? "No files found" : "Start typing to search files..."}
              </div>
            ) : (
              filteredFiles.map((file, index) => {
                const isSelected = index === selectedIndex;
                const isCurrentFile = selectedFile === file.path;
                const fileName = file.path.split("/").pop() || file.path;
                const filePath = file.path.includes("/")
                  ? file.path.substring(0, file.path.lastIndexOf("/"))
                  : "";

                return (
                  <div
                    key={file.path}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-border/30 last:border-b-0",
                      isSelected && "bg-accent",
                      isCurrentFile && "text-blue-600 dark:text-blue-400",
                    )}
                    onClick={() => handleFileClick(file)}
                  >
                    <FileIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {query
                          ? highlightMatches(
                              fileName,
                              file.matches
                                .filter(
                                  (m) => m >= file.path.lastIndexOf("/") + 1,
                                )
                                .map((m) => m - file.path.lastIndexOf("/") - 1),
                            )
                          : fileName}
                      </div>
                      {filePath && (
                        <div className="text-xs text-muted-foreground truncate">
                          {query
                            ? highlightMatches(
                                filePath,
                                file.matches.filter(
                                  (m) => m < file.path.lastIndexOf("/"),
                                ),
                              )
                            : filePath}
                        </div>
                      )}
                    </div>
                    <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
