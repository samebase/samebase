export const WORKSPACE_LAYOUT_V2_DRAG_SURFACE_ATTRIBUTE =
  "data-workspace-layout-v2-drag-surface";

/**
 * Mark a child surface as vertically scrollable but safe for the parent shell
 * to steal horizontal drags from. Editors and panes that truly own horizontal
 * scrolling simply omit this marker.
 */
export function useWorkspaceLayoutV2DragSurface(enabled: boolean) {
  return {
    containerProps: enabled
      ? {
          [WORKSPACE_LAYOUT_V2_DRAG_SURFACE_ATTRIBUTE]: "true",
        }
      : {},
    touchAction: enabled ? ("pan-y" as const) : undefined,
  };
}
