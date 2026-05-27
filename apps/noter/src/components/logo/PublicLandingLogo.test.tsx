// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { getLogoRendererFractalDepthHardMax } from "@/components/logo/logoDepthLimits";
import { LOGO_SECONDARY_LEFT_FACE_STYLE } from "@/components/logo/logoLeftFaceStyle";
import { STATIC_LOGO_GRID_SIZE } from "@/components/logo/logoStaticSvgContract";
import { createStaticLogoSvgDataUrl } from "@/components/logo/logoStaticSvgAsset";
import {
  LOGO_GRID_SIZE_2,
  createFilledVoxelSet,
  createLogoFractalVoxelGrid,
  serializeVoxelState,
} from "@/components/logo/logoVoxelState";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { resolveAppThemeColorState, syncDocumentThemeColorSearch } from "@/lib/appThemeColorSearch";
import { DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import {
  PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
  PUBLIC_LANDING_LOGO_SCENE_TEST_ID,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "@/lib/publicLandingLogo";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const originalMatchMedia = window.matchMedia;
const originalUserAgent = window.navigator.userAgent;

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

function getLogoLink(rootElement: HTMLElement) {
  const link = Array.from(rootElement.querySelectorAll("a")).find(
    (element) => element.textContent === "/logo",
  );
  if (!(link instanceof HTMLAnchorElement)) {
    throw new Error("Expected /logo link");
  }
  return link;
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

function installMatchMediaStub(matches: (query: string) => boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => {
      const mediaQueryList: MediaQueryList = {
        addEventListener: vi.fn(),
        addListener: vi.fn(),
        dispatchEvent: vi.fn(),
        matches: matches(query),
        media: query,
        onchange: null,
        removeEventListener: vi.fn(),
        removeListener: vi.fn(),
      };
      return mediaQueryList;
    }),
  });
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
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: originalMatchMedia,
    });
    syncDocumentThemeColorSearch({});
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("reveals the landing /logo link from route view params", async () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(
        <TestRouterProvider initialEntries={["/"]}>
          <PublicLandingLogoLinkProvider>
            <PublicLandingLogo
              loadInteractiveScene={false}
              routeSearch={{
                elev: PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
                freeView: true,
                rot: 180,
              }}
            />
            <AppSidebarMetaSection showLandingPreviewLink side="right" />
          </PublicLandingLogoLinkProvider>
        </TestRouterProvider>,
      );
    });

    const logoLink = getLogoLink(rootElement);
    expect(logoLink.getAttribute("aria-hidden")).toBeNull();
    expect(logoLink.getAttribute("tabindex")).toBeNull();
    expect(logoLink.className).toContain("animate-underline-color");

    await act(async () => {
      localRoot.render(
        <TestRouterProvider initialEntries={["/"]}>
          <PublicLandingLogoLinkProvider>
            <PublicLandingLogo loadInteractiveScene={false} />
            <AppSidebarMetaSection showLandingPreviewLink side="right" />
          </PublicLandingLogoLinkProvider>
        </TestRouterProvider>,
      );
    });
  });

  it("renders the initial static fallback from persisted device view state", async () => {
    const persistedView = {
      elevationDegrees: PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
      rotationDegrees: 180,
    };
    window.localStorage.setItem("noter:logo-view:dashboard-empty", JSON.stringify(persistedView));

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

  it("keeps the static fallback visible in Android standalone display mode", async () => {
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      value:
        "Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36",
    });
    installMatchMediaStub((query) => query === "(display-mode: standalone)");

    const rootElement = document.createElement("div");
    document.body.append(rootElement);
    const localRoot = createRoot(rootElement);
    root = localRoot;

    await act(async () => {
      localRoot.render(<PublicLandingLogo />);
    });

    expect(getLogoImage(rootElement).className).toContain("opacity-100");
    expect(rootElement.querySelector(`[data-testid="${PUBLIC_LANDING_LOGO_SCENE_TEST_ID}"]`)).toBe(
      null,
    );
  });

  it("renders static fallback from shareable logo route shape and view params", async () => {
    window.localStorage.setItem(
      "noter:logo-view:dashboard-empty",
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
    expect(source).not.toContain("#778899");
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
