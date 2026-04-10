import { describe, expect, it } from "vitest";
import {
  clampWorkspaceMobileSidebarWidthPx,
  DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
  MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
  MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_RATIO,
  MIN_WORKSPACE_DESKTOP_MAIN_PANE_WIDTH_PX,
  MIN_WORKSPACE_MOBILE_MAIN_PEEK_WIDTH_PX,
  MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
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
      leftWidthPx: 265,
      rightWidthPx: 215,
    });
  });

  it("caps a single desktop sidebar at 70% of the shell width", () => {
    expect(
      resolveWorkspaceDesktopSidebarWidths({
        containerWidthPx: 1200,
        leftOpen: true,
        leftWidthPx: 950,
        rightOpen: false,
        rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }),
    ).toEqual({
      leftWidthPx: 1200 * MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_RATIO,
      rightWidthPx: 0,
    });
  });

  it("caps a single desktop sidebar at 1000px on very wide shells", () => {
    expect(
      resolveWorkspaceDesktopSidebarWidths({
        containerWidthPx: 2200,
        leftOpen: true,
        leftWidthPx: 1400,
        rightOpen: false,
        rightWidthPx: DEFAULT_WORKSPACE_SIDEBAR_WIDTH_PX,
      }),
    ).toEqual({
      leftWidthPx: MAX_WORKSPACE_DESKTOP_SIDEBAR_WIDTH_PX,
      rightWidthPx: 0,
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

  it("preserves constrained desktop width preferences below the minimum", () => {
    expect(
      resolveWorkspaceDesktopSidebarWidths({
        containerWidthPx: 450,
        leftOpen: true,
        leftWidthPx: 100,
        rightOpen: true,
        rightWidthPx: 30,
      }),
    ).toEqual({
      leftWidthPx: 100,
      rightWidthPx: 30,
    });
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
    expect(clampWorkspaceMobileSidebarWidthPx(20, 430)).toBe(
      MIN_WORKSPACE_MOBILE_SIDEBAR_WIDTH_PX,
    );
  });
});
