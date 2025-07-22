import { useMemo, useState, useRef, useCallback } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FileIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

interface FileTreeItem {
  path: string;
  type: "tree" | "blob";
  size?: number;
}

interface TreeNode {
  name: string;
  path: string;
  type: "tree" | "blob";
  children?: TreeNode[];
  size?: number;
}

interface FolderExpansionState {
  folderPath: string;
  isExpanded: boolean;
}

interface FileTreeProps {
  items: FileTreeItem[];
  onFileSelect?: (path: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  selectedFile?: string;
  repositoryFullName: string;
  folderExpansionStates: FolderExpansionState[];
  onFolderToggle?: (folderPath: string, isExpanded: boolean) => void;
}

function buildTree(items: FileTreeItem[]): TreeNode[] {
  const root: TreeNode[] = [];
  const pathToNode = new Map<string, TreeNode>();

  // Sort items to process directories before files
  const sortedItems = [...items].sort((a, b) => {
    if (a.type === "tree" && b.type === "blob") return -1;
    if (a.type === "blob" && b.type === "tree") return 1;
    return a.path.localeCompare(b.path);
  });

  sortedItems.forEach((item) => {
    const parts = item.path.split("/");
    let currentPath = "";
    let currentParent = root;

    parts.forEach((part, index) => {
      currentPath = index === 0 ? part : `${currentPath}/${part}`;

      let existingNode = pathToNode.get(currentPath);

      if (!existingNode) {
        existingNode = {
          name: part,
          path: currentPath,
          type: index === parts.length - 1 ? item.type : "tree",
          children:
            index === parts.length - 1 && item.type === "blob" ? undefined : [],
          size: index === parts.length - 1 ? item.size : undefined,
        };

        pathToNode.set(currentPath, existingNode);
        currentParent.push(existingNode);

        // Sort the parent array
        currentParent.sort((a, b) => {
          if (a.type === "tree" && b.type === "blob") return -1;
          if (a.type === "blob" && b.type === "tree") return 1;
          return a.name.localeCompare(b.name);
        });
      }

      if (index < parts.length - 1) {
        currentParent = existingNode.children || [];
      }
    });
  });

  return root;
}

function TreeNodeComponent({
  node,
  level = 0,
  onFileSelect,
  onFileRename,
  onFileCreate,
  selectedFile,
  folderExpansionStates,
  onFolderToggle,
}: {
  node: TreeNode;
  level?: number;
  onFileSelect?: (path: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  selectedFile?: string;
  folderExpansionStates: FolderExpansionState[];
  onFolderToggle?: (folderPath: string, isExpanded: boolean) => void;
}) {
  // Get expansion state from database instead of auto-expanding
  const expansionState = folderExpansionStates.find(
    (state) => state.folderPath === node.path,
  );
  const isOpen = expansionState?.isExpanded ?? false; // Default to collapsed
  const isMobile = useIsMobile();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingValue, setRenamingValue] = useState(node.name);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // File creation states
  const [isFileCreationOpen, setIsFileCreationOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [isCreatingFile, setIsCreatingFile] = useState(false);

  // Long press detection for mobile
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [isLongPressing, setIsLongPressing] = useState(false);

  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedFile === node.path;
  const isFolder = node.type === "tree";

  const handleClick = () => {
    if (hasChildren) {
      const newIsOpen = !isOpen;
      onFolderToggle?.(node.path, newIsOpen);
    } else {
      onFileSelect?.(node.path);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  // Long press handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile || !isFolder) return;

      setIsLongPressing(false);
      longPressTimer.current = setTimeout(() => {
        setIsLongPressing(true);
        setIsFileCreationOpen(true);
        // Prevent normal click
        e.preventDefault();
      }, 500); // 500ms long press threshold
    },
    [isMobile, isFolder],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (isLongPressing) {
      setIsLongPressing(false);
    }
  }, [isLongPressing]);

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handleRename = () => {
    setIsRenaming(true);
    setRenamingValue(node.name);
    setContextMenu(null);
  };

  const handleCreateFile = () => {
    setIsFileCreationOpen(true);
    setContextMenu(null);
  };

  const handleRenameSubmit = () => {
    if (renamingValue.trim() && renamingValue !== node.name && onFileRename) {
      const pathParts = node.path.split("/");
      pathParts[pathParts.length - 1] = renamingValue.trim();
      const newPath = pathParts.join("/");
      onFileRename(node.path, newPath);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setIsRenaming(false);
      setRenamingValue(node.name);
    }
  };

  const handleFileCreateSubmit = () => {
    if (!newFileName.trim() || !onFileCreate) return;

    setIsCreatingFile(true);
    try {
      onFileCreate(node.path, newFileName.trim());
      setNewFileName("");
      setIsFileCreationOpen(false);
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
      setIsFileCreationOpen(false);
      setNewFileName("");
    }
  };

  // File creation dialog content
  const FileCreationDialog = () => (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">
          Create file in: {node.path || "/"}
        </label>
      </div>
      <Input
        placeholder="filename.md"
        value={newFileName}
        onChange={(e) => setNewFileName(e.target.value)}
        onKeyDown={handleFileCreateKeyDown}
        className="text-sm"
        autoFocus
      />
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsFileCreationOpen(false);
            setNewFileName("");
          }}
        >
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

