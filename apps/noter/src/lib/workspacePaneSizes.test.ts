import { describe, expect, it } from "vitest";
import {
  clampWorkspaceMobileSidebarWidthPx,
  DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  MIN_WORKSPACE_DESKTOP_MAIN_PANE_WIDTH_PX,
  MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX,
  MIN_WORKSPACE_SIDEBAR_WIDTH_PX,
  resolveWorkspaceDesktopSidebarWidths,
} from "@/lib/workspacePaneSizes";

describe("resolveWorkspaceDesktopSidebarWidths", () => {
  it("keeps the preferred widths when the shell has enough room", () => {
    expect(
      resolveWorkspaceDesktopSidebarWidths({
        containerWidthPx:
          DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX * 2 +
          MIN_WORKSPACE_DESKTOP_MAIN_PANE_WIDTH_PX +
          48,
        leftOpen: true,
        leftWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        rightOpen: true,
        rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }),
    ).toEqual({
      leftWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    });
  });

  it("shrinks both open sidebars while preserving the desktop main-pane minimum", () => {
    expect(
      resolveWorkspaceDesktopSidebarWidths({
        containerWidthPx: 800,
        leftOpen: true,
        leftWidthPx: 320,
        rightOpen: true,
        rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }),
    ).toEqual({
      leftWidthPx: 256,
      rightWidthPx: 224,
    });
  });

  it("splits the remaining desktop space proportionally when both minima do not fit", () => {
    const resolvedWidths = resolveWorkspaceDesktopSidebarWidths({
      containerWidthPx: 600,
      leftOpen: true,
      leftWidthPx: 320,
      rightOpen: true,
      rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
    });

    expect(resolvedWidths.leftWidthPx + resolvedWidths.rightWidthPx).toBe(280);
    expect(resolvedWidths.leftWidthPx).toBeGreaterThan(
      resolvedWidths.rightWidthPx,
    );
  });

  it("clamps a single desktop sidebar to the remaining shell width", () => {
    expect(
      resolveWorkspaceDesktopSidebarWidths({
        containerWidthPx: 420,
        leftOpen: true,
        leftWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
        rightOpen: false,
        rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }),
    ).toEqual({
      leftWidthPx: 100,
      rightWidthPx: 0,
    });
  });
});

describe("clampWorkspaceMobileSidebarWidthPx", () => {
  it("keeps the mobile main-pane peek visible", () => {
    expect(clampWorkspaceMobileSidebarWidthPx(360, 390)).toBe(
      390 - MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX,
    );
  });

  it("respects the mobile minimum width when the viewport can fit it", () => {
    expect(clampWorkspaceMobileSidebarWidthPx(100, 430)).toBe(
      MIN_WORKSPACE_SIDEBAR_WIDTH_PX,
    );
  });
});
