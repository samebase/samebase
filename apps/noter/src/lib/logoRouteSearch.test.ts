import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
} from "@/components/logoIsometricRenderer";
import { DEFAULT_FACE_COLORS } from "@/components/logoTailwindColors";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
} from "@/components/logoVoxelState";
import {
  buildLogoRouteSearch,
  validateLogoRouteSearch,
} from "@/lib/logoRouteSearch";

describe("logoRouteSearch", () => {
  it("normalizes logo route search into typed values", () => {
    expect(
      validateLogoRouteSearch({
        axis: "screen-vertical",
        elev: "32.4",
        freeView: "",
        isoSide: "52",
        isoStyle: "flat",
        leftColor: "amber-500",
        rightColor: "emerald-500",
        rot: "721",
        topColor: "sky-500",
        vox: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      axis: "screen-vertical",
      elev: 32.4,
      freeView: true,
      isoSide: 40,
      isoStyle: "flat",
      leftColor: "amber-500",
      rightColor: "emerald-500",
      rot: 1,
      topColor: "sky-500",
      vox: DEFAULT_VOXEL_STATE,
    });
  });

  it("normalizes custom hex face colors into canonical route values", () => {
    expect(
      validateLogoRouteSearch({
        leftColor: "#ABC",
        rightColor: "#123456",
        topColor: " #fed ",
      }),
    ).toEqual({
      leftColor: "#aabbcc",
      rightColor: "#123456",
      topColor: "#ffeedd",
    });
  });

  it("preserves supported CSS face colors in route state", () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        faceColors: {
          left: "oklch(48.8% 0.243 264.376)",
          right: DEFAULT_FACE_COLORS.right,
          top: DEFAULT_FACE_COLORS.top,
        },
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      leftColor: "oklch(48.8% 0.243 264.376)",
    });
  });

  it("drops default logo state when building route search", () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        faceColors: DEFAULT_FACE_COLORS,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({});
  });

  it("drops malformed logo route search values instead of throwing", () => {
    expect(
      validateLogoRouteSearch({
        axis: "diagonal",
        elev: { nope: true },
        freeView: "false",
        isoSide: Number.NaN,
        isoStyle: "wireframe",
        leftColor: "   ",
        rightColor: 4,
        rot: "not-a-number",
        topColor: null,
        vox: "bad-voxel-state",
      }),
    ).toEqual({});
  });

  it("builds custom hex colors with canonical lowercase output", () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        faceColors: {
          left: "#ABC",
          right: "#123456",
          top: DEFAULT_FACE_COLORS.top,
        },
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      leftColor: "#aabbcc",
      rightColor: "#123456",
    });
  });
});
