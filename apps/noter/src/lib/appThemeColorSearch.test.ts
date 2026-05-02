// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildAppThemeColorSearch,
  readAppThemeColors,
  resolveAppThemeColorState,
  syncDocumentThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import { DEFAULT_APP_THEME_COLORS } from "@/components/logoTailwindColors";

describe("appThemeColorSearch", () => {
  afterEach(() => {
    syncDocumentThemeColorSearch({});
  });

  it("builds non-default colors and retained-param clear markers", () => {
    expect(
      buildAppThemeColorSearch({
        ...DEFAULT_APP_THEME_COLORS,
        primary: "red-600",
      }),
    ).toEqual({
      base: undefined,
      primary: "red-600",
      secondary: undefined,
    });
  });

  it("reads route search into semantic app theme colors", () => {
    expect(readAppThemeColors({ base: "#ffffff" })).toEqual({
      ...DEFAULT_APP_THEME_COLORS,
      base: "#ffffff",
    });
  });

  it("resolves final app theme colors from route search in one place", () => {
    expect(
      resolveAppThemeColorState({
        search: {
          base: "#112233",
          primary: "#445566",
          secondary: "#778899",
        },
        themeMode: "light",
      }),
    ).toEqual({
      backgroundColor: "#112233",
      cacheKey: "light:112233:445566:778899",
      faceColors: {
        left: "#778899",
        right: "#445566",
        top: "#112233",
      },
      resolvedThemeColors: {
        base: "#112233",
        primary: "#445566",
        secondary: "#778899",
      },
      themeColors: {
        base: "#112233",
        primary: "#445566",
        secondary: "#778899",
      },
      themeMode: "light",
    });
  });

  it("syncs typed search colors into theme-aware document CSS variables", () => {
    syncDocumentThemeColorSearch({
      base: "#000000",
      primary: "primary-base",
      secondary: "lime-100",
    });

    const styleElement = document.getElementById(
      "noter-app-theme-color-search",
    );
    expect(styleElement?.textContent).toContain(":root");
    expect(styleElement?.textContent).toContain(".dark");
    expect(styleElement?.textContent).toContain("--background: 0 0% 0%;");
    expect(styleElement?.textContent).toContain("--foreground: 0 0% 100%;");
    expect(styleElement?.textContent).toContain(
      "--primary: 192.9 10.9% 25.1%;",
    );
    expect(styleElement?.textContent).toContain("--primary: 0 0% 100%;");

    syncDocumentThemeColorSearch({});

    expect(document.getElementById("noter-app-theme-color-search")).toBeNull();
  });
});
