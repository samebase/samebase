interface FileTreeTooltipTextArgs {
  isFolder: boolean;
  isDeletedFile: boolean;
  isMobile: boolean;
  type: "tree" | "blob";
}

export function getFileTreeTooltipText(args: FileTreeTooltipTextArgs): string {
  if (args.isFolder) {
    return args.isMobile ? "Long press for actions" : "Right-click for actions";
  }

  if (args.type === "blob" && args.isDeletedFile) {
    return args.isMobile
      ? "Tap to review deleted file, long press for actions"
      : "Click to review deleted file, right-click for actions";
  }

  if (args.type === "blob") {
    return args.isMobile ? "Long press for actions" : "Right-click for actions";
  }

  return "Click to open";
}

export function getRestoreDeletionLabel(isPending: boolean): string {
  return isPending ? "Reverting..." : "Revert deletion";
}
