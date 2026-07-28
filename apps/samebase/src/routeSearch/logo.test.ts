import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
  LOGO_ISOMETRIC_CUBE_SIDE_PIXELS,
} from "@/components/logo/logoIsometricRenderer";
import { MAX_LOGO_FRACTAL_DEPTH } from "@/components/logo/logoDepthLimits";
import { DEFAULT_LOGO_THEME_COLORS } from "@/components/logo/logoTailwindColors";
import { LOGO_DISTANCE_SCALE } from "@/components/logo/logoDistanceScale";
import { LOGO_PREVIEW_ZOOM } from "@/components/logo/logoPreviewZoom";
import { DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES } from "@/components/logo/logoShuffleAnimation";
import {
  LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
  LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
} from "@/components/logo/logoPresentationTilt";
import {
  DEFAULT_LOGO_LEFT_FACE_STYLE,
  LOGO_LEFT_FACE_STRIPE,
} from "@samebase/logo-model/left-face-style";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_LOGO_FRACTAL_DEPTH,
  DEFAULT_LOGO_GRID_SIZE,
  DEFAULT_ROTATION_DEGREES,
  DEFAULT_VOXEL_STATE,
  LOGO_GRID_SIZE_2,
  LOGO_GRID_SIZE_3,
  LOGO_GRID_SIZE_4,
  LOGO_GRID_SIZE_5,
  MAX_LOGO_GRID_SIZE,
  createDefaultVoxelState,
} from "@samebase/logo-model/voxel";
import {
  MENGER_HOVER_DEFAULT_DEPTH,
  MENGER_HOVER_MAX_DEPTH,
} from "@samebase/logo-model/menger-hover";
import {
  SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH,
  SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC,
  SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
  SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
  SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
} from "@samebase/logo-model/sierpinski-carpet-hover";
import {
  buildLogoCarpetHoverRouteSearch,
  buildLogoIsoRouteSearch,
  buildLogoMengerHoverRouteSearch,
  buildLogoRouteSearch,
  DEFAULT_LOGO_OPACITY,
  LOGO_ROUTE_SEARCH_KEYS,
  PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS,
  hasPublicLandingLogoStaticFallbackUnsafeSearch,
  preserveLogoRouteDevModeSearch,
  validateLogoCarpetHoverRouteSearch,
  validateLogoIsoRouteSearch,
  validateLogoMengerHoverRouteSearch,
  validateLogoRouteSearch,
  validateLogoRouteSearchForRenderer,
} from "@/routeSearch/logo";

