// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vite-plus/test";
import {
  buildRootThemeModeSearch,
  buildToggledRootThemeModeSearch,
  readRootThemeMode,
  readRootThemeModeSearch,
  rootThemeModeSearchFieldSchema,
  syncDocumentRootThemeMode,
} from "@/lib/rootThemeModeSearch";

describe("rootThemeModeSearch", () => {
  beforeEach(() => {
    document.documentElement.className = "";
  });

  it("normalizes conflicting light and dark flags back to system", () => {
    expect(readRootThemeMode({ dark: true, light: true })).toBe("system");
    expect(readRootThemeModeSearch({ dark: true, light: true })).toEqual({});
  });

  it("builds explicit undefined clear markers for system mode", () => {
    expect(buildRootThemeModeSearch("system")).toEqual({
      dark: undefined,
      light: undefined,
    });
  });

  it("toggles active modes off and replaces the opposite mode", () => {
    expect(buildToggledRootThemeModeSearch({}, "light")).toEqual({
      dark: undefined,
      light: true,
    });
    expect(buildToggledRootThemeModeSearch({ light: true }, "light")).toEqual({
      dark: undefined,
      light: undefined,
    });
    expect(buildToggledRootThemeModeSearch({ light: true }, "dark")).toEqual({
      dark: true,
      light: undefined,
    });
  });

  it("parses key-only URL flags", () => {
    expect(
      rootThemeModeSearchFieldSchema.parse({
        dark: "false",
        light: "",
      }),
    ).toEqual({ light: true });
  });

  it("syncs forced root theme modes to the document class", () => {
    syncDocumentRootThemeMode("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    syncDocumentRootThemeMode("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
