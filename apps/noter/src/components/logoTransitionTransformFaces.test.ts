import { describe, expect, it } from "vitest";

import {
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
import {
  createLogoTransitionTransformFaces,
  TRANSFORM_LAB_VIEW_BOX,
} from "@/components/logoTransitionTransformFaces";
import { createLogoThreeProjectedQuads } from "@/components/logoThreeSvgRenderer";
import { createFilledVoxelSet } from "@/components/logoVoxelState";

describe("logoTransitionTransformFaces", () => {
  it("reuses the static svg renderer projection baseline", () => {
    const filledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);
    const projectedQuads = createLogoThreeProjectedQuads({
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      faceColors: DEFAULT_FACE_COLORS,
      filledVoxels,
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
      viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
    });
    const transformFaces = createLogoTransitionTransformFaces();

    expect(transformFaces).toHaveLength(projectedQuads.length);
    expect(TRANSFORM_LAB_VIEW_BOX).toEqual({
      minX: 0,
      minY: 0,
      width: LOGO_THREE_SVG_VIEWBOX_SIZE,
      height: LOGO_THREE_SVG_VIEWBOX_SIZE,
    });
    expect(
      transformFaces.map((face) => ({
        color: face.color,
        colorKey: face.colorKey,
        corners: face.corners,
        key: face.key,
        strokeWidth: face.strokeWidth,
      })),
    ).toEqual(
      projectedQuads.map((quad) => ({
        color: quad.color,
        colorKey: quad.colorKey,
        corners: quad.points,
        key: quad.key,
        strokeWidth: quad.strokeWidth,
      })),
    );
  });
});
