import { describe, expect, it } from "vite-plus/test";
import { resolveLogoSceneCameraDepthBounds } from "@/components/logoSceneCameraDepth";

describe("resolveLogoSceneCameraDepthBounds", () => {
  it("keeps recursive logo depth inside the orthographic clipping range", () => {
    const cameraFitRadius = 24;
    const bounds = resolveLogoSceneCameraDepthBounds(cameraFitRadius);

    expect(bounds.distance - cameraFitRadius).toBeGreaterThan(0.1);
    expect(bounds.far - bounds.distance).toBeGreaterThan(cameraFitRadius);
  });

  it("keeps the original depth-one camera range for small logos", () => {
    expect(resolveLogoSceneCameraDepthBounds(3)).toEqual({
      distance: 11,
      far: 100,
    });
  });
});
