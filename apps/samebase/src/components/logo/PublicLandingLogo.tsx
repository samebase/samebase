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
import {
  getPointerLogoPresentationTiltTarget,
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  type LogoPresentationTiltTarget,
} from "@/components/logo/logoPresentationTilt";
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
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type LandingLogoSceneComponent = typeof import("@/components/logo/NLogoScene").NLogoScene;

const AUTO_ROTATE_RESUME_DURATION_MS = 220;
const AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER = 0.4;
const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
const POINTER_TILT_MEDIA_QUERY = "(hover: hover) and (pointer: fine)";
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
  defaultView,
  routeSearch,
  routeState,
  view,
}: {
  defaultView: RotatedLogoViewState;
  routeSearch: LogoRouteSearch;
  routeState: LogoRouteRenderState;
  view: RotatedLogoViewState;
}): LogoRouteSearch {
  const nextSearch = buildLogoRouteSearch({
    ...routeState,
    elevationDegrees: view.elevationDegrees,
    rotationDegrees: view.rotationDegrees,
    themeModeSearch: routeSearch,
  });
  return preserveLogoRouteDevModeSearch(
    {
      ...nextSearch,
      elev:
        view.elevationDegrees !== defaultView.elevationDegrees
          ? Number(view.elevationDegrees.toFixed(1))
          : undefined,
      rot:
        view.rotationDegrees !== defaultView.rotationDegrees
          ? Number(view.rotationDegrees.toFixed(1))
          : undefined,
    },
    routeSearch,
  );
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function PublicLandingLogo({
  animateLeftFaceStripes = false,
  autoRotate = false,
  defaultView = DEFAULT_LANDING_LOGO_VIEW,
  enablePointerTilt = false,
  enableViewSnapping = true,
  loadInteractiveScene = true,
  presentationTiltNeutralProgress,
  presentationTiltTarget,
  replaceRouteSearch,
  routeSearch = EMPTY_LOGO_ROUTE_SEARCH,
  routeSearchSource = "url",
  stage = "compact",
  viewStatePersistence = "visit",
  viewStateKey = PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
}: {
  animateLeftFaceStripes?: boolean;
  autoRotate?: boolean;
  defaultView?: RotatedLogoViewState;
  enablePointerTilt?: boolean;
  enableViewSnapping?: boolean;
  loadInteractiveScene?: boolean;
  /** Zero captures the rendered tilt; one renders exact neutral. */
  presentationTiltNeutralProgress?: number;
  presentationTiltTarget?: LogoPresentationTiltTarget;
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
  const resolvedInitialView = readRotatedLogoViewState({
    defaultView,
    key: viewStateKey,
    persistence: viewStatePersistence,
  });
  const defaultElevationDegrees = resolvedInitialView.elevationDegrees;
  const defaultRotationDegrees = resolvedInitialView.rotationDegrees;
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        defaultView: {
          elevationDegrees: defaultElevationDegrees,
          rotationDegrees: defaultRotationDegrees,
        },
        enableViewSnapping,
        routeSearch,
        searchDefaultView: {
          elevationDegrees: defaultView.elevationDegrees,
          rotationDegrees: defaultView.rotationDegrees,
        },
        snapFallbackView: false,
      }),
    [
      defaultElevationDegrees,
      defaultRotationDegrees,
      defaultView.elevationDegrees,
      defaultView.rotationDegrees,
      enableViewSnapping,
      routeSearch,
    ],
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
  const [pointerTiltTarget, setPointerTiltTarget] = useState<LogoPresentationTiltTarget>(
    NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  );
  const stageRef = useRef<HTMLDivElement | null>(null);
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

    // Back, Forward, and caller-owned route changes replace the local
    // interaction view as one complete pose.
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
    // The page-wide mouse supplies ambient direction while the scene keeps its
    // own direct-manipulation events for dragging.
    const resetPointerTilt = () => {
      setPointerTiltTarget(NEUTRAL_LOGO_PRESENTATION_TILT_TARGET);
    };
    const setPointerTiltFromPoint = (clientX: number, clientY: number) => {
      const stage = stageRef.current;
      if (!stage) {
        return;
      }

      const nextTarget = getPointerLogoPresentationTiltTarget({
        bounds: stage.getBoundingClientRect(),
        clientX,
        clientY,
      });
      setPointerTiltTarget((currentTarget) =>
        currentTarget.horizontal === nextTarget.horizontal &&
        currentTarget.vertical === nextTarget.vertical
          ? currentTarget
          : nextTarget,
      );
    };

    if (
      !enablePointerTilt ||
      !isSceneInteractive ||
      prefersReducedMotion ||
      typeof window.matchMedia !== "function"
    ) {
      resetPointerTilt();
      return;
    }

    const pointerMediaQuery = window.matchMedia(POINTER_TILT_MEDIA_QUERY);
    const handleMousePointerMove = (event: PointerEvent) => {
      if (!event.isPrimary || event.pointerType !== "mouse" || !pointerMediaQuery.matches) {
        return;
      }

      setPointerTiltFromPoint(event.clientX, event.clientY);
    };
    const handlePointerCapabilityChange = () => {
      if (!pointerMediaQuery.matches) {
        resetPointerTilt();
      }
    };

    window.addEventListener("blur", resetPointerTilt);
    window.addEventListener("pointermove", handleMousePointerMove, { passive: true });
    pointerMediaQuery.addEventListener("change", handlePointerCapabilityChange);
    return () => {
      window.removeEventListener("blur", resetPointerTilt);
      window.removeEventListener("pointermove", handleMousePointerMove);
      pointerMediaQuery.removeEventListener("change", handlePointerCapabilityChange);
    };
  }, [enablePointerTilt, isSceneInteractive, prefersReducedMotion]);

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

  const activePresentationTiltTarget = prefersReducedMotion
    ? undefined
    : (presentationTiltTarget ?? (enablePointerTilt ? pointerTiltTarget : undefined));

  return (
    <div className={PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME_BY_STAGE[stage]}>
      <div
        ref={stageRef}
        data-testid={PUBLIC_LANDING_LOGO_STAGE_TEST_ID}
        className={PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME}
      >
        {/* The renderer handoff always crossfades because this transition
        preserves visual continuity rather than adding decorative motion. */}
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
          className={`${PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME} relative z-10 transition-opacity duration-300 ease-out ${isSvgFallbackVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
        {LogoScene && !didSceneFail ? (
          <div
            aria-hidden="true"
            data-testid={PUBLIC_LANDING_LOGO_SCENE_TEST_ID}
            data-state={isSceneReady ? "ready" : "loading"}
            data-elevation-degrees={view.elevationDegrees.toFixed(3)}
            data-presentation-horizontal-degrees={activePresentationTiltTarget?.horizontal.toFixed(
              3,
            )}
            data-presentation-neutral-progress={presentationTiltNeutralProgress?.toFixed(3)}
            data-presentation-vertical-degrees={activePresentationTiltTarget?.vertical.toFixed(3)}
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
              onInteractionEnd={(finalView) => {
                persistRotatedLogoViewState({
                  key: viewStateKey,
                  persistence: viewStatePersistence,
                  view: finalView,
                });
                replaceRouteSearch?.(
                  buildPublicLandingLogoRouteSearch({
                    defaultView,
                    routeSearch,
                    routeState,
                    view: finalView,
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
                setView(nextView);
              }}
              onVoxelEdit={ignoreLogoVoxelEdit}
              presentationTiltNeutralProgress={presentationTiltNeutralProgress}
              presentationTiltTarget={activePresentationTiltTarget}
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
