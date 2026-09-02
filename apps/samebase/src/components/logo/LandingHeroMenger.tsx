import { MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS } from "@/components/logo/mengerAutomaticProbe";
import {
  createLogoRouteVoxelGrid,
  readLogoRouteRenderState,
} from "@/components/logo/logoRouteRenderState";
import { LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS } from "@/components/logo/logoSceneCameraDepth";
import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import { useTouchFirstCoarsePointer } from "@/hooks/pointerCapabilities";
import {
  PUBLIC_LANDING_MENGER_FALLBACK_TEST_ID,
  PUBLIC_LANDING_MENGER_TEST_ID,
} from "@/lib/publicLanding";
import { PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE } from "@/lib/publicLandingLogo";
import { clearPublicLandingLogoStaticFallbackPrehydration } from "@/lib/publicLandingLogoPrehydration";
import { MENGER_HOVER_DEFAULT_REVEAL_RADIUS } from "@samebase/logo-model/menger-hover";
import { LOGO_GRID_SIZE_3, MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/routeSearch/logo";
import {
  replaceRootLogoRouteSearch,
  useRootRouteSearch,
  type RootRouteSearch,
} from "@/routeSearch/root";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type MengerTypeGpuSceneComponent =
  typeof import("@/components/logo/MengerTypeGpuScene").MengerTypeGpuScene;

const LANDING_HERO_STATIC_VOXEL_GRID = createLogoRouteVoxelGrid({
  fractalDepth: 1,
  gridSize: LOGO_GRID_SIZE_3,
  voxelState: MENGER_SPONGE_VOXEL_STATE,
});
const LANDING_HERO_MENGER_DEPTH = 5;
const LANDING_HERO_DEFAULT_VIEW: LogoViewState = {
  elevationDegrees: 0,
  rotationDegrees: 0,
};

let cachedMengerTypeGpuScene: MengerTypeGpuSceneComponent | null = null;
let didMengerTypeGpuSceneRenderFail = false;

function buildLandingHeroMengerRouteSearch({
  rootRouteSearch,
  routeState,
  view,
}: {
  rootRouteSearch: LogoRouteSearch;
  routeState: Parameters<typeof buildLogoRouteSearch>[0];
  view: LogoViewState;
}) {
  return preserveLogoRouteDevModeSearch(
    {
      ...buildLogoRouteSearch({
        ...routeState,
        elevationDegrees: view.elevationDegrees,
        rotationDegrees: view.rotationDegrees,
        themeModeSearch: rootRouteSearch,
      }),
      elev:
        view.elevationDegrees !== LANDING_HERO_DEFAULT_VIEW.elevationDegrees
          ? Number(view.elevationDegrees.toFixed(1))
          : undefined,
      rot:
        view.rotationDegrees !== LANDING_HERO_DEFAULT_VIEW.rotationDegrees
          ? Number(view.rotationDegrees.toFixed(1))
          : undefined,
    },
    rootRouteSearch,
  );
}

/**
The hero keeps a static Menger mark until the desktop-only slot has size and
the interactive scene completes its first render. A hidden pane does not own
a GPU renderer or page-wide pointer listeners.
*/
export function LandingHeroMenger({ placement }: { placement: "preview" | "root" }) {
  const navigate = useNavigate();
  const isCoarsePointer = useTouchFirstCoarsePointer();
  const rootRouteSearch = useRootRouteSearch();
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        defaultView: LANDING_HERO_DEFAULT_VIEW,
        routeSearch: rootRouteSearch,
        searchDefaultView: LANDING_HERO_DEFAULT_VIEW,
      }),
    [rootRouteSearch],
  );
  const automaticProbe = useMemo(
    () => ({
      ...MENGER_AUTOMATIC_PROBE_DEFAULT_SETTINGS,
      enabled: isCoarsePointer,
      showPath: false,
    }),
    [isCoarsePointer],
  );
  const resolvedTheme = useResolvedAppThemeColorState(routeState.themeColors);
  const leftFaceColor = resolvedTheme.faceColors.left;
  const rightFaceColor = resolvedTheme.faceColors.right;
  const topFaceColor = resolvedTheme.faceColors.top;
  const faceColors = useMemo(
    () => ({
      left: leftFaceColor,
      right: rightFaceColor,
      top: topFaceColor,
    }),
    [leftFaceColor, rightFaceColor, topFaceColor],
  );
  const [view, setView] = useState<LogoViewState>(() => ({
    elevationDegrees: routeState.elevationDegrees,
    rotationDegrees: routeState.rotationDegrees,
  }));
  const [MengerTypeGpuScene, setMengerTypeGpuScene] = useState<MengerTypeGpuSceneComponent | null>(
    () => cachedMengerTypeGpuScene,
  );
  const [didSceneFail, setDidSceneFail] = useState(() => didMengerTypeGpuSceneRenderFail);
  const [hasSlotSize, setHasSlotSize] = useState(false);
  const [isHydratedFallbackVisibilityReady, setIsHydratedFallbackVisibilityReady] = useState(false);
  const [isSlotIntersecting, setIsSlotIntersecting] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const isSceneActive = hasSlotSize && isSlotIntersecting && !didSceneFail;
  const staticFallbackView = useMemo(
    () => ({
      elevationDegrees: routeState.elevationDegrees,
      rotationDegrees: routeState.rotationDegrees,
    }),
    [routeState.elevationDegrees, routeState.rotationDegrees],
  );
  const staticLogoSvgSrc = useMemo(
    () =>
      `${createStaticLogoSvgDataUrl({
        cameraFrustumPadding: 1,
        depth: 1,
        faceColors,
        filledVoxels: LANDING_HERO_STATIC_VOXEL_GRID.filledVoxels,
        gridSize: LANDING_HERO_STATIC_VOXEL_GRID.gridSize,
        view: staticFallbackView,
      })}#${resolvedTheme.cacheKey}:${staticFallbackView.elevationDegrees}:${staticFallbackView.rotationDegrees}`,
    [faceColors, resolvedTheme.cacheKey, staticFallbackView],
  );
  useLayoutEffect(() => {
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

    setView((currentView) =>
      currentView.elevationDegrees === nextView.elevationDegrees &&
      currentView.rotationDegrees === nextView.rotationDegrees
        ? currentView
        : nextView,
    );
  }, [routeState.elevationDegrees, routeState.rotationDegrees]);

  useEffect(() => {
    const slot = slotRef.current;
    if (slot === null) {
      return;
    }

    const syncSlotSize = () => {
      const nextHasSlotSize = slot.clientWidth > 0 && slot.clientHeight > 0;
      setHasSlotSize(nextHasSlotSize);
      if (!nextHasSlotSize) {
        setIsSceneReady(false);
      }
    };
    let firstIntersectionFrame = 0;
    let secondIntersectionFrame = 0;
    const cancelPendingIntersection = () => {
      window.cancelAnimationFrame(firstIntersectionFrame);
      window.cancelAnimationFrame(secondIntersectionFrame);
      firstIntersectionFrame = 0;
      secondIntersectionFrame = 0;
    };
    const resizeObserver = new ResizeObserver(syncSlotSize);
    const intersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (!entry) {
        return;
      }

      cancelPendingIntersection();
      if (!entry.isIntersecting) {
        setIsSlotIntersecting(false);
        setIsSceneReady(false);
        return;
      }

      // Route scroll restoration must move an off-screen hero before depth 5
      // allocates its GPU scene from the first top-of-page paint.
      firstIntersectionFrame = window.requestAnimationFrame(() => {
        secondIntersectionFrame = window.requestAnimationFrame(() => {
          setIsSlotIntersecting(true);
        });
      });
    });
    resizeObserver.observe(slot);
    intersectionObserver.observe(slot);
    syncSlotSize();

    return () => {
      cancelPendingIntersection();
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isSceneActive || MengerTypeGpuScene !== null) {
      return;
    }
    if (cachedMengerTypeGpuScene !== null) {
      setMengerTypeGpuScene(() => cachedMengerTypeGpuScene);
      return;
    }

    let cancelled = false;
    let idleCallbackId: number | null = null;
    let frameId = 0;
    let secondFrameId = 0;
    const loadScene = () => {
      void import("@/components/logo/MengerTypeGpuScene")
        .then((module) => {
          if (cancelled) {
            return;
          }

          cachedMengerTypeGpuScene = module.MengerTypeGpuScene;
          setMengerTypeGpuScene(() => module.MengerTypeGpuScene);
        })
        .catch((error: unknown) => {
          if (cancelled) {
            return;
          }
          console.error("Failed to load landing Menger scene", error);
          setDidSceneFail(true);
        });
    };

    if (typeof window.requestIdleCallback === "function") {
      idleCallbackId = window.requestIdleCallback(loadScene, { timeout: 1200 });
    } else {
      frameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(loadScene);
      });
    }

    return () => {
      cancelled = true;
      if (idleCallbackId !== null && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleCallbackId);
      }
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(secondFrameId);
    };
  }, [isSceneActive, MengerTypeGpuScene]);

  const commitView = useCallback(
    (finalView: LogoViewState) => {
      const nextLogoSearch = buildLandingHeroMengerRouteSearch({
        rootRouteSearch,
        routeState,
        view: finalView,
      });
      void navigate({
        hash: true,
        replace: true,
        resetScroll: false,
        search: (currentSearch: RootRouteSearch) =>
          replaceRootLogoRouteSearch(currentSearch, nextLogoSearch),
        state: true,
        to: ".",
      });
    },
    [navigate, rootRouteSearch, routeState],
  );
  const markSceneReady = useCallback(() => {
    setIsSceneReady(true);
  }, []);
  const markSceneUnavailable = useCallback(() => {
    didMengerTypeGpuSceneRenderFail = true;
    setDidSceneFail(true);
    setIsSceneReady(false);
  }, []);

  return (
    <div
      ref={slotRef}
      className={
        placement === "root"
          ? "relative mx-auto aspect-square min-h-0 w-full cursor-grab active:cursor-grabbing"
          : "relative hidden min-h-0 cursor-grab active:cursor-grabbing @3xl:block @3xl:aspect-square"
      }
      data-state={didSceneFail ? "fallback" : isSceneReady ? "ready" : "loading"}
      data-testid={
        placement === "root" ? PUBLIC_LANDING_MENGER_TEST_ID : "landing-preview-hero-menger"
      }
      style={placement === "root" ? { maxWidth: "min(44rem, calc(100svh - 12rem))" } : undefined}
    >
      <img
        key={isHydratedFallbackVisibilityReady ? "hydrated" : "prehydration"}
        alt=""
        aria-hidden="true"
        className={
          isSceneReady
            ? "pointer-events-none absolute inset-0 z-10 h-full w-full object-contain opacity-0 transition-opacity duration-300 ease-out"
            : "pointer-events-none absolute inset-0 z-10 h-full w-full object-contain opacity-100 transition-opacity duration-300 ease-out"
        }
        {...{ [PUBLIC_LANDING_LOGO_STATIC_FALLBACK_ATTRIBUTE]: "" }}
        data-testid={
          placement === "root"
            ? PUBLIC_LANDING_MENGER_FALLBACK_TEST_ID
            : "landing-preview-hero-menger-fallback"
        }
        decoding="async"
        height="360"
        src={staticLogoSvgSrc}
        style={{ padding: LOGO_SCENE_CAMERA_EDGE_CLEARANCE_CSS_PIXELS }}
        width="360"
      />
      {isSceneActive && MengerTypeGpuScene !== null ? (
        <div className="absolute inset-0 z-0">
          <MengerTypeGpuScene
            automaticProbe={automaticProbe}
            backgroundColor={resolvedTheme.backgroundColor}
            cameraFrustumPadding={1}
            depth={LANDING_HERO_MENGER_DEPTH}
            elevationDegrees={view.elevationDegrees}
            faceColors={faceColors}
            onInteractionEnd={commitView}
            onRenderReady={markSceneReady}
            onRenderUnavailable={markSceneUnavailable}
            onViewChange={setView}
            resolutionScale={1}
            revealRadius={MENGER_HOVER_DEFAULT_REVEAL_RADIUS}
            rotationDegrees={view.rotationDegrees}
            viewSnapEnabled={routeState.viewSnapEnabled}
          />
        </div>
      ) : null}
    </div>
  );
}
