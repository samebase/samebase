import { useMemo, useState, useRef, useCallback } from 'react'
import {
  ChevronRightIcon,
  ChevronDownIcon,
  FileIcon,
  PlusIcon,
  FilePlusIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/use-mobile'
import { useDialog } from '@/hooks/useDialog'

interface FileTreeItem {
  path: string
  originalPath: string
  type: 'tree' | 'blob'
  size?: number
}

interface TreeNode {
  name: string
  path: string
  originalPath: string
  type: 'tree' | 'blob'
  children?: TreeNode[]
  size?: number
}

interface FolderExpansionState {
  folderPath: string
  isExpanded: boolean
}

interface FileTreeProps {
  items: FileTreeItem[]
  onFileSelect?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  onFileCreate?: (folderPath: string, fileName: string) => void
  onFileDelete?: (path: string) => void
  selectedFile?: string
  folderExpansionStates: FolderExpansionState[]
  onFolderToggle?: (folderPath: string, isExpanded: boolean) => void
}

function buildTree(items: FileTreeItem[]): TreeNode[] {
  const root: TreeNode[] = []
  const pathToNode = new Map<string, TreeNode>()

  // Sort items to process directories before files
  const sortedItems = [...items].sort((a, b) => {
    if (a.type === 'tree' && b.type === 'blob') return -1
    if (a.type === 'blob' && b.type === 'tree') return 1
    return a.path.localeCompare(b.path)
  })

  sortedItems.forEach(item => {
    const parts = item.path.split('/')
    let path = ''
    let currentParent = root

    parts.forEach((part, index) => {
      path = index === 0 ? part : `${path}/${part}`

      let existingNode = pathToNode.get(path)

      if (!existingNode) {
        existingNode = {
          name: part,
          path,
          originalPath: item.originalPath,
          type: index === parts.length - 1 ? item.type : 'tree',
          children: index === parts.length - 1 && item.type === 'blob' ? undefined : [],
          size: index === parts.length - 1 ? item.size : undefined,
        }

        pathToNode.set(path, existingNode)
        currentParent.push(existingNode)

        // Sort the parent array
        currentParent.sort((a, b) => {
          if (a.type === 'tree' && b.type === 'blob') return -1
          if (a.type === 'blob' && b.type === 'tree') return 1
          return a.name.localeCompare(b.name)
        })
      }

      if (index < parts.length - 1) {
        currentParent = existingNode.children || []
      }
    })
  })

  return root
}

function TreeNodeComponent({
  node,
  level = 0,
  onFileSelect,
  onFileRename,
  onFileCreate,
  onFileDelete,
  selectedFile,
  folderExpansionStates,
  onFolderToggle,
  allItems,
}: {
  node: TreeNode
  level?: number
  onFileSelect?: (path: string) => void
  onFileRename?: (originalPath: string, newPath: string) => void
  onFileCreate?: (folderPath: string, fileName: string) => void
  onFileDelete?: (path: string) => void
  selectedFile?: string
  folderExpansionStates: FolderExpansionState[]
  onFolderToggle?: (folderPath: string, isExpanded: boolean) => void
  allItems: FileTreeItem[]
}) {
  const { openFileCreation, openFolderCreation } = useDialog()

  // Get expansion state from database instead of auto-expanding
  const expansionState = folderExpansionStates.find(state => state.folderPath === node.path)
  const isOpen = expansionState?.isExpanded ?? false // Default to collapsed
  const isMobile = useIsMobile()

  const [isRenaming, setIsRenaming] = useState(false)
  const [renamingValue, setRenamingValue] = useState(node.name)
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
  } | null>(null)

  // Long press detection for mobile
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const [isLongPressing, setIsLongPressing] = useState(false)

  const hasChildren = node.children && node.children.length > 0
  const isSelected = selectedFile === node.path
  const isFolder = node.type === 'tree'

  const handleClick = () => {
    if (hasChildren) {
      const newIsOpen = !isOpen
      onFolderToggle?.(node.path, newIsOpen)
    } else {
      onFileSelect?.(node.path)
    }
  }

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }

  // Long press handlers for mobile
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!isMobile || !isFolder) return

      setIsLongPressing(false)
      longPressTimer.current = setTimeout(() => {
        setIsLongPressing(true)

        openFileCreation(node.path)
        // Prevent normal click
        e.preventDefault()
      }, 500) // 500ms long press threshold
    },
    [isMobile, isFolder, openFileCreation, node.path],
  )

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
    if (isLongPressing) {
      setIsLongPressing(false)
    }
  }, [isLongPressing])

  const handleTouchMove = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleRename = () => {
    setIsRenaming(true)
    setRenamingValue(node.name)
    setContextMenu(null)
  }

  const handleCreateFile = () => {
    openFileCreation(node.path)
    setContextMenu(null)
  }

  const handleCreateFolder = () => {
    openFolderCreation(node.path)
    setContextMenu(null)
  }

  const handleRenameSubmit = () => {
    if (renamingValue.trim() && renamingValue.trim() !== node.name && onFileRename) {
      const pathParts = node.path.split('/')
      pathParts[pathParts.length - 1] = renamingValue.trim()
      const newPath = pathParts.join('/')
      onFileRename(node.originalPath, newPath)
    }
    setIsRenaming(false)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
      setRenamingValue(node.name)
    }
  }

  return (
    <>
      <div>
        <TooltipProvider>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-2 py-3 px-3 md:py-1 md:px-2 text-base md:text-sm cursor-pointer hover:bg-muted/30 rounded-none',
                  isSelected && 'bg-muted/50',
                  'transition-colors',
                  'min-h-[44px] md:min-h-[auto]', // Touch-friendly height on mobile
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

                {node.type === 'tree' ? (
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
                    onChange={e => setRenamingValue(e.target.value)}
                    onBlur={handleRenameSubmit}
                    onKeyDown={handleRenameKeyDown}
                    onClick={e => e.stopPropagation()}
                    onMouseDown={e => e.stopPropagation()}
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
                  ? 'Long press to create file in this folder'
                  : 'Right-click to create file in this folder'
                : node.type === 'blob'
                  ? 'Right-click to rename'
                  : 'Click to open'}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {hasChildren && isOpen && (
          <div>
            {node.children!.map(child => (
              <TreeNodeComponent
                key={child.path}
                node={child}
                level={level + 1}
                onFileSelect={onFileSelect}
                onFileRename={onFileRename}
                onFileCreate={onFileCreate}
                onFileDelete={onFileDelete}
                selectedFile={selectedFile}
                folderExpansionStates={folderExpansionStates}
                onFolderToggle={onFolderToggle}
                allItems={allItems}
              />
            ))}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-20 bg-background border border-border rounded shadow-lg py-1 min-w-32"
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
                  onClick={handleCreateFolder}
                >
                  <FilePlusIcon className="h-3 w-3" />
                  Create Folder
                </button>
              </>
            )}
            {node.type === 'blob' && (
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
                    onFileDelete?.(node.path)
                    setContextMenu(null)
                  }}
                >
                  <TrashIcon className="h-3 w-3" />
                  Delete
                </button>
              </>
            )}
          </div>
        </>
      )}
    </>
  )
}

export function FileTree({
  items,
  onFileSelect,
  onFileRename,
  onFileCreate,
  onFileDelete,
  selectedFile,
  folderExpansionStates,
  onFolderToggle,
}: FileTreeProps) {
  const tree = useMemo(() => buildTree(items), [items])

  if (items.length === 0) {
    return <div className="p-4 text-sm md:text-xs text-muted-foreground">No files found</div>
  }

  return (
    <div className="py-1">
      {tree.map(node => (
        <TreeNodeComponent
          key={node.path}
          node={node}
          onFileSelect={onFileSelect}
          onFileRename={onFileRename}
          onFileCreate={onFileCreate}
          onFileDelete={onFileDelete}
          selectedFile={selectedFile}
          folderExpansionStates={folderExpansionStates}
          onFolderToggle={onFolderToggle}
          allItems={items}
        />
      ))}
    </div>
  )
}
