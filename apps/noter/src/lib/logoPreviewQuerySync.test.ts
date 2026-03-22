import { describe, expect, it } from "vitest";

import { shouldSyncLogoPreviewQueryState } from "./logoPreviewQuerySync";

describe("shouldSyncLogoPreviewQueryState", () => {
  it("returns true when the preview is idle", () => {
    expect(
      shouldSyncLogoPreviewQueryState({
        isAutoRotating: false,
        isSceneInteracting: false,
      }),
    ).toBe(true);
  });

  it("returns false while auto-rotation is running", () => {
    expect(
      shouldSyncLogoPreviewQueryState({
        isAutoRotating: true,
        isSceneInteracting: false,
      }),
    ).toBe(false);
  });

  it("returns false while the scene is being dragged", () => {
    expect(
      shouldSyncLogoPreviewQueryState({
        isAutoRotating: false,
        isSceneInteracting: true,
      }),
    ).toBe(false);
  });

  it("returns false when both auto-rotation and dragging are active", () => {
    expect(
      shouldSyncLogoPreviewQueryState({
        isAutoRotating: true,
        isSceneInteracting: true,
      }),
    ).toBe(false);
  });
});