describe("logoRouteSearch", () => {
  it("classifies logo search keys that make the SSG landing fallback unsafe", () => {
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toContain("rot");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toContain("elev");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toContain("primary");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toContain("depth");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toContain("opacity");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toContain("auto-rotate");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).not.toContain("zoom");
    expect(PUBLIC_LANDING_LOGO_STATIC_FALLBACK_UNSAFE_SEARCH_KEYS).toEqual(
      LOGO_ROUTE_SEARCH_KEYS.filter((key) => key !== "zoom"),
    );
    expect(hasPublicLandingLogoStaticFallbackUnsafeSearch({ rot: 180 })).toBe(true);
    expect(hasPublicLandingLogoStaticFallbackUnsafeSearch({ zoom: 0.5 })).toBe(false);
  });

  it("normalizes logo route search into typed values", () => {
    expect(
      validateLogoRouteSearch({
        "animate-colors": "",
        "animate-stripes": "",
        "auto-rotate": "",
        "auto-shuffle": "false",
        axis: "screen-vertical",
        dev: "",
        depth: "99",
        dist: "-1",
        elev: "32.4",
        freeView: "",
        background: "sky-500",
        border: "stone-300",
        dark: "",
        leftFace: "striped",
        opacity: "0.5",
        primary: "emerald-500",
        rot: "721",
        secondary: "amber-500",
        shuffleMoves: "2",
        stripeA: "120",
        stripeBasis: "horizontal",
        stripeG: "2",
        stripeO: "2",
        stripeW: "-1",
        top: "white-base",
        vox: DEFAULT_VOXEL_STATE,
        zoom: "2",
      }),
    ).toEqual({
      "animate-colors": true,
      "animate-stripes": true,
      "auto-rotate": true,
      "auto-shuffle": true,
      axis: "screen-vertical",
      background: "sky-500",
      border: "stone-300",
      dark: true,
      depth: MAX_LOGO_FRACTAL_DEPTH,
      dev: true,
      dist: 0,
      elev: 32.4,
      freeView: true,
      leftFace: "striped",
      opacity: 0.5,
      primary: "emerald-500",
      rot: 1,
      secondary: "amber-500",
      shuffleMoves: 2,
      stripeA: 90,
      stripeBasis: "horizontal",
      stripeG: 1,
      stripeO: 1,
      stripeW: 0,
      top: "white-base",
      vox: DEFAULT_VOXEL_STATE,
      zoom: 1,
    });
  });

  it("clears default logo state when building route search", () => {
    const search = buildLogoRouteSearch({
      autoRotateEnabled: false,
      autoShuffleEnabled: false,
      faceColorAnimationEnabled: false,
      leftFaceStripeAnimationEnabled: false,
      logoOpacity: DEFAULT_LOGO_OPACITY,
      shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
      distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
      zoom: LOGO_PREVIEW_ZOOM.defaultValue,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      gridSize: DEFAULT_LOGO_GRID_SIZE,
      isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
      isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
      leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
      rotationAxisMode: "cube-y",
      rotationDegrees: DEFAULT_ROTATION_DEGREES,
      themeColors: DEFAULT_LOGO_THEME_COLORS,
      viewSnapEnabled: true,
      voxelState: DEFAULT_VOXEL_STATE,
    });

    expect(search).toEqual({});
    expect("animate-colors" in search).toBe(true);
    expect(search["animate-colors"]).toBeUndefined();
    expect("animate-stripes" in search).toBe(true);
    expect(search["animate-stripes"]).toBeUndefined();
    expect("auto-rotate" in search).toBe(true);
    expect(search["auto-rotate"]).toBeUndefined();
    expect("auto-shuffle" in search).toBe(true);
    expect(search["auto-shuffle"]).toBeUndefined();
    expect("axis" in search).toBe(true);
    expect(search.axis).toBeUndefined();
    expect("elev" in search).toBe(true);
    expect(search.elev).toBeUndefined();
    expect("depth" in search).toBe(true);
    expect(search.depth).toBeUndefined();
    expect("dist" in search).toBe(true);
    expect(search.dist).toBeUndefined();
    expect("freeView" in search).toBe(true);
    expect(search.freeView).toBeUndefined();
    expect("gridSize" in search).toBe(true);
    expect(search.gridSize).toBeUndefined();
    expect("zoom" in search).toBe(true);
    expect(search.zoom).toBeUndefined();
    expect("leftFace" in search).toBe(true);
    expect(search.leftFace).toBeUndefined();
    expect("opacity" in search).toBe(true);
    expect(search.opacity).toBeUndefined();
    expect("rot" in search).toBe(true);
    expect(search.rot).toBeUndefined();
    expect("shuffleMoves" in search).toBe(true);
    expect(search.shuffleMoves).toBeUndefined();
    expect("vox" in search).toBe(true);
    expect(search.vox).toBeUndefined();
  });

  it("preserves non-default logo motion and opacity route state", () => {
    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: true,
        autoShuffleEnabled: true,
        faceColorAnimationEnabled: true,
        leftFaceStripeAnimationEnabled: true,
        logoOpacity: 0.456,
        shuffleParallelMoves: 2,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({
      "animate-colors": true,
      "animate-stripes": true,
      "auto-rotate": true,
      "auto-shuffle": true,
      opacity: 0.46,
      shuffleMoves: 2,
    });
  });

  it("keeps iso renderer params on the iso route schema only", () => {
    expect(validateLogoIsoRouteSearch({ isoSide: "52", isoStyle: "flat" })).toEqual({
      isoSide: 40,
      isoStyle: "flat",
    });

    expect(validateLogoRouteSearch({ isoSide: "52", isoStyle: "flat" })).toEqual({});
  });

  it("clears default iso state with tombstones when building iso route search", () => {
    const search = buildLogoIsoRouteSearch({
      autoRotateEnabled: false,
      autoShuffleEnabled: false,
      faceColorAnimationEnabled: false,
      leftFaceStripeAnimationEnabled: false,
      logoOpacity: DEFAULT_LOGO_OPACITY,
      shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
      distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
      zoom: LOGO_PREVIEW_ZOOM.defaultValue,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      gridSize: DEFAULT_LOGO_GRID_SIZE,
      isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
      isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
      leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
      rotationAxisMode: "cube-y",
      rotationDegrees: DEFAULT_ROTATION_DEGREES,
      themeColors: DEFAULT_LOGO_THEME_COLORS,
      viewSnapEnabled: true,
      voxelState: DEFAULT_VOXEL_STATE,
    });

    expect(search).toEqual({});
    expect("isoSide" in search).toBe(true);
    expect(search.isoSide).toBeUndefined();
    expect("isoStyle" in search).toBe(true);
    expect(search.isoStyle).toBeUndefined();
  });

  it("keeps carpet hover params on the carpet route schema only", () => {
    expect(
      validateLogoCarpetHoverRouteSearch({
        mechanic: "slide",
        radius: "0.5",
      }),
    ).toEqual({ mechanic: "slide", radius: 0.5 });

    expect(validateLogoRouteSearch({ mechanic: "slide", radius: "0.5" })).toEqual({});
    expect(validateLogoCarpetHoverRouteSearch({ mechanic: "spin" })).toEqual({});
  });

  it("keeps landing tilt on the Menger hover route schema only", () => {
    expect(
      validateLogoMengerHoverRouteSearch({
        depth: "99",
        tilt: "",
        tiltRadius: "3.5",
        tiltStrength: "1.5",
      }),
    ).toEqual({
      depth: MENGER_HOVER_MAX_DEPTH,
      tilt: true,
      tiltRadius: 3.5,
      tiltStrength: 1.5,
    });
    expect(validateLogoMengerHoverRouteSearch({ tiltRadius: "-1" })).toEqual({
      tiltRadius: 0,
    });
    expect(validateLogoMengerHoverRouteSearch({ tiltStrength: "-1" })).toEqual({
      tiltStrength: 0,
    });
    expect(validateLogoRouteSearch({ tilt: "", tiltRadius: "1.2", tiltStrength: "1.5" })).toEqual(
      {},
    );
    expect(
      validateLogoCarpetHoverRouteSearch({
        tilt: "",
        tiltRadius: "1.2",
        tiltStrength: "1.5",
      }),
    ).toEqual({});
  });

  it("clamps carpet reveal depth and radius at the model bounds", () => {
    expect(validateLogoCarpetHoverRouteSearch({ depth: "9" })).toEqual({
      depth: SIERPINSKI_CARPET_HOVER_MAX_DEPTH,
    });
    expect(validateLogoCarpetHoverRouteSearch({ depth: "4" })).toEqual({ depth: 4 });
    expect(validateLogoCarpetHoverRouteSearch({ radius: "9" })).toEqual({
      radius: SIERPINSKI_CARPET_HOVER_MAX_REVEAL_RADIUS,
    });
    // Finer-than-slider precision survives the validate and build round trip.
    expect(validateLogoCarpetHoverRouteSearch({ radius: "0.055" })).toEqual({ radius: 0.055 });
  });

  it("clears default hover state with tombstones when building hover route search", () => {
    const routeBuildDefaults = {
      autoRotateEnabled: false,
      autoShuffleEnabled: false,
      faceColorAnimationEnabled: false,
      leftFaceStripeAnimationEnabled: false,
      logoOpacity: DEFAULT_LOGO_OPACITY,
      shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
      distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
      zoom: LOGO_PREVIEW_ZOOM.defaultValue,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      gridSize: DEFAULT_LOGO_GRID_SIZE,
      isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
      isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
      leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
      rotationAxisMode: "cube-y",
      rotationDegrees: DEFAULT_ROTATION_DEGREES,
      themeColors: DEFAULT_LOGO_THEME_COLORS,
      viewSnapEnabled: true,
      voxelState: DEFAULT_VOXEL_STATE,
    } as const;
    const search = buildLogoCarpetHoverRouteSearch({
      ...routeBuildDefaults,
      carpetMechanic: SIERPINSKI_CARPET_HOVER_DEFAULT_MECHANIC,
      carpetRevealDepth: SIERPINSKI_CARPET_HOVER_DEFAULT_DEPTH,
      carpetRevealRadius: SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
    });

    expect(search).toEqual({});
    expect("mechanic" in search).toBe(true);
    expect(search.mechanic).toBeUndefined();
    expect("radius" in search).toBe(true);
    expect(search.radius).toBeUndefined();
    expect("depth" in search).toBe(true);
    expect(search.depth).toBeUndefined();

    const nonDefaultSearch = buildLogoCarpetHoverRouteSearch({
      ...routeBuildDefaults,
      carpetMechanic: "grow",
      carpetRevealDepth: 3,
      carpetRevealRadius: 0.5,
    });

    expect(nonDefaultSearch.mechanic).toBe("grow");
    expect(nonDefaultSearch.depth).toBe(3);
    expect(nonDefaultSearch.radius).toBe(0.5);

    const mengerDefaults = buildLogoMengerHoverRouteSearch({
      ...routeBuildDefaults,
      mengerHoverDepth: MENGER_HOVER_DEFAULT_DEPTH,
      mengerHoverTiltEnabled: false,
      mengerHoverTiltRadiusScale: LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
      mengerHoverTiltStrengthScale: LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
    });
    expect(mengerDefaults).toEqual({});
    expect("depth" in mengerDefaults).toBe(true);
    expect(mengerDefaults.depth).toBeUndefined();
    expect("tilt" in mengerDefaults).toBe(true);
    expect(mengerDefaults.tilt).toBeUndefined();
    expect("tiltRadius" in mengerDefaults).toBe(true);
    expect(mengerDefaults.tiltRadius).toBeUndefined();
    expect("tiltStrength" in mengerDefaults).toBe(true);
    expect(mengerDefaults.tiltStrength).toBeUndefined();

    expect(
      buildLogoMengerHoverRouteSearch({
        ...routeBuildDefaults,
        mengerHoverDepth: 1,
        mengerHoverTiltEnabled: false,
        mengerHoverTiltRadiusScale: LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
        mengerHoverTiltStrengthScale: LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
      }).depth,
    ).toBe(1);
    expect(
      buildLogoMengerHoverRouteSearch({
        ...routeBuildDefaults,
        mengerHoverDepth: 99,
        mengerHoverTiltEnabled: true,
        mengerHoverTiltRadiusScale: LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
        mengerHoverTiltStrengthScale: LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
      }).depth,
    ).toBe(MENGER_HOVER_MAX_DEPTH);
    expect(
      buildLogoMengerHoverRouteSearch({
        ...routeBuildDefaults,
        mengerHoverDepth: MENGER_HOVER_DEFAULT_DEPTH,
        mengerHoverTiltEnabled: true,
        mengerHoverTiltRadiusScale: LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
        mengerHoverTiltStrengthScale: 1,
      }).tiltStrength,
    ).toBe(1);
    expect(
      buildLogoMengerHoverRouteSearch({
        ...routeBuildDefaults,
        mengerHoverDepth: MENGER_HOVER_DEFAULT_DEPTH,
        mengerHoverTiltEnabled: true,
        mengerHoverTiltRadiusScale: 1.2,
        mengerHoverTiltStrengthScale: 1.5,
      }).tilt,
    ).toBe(true);
    expect(
      buildLogoMengerHoverRouteSearch({
        ...routeBuildDefaults,
        mengerHoverDepth: MENGER_HOVER_DEFAULT_DEPTH,
        mengerHoverTiltEnabled: true,
        mengerHoverTiltRadiusScale: 1.2,
        mengerHoverTiltStrengthScale: 1.5,
      }).tiltRadius,
    ).toBe(1.2);
    expect(
      buildLogoMengerHoverRouteSearch({
        ...routeBuildDefaults,
        mengerHoverDepth: MENGER_HOVER_DEFAULT_DEPTH,
        mengerHoverTiltEnabled: true,
        mengerHoverTiltRadiusScale: 1.2,
        mengerHoverTiltStrengthScale: 1.5,
      }).tiltStrength,
    ).toBe(1.5);
  });

  it("preserves canonical theme mode flags when building route search", () => {
    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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
        opacity: "not-a-number",
        background: null,
        border: 2,
        primary: "not-a-color",
        rot: "not-a-number",
        secondary: 4,
        shuffleMoves: "4",
        stripeA: "not-a-number",
        stripeBasis: "diagonal",
        stripeG: {},
        stripeO: null,
        stripeW: Number.NaN,
        vox: "bad-voxel-state",
        zoom: "not-a-number",
      }),
    ).toEqual({
      freeView: true,
    });
  });

  it("ignores the unsupported base query key", () => {
    expect(validateLogoRouteSearch({ base: "#112233" })).toEqual({});
    expect(validateLogoRouteSearch({ background: "#445566", base: "#112233" })).toEqual({
      background: "#445566",
    });
  });

  it("keeps grid size and voxel state as one coherent route shape", () => {
    const grid2VoxelState = createDefaultVoxelState(LOGO_GRID_SIZE_2);
    const grid3VoxelState = createDefaultVoxelState(LOGO_GRID_SIZE_3);
    const grid4VoxelState = createDefaultVoxelState(LOGO_GRID_SIZE_4);
    const grid5VoxelState = createDefaultVoxelState(LOGO_GRID_SIZE_5);
    const grid10VoxelState = createDefaultVoxelState(MAX_LOGO_GRID_SIZE);

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
    expect(validateLogoRouteSearch({ vox: grid4VoxelState })).toEqual({
      gridSize: LOGO_GRID_SIZE_4,
      vox: grid4VoxelState,
    });
    expect(validateLogoRouteSearch({ gridSize: "5", vox: grid5VoxelState })).toEqual({
      gridSize: LOGO_GRID_SIZE_5,
      vox: grid5VoxelState,
    });
    expect(validateLogoRouteSearch({ gridSize: "10", vox: grid10VoxelState })).toEqual({
      gridSize: MAX_LOGO_GRID_SIZE,
      vox: grid10VoxelState,
    });
    expect(validateLogoRouteSearch({ gridSize: "11" })).toEqual({});

    const builtSearch = buildLogoRouteSearch({
      autoRotateEnabled: false,
      autoShuffleEnabled: false,
      faceColorAnimationEnabled: false,
      leftFaceStripeAnimationEnabled: false,
      logoOpacity: DEFAULT_LOGO_OPACITY,
      shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
      distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
      zoom: LOGO_PREVIEW_ZOOM.defaultValue,
      elevationDegrees: DEFAULT_ELEVATION_DEGREES,
      fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
      gridSize: LOGO_GRID_SIZE_2,
      isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: 6,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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

  it("caps built logo depth at the route recovery limit", () => {
    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: MAX_LOGO_FRACTAL_DEPTH + 1,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: DEFAULT_LOGO_LEFT_FACE_STYLE,
        rotationAxisMode: "cube-y",
        rotationDegrees: DEFAULT_ROTATION_DEGREES,
        themeColors: DEFAULT_LOGO_THEME_COLORS,
        viewSnapEnabled: true,
        voxelState: DEFAULT_VOXEL_STATE,
      }),
    ).toEqual({ depth: MAX_LOGO_FRACTAL_DEPTH });
  });

  it("caps logo depth at renderer recovery limits without rendering", () => {
    expect(validateLogoRouteSearchForRenderer("svg")({ depth: "99" })).toEqual({
      depth: 3,
    });
    expect(validateLogoRouteSearchForRenderer("three")({ depth: "99" })).toEqual({
      depth: 5,
    });
    expect(validateLogoRouteSearchForRenderer("raster")({ depth: "99" })).toEqual({
      depth: 10,
    });
    expect(validateLogoRouteSearchForRenderer("iso")({ depth: "99" })).toEqual({
      depth: 10,
    });
  });

  it("preserves distance values above the slider range", () => {
    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.sliderMax + 1,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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

  it("caps built preview zoom at the current route max", () => {
    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: 2,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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
      dist: undefined,
      leftFace: undefined,
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeO: undefined,
      stripeW: undefined,
      zoom: undefined,
    });

    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: 0.555,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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
      dist: undefined,
      leftFace: undefined,
      stripeA: undefined,
      stripeBasis: undefined,
      stripeG: undefined,
      stripeO: undefined,
      stripeW: undefined,
      zoom: 0.56,
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

    expect(defaultStripedSearch).toEqual({
      leftFace: "striped",
    });
    expect(defaultStripedSearch.leftFace).toBe("striped");

    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: {
          kind: "striped",
          stripeAngleDegrees: LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue,
          stripeBasis: LOGO_LEFT_FACE_STRIPE.basis.defaultValue,
          stripeGap: LOGO_LEFT_FACE_STRIPE.gap.defaultValue,
          stripeGapLinked: LOGO_LEFT_FACE_STRIPE.gapLinked.defaultValue,
          stripeOffset: LOGO_LEFT_FACE_STRIPE.offset.defaultValue,
          stripeWidth: LOGO_LEFT_FACE_STRIPE.width.defaultValue,
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
      stripeG: undefined,
      stripeLink: undefined,
      stripeO: undefined,
      stripeW: undefined,
    });

    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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

  it("drops secondary as the default duotone route state", () => {
    const defaultSecondarySearch = validateLogoRouteSearch({ leftFace: "secondary" });

    expect(defaultSecondarySearch).toEqual({});
    expect(defaultSecondarySearch.leftFace).toBeUndefined();

    expect(
      buildLogoRouteSearch({
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
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
      leftFace: undefined,
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
        autoRotateEnabled: false,
        autoShuffleEnabled: false,
        faceColorAnimationEnabled: false,
        leftFaceStripeAnimationEnabled: false,
        logoOpacity: DEFAULT_LOGO_OPACITY,
        shuffleParallelMoves: DEFAULT_LOGO_SHUFFLE_PARALLEL_MOVES,
        distanceScale: LOGO_DISTANCE_SCALE.defaultValue,
        zoom: LOGO_PREVIEW_ZOOM.defaultValue,
        elevationDegrees: DEFAULT_ELEVATION_DEGREES,
        fractalDepth: DEFAULT_LOGO_FRACTAL_DEPTH,
        gridSize: DEFAULT_LOGO_GRID_SIZE,
        isoCubeSidePixels: LOGO_ISOMETRIC_CUBE_SIDE_PIXELS.defaultValue,
        isoStyleId: DEFAULT_LOGO_ISOMETRIC_STYLE_ID,
        leftFaceStyle: {
          kind: "striped",
          stripeAngleDegrees: LOGO_LEFT_FACE_STRIPE.angleDegrees.defaultValue,
          stripeBasis: LOGO_LEFT_FACE_STRIPE.basis.defaultValue,
          stripeGap: 0.4,
          stripeGapLinked: true,
          stripeOffset: LOGO_LEFT_FACE_STRIPE.offset.defaultValue,
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
