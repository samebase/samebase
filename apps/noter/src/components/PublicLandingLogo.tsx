import {
  DEFAULT_FACE_COLORS,
  getTailwindColorHex,
} from "@/components/logoTailwindColors";
import {
  LOGO_ISOMETRIC_ELEVATION_DEGREES,
  LOGO_ISOMETRIC_ROTATION_DEGREES,
} from "@/components/logoIsometricRenderer";
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
import { DEFAULT_VOXEL_STATE } from "@/components/logoVoxelState";
import { useEffect, useState } from "react";

type LandingLogoSceneComponent =
  typeof import("@/components/NLogoScene").NLogoScene;

export function PublicLandingLogo() {
  const [LogoScene, setLogoScene] = useState<LandingLogoSceneComponent | null>(
    null,
  );
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isSvgVisible, setIsSvgVisible] = useState(true);
  const [rotationDegrees, setRotationDegrees] = useState(
    LOGO_ISOMETRIC_ROTATION_DEGREES,
  );
  const [elevationDegrees, setElevationDegrees] = useState(
    LOGO_ISOMETRIC_ELEVATION_DEGREES,
  );
  const backgroundColor = getTailwindColorHex("background-base");

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
        {LogoScene ? (
          <div
            aria-hidden="true"
            data-testid={PUBLIC_LANDING_LOGO_SCENE_TEST_ID}
            data-state={isSceneReady ? "ready" : "loading"}
            className={`absolute inset-0 z-0 ${isSvgVisible ? "pointer-events-none" : ""}`}
          >
            <LogoScene
              className="h-full w-full touch-none"
              backgroundColor={backgroundColor}
              elevationDegrees={elevationDegrees}
              faceColors={DEFAULT_FACE_COLORS}
              onRenderReady={() => {
                setIsSceneReady(true);
              }}
              onViewChange={(nextView) => {
                setElevationDegrees(nextView.elevationDegrees);
                setRotationDegrees(nextView.rotationDegrees);
              }}
              onVoxelEdit={() => {}}
              rotationDegrees={rotationDegrees}
              shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
              voxelState={DEFAULT_VOXEL_STATE}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
