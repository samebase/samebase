// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  buildLogoThemeColorSearch,
  readAppThemeColors,
  readLogoThemeColors,
  resolveAppThemeColorState,
  syncDocumentThemeColorSearch,
} from "@/lib/appThemeColorSearch";
import {
  DEFAULT_APP_THEME_COLORS,
  DEFAULT_LOGO_THEME_COLORS,
  RGB_LOGO_THEME_COLORS,
} from "@/components/logo/logoTailwindColors";

describe("appThemeColorSearch", () => {
  afterEach(() => {
    syncDocumentThemeColorSearch({});
  });

  it("builds non-default colors and retained-param clear markers", () => {
    expect(
      buildLogoThemeColorSearch({
        ...DEFAULT_LOGO_THEME_COLORS,
        background: "sky-950",
        primary: "red-600",
        top: "white-base",
      }),
    ).toEqual({
      background: "sky-950",
      border: undefined,
      primary: "red-600",
      secondary: undefined,
      top: "white-base",
    });

    expect(
      buildLogoThemeColorSearch({
        ...DEFAULT_LOGO_THEME_COLORS,
        background: "sky-950",
        top: DEFAULT_LOGO_THEME_COLORS.top,
      }).top,
    ).toBeUndefined();

    expect(
      buildLogoThemeColorSearch({
        ...DEFAULT_LOGO_THEME_COLORS,
        background: "sky-950",
        top: "sky-950",
      }).top,
    ).toBe("sky-950");

    expect(buildLogoThemeColorSearch(RGB_LOGO_THEME_COLORS)).toEqual({
      background: undefined,
      border: undefined,
      primary: "green-500",
      secondary: "red-500",
      top: "blue-500",
    });
  });

  it("reads route search into semantic app theme colors", () => {
    expect(readAppThemeColors({ base: "#ffffff" })).toEqual({
      ...DEFAULT_APP_THEME_COLORS,
      background: "#ffffff",
    });

    expect(
      readLogoThemeColors({
        background: "#112233",
      }).top,
    ).toBe(DEFAULT_LOGO_THEME_COLORS.top);

    expect(
      readLogoThemeColors({
        background: "#112233",
        top: "#ddeeff",
      }),
    ).toEqual({
      ...DEFAULT_LOGO_THEME_COLORS,
      background: "#112233",
      top: "#ddeeff",
    });
  });

  it("resolves final app theme colors from route search in one place", () => {
    expect(
      resolveAppThemeColorState({
        search: {
          background: "#112233",
          border: "#334455",
          primary: "#445566",
          secondary: "#778899",
          top: "#abcdef",
        },
        themeMode: "light",
      }),
    ).toEqual({
      backgroundColor: "#112233",
      cacheKey: "light:445566:778899:abcdef:112233:334455",
      faceColors: {
        left: "#778899",
        right: "#445566",
        top: "#abcdef",
      },
      resolvedThemeColors: {
        background: "#112233",
        border: "#334455",
        primary: "#445566",
        secondary: "#778899",
        top: "#abcdef",
      },
      themeColors: {
        background: "#112233",
        border: "#334455",
        primary: "#445566",
        secondary: "#778899",
        top: "#abcdef",
      },
      themeMode: "light",
    });
  });

  it("syncs typed search colors into theme-aware document CSS variables", () => {
    syncDocumentThemeColorSearch({
      background: "#000000",
      border: "#333333",
      primary: "primary-base",
      secondary: "lime-100",
    });

    const styleElement = document.getElementById("noter-app-theme-color-search");
    expect(styleElement?.textContent).toContain(":root");
    expect(styleElement?.textContent).toContain(".dark");
    expect(styleElement?.textContent).toContain("--background: 0 0% 0%;");
    expect(styleElement?.textContent).toContain("--foreground: 0 0% 100%;");
    expect(styleElement?.textContent).toContain("--border: 0 0% 20%;");
    expect(styleElement?.textContent).toContain("--input: 0 0% 20%;");
    expect(styleElement?.textContent).toContain("--primary: 192.9 10.9% 25.1%;");
    expect(styleElement?.textContent).toContain("--primary: 0 0% 100%;");

    syncDocumentThemeColorSearch({});

    expect(document.getElementById("noter-app-theme-color-search")).toBeNull();
  });
});
