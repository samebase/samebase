import {
  normalizeRouteSearchPresenceFlags,
  type SearchPatch,
} from "@/lib/routeSearchFlags";
import { z } from "zod";

export const ROOT_THEME_MODE_SEARCH_KEYS = ["light", "dark"] as const;
const QUERY_PARAM_LINK_LABEL_PREFIX = "?";
const QUERY_PARAM_DISABLE_LINK_LABEL_PREFIX = `${QUERY_PARAM_LINK_LABEL_PREFIX}-`;
export const ROOT_THEME_LIGHT_MODE_LINK_LABEL = `${QUERY_PARAM_LINK_LABEL_PREFIX}light`;
export const ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL = `${QUERY_PARAM_DISABLE_LINK_LABEL_PREFIX}light`;
export const ROOT_THEME_DARK_MODE_LINK_LABEL = `${QUERY_PARAM_LINK_LABEL_PREFIX}dark`;
export const ROOT_THEME_DARK_MODE_DISABLE_LINK_LABEL = `${QUERY_PARAM_DISABLE_LINK_LABEL_PREFIX}dark`;
export type RootThemeModeSearchKey =
  (typeof ROOT_THEME_MODE_SEARCH_KEYS)[number];
export type RootThemeMode = "system" | RootThemeModeSearchKey;
type ForcedRootThemeMode = Exclude<RootThemeMode, "system">;
export type RootThemeModeSearch = Partial<
  Record<RootThemeModeSearchKey, true | undefined>
>;
export type RootThemeModeSearchPatch = SearchPatch<RootThemeModeSearch>;

export const rootThemeModeSearchFieldSchema = z.object({
  dark: z.literal(true).optional(),
  light: z.literal(true).optional(),
});

export function validateRootThemeModeSearch(
  search: Record<string, unknown>,
): RootThemeModeSearch {
  return rootThemeModeSearchFieldSchema.parse(
    normalizeRouteSearchPresenceFlags(search, ROOT_THEME_MODE_SEARCH_KEYS),
  );
}

export function readRootThemeMode(search: RootThemeModeSearch): RootThemeMode {
  if (search.light && !search.dark) {
    return "light";
  }

  if (search.dark && !search.light) {
    return "dark";
  }

  return "system";
}

export function readRootThemeModeSearch(
  search: RootThemeModeSearch,
): RootThemeModeSearch {
  const themeMode = readRootThemeMode(search);

  if (themeMode === "light") {
    return { light: true };
  }

  if (themeMode === "dark") {
    return { dark: true };
  }

  return {};
}

export function buildRootThemeModeSearch(
  themeMode: RootThemeMode,
): RootThemeModeSearchPatch {
  if (themeMode === "light") {
    return { dark: null, light: true };
  }

  if (themeMode === "dark") {
    return { dark: true, light: null };
  }

  return { dark: null, light: null };
}

export function buildToggledRootThemeModeSearch(
  search: RootThemeModeSearch,
  themeMode: ForcedRootThemeMode,
): RootThemeModeSearchPatch {
  return buildRootThemeModeSearch(
    readRootThemeMode(search) === themeMode ? "system" : themeMode,
  );
}

function readSystemRootThemeMode(): ForcedRootThemeMode | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const storedTheme = window.localStorage.getItem("theme");
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {}

  return typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function syncDocumentRootThemeMode(themeMode: RootThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  const resolvedThemeMode =
    themeMode === "system" ? readSystemRootThemeMode() : themeMode;
  if (typeof resolvedThemeMode === "undefined") {
    return;
  }

  document.documentElement.classList.toggle(
    "dark",
    resolvedThemeMode === "dark",
  );
}
