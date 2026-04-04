export const WORKSPACE_LAYOUT_V2_DRAG_SURFACE_ATTRIBUTE =
  "data-workspace-layout-v2-drag-surface";

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
