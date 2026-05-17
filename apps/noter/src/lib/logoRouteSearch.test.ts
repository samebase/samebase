import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
} from "#src/components/logoIsometricRenderer.ts";
import { DEFAULT_LOGO_THEME_COLORS } from "#src/components/logoTailwindColors.ts";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
} from "#src/components/logoVoxelState.ts";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  validateLogoRouteSearch,
} from "#src/lib/logoRouteSearch.ts";

describe("logoRouteSearch", () => {
  it("normalizes logo route search into typed values", () => {
    expect(
      validateLogoRouteSearch({
        axis: "screen-vertical",
        dev: "",
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
      dev: true,
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
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({});
  });

  it("preserves canonical theme mode flags when building route search", () => {
    expect(
      buildLogoRouteSearch({
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
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
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
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
});
