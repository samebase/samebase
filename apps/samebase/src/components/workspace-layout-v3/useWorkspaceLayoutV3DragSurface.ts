export const WORKSPACE_LAYOUT_V3_DRAG_SURFACE_ATTRIBUTE = "data-workspace-layout-v3-drag-surface";

/**
 * Mark interactive surfaces that live inside the mobile workspace carousel.
 * Leave native touch arbitration to the browser so horizontal pane swipes can
 * start from inside editors without extra gesture policy fighting the shell.
 */
export function useWorkspaceLayoutV3DragSurface(enabled: boolean) {
  return {
    containerProps: enabled
      ? {
          [WORKSPACE_LAYOUT_V3_DRAG_SURFACE_ATTRIBUTE]: "true",
        }
      : {},
  };
}
