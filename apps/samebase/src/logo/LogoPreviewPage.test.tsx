// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { RGB_LOGO_THEME_COLORS } from "./logoTailwindColors";
import { syncDocumentThemeColorSearch } from "@/lib/appThemeColorSearch";
import { LogoPreviewPage } from "./LogoPreviewPage";
import { type LogoIsoRouteSearch } from "@/routeSearch/logo";

const { latestThreeSceneAutoRotation, latestThreeSceneFaceColors } = vi.hoisted(() => ({
  latestThreeSceneAutoRotation: vi.fn<
    (
      autoRotation:
        | {
            degreesPerSecond: number;
            onViewChange: (nextView: { elevationDegrees: number; rotationDegrees: number }) => void;
          }
        | undefined,
    ) => void
  >(),
  latestThreeSceneFaceColors: vi.fn(),
}));

vi.mock("@/appShell/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({
    children,
    left,
  }: {
    children?: React.ReactNode;
    left?: { content?: React.ReactNode };
  }) => (
    <div>
      <aside>{left?.content}</aside>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock("@/logo/NLogoScene", () => ({
  NLogoScene: ({
    autoRotation,
    faceColors,
  }: {
    autoRotation:
      | {
          degreesPerSecond: number;
          onViewChange: (nextView: { elevationDegrees: number; rotationDegrees: number }) => void;
        }
      | undefined;
    faceColors: unknown;
  }) => {
    latestThreeSceneAutoRotation(autoRotation);
    latestThreeSceneFaceColors(faceColors);
    return <div data-testid="mock-three-logo-scene" />;
  },
}));

vi.mock("@/logo/NLogoIsoScene", () => ({
  LogoIsoCubePixelEditor: () => <div />,
  LogoIsoThumbnail: () => <div />,
  NLogoIsoScene: () => <div />,
}));

vi.mock("@/logo/NLogoRasterScene", () => ({
  NLogoRasterScene: () => <div />,
}));

async function renderLogoPreviewPage(
  routeSearch: LogoIsoRouteSearch = {},
  replaceRouteSearch: (nextSearch: LogoIsoRouteSearch) => void = () => {},
) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await React.act(async () => {
    root.render(
      <LogoPreviewPage replaceRouteSearch={replaceRouteSearch} routeSearch={routeSearch} />,
    );
  });
  return { root, rootElement };
}

function findButtonByText(rootElement: HTMLElement, text: string): HTMLButtonElement {
  for (const button of rootElement.querySelectorAll("button")) {
    if (button.textContent.trim() === text) {
      return button;
    }
  }

  throw new Error(`Expected ${text} button`);
}

describe("LogoPreviewPage", () => {
  let root: Root | null = null;

  afterEach(() => {
    const mountedRoot = root;
    if (mountedRoot !== null) {
      React.act(() => {
        mountedRoot.unmount();
      });
      root = null;
    }
    document.body.replaceChildren();
    syncDocumentThemeColorSearch({});
    vi.clearAllMocks();
  });

  it("clears stale secondary color overrides before applying default colors", async () => {
    syncDocumentThemeColorSearch(RGB_LOGO_THEME_COLORS);

    const rendered = await renderLogoPreviewPage({
      primary: RGB_LOGO_THEME_COLORS.primary,
      secondary: RGB_LOGO_THEME_COLORS.secondary,
      top: RGB_LOGO_THEME_COLORS.top,
    });
    root = rendered.root;

    expect(latestThreeSceneFaceColors).toHaveBeenLastCalledWith({
      left: "#fb2c36",
      right: "#00c950",
      top: "#2b7fff",
    });

    await React.act(async () => {
      findButtonByText(rendered.rootElement, "Default colors").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(document.getElementById("samebase-app-theme-color-search")).toBeNull();
    expect(latestThreeSceneFaceColors).toHaveBeenLastCalledWith({
      left: "#00b8db",
      right: "#394447",
      top: "#ffffff",
    });
  });

  it("keeps auto-rotation frames outside React and commits the final view when stopped", async () => {
    const replaceRouteSearch = vi.fn<(nextSearch: LogoIsoRouteSearch) => void>();
    const rendered = await renderLogoPreviewPage(
      {
        "auto-rotate": true,
        depth: 5,
        rot: 45,
        rotationSpeed: 24,
      },
      replaceRouteSearch,
    );
    root = rendered.root;

    const autoRotation = latestThreeSceneAutoRotation.mock.lastCall?.[0];
    if (autoRotation === undefined) {
      throw new Error("Expected active Three scene auto-rotation.");
    }

    expect(autoRotation.degreesPerSecond).toBe(24);
    const renderCount = latestThreeSceneAutoRotation.mock.calls.length;
    React.act(() => {
      for (let index = 0; index < 80; index += 1) {
        autoRotation.onViewChange({
          elevationDegrees: 35,
          rotationDegrees: 45 + index,
        });
      }
    });

    expect(latestThreeSceneAutoRotation).toHaveBeenCalledTimes(renderCount);
    expect(replaceRouteSearch).not.toHaveBeenCalled();

    await React.act(async () => {
      findButtonByText(rendered.rootElement, "Stop auto rotate").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(replaceRouteSearch).toHaveBeenCalledTimes(1);
    expect(replaceRouteSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        "auto-rotate": undefined,
        depth: 5,
        elev: 35,
        rot: 124,
        rotationSpeed: 24,
      }),
    );
  });
});