  return (
    <>
      <div>
        <TooltipProvider>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-2 py-3 px-3 md:py-1 md:px-2 text-base md:text-sm cursor-pointer hover:bg-muted/30 rounded-none",
                  isSelected && "bg-muted/50",
                  "transition-colors",
                  "min-h-[44px] md:min-h-[auto]", // Touch-friendly height on mobile
                )}
                style={{ paddingLeft: `${level * 16 + 12}px` }}
                onClick={handleClick}
                onContextMenu={handleRightClick}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
              >
                {hasChildren ? (
                  isOpen ? (
                    <ChevronDownIcon className="h-4 w-4 md:h-3 md:w-3 text-muted-foreground flex-shrink-0" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4 md:h-3 md:w-3 text-muted-foreground flex-shrink-0" />
                  )
                ) : (
                  <div className="w-4 md:w-3" />
                )}

                {node.type === "tree" ? (
                  <div className="h-4 w-4 md:h-3 md:w-3 flex items-center justify-center">
                    <div className="h-3 w-3 md:h-2 md:w-2 bg-muted-foreground/30 rounded-sm" />
                  </div>
                ) : (
                  <FileIcon className="h-4 w-4 md:h-3 md:w-3 text-muted-foreground flex-shrink-0" />
                )}

                {isRenaming ? (
                  <input
                    type="text"
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={handleRenameKeyDown}
                    className="flex-1 bg-background border border-border rounded px-1 text-xs"
                    autoFocus
                  />
                ) : (
                  <span className="truncate text-muted-foreground text-sm md:text-xs">
                    {node.name}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {isFolder
                ? isMobile
                  ? "Long press to create file in this folder"
                  : "Right-click to create file in this folder"
                : node.type === "blob"
                  ? "Right-click to rename"
                  : "Click to open"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {hasChildren && isOpen && (
          <div>
            {node.children!.map((child) => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                level={level + 1}
                onFileSelect={onFileSelect}
                onFileRename={onFileRename}
                onFileCreate={onFileCreate}
                selectedFile={selectedFile}
                folderExpansionStates={folderExpansionStates}
                onFolderToggle={onFolderToggle}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setContextMenu(null)}
          />
          <div
            className="fixed z-20 bg-background border border-border rounded shadow-lg py-1 min-w-32"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {isFolder && (
              <button
                className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50 flex items-center gap-2"
                onClick={handleCreateFile}
              >
                <PlusIcon className="h-3 w-3" />
                Create File
              </button>
            )}
            {node.type === "blob" && (
              <button
                className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50"
                onClick={handleRename}
              >
                Rename
              </button>
            )}
          </div>
        </>
      )}

      {/* Mobile Sheet for File Creation */}
      {isMobile ? (
        <Sheet open={isFileCreationOpen} onOpenChange={setIsFileCreationOpen}>
          <SheetContent side="bottom" className="rounded-t-lg">
            <SheetHeader>
              <SheetTitle>Create New File</SheetTitle>
            </SheetHeader>
            <FileCreationDialog />
          </SheetContent>
        </Sheet>
      ) : (
        /* Desktop Dialog for File Creation */
        <Dialog open={isFileCreationOpen} onOpenChange={setIsFileCreationOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New File</DialogTitle>
            </DialogHeader>
            <FileCreationDialog />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function FileTree({
  items,
  onFileSelect,
  onFileRename,
  onFileCreate,
  selectedFile,
  folderExpansionStates,
  onFolderToggle,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(items), [items]);

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm md:text-xs text-muted-foreground">
        No files found
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          onFileSelect={onFileSelect}
          onFileRename={onFileRename}
          onFileCreate={onFileCreate}
          selectedFile={selectedFile}
          folderExpansionStates={folderExpansionStates}
          onFolderToggle={onFolderToggle}
        />
      ))}
    </div>
  );
}
