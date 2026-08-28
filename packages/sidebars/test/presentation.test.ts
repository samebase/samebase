import { describe, expect, it } from "vite-plus/test";
import {
  getSidebarLayoutPresentation,
  type SidebarLayoutDisplayedMobileState,
} from "../src/SidebarLayoutPresentation.ts";
import type { SidebarLayoutLocalStoreState } from "../src/SidebarRuntimeInternal.tsx";
import type { SidebarRuntimeState } from "../src/SidebarRuntimeInternal.tsx";

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
} satisfies SidebarLayoutLocalStoreState;

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
} satisfies SidebarRuntimeState;

const displayedMergedRightState = {
  mobileMergeAvailableSides: { left: true, right: true },
  mobilePane: "right",
  mobileSurface: { kind: "merged", mainWidthPx: 260, side: "right" },
} satisfies SidebarLayoutDisplayedMobileState;

describe("sidebar layout presentation", () => {
  it("reports merge progress while a mobile pane is resized", () => {
    expect(
      getSidebarLayoutPresentation({
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
      leftDesktopOpen: true,
      mobileMergeProgress: { progress: 0.5, side: "right" },
      mobilePane: "right",
      mobilePaneScrollProgress: 0.25,
      rightDesktopOpen: true,
    });
  });

  it("omits drag merge progress when the displayed viewport cannot merge", () => {
    expect(
      getSidebarLayoutPresentation({
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
      getSidebarLayoutPresentation({
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
      getSidebarLayoutPresentation({
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
