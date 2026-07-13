import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { advanceLogoAutoRotation } from "@/components/logo/logoAutoRotation";
import {
  createLogoRouteVoxelGrid,
  readLogoRouteRenderState,
  type LogoRouteRenderState,
} from "@/components/logo/logoRouteRenderState";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
} from "@/components/logo/logoStaticSvgContract";
import { DEFAULT_LOGO_FRACTAL_DEPTH } from "@/components/logo/logoVoxelState";
import {
  PUBLIC_LANDING_LOGO_ALT,
  PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME_BY_STAGE,
  PUBLIC_LANDING_LOGO_HEIGHT,
  type PublicLandingLogoStage,
  PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
  PUBLIC_LANDING_LOGO_WIDTH,
} from "@/lib/publicLandingLogo";
import {
  persistRotatedLogoViewState,
  PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
  readRotatedLogoViewState,
  type RotatedLogoViewState,
  type RotatedLogoViewStateKey,
  type RotatedLogoViewStatePersistence,
} from "@/lib/rotatedLogoViewState";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import {
  buildLogoRouteSearch,
  hasPublicLandingLogoStaticFallbackUnsafeSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/routeSearch/logo";
import { clearPublicLandingLogoStaticFallbackPrehydration } from "@/lib/publicLandingLogoPrehydration";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type LandingLogoSceneComponent = typeof import("@/components/logo/NLogoScene").NLogoScene;

const AUTO_ROTATE_RESUME_DURATION_MS = 220;
const AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER = 0.4;
const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
// The canvas receives the requested depth; the SVG fallback stays cheap enough
// to render before the interactive scene is ready.
const LANDING_STATIC_SVG_FALLBACK_DEPTH = 3;

const DEFAULT_LANDING_LOGO_VIEW: RotatedLogoViewState = {
  elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
  rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
};
const EMPTY_LOGO_ROUTE_SEARCH: LogoRouteSearch = {};

let cachedLandingLogoScene: LandingLogoSceneComponent | null = null;
// Unsupported renderer paths can loop on remount, so keep that failure sticky
// for the session while still allowing later chunk loads to retry.
let didLandingLogoSceneRenderFail = false;

function ignoreLogoVoxelEdit() {}

function buildPublicLandingLogoRouteSearch({
  routeSearch,
  routeState,
  view,
}: {
  routeSearch: LogoRouteSearch;
  routeState: LogoRouteRenderState;
  view: RotatedLogoViewState;
}): LogoRouteSearch {
  return preserveLogoRouteDevModeSearch(
    buildLogoRouteSearch({
      ...routeState,
      elevationDegrees: view.elevationDegrees,
      rotationDegrees: view.rotationDegrees,
      themeModeSearch: routeSearch,
    }),
    routeSearch,
  );
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function PublicLandingLogo({
  animateLeftFaceStripes = false,
  autoRotate = false,
  enableViewSnapping = true,
  loadInteractiveScene = true,
  replaceRouteSearch,
  routeSearch = EMPTY_LOGO_ROUTE_SEARCH,
  routeSearchSource = "url",
  stage = "compact",
  viewStatePersistence = "visit",
  viewStateKey = PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
}: {
  animateLeftFaceStripes?: boolean;
  autoRotate?: boolean;
  enableViewSnapping?: boolean;
  loadInteractiveScene?: boolean;
  replaceRouteSearch?: (nextSearch: LogoRouteSearch) => void;
  routeSearch?: LogoRouteSearch;
  /**
  "url" search can differ from the prerendered document, so the stale static
  fallback hides until the scene is ready. "static" search is a constant the
  caller renders identically on server and client, so the fallback is always
  correct and stays visible while the scene loads.
  */
  routeSearchSource?: "url" | "static";
  stage?: PublicLandingLogoStage;
  viewStatePersistence?: RotatedLogoViewStatePersistence;
  viewStateKey?: RotatedLogoViewStateKey;
}) {
  const [LogoScene, setLogoScene] = useState<LandingLogoSceneComponent | null>(() =>
    loadInteractiveScene ? cachedLandingLogoScene : null,
  );
  const [didSceneFail, setDidSceneFail] = useState(() => didLandingLogoSceneRenderFail);
  const defaultView = readRotatedLogoViewState({
    defaultView: DEFAULT_LANDING_LOGO_VIEW,
    key: viewStateKey,
    persistence: viewStatePersistence,
  });
  const defaultElevationDegrees = defaultView.elevationDegrees;
  const defaultRotationDegrees = defaultView.rotationDegrees;
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        defaultView: {
          elevationDegrees: defaultElevationDegrees,
          rotationDegrees: defaultRotationDegrees,
        },
        enableViewSnapping,
        routeSearch,
        snapFallbackView: false,
      }),
    [defaultElevationDegrees, defaultRotationDegrees, enableViewSnapping, routeSearch],
  );
  const logoTheme = useResolvedAppThemeColorState(routeState.themeColors);
  const { backgroundColor, faceColors } = logoTheme;
  const staticFallbackView = useMemo(
    () => ({
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    }),
    [routeState.elevationDegrees, routeState.rotationDegrees],
  );
  const staticFallbackDepth = Math.min(routeState.fractalDepth, LANDING_STATIC_SVG_FALLBACK_DEPTH);
  const staticLogoVoxelGrid = useMemo(
    () =>
      createLogoRouteVoxelGrid({
        fractalDepth: staticFallbackDepth,
        gridSize: routeState.gridSize,
        voxelState: routeState.voxelState,
      }),
    [routeState.gridSize, routeState.voxelState, staticFallbackDepth],
  );
  const staticLogoSvgSrc = `${createStaticLogoSvgDataUrl({
    faceColors,
    filledVoxels: staticLogoVoxelGrid.filledVoxels,
    gridSize: staticLogoVoxelGrid.gridSize,
    leftFaceStyle: routeState.leftFaceStyle,
    view: staticFallbackView,
  })}#${logoTheme.cacheKey}:${routeState.gridSize}:${routeState.fractalDepth}:${routeState.distanceScale}`;
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isSvgVisible, setIsSvgVisible] = useState(true);
  const [isHydratedFallbackVisibilityReady, setIsHydratedFallbackVisibilityReady] = useState(false);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [view, setView] = useState<RotatedLogoViewState>(() => staticFallbackView);
  const latestViewRef = useRef(view);
  const lastFrameTimeRef = useRef<number | null>(null);
  const autoRotateResumeStartedAtRef = useRef<number | null>(null);
  const shouldHideQuerySvgFallbackUntilSceneReady =
    loadInteractiveScene &&
    routeSearchSource === "url" &&
    hasPublicLandingLogoStaticFallbackUnsafeSearch(routeSearch);
  const isSvgFallbackVisible =
    !isHydratedFallbackVisibilityReady ||
    (isSvgVisible && (!shouldHideQuerySvgFallbackUntilSceneReady || didSceneFail));
  const isSceneInteractive = isSceneReady && !isSvgFallbackVisible;
  // Continuous rotation is decorative motion, so it follows the same OS
  // preference as the color and stripe animations.
  const isAutoRotateRequested =
    (autoRotate || routeState.autoRotateEnabled) && !prefersReducedMotion;
  const shouldAnimateFaceColors = routeState.faceColorAnimationEnabled && !prefersReducedMotion;
  const shouldAnimateLeftFaceStripes =
    (animateLeftFaceStripes || routeState.leftFaceStripeAnimationEnabled) && !prefersReducedMotion;
  const shuffleAnimation = {
    enabled: routeState.autoShuffleEnabled && !prefersReducedMotion,
    parallelMoves: routeState.shuffleParallelMoves,
  };
  const persistLatestLogoView = useCallback(() => {
    persistRotatedLogoViewState({
      key: viewStateKey,
      persistence: viewStatePersistence,
      view: latestViewRef.current,
    });
  }, [viewStateKey, viewStatePersistence]);

  useLayoutEffect(() => {
    // The first hydrated render must keep the SSG opacity class so React does
    // not leave an unpatched class mismatch on the server-rendered image.
    setIsHydratedFallbackVisibilityReady(true);
  }, []);

  useLayoutEffect(() => {
    if (!isHydratedFallbackVisibilityReady) {
      return;
    }

    clearPublicLandingLogoStaticFallbackPrehydration();
  }, [isHydratedFallbackVisibilityReady]);

  useLayoutEffect(() => {
    const nextView = {
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    };

    latestViewRef.current = nextView;
    lastFrameTimeRef.current = null;
    autoRotateResumeStartedAtRef.current = null;
    setView((currentView) =>
      currentView.elevationDegrees === nextView.elevationDegrees &&
      currentView.rotationDegrees === nextView.rotationDegrees
        ? currentView
        : nextView,
    );
  }, [routeState.elevationDegrees, routeState.rotationDegrees]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia(REDUCED_MOTION_MEDIA_QUERY);
    const syncReducedMotionPreference = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    // Automatic stripe motion follows the user's OS motion preference.
    syncReducedMotionPreference();
    mediaQuery.addEventListener("change", syncReducedMotionPreference);
    return () => {
      mediaQuery.removeEventListener("change", syncReducedMotionPreference);
    };
  }, []);

  useEffect(() => {
    if (!loadInteractiveScene) {
      setLogoScene(null);
      setDidSceneFail(false);
      setIsSceneReady(false);
      setIsSvgVisible(true);
      return;
    }

    if (didLandingLogoSceneRenderFail) {
      setDidSceneFail(true);
      return;
    }
    setDidSceneFail(false);

    if (cachedLandingLogoScene !== null) {
      setLogoScene(() => cachedLandingLogoScene);
      return;
    }

    let cancelled = false;
    let idleCallbackId: number | null = null;
    let frameId = 0;
    let frameId2 = 0;

    const loadScene = () => {
      void import("@/components/logo/NLogoScene")
        .then((module) => {
          if (cancelled) {
            return;
          }

          cachedLandingLogoScene = module.NLogoScene;
          setLogoScene(() => module.NLogoScene);
          setDidSceneFail(false);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          console.error("Failed to load landing logo scene", error);
          setDidSceneFail(true);
        });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(loadScene, {
        timeout: 1200,
      });
    } else {
      frameId = window.requestAnimationFrame(() => {
        frameId2 = window.requestAnimationFrame(loadScene);
      });
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(frameId2);
    };
  }, [loadInteractiveScene]);

  useEffect(() => {
    if (!isSceneReady || !isSvgVisible) {
      return;
    }
    setIsSvgVisible(false);
  }, [isSceneReady, isSvgVisible]);

  useEffect(() => {
    setIsAutoRotating(isAutoRotateRequested);
    lastFrameTimeRef.current = null;
    autoRotateResumeStartedAtRef.current = null;
  }, [isAutoRotateRequested]);

  useEffect(() => {
    if (!isAutoRotating) {
      lastFrameTimeRef.current = null;
      return;
    }

    let animationFrameId = 0;

    const step = (timestamp: number) => {
      const lastFrameTime = lastFrameTimeRef.current;
      if (lastFrameTime !== null) {
        const deltaSeconds = (timestamp - lastFrameTime) / 1000;
        let speedMultiplier = 1;
        const resumeStartedAt = autoRotateResumeStartedAtRef.current;
        if (resumeStartedAt !== null) {
          const progress = Math.min(
            (timestamp - resumeStartedAt) / AUTO_ROTATE_RESUME_DURATION_MS,
            1,
          );
          speedMultiplier =
            AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER +
            (1 - AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER) * easeOutCubic(progress);
          if (progress >= 1) {
            autoRotateResumeStartedAtRef.current = null;
          }
        }
        setView((currentView) => {
          const nextView = {
            ...currentView,
            rotationDegrees: advanceLogoAutoRotation(
              currentView.rotationDegrees,
              deltaSeconds,
              speedMultiplier,
            ),
          };
          latestViewRef.current = nextView;
          return nextView;
        });
      }
      lastFrameTimeRef.current = timestamp;
      animationFrameId = window.requestAnimationFrame(step);
    };

    animationFrameId = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lastFrameTimeRef.current = null;
    };
  }, [isAutoRotating]);

  return (
    <div className={PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME_BY_STAGE[stage]}>
      <div
        data-testid={PUBLIC_LANDING_LOGO_STAGE_TEST_ID}
        className={PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME}
      >
        <img
          {...{ [PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE]: "" }}
          data-testid={PUBLIC_LANDING_LOGO_TEST_ID}
          src={staticLogoSvgSrc}
          alt={PUBLIC_LANDING_LOGO_ALT}
          width={PUBLIC_LANDING_LOGO_WIDTH}
          height={PUBLIC_LANDING_LOGO_HEIGHT}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className={`${PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME} relative z-10 transition-opacity duration-150 ease-out motion-reduce:transition-none ${isSvgFallbackVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
        {LogoScene && !didSceneFail ? (
          <div
            aria-hidden="true"
            data-testid={PUBLIC_LANDING_LOGO_SCENE_TEST_ID}
            data-state={isSceneReady ? "ready" : "loading"}
            data-elevation-degrees={view.elevationDegrees.toFixed(3)}
            data-rotation-degrees={view.rotationDegrees.toFixed(3)}
            className={`absolute inset-0 z-0 ${isSceneInteractive ? "pointer-events-auto touch-none" : "pointer-events-none"}`}
          >
            <LogoScene
              baseGridSize={routeState.gridSize}
              className={`h-full w-full ${isSceneInteractive ? "cursor-grab active:cursor-grabbing" : ""}`}
              backgroundColor={backgroundColor}
              distanceScale={routeState.distanceScale}
              editMode="add"
              elevationDegrees={view.elevationDegrees}
              faceColors={faceColors}
              leftFaceStyle={routeState.leftFaceStyle}
              opacity={routeState.logoOpacity}
              onInteractionStart={() => {
                autoRotateResumeStartedAtRef.current = null;
                setIsAutoRotating(false);
              }}
              onInteractionEnd={() => {
                persistLatestLogoView();
                replaceRouteSearch?.(
                  buildPublicLandingLogoRouteSearch({
                    routeSearch,
                    routeState,
                    view: latestViewRef.current,
                  }),
                );
                if (!isAutoRotateRequested) {
                  return;
                }
                autoRotateResumeStartedAtRef.current = performance.now();
                lastFrameTimeRef.current = autoRotateResumeStartedAtRef.current;
                setIsAutoRotating(true);
              }}
              onRenderReady={() => {
                setIsSceneReady(true);
              }}
              onRenderUnavailable={() => {
                didLandingLogoSceneRenderFail = true;
                setDidSceneFail(true);
              }}
              onViewChange={(nextView) => {
                latestViewRef.current = nextView;
                setView(nextView);
              }}
              onVoxelEdit={ignoreLogoVoxelEdit}
              rotationAxisMode={routeState.rotationAxisMode}
              rotationDegrees={view.rotationDegrees}
              shuffleAnimation={shuffleAnimation}
              animateFaceColors={shouldAnimateFaceColors}
              animateLeftFaceStripes={shouldAnimateLeftFaceStripes}
              fractalDepth={routeState.fractalDepth}
              voxelGrid={
                routeState.fractalDepth > DEFAULT_LOGO_FRACTAL_DEPTH
                  ? undefined
                  : staticLogoVoxelGrid
              }
              voxelEditingEnabled={false}
              viewDragConfig={
                routeState.viewSnapEnabled ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG : undefined
              }
              voxelState={routeState.voxelState}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
