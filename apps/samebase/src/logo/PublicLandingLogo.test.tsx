// @vitest-environment jsdom

import { createContext, Script } from "node:vm";
import * as React from "react";
import { flushSync } from "react-dom";
import { createRoot, hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { PublicLandingLogo } from "@/logo/PublicLandingLogo";
import { getLogoRendererFractalDepthHardMax } from "@/logo/logoDepthLimits";
import { LOGO_SECONDARY_LEFT_FACE_STYLE } from "@samebase/logo-model/left-face-style";
import {
  NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
  type LogoPresentationTiltTarget,
} from "@/logo/logoPresentationTilt";
import { STATIC_LOGO_GRID_SIZE } from "@samebase/logo-model/identity";
import { createStaticLogoSvgDataUrl } from "@/logo/logoStaticSvgAsset";
import {
  DEFAULT_ELEVATION_DEGREES,
  DEFAULT_ROTATION_DEGREES,
  LOGO_GRID_SIZE_2,
  createFilledVoxelSet,
  createLogoFractalVoxelGrid,
  serializeVoxelState,
} from "@samebase/logo-model/voxel";
import { resolveAppThemeColorState, syncDocumentThemeColorSearch } from "@/lib/appThemeColorSearch";
import {
  clearPublicLandingLogoStaticFallbackPrehydration,
  publicLandingLogoPrehydrationScript,
} from "@/logo/publicLandingLogoPrehydration";
import {
  clearRotatedLogoViewStates,
  DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY,
} from "@/logo/rotatedLogoViewState";
import {
  PUBLIC_LANDING_LOGO_STAGE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "@/logo/publicLandingLogoConstants";
import { type LogoRouteSearch } from "@/routeSearch/logo";

type MockLandingLogoSceneProps = {
  elevationDegrees: number;
  onInteractionStart?: () => void;
  onInteractionEnd?: (finalView: { elevationDegrees: number; rotationDegrees: number }) => void;
  onRenderReady?: () => void;
  onViewChange: (nextView: { elevationDegrees: number; rotationDegrees: number }) => void;
  presentationTiltNeutralProgress?: number;
  presentationTiltTarget?: LogoPresentationTiltTarget;
  rotationDegrees: number;
  shuffleAnimation: { enabled: boolean };
  voxelGrid: unknown;
};

const { latestLandingLogoSceneProps } = vi.hoisted<{
  latestLandingLogoSceneProps: { current: MockLandingLogoSceneProps | null };
}>(() => ({
  latestLandingLogoSceneProps: {
    current: null,
  },
}));

vi.mock("@/logo/NLogoScene", () => ({
  NLogoScene: (props: MockLandingLogoSceneProps) => {
    latestLandingLogoSceneProps.current = props;
    return <div data-testid="mock-public-landing-logo-scene" />;
  },
}));

const { act } = React;
const originalMatchMedia = window.matchMedia;

function installLocalStorageStub() {
  const entries = new Map<string, string>();
  const localStorageStub: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(key);
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
  };

  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageStub,
  });
}

function installMotionMediaQueries({
  finePointer,
  reducedMotion,
}: {
  finePointer: boolean;
  reducedMotion: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
      matches:
        (query === "(hover: hover) and (pointer: fine)" && finePointer) ||
        (query === "(prefers-reduced-motion: reduce)" && reducedMotion),
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

function dispatchPrimaryMouseMove(clientX: number, clientY: number) {
  const event = new MouseEvent("pointermove", { clientX, clientY });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerType: { value: "mouse" },
  });
  window.dispatchEvent(event);
}

function installImmediateIdleCallback() {
  Object.defineProperty(window, "requestIdleCallback", {
    configurable: true,
    value: (callback: IdleRequestCallback): number => {
      callback({
        didTimeout: false,
        timeRemaining: () => 50,
      });
      return 1;
    },
  });
  Object.defineProperty(window, "cancelIdleCallback", {
    configurable: true,
    value: () => {},
  });
}

