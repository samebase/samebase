import { getTailwindColorHex } from "@/components/logoTailwindColors";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_FACE_COLORS,
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
  PUBLIC_LANDING_LOGO_SRC,
  PUBLIC_LANDING_LOGO_STAGE_CLASS_NAME,
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
  PUBLIC_LANDING_LOGO_WIDTH,
} from "@/lib/publicLandingLogo";
import { useEffect, useRef, useState } from "react";

type LandingLogoSceneComponent =
  typeof import("@/components/NLogoScene").NLogoScene;

const AUTO_ROTATE_DEGREES_PER_SECOND = 18;

export function PublicLandingLogo({
  autoRotate = false,
}: {
  autoRotate?: boolean;
}) {
  const [LogoScene, setLogoScene] = useState<LandingLogoSceneComponent | null>(
    null,
  );
  const [didSceneFail, setDidSceneFail] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isSvgVisible, setIsSvgVisible] = useState(true);
  const [isAutoRotating, setIsAutoRotating] = useState(autoRotate);
  const [view, setView] = useState(() => ({
    elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
    rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
  }));
  const lastFrameTimeRef = useRef<number | null>(null);
  const backgroundColor = getTailwindColorHex("background-base");
  const isSceneInteractive = isSceneReady && !isSvgVisible;

  useEffect(() => {
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

          setLogoScene(() => module.NLogoScene);
        })
        .catch((error: unknown) => {
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
  }, []);

  useEffect(() => {
    if (!isSceneReady || !isSvgVisible) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setIsSvgVisible(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [isSceneReady, isSvgVisible]);

  useEffect(() => {
    setIsAutoRotating(autoRotate);
    lastFrameTimeRef.current = null;

    if (autoRotate) {
      return;
    }

    setView({
      elevationDegrees: STATIC_LOGO_ELEVATION_DEGREES,
      rotationDegrees: STATIC_LOGO_ROTATION_DEGREES,
    });
  }, [autoRotate]);

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
        setView((currentView) => ({
          ...currentView,
          rotationDegrees: normalizeRotationDegrees(
            currentView.rotationDegrees +
              deltaSeconds * AUTO_ROTATE_DEGREES_PER_SECOND,
          ),
        }));
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
          src={PUBLIC_LANDING_LOGO_SRC}
          alt={PUBLIC_LANDING_LOGO_ALT}
          width={PUBLIC_LANDING_LOGO_WIDTH}
          height={PUBLIC_LANDING_LOGO_HEIGHT}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          className={`${PUBLIC_LANDING_LOGO_IMAGE_CLASS_NAME} relative z-10 ${isSvgVisible ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
        {LogoScene && !didSceneFail ? (
          <div
            aria-hidden="true"
            data-testid={PUBLIC_LANDING_LOGO_SCENE_TEST_ID}
            data-state={isSceneReady ? "ready" : "loading"}
            className={`absolute inset-0 z-0 ${isSceneInteractive ? "pointer-events-auto touch-none" : "pointer-events-none"}`}
          >
            <LogoScene
              className={`h-full w-full ${isSceneInteractive ? "cursor-grab active:cursor-grabbing" : ""}`}
              backgroundColor={backgroundColor}
              editMode="add"
              elevationDegrees={view.elevationDegrees}
              faceColors={STATIC_LOGO_FACE_COLORS}
              opacity={1}
              onInteractionStart={() => {
                setIsAutoRotating(false);
              }}
              onRenderReady={() => {
                setIsSceneReady(true);
              }}
              onRenderUnavailable={() => {
                setDidSceneFail(true);
              }}
              onViewChange={(nextView) => {
                setView(nextView);
              }}
              onVoxelEdit={() => {}}
              rotationDegrees={view.rotationDegrees}
              shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
              voxelState={STATIC_LOGO_VOXEL_STATE}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
