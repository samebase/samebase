// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  buildRootThemeModeSearch,
  buildToggledRootThemeModeSearch,
  readRootThemeMode,
  readRootThemeModeSearch,
  syncDocumentRootThemeMode,
  validateRootThemeModeSearch,
} from "#src/lib/rootThemeModeSearch.ts";

describe("rootThemeModeSearch", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("normalizes conflicting light and dark flags back to system", () => {
    expect(readRootThemeMode({ dark: true, light: true })).toBe("system");
    expect(readRootThemeModeSearch({ dark: true, light: true })).toEqual({});
  });

  it("builds null tombstones for system mode", () => {
    expect(buildRootThemeModeSearch("system")).toEqual({
      dark: null,
      light: null,
    });
  });

  it("toggles active modes off and replaces the opposite mode", () => {
    expect(buildToggledRootThemeModeSearch({}, "light")).toEqual({
      dark: null,
      light: true,
    });
    expect(buildToggledRootThemeModeSearch({ light: true }, "light")).toEqual({
      dark: null,
      light: null,
    });
    expect(buildToggledRootThemeModeSearch({ light: true }, "dark")).toEqual({
      dark: true,
      light: null,
    });
  });

  it("parses key-only URL flags", () => {
    expect(
      validateRootThemeModeSearch({
        dark: "false",
        light: "",
      }),
    ).toEqual({ dark: true, light: true });
    expect(
      validateRootThemeModeSearch({
        dark: undefined,
        light: null,
      }),
    ).toEqual({});
  });

  it("syncs forced root theme modes to the document class", () => {
    syncDocumentRootThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    syncDocumentRootThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