function installControllableIntersectionObserver() {
  let notifyIntersection: ((isIntersecting: boolean) => void) | undefined;

  class MockIntersectionObserver implements IntersectionObserver {
    private readonly callback: IntersectionObserverCallback;
    readonly root: Element | Document | null = null;
    readonly rootMargin = "0px";
    readonly scrollMargin = "0px";
    readonly thresholds: ReadonlyArray<number> = [];

    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      notifyIntersection = (isIntersecting) => this.notify(isIntersecting);
    }

    disconnect() {}

    observe() {}

    takeRecords() {
      return [];
    }

    unobserve() {}

    notify(isIntersecting: boolean) {
      // @ts-expect-error PublicLandingLogo only reads isIntersecting from this test entry.
      this.callback([{ isIntersecting }], this);
    }
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  return (isIntersecting: boolean) => {
    if (!notifyIntersection) {
      throw new Error("Expected PublicLandingLogo to observe its stage.");
    }
    notifyIntersection(isIntersecting);
  };
}

function getLogoImage(rootElement: HTMLElement) {
  const logoImage = rootElement.querySelector(`[data-testid="${PUBLIC_LANDING_LOGO_TEST_ID}"]`);
  if (!(logoImage instanceof HTMLImageElement)) {
    throw new Error("Expected logo image");
  }

  return logoImage;
}

function getLogoImageDecodedSource(rootElement: HTMLElement) {
  return decodeURIComponent(getLogoImage(rootElement).getAttribute("src") ?? "");
}

function installLogoThemeStyle() {
  const styleElement = document.createElement("style");
  styleElement.setAttribute("data-public-logo-theme-test-style", "true");
  styleElement.textContent = `
:root {
  --background: 0 0% 100%;
  --primary: 0 0% 10%;
  --secondary: 120 100% 40%;
}

.dark {
  --background: 0 0% 0%;
  --primary: 0 0% 90%;
  --secondary: 240 100% 60%;
}
`;
  document.head.append(styleElement);
}

function runPublicLandingLogoPrehydrationScript() {
  new Script(publicLandingLogoPrehydrationScript).runInContext(
    createContext({
      document,
      window,
    }),
  );
}

