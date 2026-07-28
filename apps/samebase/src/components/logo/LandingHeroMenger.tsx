import {
  LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE,
  LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE,
} from "@/components/logo/logoPresentationTilt";
import {
  createLogoRouteVoxelGrid,
  readLogoRouteRenderState,
} from "@/components/logo/logoRouteRenderState";
import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import { type LogoViewState } from "@/components/logo/logoViewDrag";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import {
  MENGER_HOVER_DEFAULT_DEPTH,
  MENGER_HOVER_DEFAULT_REVEAL_RADIUS,
} from "@samebase/logo-model/menger-hover";
import { LOGO_GRID_SIZE_3, MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import {
  buildLogoRouteSearch,
  preserveLogoRouteDevModeSearch,
  type LogoRouteSearch,
} from "@/routeSearch/logo";
import { replaceRootLogoRouteSearch, useRootRouteSearch } from "@/routeSearch/root";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

type MengerHoverSceneComponent =
  typeof import("@/components/logo/MengerHoverScene").MengerHoverScene;

const LANDING_HERO_STATIC_VOXEL_GRID = createLogoRouteVoxelGrid({
  fractalDepth: 1,
  gridSize: LOGO_GRID_SIZE_3,
  voxelState: MENGER_SPONGE_VOXEL_STATE,
});
const LANDING_HERO_DEFAULT_VIEW: LogoViewState = {
  elevationDegrees: 0,
  rotationDegrees: 0,
};

let cachedMengerHoverScene: MengerHoverSceneComponent | null = null;
let didMengerHoverSceneRenderFail = false;

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
a WebGL renderer or page-wide pointer listeners.
*/
export function LandingHeroMenger() {
  const navigate = useNavigate();
  const rootRouteSearch = useRootRouteSearch();
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        defaultView: LANDING_HERO_DEFAULT_VIEW,
        renderMode: "three",
        routeSearch: rootRouteSearch,
        searchDefaultView: LANDING_HERO_DEFAULT_VIEW,
      }),
    [rootRouteSearch],
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
  const [MengerHoverScene, setMengerHoverScene] = useState<MengerHoverSceneComponent | null>(
    () => cachedMengerHoverScene,
  );
  const [didSceneFail, setDidSceneFail] = useState(() => didMengerHoverSceneRenderFail);
  const [hasSlotSize, setHasSlotSize] = useState(false);
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
        depth: 1,
        faceColors,
        filledVoxels: LANDING_HERO_STATIC_VOXEL_GRID.filledVoxels,
        gridSize: LANDING_HERO_STATIC_VOXEL_GRID.gridSize,
        view: staticFallbackView,
      })}#${resolvedTheme.cacheKey}:${staticFallbackView.elevationDegrees}:${staticFallbackView.rotationDegrees}`,
    [faceColors, resolvedTheme.cacheKey, staticFallbackView],
  );

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
    const resizeObserver = new ResizeObserver(syncSlotSize);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      const nextIsSlotIntersecting = entry.isIntersecting;
      setIsSlotIntersecting(nextIsSlotIntersecting);
      if (!nextIsSlotIntersecting) {
        setIsSceneReady(false);
      }
    });
    resizeObserver.observe(slot);
    intersectionObserver.observe(slot);
    syncSlotSize();

    return () => {
      intersectionObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isSceneActive || MengerHoverScene !== null) {
      return;
    }
    if (cachedMengerHoverScene !== null) {
      setMengerHoverScene(() => cachedMengerHoverScene);
      return;
    }

    let cancelled = false;
    let idleCallbackId: number | null = null;
    let frameId = 0;
    let secondFrameId = 0;
    const loadScene = () => {
      void import("@/components/logo/MengerHoverScene")
        .then((module) => {
          if (cancelled) {
            return;
          }

          cachedMengerHoverScene = module.MengerHoverScene;
          setMengerHoverScene(() => module.MengerHoverScene);
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
  }, [isSceneActive, MengerHoverScene]);

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
        search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextLogoSearch),
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
    didMengerHoverSceneRenderFail = true;
    setDidSceneFail(true);
    setIsSceneReady(false);
  }, []);

  return (
    <div
      ref={slotRef}
      className="relative hidden min-h-0 @3xl:block"
      data-state={didSceneFail ? "fallback" : isSceneReady ? "ready" : "loading"}
      data-testid="landing-preview-hero-menger"
    >
      <img
        alt=""
        aria-hidden="true"
        className={
          isSceneReady
            ? "pointer-events-none absolute inset-0 z-10 h-full w-full object-contain opacity-0 transition-opacity duration-300 ease-out"
            : "pointer-events-none absolute inset-0 z-10 h-full w-full object-contain opacity-100 transition-opacity duration-300 ease-out"
        }
        data-testid="landing-preview-hero-menger-fallback"
        decoding="async"
        height="360"
        src={staticLogoSvgSrc}
        width="360"
      />
      {isSceneActive && MengerHoverScene !== null ? (
        <div className="absolute inset-0 z-0">
          <MengerHoverScene
            elevationDegrees={view.elevationDegrees}
            faceColors={faceColors}
            maximumDepth={MENGER_HOVER_DEFAULT_DEPTH}
            onInteractionEnd={commitView}
            onRenderReady={markSceneReady}
            onRenderUnavailable={markSceneUnavailable}
            onViewChange={setView}
            pointerTiltEnabled
            pointerTiltRadiusScale={LOGO_PRESENTATION_TILT_DEFAULT_RADIUS_SCALE}
            pointerTiltStrengthScale={LOGO_PRESENTATION_TILT_DEFAULT_STRENGTH_SCALE}
            revealRadius={MENGER_HOVER_DEFAULT_REVEAL_RADIUS}
            rotationDegrees={view.rotationDegrees}
            viewSnapEnabled={routeState.viewSnapEnabled}
          />
        </div>
      ) : null}
    </div>
  );
}
