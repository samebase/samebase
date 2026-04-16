export const FILE_VIEW_PUBLISHED_FILE_ACTIONS_VISUAL_MODES = [
  "file-view-published-file-unpublished",
  "file-view-published-file-published",
  "file-view-published-file-publishing",
] as const;

export type FileViewPublishedFileActionsVisualMode =
  (typeof FILE_VIEW_PUBLISHED_FILE_ACTIONS_VISUAL_MODES)[number];

export function isFileViewPublishedFileActionsVisualMode(
  value: string,
): value is FileViewPublishedFileActionsVisualMode {
  return FILE_VIEW_PUBLISHED_FILE_ACTIONS_VISUAL_MODES.some(
    (mode) => mode === value,
  );
}
