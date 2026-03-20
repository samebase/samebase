import { describe, expect, it } from "vitest";

import {
  LOGO_THREE_SVG_VIEWBOX_SIZE,
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_COORDINATES,
} from "@/components/logoStaticSvgContract";
import {
  collectLogoProjectedLatticePoints,
  collectLogoProjectedVoxelCornerPoints,
  getLogoProjectedLatticeBasis,
  getLogoProjectedPointKey,
  type LogoProjectedPoint,
} from "@/components/logoThreeSvgRenderer";
import { createFilledVoxelSet } from "@/components/logoVoxelState";

const filledVoxels = createFilledVoxelSet(STATIC_LOGO_VOXEL_COORDINATES);

function getPointLength(point: LogoProjectedPoint) {
  return Math.hypot(point.x, point.y);
}

function getAngleBetween(left: LogoProjectedPoint, right: LogoProjectedPoint) {
  const leftLength = getPointLength(left);
  const rightLength = getPointLength(right);
  if (leftLength === 0 || rightLength === 0) {
    return 0;
  }

  const cosine =
    (left.x * right.x + left.y * right.y) / (leftLength * rightLength);
  return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
}

describe("logoProjectedDotPattern", () => {
  it("includes every projected cube corner in the rendered lattice", () => {
    const views = [
      {
        elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
        rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
      },
      {
        elevationDegrees: 20,
        rotationDegrees: 30,
      },
      {
        elevationDegrees: 35,
        rotationDegrees: 75,
      },
      {
        elevationDegrees: 50,
        rotationDegrees: 135,
      },
      {
        elevationDegrees: 65,
        rotationDegrees: 210,
      },
      {
        elevationDegrees: 25,
        rotationDegrees: 315,
      },
    ] as const;

    for (const view of views) {
      const latticeKeys = new Set(
        collectLogoProjectedLatticePoints({
          elevationDegrees: view.elevationDegrees,
          filledVoxels,
          rotationDegrees: view.rotationDegrees,
          viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
        }).map((point) => getLogoProjectedPointKey(point)),
      );
      const missingCornerKeys = collectLogoProjectedVoxelCornerPoints({
        elevationDegrees: view.elevationDegrees,
        filledVoxels,
        rotationDegrees: view.rotationDegrees,
        viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
      })
        .map((point) => getLogoProjectedPointKey(point))
        .filter((pointKey) => !latticeKeys.has(pointKey));

      expect(
        missingCornerKeys,
        `view rotation=${view.rotationDegrees} elevation=${view.elevationDegrees}`,
      ).toEqual([]);
    }
  });

  it("keeps the default landing view on an isometric equilateral lattice", () => {
    const basis = getLogoProjectedLatticeBasis({
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      filledVoxels,
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
      viewBoxSize: LOGO_THREE_SVG_VIEWBOX_SIZE,
    });

    expect(basis).not.toBeNull();
    if (!basis) {
      return;
    }

    const xLength = getPointLength(basis.xEdge);
    const yLength = getPointLength(basis.yEdge);
    const zLength = getPointLength(basis.zEdge);
    const xyAngle = getAngleBetween(basis.xEdge, basis.yEdge);
    const yzAngle = getAngleBetween(basis.yEdge, basis.zEdge);
    const zxAngle = getAngleBetween(basis.zEdge, basis.xEdge);

    expect(Math.abs(xLength - yLength)).toBeLessThan(0.000001);
    expect(Math.abs(yLength - zLength)).toBeLessThan(0.000001);
    expect(Math.abs(xyAngle - 120)).toBeLessThan(0.00001);
    expect(Math.abs(yzAngle - 120)).toBeLessThan(0.00001);
    expect(Math.abs(zxAngle - 120)).toBeLessThan(0.00001);
  });
});
