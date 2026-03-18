import { getTailwindColorHex } from "@/components/logoTailwindColors";
import {
  STATIC_LOGO_ELEVATION_DEGREES,
  STATIC_LOGO_FACE_COLORS,
  STATIC_LOGO_ROTATION_DEGREES,
  STATIC_LOGO_VOXEL_STATE,
} from "@/components/logoStaticSvgContract";
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
import { useEffect, useState } from "react";

type LandingLogoSceneComponent =
  typeof import("@/components/NLogoScene").NLogoScene;

export function PublicLandingLogo() {
  const [LogoScene, setLogoScene] = useState<LandingLogoSceneComponent | null>(
    null,
  );
  const [didSceneFail, setDidSceneFail] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const [isSvgVisible, setIsSvgVisible] = useState(true);
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
            className="pointer-events-none absolute inset-0 z-0"
          >
            <LogoScene
              className="h-full w-full"
              backgroundColor={backgroundColor}
              editMode="add"
              elevationDegrees={STATIC_LOGO_ELEVATION_DEGREES}
              faceColors={STATIC_LOGO_FACE_COLORS}
              opacity={1}
              onRenderReady={() => {
                setIsSceneReady(true);
              }}
              onRenderUnavailable={() => {
                setDidSceneFail(true);
              }}
              onViewChange={(_nextView) => {}}
              onVoxelEdit={() => {}}
              rotationDegrees={STATIC_LOGO_ROTATION_DEGREES}
              shuffleAnimation={{ enabled: false, parallelMoves: 1 }}
              voxelState={STATIC_LOGO_VOXEL_STATE}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