async function settleHydrationUpdate() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("PublicLandingLogo", () => {
  let root: Root | null = null;

  beforeEach(() => {
    installLocalStorageStub();
  });

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot !== null) {
      act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    document.body.replaceChildren();
    document.documentElement.className = "";
    document.querySelectorAll("[data-public-logo-theme-test-style]").forEach((element) => {
      element.remove();
    });
    syncDocumentThemeColorSearch({});
    clearPublicLandingLogoStaticFallbackPrehydration();
    window.history.replaceState(null, "", "/");
    clearRotatedLogoViewStates();
    window.localStorage.clear();
    latestLandingLogoSceneProps.current = null;
    Object.defineProperty(window, "requestIdleCallback", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "cancelIdleCallback", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pauses decorative animation while its stage is outside the viewport", async () => {
    installImmediateIdleCallback();
    installMotionMediaQueries({ finePointer: false, reducedMotion: false });
    const notifyIntersection = installControllableIntersectionObserver();
    let nextAnimationFrameId = 1;
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation(() => nextAnimationFrameId++);
    const cancelAnimationFrame = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockImplementation(() => {});

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          routeSearch={{ "auto-rotate": true, "auto-shuffle": true }}
          routeSearchSource="static"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const offscreenSceneProps = latestLandingLogoSceneProps.current;
    if (!offscreenSceneProps) {
      throw new Error("Expected mocked logo scene props while off screen.");
    }
    expect(offscreenSceneProps.shuffleAnimation.enabled).toBe(false);
    expect(requestAnimationFrame).not.toHaveBeenCalled();

    await act(async () => {
      notifyIntersection(true);
      await Promise.resolve();
    });

    const visibleSceneProps = latestLandingLogoSceneProps.current;
    if (!visibleSceneProps) {
      throw new Error("Expected mocked logo scene props while visible.");
    }
    expect(visibleSceneProps.shuffleAnimation.enabled).toBe(true);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    await act(async () => {
      notifyIntersection(false);
      await Promise.resolve();
    });

    const hiddenSceneProps = latestLandingLogoSceneProps.current;
    if (!hiddenSceneProps) {
      throw new Error("Expected mocked logo scene props after leaving the viewport.");
    }
    expect(hiddenSceneProps.shuffleAnimation.enabled).toBe(false);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it("forwards a normalized mouse target without changing the dragged view", async () => {
    installImmediateIdleCallback();
    installMotionMediaQueries({ finePointer: true, reducedMotion: false });

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingLogo enablePointerTilt routeSearchSource="static" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const stage = rootElement.querySelector(`[data-testid="${PUBLIC_LANDING_LOGO_STAGE_TEST_ID}"]`);
    if (!(stage instanceof HTMLDivElement)) {
      throw new Error("Expected landing logo stage.");
    }
    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      bottom: 300,
      height: 200,
      left: 100,
      right: 300,
      top: 100,
      width: 200,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    const initialSceneProps = latestLandingLogoSceneProps.current;
    if (initialSceneProps === null) {
      throw new Error("Expected mocked logo scene props.");
    }
    await act(async () => {
      initialSceneProps.onRenderReady?.();
      await Promise.resolve();
    });

    await act(async () => {
      dispatchPrimaryMouseMove(550, 200);
    });

    expect(latestLandingLogoSceneProps.current?.presentationTiltTarget).toEqual({
      horizontal: 12,
      vertical: 0,
    });
    expect(latestLandingLogoSceneProps.current?.elevationDegrees).toBe(
      initialSceneProps.elevationDegrees,
    );
    expect(latestLandingLogoSceneProps.current?.rotationDegrees).toBe(
      initialSceneProps.rotationDegrees,
    );

    await act(async () => {
      dispatchPrimaryMouseMove(200, 200);
    });
    expect(latestLandingLogoSceneProps.current?.presentationTiltTarget).toBe(
      NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
    );
  });

  it("applies an external presentation tilt without changing the view", async () => {
    installImmediateIdleCallback();
    installMotionMediaQueries({ finePointer: false, reducedMotion: false });

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          presentationTiltNeutralProgress={0.25}
          presentationTiltTarget={{ horizontal: 6, vertical: 0 }}
          routeSearchSource="static"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const initialSceneProps = latestLandingLogoSceneProps.current;
    if (initialSceneProps === null) {
      throw new Error("Expected mocked logo scene props.");
    }
    expect(initialSceneProps.presentationTiltNeutralProgress).toBe(0.25);
    expect(initialSceneProps.presentationTiltTarget).toEqual({ horizontal: 6, vertical: 0 });

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          presentationTiltNeutralProgress={1}
          presentationTiltTarget={{ horizontal: 12, vertical: 0 }}
          routeSearchSource="static"
        />,
      );
    });

    expect(latestLandingLogoSceneProps.current?.presentationTiltNeutralProgress).toBe(1);
    expect(latestLandingLogoSceneProps.current?.presentationTiltTarget).toEqual({
      horizontal: 12,
      vertical: 0,
    });
    expect(latestLandingLogoSceneProps.current?.elevationDegrees).toBe(
      initialSceneProps.elevationDegrees,
    );
    expect(latestLandingLogoSceneProps.current?.rotationDegrees).toBe(
      initialSceneProps.rotationDegrees,
    );
  });

  it("suppresses presentation tilt when reduced motion is requested", async () => {
    installImmediateIdleCallback();
    installMotionMediaQueries({ finePointer: true, reducedMotion: true });

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          enablePointerTilt
          presentationTiltTarget={{ horizontal: 12, vertical: 0 }}
          routeSearchSource="static"
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const sceneProps = latestLandingLogoSceneProps.current;
    if (sceneProps === null) {
      throw new Error("Expected mocked logo scene props.");
    }
    await act(async () => {
      sceneProps.onRenderReady?.();
      dispatchPrimaryMouseMove(550, 200);
      await Promise.resolve();
    });

    expect(latestLandingLogoSceneProps.current?.presentationTiltTarget).toBeUndefined();
    const logoImage = getLogoImage(rootElement);
    expect(logoImage.className).toContain("transition-opacity");
    expect(logoImage.className).toContain("duration-300");
    expect(logoImage.className).not.toContain("motion-reduce:transition-none");
  });

  it("keeps the pointer tilt neutral without a fine hover pointer", async () => {
    installImmediateIdleCallback();
    installMotionMediaQueries({ finePointer: false, reducedMotion: false });

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingLogo enablePointerTilt routeSearchSource="static" />);
      await Promise.resolve();
      await Promise.resolve();
    });

    const sceneProps = latestLandingLogoSceneProps.current;
    if (sceneProps === null) {
      throw new Error("Expected mocked logo scene props.");
    }
    await act(async () => {
      sceneProps.onRenderReady?.();
      dispatchPrimaryMouseMove(550, 200);
      await Promise.resolve();
    });

    expect(latestLandingLogoSceneProps.current?.presentationTiltTarget).toBe(
      NEUTRAL_LOGO_PRESENTATION_TILT_TARGET,
    );
  });

  it("renders the initial static fallback from persisted device view state", async () => {
    const persistedView = {
      elevationDegrees: 0,
      rotationDegrees: 180,
    };
    window.localStorage.setItem(
      "samebase:logo-view:dashboard-empty",
      JSON.stringify(persistedView),
    );

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          loadInteractiveScene={false}
          viewStatePersistence="device"
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
    });

    const logoImage = getLogoImage(rootElement);
    const defaultLogoTheme = resolveAppThemeColorState({
      search: {},
      themeMode: "light",
    });
    const defaultVoxelGrid = createLogoFractalVoxelGrid({
      depth: 1,
      gridSize: STATIC_LOGO_GRID_SIZE,
    });

    expect(logoImage.getAttribute("src")).toBe(
      `${createStaticLogoSvgDataUrl({
        faceColors: defaultLogoTheme.faceColors,
        filledVoxels: defaultVoxelGrid.filledVoxels,
        gridSize: defaultVoxelGrid.gridSize,
        view: persistedView,
      })}#${defaultLogoTheme.cacheKey}:${STATIC_LOGO_GRID_SIZE}:1:1`,
    );
    expect(logoImage.getAttribute("src")).not.toBe(
      `${createStaticLogoSvgDataUrl({
        faceColors: defaultLogoTheme.faceColors,
      })}#${defaultLogoTheme.cacheKey}:${STATIC_LOGO_GRID_SIZE}:1:1`,
    );
  });

  it("keeps cleared route view at the supplied default instead of mount-time device view", async () => {
    installImmediateIdleCallback();
    window.localStorage.setItem(
      "samebase:logo-view:dashboard-empty",
      JSON.stringify({
        elevationDegrees: 56.3,
        rotationDegrees: 180,
      }),
    );

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;
    const replacedSearches: LogoRouteSearch[] = [];
    function renderLogo(routeSearch: LogoRouteSearch) {
      localRoot.render(
        <PublicLandingLogo
          defaultView={{ elevationDegrees: 0, rotationDegrees: 0 }}
          replaceRouteSearch={(nextSearch) => {
            replacedSearches.push(nextSearch);
            flushSync(() => {
              renderLogo(nextSearch);
            });
          }}
          routeSearch={routeSearch}
          viewStatePersistence="device"
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
    }

    await act(async () => {
      renderLogo({
        elev: 56.3,
        rot: 180,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    const sceneProps = latestLandingLogoSceneProps.current;
    if (sceneProps === null) {
      throw new Error("Expected mocked logo scene props.");
    }

    await act(async () => {
      sceneProps.onViewChange({
        elevationDegrees: 0,
        rotationDegrees: 0,
      });
    });

    await act(async () => {
      sceneProps.onInteractionEnd?.({
        elevationDegrees: 0,
        rotationDegrees: 0,
      });
    });

    const replacedSearch = replacedSearches[0];
    expect(replacedSearch).toEqual({});
    expect("elev" in replacedSearch).toBe(true);
    expect(replacedSearch.elev).toBeUndefined();
    expect("rot" in replacedSearch).toBe(true);
    expect(replacedSearch.rot).toBeUndefined();

    const finalSceneProps = latestLandingLogoSceneProps.current;
    if (finalSceneProps === null) {
      throw new Error("Expected mocked logo scene props after cleared route search.");
    }
    expect(finalSceneProps.elevationDegrees).toBe(0);
    expect(finalSceneProps.rotationDegrees).toBe(0);
  });

  it("omits the default elevation after a horizontal drag", async () => {
    installImmediateIdleCallback();

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;
    const replacedSearches: LogoRouteSearch[] = [];
    function renderLogo(routeSearch: LogoRouteSearch) {
      localRoot.render(
        <PublicLandingLogo
          defaultView={{ elevationDegrees: 0, rotationDegrees: 0 }}
          replaceRouteSearch={(nextSearch) => {
            replacedSearches.push(nextSearch);
            flushSync(() => {
              renderLogo(nextSearch);
            });
          }}
          routeSearch={routeSearch}
        />,
      );
    }

    await act(async () => {
      renderLogo({});
      await Promise.resolve();
      await Promise.resolve();
    });

    const draggedView = {
      elevationDegrees: 0,
      rotationDegrees: 5.6,
    };
    const sceneProps = latestLandingLogoSceneProps.current;
    if (sceneProps === null) {
      throw new Error("Expected mocked logo scene props before horizontal drag.");
    }

    await act(async () => {
      sceneProps.onViewChange(draggedView);
    });
    await act(async () => {
      sceneProps.onInteractionEnd?.(draggedView);
    });

    expect(replacedSearches[0]).toMatchObject({
      elev: undefined,
      rot: 5.6,
    });
    const finalSceneProps = latestLandingLogoSceneProps.current;
    if (finalSceneProps === null) {
      throw new Error("Expected mocked logo scene props after horizontal drag.");
    }
    expect(finalSceneProps.elevationDegrees).toBe(0);
    expect(finalSceneProps.rotationDegrees).toBe(5.6);
  });

  it("uses the supplied view default for a missing route axis", async () => {
    installImmediateIdleCallback();

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          defaultView={{ elevationDegrees: 0, rotationDegrees: 0 }}
          routeSearch={{ rot: 5.6 }}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const sceneProps = latestLandingLogoSceneProps.current;
    if (sceneProps === null) {
      throw new Error("Expected mocked logo scene props for partial route view.");
    }
    expect(sceneProps.elevationDegrees).toBe(0);
    expect(sceneProps.rotationDegrees).toBe(5.6);
  });

  it("keeps the shuffled voxel grid stable after a persisted view drag", async () => {
    installImmediateIdleCallback();

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          autoRotate
          routeSearch={{ "auto-shuffle": true }}
          routeSearchSource="static"
          viewStatePersistence="device"
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const initialSceneProps = latestLandingLogoSceneProps.current;
    if (initialSceneProps === null) {
      throw new Error("Expected mocked logo scene props before the view drag.");
    }
    const initialVoxelGrid = initialSceneProps.voxelGrid;

    await act(async () => {
      initialSceneProps.onInteractionStart?.();
      initialSceneProps.onViewChange({
        elevationDegrees: 16.7,
        rotationDegrees: 5.8,
      });
    });

    await act(async () => {
      latestLandingLogoSceneProps.current?.onInteractionEnd?.({
        elevationDegrees: 16.7,
        rotationDegrees: 5.8,
      });
    });

    expect(latestLandingLogoSceneProps.current?.voxelGrid).toBe(initialVoxelGrid);
  });

  it("uses the default view after reset clears dashboard device view state", async () => {
    installImmediateIdleCallback();
    window.localStorage.setItem(
      "samebase:logo-view:dashboard-empty",
      JSON.stringify({
        elevationDegrees: 56.3,
        rotationDegrees: 180,
      }),
    );

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;
    const renderLogo = () => {
      localRoot.render(
        <PublicLandingLogo
          routeSearch={{}}
          viewStatePersistence="device"
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
    };

    await act(async () => {
      renderLogo();
      await Promise.resolve();
      await Promise.resolve();
    });

    const storedSceneProps = latestLandingLogoSceneProps.current;
    if (storedSceneProps === null) {
      throw new Error("Expected mocked logo scene props from stored device view.");
    }
    expect(storedSceneProps.elevationDegrees).toBe(56.3);
    expect(storedSceneProps.rotationDegrees).toBe(180);

    clearRotatedLogoViewStates();

    await act(async () => {
      renderLogo();
      await Promise.resolve();
    });

    const resetSceneProps = latestLandingLogoSceneProps.current;
    if (resetSceneProps === null) {
      throw new Error("Expected mocked logo scene props after reset.");
    }
    expect(window.localStorage.getItem("samebase:logo-view:dashboard-empty")).toBeNull();
    expect(resetSceneProps.elevationDegrees).toBe(DEFAULT_ELEVATION_DEGREES);
    expect(resetSceneProps.rotationDegrees).toBe(DEFAULT_ROTATION_DEGREES);
  });

  it("reveals the query-aware static fallback after prehydration suppression when the scene is disabled", async () => {
    window.history.replaceState(null, "", "/?rot=180");
    runPublicLandingLogoPrehydrationScript();

    expect(
      document.documentElement.hasAttribute("data-public-landing-logo-static-fallback-hidden"),
    ).toBe(true);

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          loadInteractiveScene={false}
          routeSearch={{ rot: 180 }}
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
    });

    const logoImage = getLogoImage(rootElement);
    expect(logoImage.hasAttribute("data-public-landing-logo-static-fallback")).toBe(true);
    expect(
      document.documentElement.hasAttribute("data-public-landing-logo-static-fallback-hidden"),
    ).toBe(false);
    expect(document.getElementById("samebase-public-landing-logo-prehydration")).toBeNull();
  });

  it("keeps the query-aware static fallback hidden while the interactive scene is pending", async () => {
    window.history.replaceState(null, "", "/?rot=180");
    runPublicLandingLogoPrehydrationScript();

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          routeSearch={{ rot: 180 }}
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
    });

    const logoImage = getLogoImage(rootElement);
    expect(logoImage.className).toContain("opacity-0");
    expect(logoImage.className).toContain("pointer-events-none");
    expect(
      document.documentElement.hasAttribute("data-public-landing-logo-static-fallback-hidden"),
    ).toBe(false);
    expect(document.getElementById("samebase-public-landing-logo-prehydration")).toBeNull();
  });

  it("hydrates query fallback visibility without a recoverable mismatch", async () => {
    window.history.replaceState(null, "", "/?rot=180");

    const rootElement = document.createElement("div");
    rootElement.innerHTML = renderToString(
      <PublicLandingLogo viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY} />,
    );
    document.body.append(rootElement);

    const serverLogoImage = getLogoImage(rootElement);
    expect(serverLogoImage.className).toContain("opacity-100");
    expect(serverLogoImage.className).not.toContain("opacity-0");

    runPublicLandingLogoPrehydrationScript();

    const recoverableErrors: unknown[] = [];

    await act(async () => {
      root = hydrateRoot(
        rootElement,
        <PublicLandingLogo
          routeSearch={{ rot: 180 }}
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
        {
          onRecoverableError(error: unknown) {
            recoverableErrors.push(error);
          },
        },
      );
      await settleHydrationUpdate();
    });

    const hydratedLogoImage = getLogoImage(rootElement);
    expect(recoverableErrors).toEqual([]);
    expect(hydratedLogoImage.className).toContain("pointer-events-none");
    expect(hydratedLogoImage.className).toContain("opacity-0");
    expect(
      document.documentElement.hasAttribute("data-public-landing-logo-static-fallback-hidden"),
    ).toBe(false);
    expect(document.getElementById("samebase-public-landing-logo-prehydration")).toBeNull();
  });

  it("renders static fallback from shareable logo route shape and view params", async () => {
    window.localStorage.setItem(
      "samebase:logo-view:dashboard-empty",
      JSON.stringify({
        elevationDegrees: 90,
        rotationDegrees: 270,
      }),
    );

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    const filledVoxelCoordinates = [[0, 0, 0]] as const;
    const filledVoxels = createFilledVoxelSet(filledVoxelCoordinates);
    const voxelState = serializeVoxelState(filledVoxels, LOGO_GRID_SIZE_2);
    const routeView = {
      elevationDegrees: 0,
      rotationDegrees: 180,
    };

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          loadInteractiveScene={false}
          routeSearch={{
            elev: routeView.elevationDegrees,
            freeView: true,
            gridSize: LOGO_GRID_SIZE_2,
            leftFace: "secondary",
            rot: routeView.rotationDegrees,
            vox: voxelState,
          }}
          viewStatePersistence="device"
          viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
        />,
      );
    });

    const expectedVoxelGrid = createLogoFractalVoxelGrid({
      depth: 1,
      filledVoxels,
      gridSize: LOGO_GRID_SIZE_2,
    });
    const defaultLogoTheme = resolveAppThemeColorState({
      search: {},
      themeMode: "light",
    });

    expect(getLogoImageDecodedSource(rootElement)).toBe(
      decodeURIComponent(
        `${createStaticLogoSvgDataUrl({
          faceColors: defaultLogoTheme.faceColors,
          filledVoxels: expectedVoxelGrid.filledVoxels,
          gridSize: expectedVoxelGrid.gridSize,
          leftFaceStyle: LOGO_SECONDARY_LEFT_FACE_STYLE,
          view: routeView,
        })}#${defaultLogoTheme.cacheKey}:${LOGO_GRID_SIZE_2}:1:1`,
      ),
    );
  });

  it("renders static fallback from the logo depth search param", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo loadInteractiveScene={false} routeSearch={{ depth: 2 }} />,
      );
    });

    const expectedVoxelGrid = createLogoFractalVoxelGrid({
      depth: 2,
      gridSize: STATIC_LOGO_GRID_SIZE,
    });
    const defaultLogoTheme = resolveAppThemeColorState({
      search: {},
      themeMode: "light",
    });

    expect(getLogoImageDecodedSource(rootElement)).toBe(
      decodeURIComponent(
        `${createStaticLogoSvgDataUrl({
          faceColors: defaultLogoTheme.faceColors,
          filledVoxels: expectedVoxelGrid.filledVoxels,
          gridSize: expectedVoxelGrid.gridSize,
        })}#${defaultLogoTheme.cacheKey}:${STATIC_LOGO_GRID_SIZE}:2:1`,
      ),
    );
  });

  it("bounds high-depth public landing logo rendering", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo loadInteractiveScene={false} routeSearch={{ depth: 99 }} />,
      );
    });

    const fallbackVoxelGrid = createLogoFractalVoxelGrid({
      depth: 3,
      gridSize: STATIC_LOGO_GRID_SIZE,
    });
    const defaultLogoTheme = resolveAppThemeColorState({
      search: {},
      themeMode: "light",
    });

    expect(getLogoImageDecodedSource(rootElement)).toBe(
      decodeURIComponent(
        `${createStaticLogoSvgDataUrl({
          faceColors: defaultLogoTheme.faceColors,
          filledVoxels: fallbackVoxelGrid.filledVoxels,
          gridSize: fallbackVoxelGrid.gridSize,
        })}#${defaultLogoTheme.cacheKey}:${STATIC_LOGO_GRID_SIZE}:${getLogoRendererFractalDepthHardMax("three")}:1`,
      ),
    );
  });

  it("refreshes the static fallback when the document theme changes", async () => {
    installLogoThemeStyle();

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingLogo loadInteractiveScene={false} />);
    });

    const logoImage = getLogoImage(rootElement);
    const lightSource = logoImage.getAttribute("src");

    expect(decodeURIComponent(lightSource ?? "")).toContain("#1a1a1a");

    await act(async () => {
      document.documentElement.classList.add("dark");
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });

    const darkSource = logoImage.getAttribute("src");

    expect(darkSource).not.toBe(lightSource);
    expect(decodeURIComponent(darkSource ?? "")).toContain("#e6e6e6");
  });

  it("renders static fallback colors from explicit app theme overrides", async () => {
    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          loadInteractiveScene={false}
          routeSearch={{
            background: "#112233",
            primary: "#445566",
            secondary: "#778899",
            top: "#abcdef",
          }}
        />,
      );
    });

    const logoImage = getLogoImage(rootElement);
    const source = decodeURIComponent(logoImage.getAttribute("src") ?? "");

    expect(source).toContain("#abcdef");
    expect(source).toContain("#445566");
    expect(source).toContain("#778899");
  });

  it("refreshes default static fallback colors after reset clears stale document overrides", async () => {
    syncDocumentThemeColorSearch({
      primary: "green-500",
      secondary: "red-500",
    });

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <PublicLandingLogo
          loadInteractiveScene={false}
          routeSearch={{
            primary: "green-500",
            secondary: "red-500",
            top: "blue-500",
          }}
        />,
      );
    });

    expect(decodeURIComponent(getLogoImage(rootElement).getAttribute("src") ?? "")).toContain(
      "#00c950",
    );

    await act(async () => {
      localRoot.render(<PublicLandingLogo loadInteractiveScene={false} routeSearch={{}} />);
      syncDocumentThemeColorSearch({});
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    });

    const source = decodeURIComponent(getLogoImage(rootElement).getAttribute("src") ?? "");

    expect(source).toContain("#ffffff");
    expect(source).toContain("#394447");
    expect(source).not.toContain("#ecfccb");
    expect(source).not.toContain("#2b7fff");
    expect(source).not.toContain("#00c950");
    expect(source).not.toContain("#fb2c36");
  });
});
