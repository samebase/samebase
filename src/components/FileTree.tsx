import { useMemo, useState } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FileIcon,
} from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";

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

interface FileTreeProps {
  items: FileTreeItem[];
  onFileSelect?: (path: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  selectedFile?: string;
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
  selectedFile,
}: {
  node: TreeNode;
  level?: number;
  onFileSelect?: (path: string) => void;
  onFileRename?: (oldPath: string, newPath: string) => void;
  selectedFile?: string;
}) {
  const [isOpen, setIsOpen] = useState(level < 2); // Auto-expand first 2 levels
  const [isRenaming, setIsRenaming] = useState(false);
  const [renamingValue, setRenamingValue] = useState(node.name);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedFile === node.path;

  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    } else {
      onFileSelect?.(node.path);
    }
  };

  const handleRightClick = (e: React.MouseEvent) => {
    if (node.type === "blob") {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    }
  };

  const handleRename = () => {
    setIsRenaming(true);
    setRenamingValue(node.name);
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

  return (
    <>
      <div>
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

        {hasChildren && isOpen && (
          <div>
            {node.children!.map((child) => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                level={level + 1}
                onFileSelect={onFileSelect}
                onFileRename={onFileRename}
                selectedFile={selectedFile}
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
            className="fixed z-20 bg-background border border-border rounded shadow-lg py-1 min-w-24"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              className="w-full px-3 py-1 text-xs text-left hover:bg-muted/50"
              onClick={handleRename}
            >
              Rename
            </button>
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
  selectedFile,
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
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
}
