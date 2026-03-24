export const FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES = [
  "file-view-default-draft",
  "file-view-create-draft",
  "file-view-open-pr",
] as const;

export type FileViewPushActionsVisualMode =
  (typeof FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES)[number];

export function isFileViewPushActionsVisualMode(
  value: string,
): value is FileViewPushActionsVisualMode {
  return FILE_VIEW_PUSH_ACTIONS_VISUAL_MODES.some((mode) => mode === value);
}
