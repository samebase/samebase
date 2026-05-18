import { describe, expect, it } from "vite-plus/test";

import { createLogoRasterProjection } from "@/components/logo/logoRasterProjection";

describe("createLogoRasterProjection", () => {
  it("keeps raster scale stable across yaw and elevation", () => {
    const baseProjection = createLogoRasterProjection({
      elevationDegrees: 0,
      frustumPadding: 1,
      rotationAxisMode: "cube-y",
      rotationDegrees: 0,
      sizePx: 600,
    });
    const yawProjection = createLogoRasterProjection({
      elevationDegrees: 0,
      frustumPadding: 1,
      rotationAxisMode: "cube-y",
      rotationDegrees: 45,
      sizePx: 600,
    });
    const elevatedProjection = createLogoRasterProjection({
      elevationDegrees: 35.26438968,
      frustumPadding: 1,
      rotationAxisMode: "cube-y",
      rotationDegrees: 45,
      sizePx: 600,
    });

    expect(yawProjection.scalePx).toBeCloseTo(baseProjection.scalePx);
    expect(elevatedProjection.scalePx).toBeCloseTo(baseProjection.scalePx);
  });

  it("scales raster fit from the bounding cube radius", () => {
    const projection = createLogoRasterProjection({
      elevationDegrees: 22,
      frustumPadding: 1,
      rotationAxisMode: "cube-y",
      rotationDegrees: 45,
      sizePx: 600,
      worldHalfSize: 2 / 3,
    });

    expect(projection.scalePx).toBeCloseTo(600 / ((4 / 3) * Math.sqrt(3)));
  });
});
