import { normalizeRotationDegrees } from "@/components/logo/logoVoxelState";
import { createLogoRouteStaticSvgSrc } from "@/components/logo/logoRouteStaticSvg";
import { readLogoRouteState, type LogoRouteState } from "@/components/logo/logoRouteState";
import { type LogoRouteSearch } from "@/lib/logoRouteSearch";
import {
  PUBLIC_LANDING_LOGO_ALT,
  PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME,
  PUBLIC_LANDING_LOGO_HEIGHT,
  PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_WIDTH,
  shouldRevealPublicLandingLogoLink,
} from "@/lib/publicLandingLogo";
import {
  cacheRotatedLogoViewState,
  persistRotatedLogoViewState,
  PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
  readRotatedLogoViewState,
  type RotatedLogoViewState,
  type RotatedLogoViewStateKey,
  type RotatedLogoViewStatePersistence,
} from "@/lib/rotatedLogoViewState";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import { useOptionalPublicLandingLogoLink } from "@/hooks/useOptionalPublicLandingLogoLink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type LandingLogoSceneComponent =
  typeof import("@/components/logo/LogoRouteMarkScene").LogoRouteMarkScene;

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const AUTO_ROTATE_RESUME_DURATION_MS = 220;
const AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER = 0.4;
const REDUCED_MOTION_MEDIA_QUERY = "(prefers-reduced-motion: reduce)";
// The canvas receives the requested depth; the SVG fallback stays cheap enough
// to render before the interactive scene is ready.
const LANDING_STATIC_SVG_FALLBACK_DEPTH = 3;

let cachedLandingLogoScene: LandingLogoSceneComponent | null = null;
// Unsupported renderer paths can loop on remount, so keep that failure sticky
// for the session while still allowing later chunk loads to retry.
let didLandingLogoSceneRenderFail = false;

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

function hasLogoRouteViewSearch(routeSearch: LogoRouteSearch): boolean {
  return typeof routeSearch.elev === "number" || typeof routeSearch.rot === "number";
}

