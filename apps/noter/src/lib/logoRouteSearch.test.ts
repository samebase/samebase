import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
} from "@/components/logo/logoIsometricRenderer";
import { DEFAULT_LOGO_THEME_COLORS } from "@/components/logo/logoTailwindColors";
import {
  DEFAULT_LOGO_DISTANCE_SCALE,
  LOGO_DISTANCE_SCALE_SLIDER_MAX,
} from "@/components/logo/logoDistanceScale";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
} from "@/components/logo/logoVoxelState";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  validateLogoRouteSearch,
} from "@/lib/logoRouteSearch";

describe("logoRouteSearch", () => {
  it("normalizes logo route search into typed values", () => {
    expect(
      validateLogoRouteSearch({
        axis: "screen-vertical",
        dev: "",
        depth: "99",
        dist: "1.25",
        elev: "32.4",
        freeView: "",
        isoSide: "52",
        isoStyle: "flat",
        base: "sky-500",
        border: "stone-300",
        dark: "",
        primary: "emerald-500",
        rot: "721",
        secondary: "amber-500",
        top: "white-base",
        vox: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      axis: "screen-vertical",
      background: "sky-500",
      border: "stone-300",
      dark: true,
      depth: 99,
      dev: true,
      dist: 1.25,
      elev: 32.4,
      freeView: true,
      isoSide: 40,
      isoStyle: "flat",
      primary: "emerald-500",
      rot: 1,
      secondary: "amber-500",
      top: "white-base",
      vox: DEFAULT_VOXEL_STATE,
    });
  });

  it("drops default logo state when building route search", () => {
    const search = buildLogoRouteSearch({
      distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
      isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
      rotationAxisMode: "cube-y",
      rotationDegrees: DEFAULT_ROTATION_DEGREES,
      themeColors: DEFAULT_LOGO_THEME_COLORS,
      viewSnapEnabled: true,
      voxelState: DEFAULT_VOXEL_STATE,
    });

    expect(search).toEqual({});
    expect("depth" in search).toBe(true);
    expect(search.depth).toBeUndefined();
    expect("dist" in search).toBe(true);
    expect(search.dist).toBeUndefined();
  });

  it("preserves canonical theme mode flags when building route search", () => {
    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        themeModeSearch: { light: true },
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({ light: true });

    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        themeModeSearch: { dark: true, light: true },
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({});
  });

  it("preserves the public dev flag across logo query-state sync", () => {
    expect(
      preserveLogoRouteDevModeSearch({ primary: "red-600" }, { dev: true }),
    ).toEqual({
      dev: true,
      primary: "red-600",
    });

    expect(preserveLogoRouteDevModeSearch({ primary: "red-600" }, {})).toEqual({
      primary: "red-600",
    });
  });

  it("drops malformed logo route search values instead of throwing", () => {
    expect(
      validateLogoRouteSearch({
        axis: "diagonal",
        depth: { nope: true },
        dist: "not-a-number",
        elev: { nope: true },
        freeView: "false",
        isoSide: Number.NaN,
        isoStyle: "wireframe",
        base: null,
        border: 2,
        primary: "not-a-color",
        rot: "not-a-number",
        secondary: 4,
        vox: "bad-voxel-state",
      }),
    ).toEqual({
      freeView: true,
    });
  });

  it("preserves non-default logo depth when building route search", () => {
    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: 6,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({ depth: 6 });
  });

  it("preserves distance values above the slider range", () => {
    expect(
      buildLogoRouteSearch({
        distanceScale: LOGO_DISTANCE_SCALE_SLIDER_MAX + 1,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      depth: undefined,
      dist: 3,
    });
  });
});
