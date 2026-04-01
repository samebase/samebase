import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FileIcon,
  PlusIcon,
  FilePlusIcon,
  TrashIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/tooltip";
import { useIsMobile } from "@/hooks/use-mobile";
import { useDialog } from "@/hooks/useDialog";
import {
  getCommitStatusTextClassName,
  type CommitReviewFileStatus,
} from "@/lib/commitReviewStatus";
import {
  buildEffectiveFolderExpansionStates,
  type FolderExpansionState,
} from "@/lib/fileTreeState";
import {
  getFileTreeTooltipText,
  getRestoreDeletionLabel,
} from "@/lib/fileTreeLabels";

interface FileTreeItem {
  path: string;
  originalPath: string;
  type: "tree" | "blob";
  size?: number;
  deleted?: boolean;
  status?: CommitReviewFileStatus;
}

interface TreeNode {
  name: string;
  path: string;
  originalPath: string;
  type: "tree" | "blob";
  children?: TreeNode[];
  size?: number;
  deleted?: boolean;
  status?: CommitReviewFileStatus;
}

interface FileTreeProps {
  items: FileTreeItem[];
  onFileSelect?: (path: string, status?: CommitReviewFileStatus) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  onMediaUploadRequest?: (folderPath: string) => void;
  onFileDelete?: (path: string, originalPath: string) => void;
  onFileRestore?: (path: string, originalPath: string) => void;
  restoringFilePath?: string | null;
  selectedFile?: string;
  folderExpansionStates: FolderExpansionState[];
  onFolderToggle?: (folderPath: string, isExpanded: boolean) => void;
  autoExpandedPaths?: string[];
  forceAutoExpandedPaths?: boolean;
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
    let path = "";
    let currentParent = root;

