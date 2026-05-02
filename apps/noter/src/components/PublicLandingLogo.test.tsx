// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vite-plus/test";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";
import { PublicLandingLogo } from "@/components/PublicLandingLogo";
import { createStaticLogoSvgDataUrl } from "@/components/logoStaticSvgAsset";
import { PublicLandingLogoLinkProvider } from "@/contexts/PublicLandingLogoLinkContext";
import { DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import {
  PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
  PUBLIC_LANDING_LOGO_TEST_ID,
} from "@/lib/publicLandingLogo";
import { TestRouterProvider } from "@/test/TestRouterProvider";

const { act } = React;
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

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
  const logoImage = rootElement.querySelector(
    `[data-testid="${PUBLIC_LANDING_LOGO_TEST_ID}"]`,
  );
  if (!(logoImage instanceof HTMLImageElement)) {
    throw new Error("Expected logo image");
  }

  return logoImage;
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
    document
      .querySelectorAll("[data-public-logo-theme-test-style]")
      .forEach((element) => {
        element.remove();
      });
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("reveals the dashboard /logo link from persisted empty-state logo rotation", async () => {
    vi.stubGlobal("__APP_COMMIT__", "0123456789abcdef");
    vi.stubGlobal("__APP_COMMIT_NUMBER__", 463);
    vi.stubGlobal("__APP_REPO_URL__", "https://github.com/noter-md/noter");
    window.localStorage.setItem(
      "noter:logo-view:dashboard-empty",
      JSON.stringify({
        elevationDegrees: PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
        rotationDegrees: 180,
      }),
    );

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
              viewStatePersistence="device"
              viewStateKey={DASHBOARD_EMPTY_LOGO_VIEW_STATE_KEY}
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
  });

  it("renders the initial static fallback from persisted device view state", async () => {
    const persistedView = {
      elevationDegrees: PUBLIC_LANDING_LOGO_LINK_REVEAL_ELEVATION_DEGREES,
      rotationDegrees: 180,
    };
    window.localStorage.setItem(
      "noter:logo-view:dashboard-empty",
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

    expect(logoImage.getAttribute("src")).toBe(
      `${createStaticLogoSvgDataUrl({
        view: persistedView,
      })}#light:ffffff:394447:ecfccb`,
    );
    expect(logoImage.getAttribute("src")).not.toBe(
      `${createStaticLogoSvgDataUrl()}#light:ffffff:394447:ecfccb`,
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
          themeColorSearch={{
            base: "#112233",
            primary: "#445566",
            secondary: "#778899",
          }}
        />,
      );
    });

    const logoImage = getLogoImage(rootElement);
    const source = decodeURIComponent(logoImage.getAttribute("src") ?? "");

    expect(source).toContain("#112233");
    expect(source).toContain("#445566");
    expect(source).toContain("#778899");
  });
});
