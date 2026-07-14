interface FileTreeTooltipTextArgs {
  hasContextMenuActions?: boolean;
  isCoarsePointer: boolean;
  isFolder: boolean;
  isDeletedFile: boolean;
  type: "tree" | "blob";
}

export function getFileTreeTooltipText(args: FileTreeTooltipTextArgs): string {
  if (args.hasContextMenuActions === false) {
    if (args.isFolder) {
      return args.isCoarsePointer ? "Tap to expand folder" : "Click to expand folder";
    }

    return args.isCoarsePointer ? "Tap to open" : "Click to open";
  }

  if (args.isFolder) {
    return args.isCoarsePointer ? "Long press for actions" : "Right-click for actions";
  }

  if (args.type === "blob" && args.isDeletedFile) {
    return args.isCoarsePointer
      ? "Tap to review deleted file, long press for actions"
      : "Click to review deleted file, right-click for actions";
  }

  if (args.type === "blob") {
    return args.isCoarsePointer ? "Long press for actions" : "Right-click for actions";
  }

  return "Click to open";
}

export function getRestoreDeletionLabel(isPending: boolean): string {
  return isPending ? "Reverting..." : "Revert deletion";
}