    parts.forEach((part, index) => {
      path = index === 0 ? part : `${path}/${part}`;

      let existingNode = pathToNode.get(path);

      if (!existingNode) {
        existingNode = {
          name: part,
          path,
          originalPath: item.originalPath,
          type: index === parts.length - 1 ? item.type : "tree",
          children:
            index === parts.length - 1 && item.type === "blob" ? undefined : [],
          size: index === parts.length - 1 ? item.size : undefined,
          deleted: index === parts.length - 1 ? item.deleted : undefined,
          status: index === parts.length - 1 ? item.status : undefined,
        };

        pathToNode.set(path, existingNode);
        currentParent.push(existingNode);

        // Sort the parent array
        currentParent.sort((a, b) => {
          if (a.type === "tree" && b.type === "blob") return -1;
          if (a.type === "blob" && b.type === "tree") return 1;
          return a.name.localeCompare(b.name);
        });
      }
      if (index === parts.length - 1) {
        existingNode.deleted = item.deleted;
        existingNode.status = item.status;
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
  onMediaUploadRequest,
  onFileDelete,
  onFileRestore,
  restoringFilePath,
  selectedFile,
  folderExpansionStates,
  onFolderToggle,
  autoExpandedPaths,
}: {
  node: TreeNode;
  level?: number;
  onFileSelect?: (path: string, status?: CommitReviewFileStatus) => void;
  onFileRename?: (originalPath: string, newPath: string) => void;
  onFileCreate?: (folderPath: string, fileName: string) => void;
  onMediaUploadRequest?: (folderPath: string) => void;
  onFileDelete?: (path: string, originalPath: string) => void;
  onFileRestore?: (path: string, originalPath: string) => void;
  restoringFilePath?: string | null;
  selectedFile?: string;
  folderExpansionStates: FolderExpansionState[];
  onFolderToggle?: (folderPath: string, isExpanded: boolean) => void;
  autoExpandedPaths: Set<string>;
}) {
  const { openFileCreation, openFolderCreation } = useDialog();

  const expansionState = folderExpansionStates.find(
    (state) => state.folderPath === node.path,
  );
  const isOpen = expansionState
    ? expansionState.isExpanded === true
    : autoExpandedPaths.has(node.path);
  const isMobile = useIsMobile();

  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingValue, setRenamingValue] = useState(node.name);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  // Long press detection for mobile
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const didTriggerLongPressRef = useRef(false);

  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedFile === node.path;
  const isFolder = node.type === "tree";
  const fileStatus = node.type === "blob" ? node.status : undefined;
  const isDeletedFile = fileStatus === "deleted" || node.deleted === true;
  const isRestorePending = restoringFilePath === node.path;
  const fileStatusClassName = fileStatus
    ? getCommitStatusTextClassName(fileStatus)
    : undefined;
  const openContextMenu = useCallback((x: number, y: number) => {
    setContextMenu({ x, y });
  }, []);

  const handleClick = () => {
    if (didTriggerLongPressRef.current) {
      didTriggerLongPressRef.current = false;
      return;
    }

    if (hasChildren) {
      const newIsOpen = !isOpen;
      onFolderToggle?.(node.path, newIsOpen);
    } else {
      onFileSelect?.(node.path, fileStatus);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY);
  };

  // Long press handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile) return;
      const touch = e.touches[0];

      didTriggerLongPressRef.current = false;
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      longPressTimer.current = setTimeout(() => {
        didTriggerLongPressRef.current = true;
        openContextMenu(touchX, touchY);
      }, 500); // 500ms long press threshold
    },
    [isMobile, openContextMenu],
  );

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

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
    openFileCreation(node.path);
    setContextMenu(null);
  };

  const handleCreateFolder = () => {
    openFolderCreation(node.path);
    setContextMenu(null);
  };

  const handleUploadImage = () => {
    onMediaUploadRequest?.(node.path);
    setContextMenu(null);
  };

  const handleRenameSubmit = () => {
    if (
      renamingValue.trim() &&
      renamingValue.trim() !== node.name &&
      onFileRename
    ) {
      const pathParts = node.path.split("/");
      pathParts[pathParts.length - 1] = renamingValue.trim();
      const newPath = pathParts.join("/");
      onFileRename(node.originalPath, newPath);
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

  return (
    <>
      <div>
        <TooltipProvider>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-2 py-3 px-3 md:py-1 md:px-2 text-base md:text-sm cursor-pointer hover:bg-muted/30 corner-notch-1",
                  isSelected &&
                    "bg-primary/15 hover:bg-primary/20 ring-1 ring-inset ring-primary/40",
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
                    <div className="h-3 w-3 md:h-2 md:w-2 bg-muted-foreground/30 corner-notch-1" />
                  </div>
                ) : (
                  <FileIcon
                    className={cn(
                      "h-4 w-4 md:h-3 md:w-3 text-muted-foreground flex-shrink-0",
                      fileStatusClassName,
                      !fileStatus && isSelected && "text-primary",
                    )}
                  />
                )}

                {isRenaming ? (
                  <input
                    type="text"
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={handleRenameKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="flex-1 bg-background border border-border corner-notch-1 px-1 text-xs"
                    autoFocus
                  />
                ) : (
                  <span
                    className={cn(
                      "truncate text-muted-foreground text-sm md:text-xs",
                      fileStatusClassName,
                      !fileStatus &&
                        isSelected &&
                        "text-foreground font-medium",
                      isSelected && "font-medium",
                      isDeletedFile && "line-through decoration-current",
                    )}
                  >
                    {node.name}
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {getFileTreeTooltipText({
                isFolder,
                isDeletedFile,
                isMobile,
                type: node.type,
              })}
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
                onMediaUploadRequest={onMediaUploadRequest}
                onFileDelete={onFileDelete}
                onFileRestore={onFileRestore}
                restoringFilePath={restoringFilePath}
                selectedFile={selectedFile}
                folderExpansionStates={folderExpansionStates}
                onFolderToggle={onFolderToggle}
                autoExpandedPaths={autoExpandedPaths}
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
            className="fixed z-20 bg-background border border-border corner-notch-1 shadow-lg py-1 min-w-32"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {isFolder && (
              <>
                <button
                  className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50 flex items-center gap-2"
                  onClick={handleCreateFile}
                >
                  <PlusIcon className="h-3 w-3" />
                  Create File
                </button>
                <button
                  className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50 flex items-center gap-2"
                  onClick={handleUploadImage}
                >
                  <PlusIcon className="h-3 w-3" />
                  Upload Image
                </button>
                <button
                  className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50 flex items-center gap-2"
                  onClick={handleCreateFolder}
                >
                  <FilePlusIcon className="h-3 w-3" />
                  Create Folder
                </button>
              </>
            )}
            {node.type === "blob" && !isDeletedFile && (
              <>
                <button
                  className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50"
                  onClick={handleRename}
                >
                  Rename
                </button>
                <button
                  className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50 text-destructive flex items-center gap-2"
                  onClick={() => {
                    onFileDelete?.(node.path, node.originalPath);
                    setContextMenu(null);
                  }}
                >
                  <TrashIcon className="h-3 w-3" />
                  Delete
                </button>
              </>
            )}
            {node.type === "blob" && isDeletedFile && (
              <button
                className="w-full px-3 py-2 text-xs text-left hover:bg-muted/50 flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isRestorePending}
                onClick={() => {
                  if (isRestorePending) {
                    return;
                  }
                  onFileRestore?.(node.path, node.originalPath);
                  setContextMenu(null);
                }}
              >
                <UpdateIcon className="h-3 w-3" />
                {getRestoreDeletionLabel(isRestorePending)}
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

export function FileTree({
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
  autoExpandedPaths = [],
  forceAutoExpandedPaths = false,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(items), [items]);
  const autoExpandedPathSet = useMemo(
    () => new Set(autoExpandedPaths),
    [autoExpandedPaths],
  );
  const [manualExpansionOverrides, setManualExpansionOverrides] = useState(
    () => new Map<string, boolean>(),
  );

  useEffect(() => {
    if (!forceAutoExpandedPaths) {
      setManualExpansionOverrides(new Map());
    }
  }, [forceAutoExpandedPaths]);

  const effectiveFolderExpansionStates = useMemo(() => {
    return buildEffectiveFolderExpansionStates({
      folderExpansionStates,
      autoExpandedPaths: autoExpandedPathSet,
      manualExpansionOverrides,
      forceAutoExpandedPaths,
    });
  }, [
    autoExpandedPathSet,
    folderExpansionStates,
    forceAutoExpandedPaths,
    manualExpansionOverrides,
  ]);

  const handleFolderToggleWithSessionOverride = useCallback(
    (folderPath: string, isExpanded: boolean) => {
      setManualExpansionOverrides((previous) => {
        const next = new Map(previous);
        next.set(folderPath, isExpanded);
        return next;
      });
      onFolderToggle?.(folderPath, isExpanded);
    },
    [onFolderToggle],
  );

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
          onMediaUploadRequest={onMediaUploadRequest}
          onFileDelete={onFileDelete}
          onFileRestore={onFileRestore}
          restoringFilePath={restoringFilePath}
          selectedFile={selectedFile}
          folderExpansionStates={effectiveFolderExpansionStates}
          onFolderToggle={handleFolderToggleWithSessionOverride}
          autoExpandedPaths={autoExpandedPathSet}
        />
      ))}
    </div>
  );
}
