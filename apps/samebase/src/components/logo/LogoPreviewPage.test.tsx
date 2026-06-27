// @vitest-environment jsdom

import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { RGB_LOGO_THEME_COLORS } from "./logoTailwindColors";
import { syncDocumentThemeColorSearch } from "@/lib/appThemeColorSearch";
import { LogoPreviewPage } from "./LogoPreviewPage";
import { type LogoIsoRouteSearch } from "@/routeSearch/logo";

const { latestThreeSceneFaceColors } = vi.hoisted(() => ({
  latestThreeSceneFaceColors: vi.fn(),
}));

vi.mock("@/components/AppWorkspaceShell", () => ({
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

vi.mock("@/components/logo/NLogoScene", () => ({
  NLogoScene: ({ faceColors }: { faceColors: unknown }) => {
    latestThreeSceneFaceColors(faceColors);
    return <div data-testid="mock-three-logo-scene" />;
  },
}));

vi.mock("@/components/logo/NLogoIsoScene", () => ({
  LogoIsoCubePixelEditor: () => <div />,
  LogoIsoThumbnail: () => <div />,
  NLogoIsoScene: () => <div />,
}));

vi.mock("@/components/logo/NLogoRasterScene", () => ({
  NLogoRasterScene: () => <div />,
}));

async function renderLogoPreviewPage(routeSearch: LogoIsoRouteSearch = {}) {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);
  await React.act(async () => {
    root.render(<LogoPreviewPage replaceRouteSearch={() => {}} routeSearch={routeSearch} />);
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
    document.documentElement.className = "";
    syncDocumentThemeColorSearch({});
    vi.clearAllMocks();
  });

  it("keeps the default primary logo face dark on dark theme refresh", async () => {
    document.documentElement.classList.add("dark");

    const rendered = await renderLogoPreviewPage({ dark: true });
    root = rendered.root;

    expect(latestThreeSceneFaceColors).toHaveBeenLastCalledWith({
      left: "#00b8db",
      right: "#394447",
      top: "#394447",
    });
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
});
