import {
  DEFAULT_FACE_COLORS,
  type FaceColors,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_STATE,
} from "@/components/logoStaticSvgContract";
import { normalizeRotationDegrees } from "@/components/logoVoxelState";
import {
  PUBLIC_LANDING_LOGO_ALT,
  PUBLIC_LANDING_LOGO_CONTAINER_CLASS_NAME,
  PUBLIC_LANDING_LOGO_HEIGHT,
  PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG,
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
} from "@/lib/rotatedLogoViewState";
import { useOptionalPublicLandingLogoLink } from "@/hooks/useOptionalPublicLandingLogoLink";
import { useCallback, useEffect, useRef, useState } from "react";

type LandingLogoSceneComponent =
  typeof import("@/components/NLogoScene").NLogoScene;

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;
const AUTO_ROTATE_RESUME_DURATION_MS = 220;
const AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER = 0.4;

const DEFAULT_LANDING_LOGO_VIEW: RotatedLogoViewState = {
  elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
  rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
};
const STATIC_LOGO_SVG_SRC = createStaticLogoSvgDataUrl();

let cachedLandingLogoScene: LandingLogoSceneComponent | null = null;
// Unsupported renderer paths can loop on remount, so keep that failure sticky
// for the session while still allowing later chunk loads to retry.
let didLandingLogoSceneRenderFail = false;

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}

export function PublicLandingLogo({
  autoRotate = false,
  enableViewSnapping = true,
  loadInteractiveScene = true,
  viewStateKey = PUBLIC_LANDING_LOGO_VIEW_STATE_KEY,
}: {
  autoRotate?: boolean;
  enableViewSnapping?: boolean;
  loadInteractiveScene?: boolean;
  viewStateKey?: RotatedLogoViewStateKey;
}) {
  const [LogoScene, setLogoScene] = useState<LandingLogoSceneComponent | null>(
    () => (loadInteractiveScene ? cachedLandingLogoScene : null),
  );
  const [didSceneFail, setDidSceneFail] = useState(
    () => didLandingLogoSceneRenderFail,
  );
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isSvgVisible, setIsSvgVisible] = useState(true);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);
  const [view, setView] = useState<RotatedLogoViewState>(() =>
    readRotatedLogoViewState(viewStateKey, DEFAULT_LANDING_LOGO_VIEW),
  );
  const publicLandingLogoLink = useOptionalPublicLandingLogoLink();
  const latestViewRef = useRef(view);
  const lastFrameTimeRef = useRef<number | null>(null);
  const autoRotateResumeStartedAtRef = useRef<number | null>(null);
  const backgroundColor = getTailwindColorHex("background-base");
  const faceColors: FaceColors = {
    left: DEFAULT_FACE_COLORS.left,
    right: DEFAULT_FACE_COLORS.right,
    top: DEFAULT_FACE_COLORS.top,
  };
  const isSceneInteractive = isSceneReady && !isSvgVisible;
  const persistLatestLogoView = useCallback(() => {
    persistRotatedLogoViewState(viewStateKey, latestViewRef.current);
  }, [viewStateKey]);

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
      void import("@/components/NLogoScene")
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
      if (
        idleCallbackId !== null &&
        typeof window.cancelIdleCallback === "function"
      ) {
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

    publicLandingLogoLink.setIsLogoLinkVisible(
      shouldRevealPublicLandingLogoLink(view),
    );
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
            (1 - AUTO_ROTATE_RESUME_MIN_SPEED_MULTIPLIER) *
              easeOutCubic(progress);
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
          src={STATIC_LOGO_SVG_SRC}
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
              className={`h-full w-full ${isSceneInteractive ? "cursor-grab active:cursor-grabbing" : ""}`}
              backgroundColor={backgroundColor}
              editMode="add"
              elevationDegrees={view.elevationDegrees}
              faceColors={faceColors}
              opacity={1}
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
              onVoxelEdit={() => {}}
              rotationDegrees={view.rotationDegrees}
              shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
              animateFaceColors={false}
              viewDragConfig={
                enableViewSnapping
                  ? PUBLIC_LANDING_LOGO_VIEW_DRAG_CONFIG
                  : undefined
              }
              voxelState={STATIC_LOGO_VOXEL_STATE}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
