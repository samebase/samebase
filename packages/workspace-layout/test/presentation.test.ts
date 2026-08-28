import { describe, expect, it } from "vite-plus/test";
import {
  getWorkspaceLayoutPresentation,
  type WorkspaceLayoutDisplayedMobileState,
} from "../src/WorkspaceLayoutPresentation.ts";
import type { WorkspaceLayoutV2LocalStoreState } from "../src/WorkspacePaneRuntime.tsx";
import type { WorkspacePaneState } from "../src/WorkspacePaneRuntime.tsx";

const localState = {
  activeResizeSide: null,
  mobile: {
    grip: { kind: "idle" },
    isPaneSettled: true,
    paneScrollProgress: 0.25,
  },
  viewportSize: {
    heightPx: 844,
    widthPx: 390,
  },
} satisfies WorkspaceLayoutV2LocalStoreState;

const paneState = {
  isMobile: true,
  leftDesktopOpen: true,
  leftDesktopWidthPx: 280,
  leftMobileWidthPx: 200,
  mobilePane: "right",
  mobileSurface: { kind: "unmerged" },
  rightDesktopOpen: true,
  rightDesktopWidthPx: 280,
  rightMobileWidthPx: 170,
} satisfies WorkspacePaneState;

const displayedMergedRightState = {
  mobileMergeAvailableSides: { left: true, right: true },
  mobilePane: "right",
  mobileSurface: { kind: "merged", mainWidthPx: 260, side: "right" },
} satisfies WorkspaceLayoutDisplayedMobileState;

describe("workspace layout presentation", () => {
  it("reports merge progress while a mobile pane is resized", () => {
    expect(
      getWorkspaceLayoutPresentation({
        displayedMobileState: {
          ...displayedMergedRightState,
          mobileSurface: { kind: "unmerged" },
        },
        localState: {
          ...localState,
          mobile: {
            ...localState.mobile,
            grip: {
              kind: "dragging",
              mergeTargetSide: "right",
              previewSurface: displayedMergedRightState.mobileSurface,
              shouldSettleMergedOnEnd: false,
              side: "right",
              slideOffsetPx: 0,
              startSideWidthPx: 200,
            },
          },
        },
        paneState,
      }),
    ).toEqual({
      isMobile: true,
      mobileMergeProgress: { progress: 0.5, side: "right" },
      mobilePane: "right",
      mobilePaneScrollProgress: 0.25,
    });
  });

  it("omits drag merge progress when the displayed viewport cannot merge", () => {
    expect(
      getWorkspaceLayoutPresentation({
        displayedMobileState: {
          mobileMergeAvailableSides: { left: false, right: false },
          mobilePane: "right",
          mobileSurface: { kind: "unmerged" },
        },
        localState: {
          ...localState,
          mobile: {
            ...localState.mobile,
            grip: {
              kind: "dragging",
              mergeTargetSide: "right",
              previewSurface: { kind: "unmerged" },
              shouldSettleMergedOnEnd: false,
              side: "right",
              slideOffsetPx: 0,
              startSideWidthPx: 200,
            },
          },
        },
        paneState,
      }).mobileMergeProgress,
    ).toBeNull();
  });

  it("reports a completed merge after the grip settles", () => {
    expect(
      getWorkspaceLayoutPresentation({
        displayedMobileState: displayedMergedRightState,
        localState,
        paneState: {
          ...paneState,
          mobileSurface: { kind: "merged", mainWidthPx: 260, side: "right" },
          rightMobileWidthPx: 130,
        },
      }).mobileMergeProgress,
    ).toEqual({ progress: 1, side: "right" });
  });

  it("does not expose mobile merge progress on desktop", () => {
    expect(
      getWorkspaceLayoutPresentation({
        displayedMobileState: displayedMergedRightState,
        localState,
        paneState: {
          ...paneState,
          isMobile: false,
          mobileSurface: { kind: "merged", mainWidthPx: 260, side: "right" },
        },
      }).mobileMergeProgress,
    ).toBeNull();
  });
});
