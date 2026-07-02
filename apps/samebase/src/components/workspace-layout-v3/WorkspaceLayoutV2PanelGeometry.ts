import { clampNumber } from "@/lib/clampNumber";

export const WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX = 3 * 16;
export const WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX = 18 * 16;
const WORKSPACE_LAYOUT_V2_PANEL_MOBILE_DEFAULT_HEIGHT_RATIO = 0.35;

export function getWorkspaceLayoutV2PanelMaxHeightPx(viewportHeightPx: number) {
  if (viewportHeightPx <= 0) {
    return WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX;
  }

  return Math.max(WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX, Math.floor(viewportHeightPx));
}

export function clampWorkspaceLayoutV2PanelHeight(args: {
  heightPx: number;
  viewportHeightPx: number;
}) {
  return clampNumber(
    Math.round(args.heightPx),
    WORKSPACE_LAYOUT_V2_PANEL_MIN_HEIGHT_PX,
    getWorkspaceLayoutV2PanelMaxHeightPx(args.viewportHeightPx),
  );
}

export function getDefaultWorkspaceLayoutV2PanelHeight(args: {
  isMobile: boolean;
  viewportHeightPx: number;
}) {
  if (args.viewportHeightPx <= 0) {
    return WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX;
  }

  const preferredHeight = args.isMobile
    ? Math.floor(args.viewportHeightPx * WORKSPACE_LAYOUT_V2_PANEL_MOBILE_DEFAULT_HEIGHT_RATIO)
    : WORKSPACE_LAYOUT_V2_PANEL_DEFAULT_HEIGHT_PX;

  return clampWorkspaceLayoutV2PanelHeight({
    heightPx: preferredHeight,
    viewportHeightPx: args.viewportHeightPx,
  });
}
