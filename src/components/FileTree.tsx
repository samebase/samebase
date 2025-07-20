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
  selectedFile,
}: {
  node: TreeNode;
  level?: number;
  onFileSelect?: (path: string) => void;
  selectedFile?: string;
}) {
  const [isOpen, setIsOpen] = useState(level < 2); // Auto-expand first 2 levels
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedFile === node.path;

  const handleClick = () => {
    if (hasChildren) {
      setIsOpen(!isOpen);
    } else {
      onFileSelect?.(node.path);
    }
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 text-sm cursor-pointer hover:bg-muted/30 rounded-none",
          isSelected && "bg-muted/50",
          "transition-colors",
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={handleClick}
      >
        {hasChildren ? (
          isOpen ? (
            <ChevronDownIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRightIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <div className="w-3" />
        )}

        {node.type === "tree" ? (
          <div className="h-3 w-3 flex items-center justify-center">
            <div className="h-2 w-2 bg-muted-foreground/30 rounded-sm" />
          </div>
        ) : (
          <FileIcon className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        )}

        <span className="truncate text-muted-foreground text-xs">
          {node.name}
        </span>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children!.map((child) => (
            <TreeNodeComponent
              key={child.path}
              node={child}
              level={level + 1}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ items, onFileSelect, selectedFile }: FileTreeProps) {
  const tree = useMemo(() => buildTree(items), [items]);

  if (items.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">No files found</div>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
        />
      ))}
    </div>
  );
}