export function PublicLandingLogo({
  animateLeftFaceStripes = false,
  autoRotate = false,
  enableViewSnapping = true,
  loadInteractiveScene = true,
  routeSearch = {},
  viewStatePersistence = "visit",
  viewStateKey = PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
}: {
  animateLeftFaceStripes?: boolean;
  autoRotate?: boolean;
  enableViewSnapping?: boolean;
  loadInteractiveScene?: boolean;
  routeSearch?: LogoRouteSearch;
  viewStatePersistence?: RotatedLogoViewStatePersistence;
  viewStateKey?: RotatedLogoViewStateKey;
}) {
  const routeState = useMemo(() => readLogoRouteState(routeSearch, "three"), [routeSearch]);
  const logoRouteState = useMemo(
    () =>
      enableViewSnapping
        ? routeState
        : {
            ...routeState,
            isViewSnapEnabled: false,
          },
    [enableViewSnapping, routeState],
  );
  const routeView = useMemo(
    () => ({
      elevationDegrees: logoRouteState.elevationDegrees,
      rotationDegrees: logoRouteState.rotationDegrees,
    }),
    [logoRouteState.elevationDegrees, logoRouteState.rotationDegrees],
  );
  const routeViewSearchEnabled = hasLogoRouteViewSearch(routeSearch);
  const readStoredLogoView = useCallback(
    () =>
      readRotatedLogoViewState({
        defaultView: routeView,
        key: viewStateKey,
        persistence: viewStatePersistence,
      }),
    [routeView, viewStateKey, viewStatePersistence],
  );
  const [LogoScene, setLogoScene] = useState<LandingLogoSceneComponent | null>(() =>
    loadInteractiveScene ? cachedLandingLogoScene : null,
  );
  const [didSceneFail, setDidSceneFail] = useState(() => didLandingLogoSceneRenderFail);
  const logoTheme = useResolvedAppThemeColorState(routeSearch);
  const { backgroundColor, faceColors } = logoTheme;
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isSvgVisible, setIsSvgVisible] = useState(true);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [view, setView] = useState<RotatedLogoViewState>(() =>
    routeViewSearchEnabled ? routeView : readStoredLogoView(),
  );
  const visibleLogoState: LogoRouteState = useMemo(
    () => ({
      ...logoRouteState,
      elevationDegrees: view.elevationDegrees,
      rotationDegrees: view.rotationDegrees,
    }),
    [logoRouteState, view.elevationDegrees, view.rotationDegrees],
  );
  const staticFallbackDepth = Math.min(
    visibleLogoState.fractalDepth,
    LANDING_STATIC_SVG_FALLBACK_DEPTH,
  );
  const staticLogoSvgSrc = createLogoRouteStaticSvgSrc({
    cacheKey: logoTheme.cacheKey,
    faceColors,
    fractalDepth: staticFallbackDepth,
    state: visibleLogoState,
    view,
  });
  const publicLandingLogoLink = useOptionalPublicLandingLogoLink();
  const latestViewRef = useRef(view);
  const lastFrameTimeRef = useRef<number | null>(null);
  const autoRotateResumeStartedAtRef = useRef<number | null>(null);
  const isSceneInteractive = isSceneReady && !isSvgVisible;
  const shouldAnimateLeftFaceStripes = animateLeftFaceStripes && !prefersReducedMotion;
  const persistLatestLogoView = useCallback(() => {
    persistRotatedLogoViewState({
      key: viewStateKey,
      persistence: viewStatePersistence,
      view: latestViewRef.current,
    });
  }, [viewStateKey, viewStatePersistence]);

  useEffect(() => {
    const nextView = routeViewSearchEnabled ? routeView : readStoredLogoView();
    latestViewRef.current = nextView;
    setView(nextView);
  }, [readStoredLogoView, routeView, routeViewSearchEnabled]);

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
      void import("@/components/logo/LogoRouteMarkScene")
        .then((module) => {
          if (cancelled) {
            return;
          }

          cachedLandingLogoScene = module.LogoRouteMarkScene;
          setLogoScene(() => module.LogoRouteMarkScene);
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
    setIsAutoRotating(autoRotate);
    lastFrameTimeRef.current = null;
    autoRotateResumeStartedAtRef.current = null;
  }, [autoRotate]);

  useEffect(() => {
    latestViewRef.current = view;
    cacheRotatedLogoViewState(viewStateKey, view);
  }, [view, viewStateKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handlePageHide = () => {
      persistLatestLogoView();
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      persistLatestLogoView();
    };
  }, [persistLatestLogoView]);

  useEffect(() => {
    if (publicLandingLogoLink === null) {
      return;
    }

    publicLandingLogoLink.setIsLogoLinkVisible(shouldRevealPublicLandingLogoLink(view));
  }, [publicLandingLogoLink, view]);

  useEffect(() => {
    if (publicLandingLogoLink === null) {
      return;
    }

    return () => {
      publicLandingLogoLink.setIsLogoLinkVisible(false);
    };
  }, [publicLandingLogoLink]);

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
            rotationDegrees: normalizeRotationDegrees(
              currentView.rotationDegrees +
                deltaSeconds * AUTO_ROTATE_DEGREES_PER_SECOND * speedMultiplier,
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
    <div className={PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME}>
      <div
        data-testid={PUBLIC_LANDING_LOGO_STAGE_TEST_ID}
        className={PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME}
      >
        <img
          data-testid={PUBLIC_LANDING_LOGO_TEST_ID}
          src={staticLogoSvgSrc}
          alt={PUBLIC_LANDING_LOGO_ALT}
          width={PUBLIC_LANDING_LOGO_WIDTH}
          height={PUBLIC_LANDING_LOGO_HEIGHT}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className={`${PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME} relative z-10 transition-opacity duration-150 ease-out motion-reduce:transition-none ${isSvgVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
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
              backgroundColor={backgroundColor}
              className={`h-full w-full ${isSceneInteractive ? "active:cursor-grabbing" : ""}`}
              faceColors={faceColors}
              onInteractionStart={() => {
                autoRotateResumeStartedAtRef.current = null;
                setIsAutoRotating(false);
              }}
              onInteractionEnd={() => {
                persistLatestLogoView();
                if (!autoRotate) {
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
              state={visibleLogoState}
              animateFaceColors={false}
              animateLeftFaceStripes={shouldAnimateLeftFaceStripes}
              voxelEditingEnabled={false}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
