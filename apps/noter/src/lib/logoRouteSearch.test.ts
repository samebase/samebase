import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
} from "@/components/logoIsometricRenderer";
import { DEFAULT_APP_THEME_COLORS } from "@/components/logoTailwindColors";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
} from "@/components/logoVoxelState";
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
        depth: "2",
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
        vox: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      axis: "screen-vertical",
      base: "sky-500",
      border: "stone-300",
      dark: true,
      depth: 2,
      dev: true,
      elev: 32.4,
      freeView: true,
      isoSide: 40,
      isoStyle: "flat",
      primary: "emerald-500",
      rot: 1,
      secondary: "amber-500",
      vox: DEFAULT_VOXEL_STATE,
    });
  });

  it("drops default logo state when building route search", () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_APP_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({});
  });

  it("preserves canonical theme mode flags when building route search", () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_APP_THEME_COLORS,
        themeModeSearch: { light: true },
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({ light: true });

    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_APP_THEME_COLORS,
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
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: 2,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_APP_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({ depth: 2 });
  });
});
