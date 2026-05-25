import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
} from "@/components/logo/logoIsometricRenderer";
import { getLogoRendererFractalDepthHardMax } from "@/components/logo/logoDepthLimits";
import { DEFAULT_LOGO_THEME_COLORS } from "@/components/logo/logoTailwindColors";
import {
  DEFAULT_LOGO_DISTANCE_SCALE,
  LOGO_DISTANCE_SCALE_SLIDER_MAX,
} from "@/components/logo/logoDistanceScale";
import {
  DEFAULT_LOGO_LEFT_FACE_STYLE,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP_LINKED,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
  DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH,
} from "@/components/logo/logoLeftFaceStyle";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  createDefaultVoxelState,
} from "@/components/logo/logoVoxelState";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  validateLogoRouteSearch,
  validateLogoRouteSearchForRenderer,
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
        background: "sky-500",
        border: "stone-300",
        dark: "",
        leftFace: "striped",
        primary: "emerald-500",
        rot: "721",
        secondary: "amber-500",
        stripeA: "30",
        stripeBasis: "horizontal",
        stripeG: "0.24",
        stripeO: "0.5",
        stripeW: "0.12",
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
      leftFace: "striped",
      primary: "emerald-500",
      rot: 1,
      secondary: "amber-500",
      stripeA: 30,
      stripeBasis: "horizontal",
      stripeG: 0.24,
      stripeO: 0.5,
      stripeW: 0.12,
      top: "white-base",
      vox: DEFAULT_VOXEL_STATE,
    });
  });

  it("drops default logo state when building route search", () => {
    const search = buildLogoRouteSearch({
      distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      gridSize: DEFAULT_LOGO_GRID_SIZE,
      isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
      isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
      leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
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
    expect("leftFace" in search).toBe(true);
    expect(search.leftFace).toBeUndefined();
  });

  it("preserves canonical theme mode flags when building route search", () => {
    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
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
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
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
    expect(preserveLogoRouteDevModeSearch({ primary: "red-600" }, { dev: true })).toEqual({
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
        leftFace: "dots",
        background: null,
        border: 2,
        primary: "not-a-color",
        rot: "not-a-number",
        secondary: 4,
        stripeA: "not-a-number",
        stripeBasis: "diagonal",
        stripeG: {},
        stripeO: null,
        stripeW: Number.NaN,
        vox: "bad-voxel-state",
      }),
    ).toEqual({
      freeView: true,
    });
  });

  it("keeps grid size and voxel state as one coherent route shape", () => {
    const grid2VoxelState = createDefaultVoxelState(LOGO_GRID_SIZE_2);
    const grid3VoxelState = createDefaultVoxelState(LOGO_GRID_SIZE_3);

    expect(DEFAULT_LOGO_GRID_SIZE).toBe(LOGO_GRID_SIZE_3);
    expect(validateLogoRouteSearch({ vox: grid3VoxelState })).toEqual({
      vox: grid3VoxelState,
    });

    expect(validateLogoRouteSearch({ vox: grid2VoxelState })).toEqual({
      gridSize: LOGO_GRID_SIZE_2,
      vox: grid2VoxelState,
    });

    expect(validateLogoRouteSearch({ gridSize: "2", vox: grid3VoxelState })).toEqual({
      gridSize: LOGO_GRID_SIZE_2,
    });

    const builtSearch = buildLogoRouteSearch({
      distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      gridSize: LOGO_GRID_SIZE_2,
      isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
      isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
      leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
      rotationAxisMode: "cube-y",
      rotationDegrees: DEFAULT_ROTATION_DEGREES,
      themeColors: DEFAULT_LOGO_THEME_COLORS,
      viewSnapEnabled: true,
      voxelState: grid2VoxelState,
    });

    expect(builtSearch.gridSize).toBe(LOGO_GRID_SIZE_2);
    expect(builtSearch.vox).toBeUndefined();
  });

  it("preserves non-default logo depth when building route search", () => {
    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: 6,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({ depth: 6 });
  });

  it("caps logo depth at renderer recovery limits", () => {
    expect(validateLogoRouteSearchForRenderer("svg")({ depth: "99" })).toEqual({
      depth: getLogoRendererFractalDepthHardMax("svg"),
    });
    expect(validateLogoRouteSearchForRenderer("three")({ depth: "99" })).toEqual({
      depth: getLogoRendererFractalDepthHardMax("three"),
    });
    expect(validateLogoRouteSearchForRenderer("raster")({ depth: "99" })).toEqual({
      depth: getLogoRendererFractalDepthHardMax("raster"),
    });
    expect(validateLogoRouteSearchForRenderer("iso")({ depth: "99" })).toEqual({
      depth: getLogoRendererFractalDepthHardMax("iso"),
    });
  });

  it("preserves distance values above the slider range", () => {
    expect(
      buildLogoRouteSearch({
        distanceScale: LOGO_DISTANCE_SCALE_SLIDER_MAX + 1,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      depth: undefined,
      dist: 3,
      leftFace: undefined,
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeO: undefined,
      stripeW: undefined,
    });
  });

  it("preserves striped left-face route state", () => {
    const defaultStripedSearch = validateLogoRouteSearch({
      leftFace: "striped",
      stripeA: "-45",
      stripeBasis: "vertical",
      stripeG: "0.25",
      stripeW: "0.25",
    });

    expect(defaultStripedSearch).toEqual({});
    expect(defaultStripedSearch.leftFace).toBeUndefined();

    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: {
          kind: "striped",
          stripeAngleDegrees: DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
          stripeBasis: DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS,
          stripeGap: DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP,
          stripeGapLinked: DEFAULT_LOGO_LEFT_FACE_STRIPE_GAP_LINKED,
          stripeOffset: DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
          stripeWidth: DEFAULT_LOGO_LEFT_FACE_STRIPE_WIDTH,
        },
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      depth: undefined,
      dist: undefined,
      leftFace: undefined,
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeO: undefined,
      stripeW: undefined,
    });

    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: {
          kind: "striped",
          stripeAngleDegrees: 22.125,
          stripeBasis: "horizontal",
          stripeGap: 0.32,
          stripeGapLinked: false,
          stripeOffset: 0.4,
          stripeWidth: 0.11,
        },
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      depth: undefined,
      dist: undefined,
      leftFace: "striped",
      stripeA: 22.125,
      stripeBasis: "horizontal",
      stripeG: 0.32,
      stripeO: 0.4,
      stripeW: 0.11,
    });
  });

  it("preserves secondary as the explicit duotone route state", () => {
    expect(validateLogoRouteSearch({ leftFace: "secondary" })).toEqual({
      leftFace: "secondary",
    });

    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: { kind: "secondary" },
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      depth: undefined,
      dist: undefined,
      leftFace: "secondary",
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeLink: undefined,
      stripeO: undefined,
      stripeW: undefined,
    });
  });

  it("does not create left-face tombstones while parsing unrelated logo params", () => {
    const search = validateLogoRouteSearch({ secondary: "amber-500" });

    expect(search.secondary).toBe("amber-500");
    expect(Object.prototype.hasOwnProperty.call(search, "leftFace")).toBe(false);
  });

  it("preserves linked striped left-face route state", () => {
    expect(
      validateLogoRouteSearch({
        leftFace: "striped",
        stripeG: "0",
        stripeW: "0",
      }),
    ).toEqual({
      leftFace: "striped",
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: 0,
      stripeLink: undefined,
      stripeO: undefined,
      stripeW: 0,
    });

    expect(
      validateLogoRouteSearch({
        leftFace: "striped",
        stripeG: "0.4",
        stripeLink: "",
      }),
    ).toEqual({
      leftFace: "striped",
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: 0.4,
      stripeLink: true,
      stripeO: undefined,
      stripeW: 0.4,
    });

    expect(
      buildLogoRouteSearch({
        distanceScale: DEFAULT_LOGO_DISTANCE_SCALE,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: DEFAULT_LOGO_ISOMETRIC_CUBE_SIDE_PX,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: {
          kind: "striped",
          stripeAngleDegrees: DEFAULT_LOGO_LEFT_FACE_STRIPE_ANGLE_DEGREES,
          stripeBasis: DEFAULT_LOGO_LEFT_FACE_STRIPE_BASIS,
          stripeGap: 0.4,
          stripeGapLinked: true,
          stripeOffset: DEFAULT_LOGO_LEFT_FACE_STRIPE_OFFSET,
          stripeWidth: 0.4,
        },
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      depth: undefined,
      dist: undefined,
      leftFace: "striped",
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: 0.4,
      stripeLink: true,
      stripeO: undefined,
      stripeW: 0.4,
    });
  });
});
