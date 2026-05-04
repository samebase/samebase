import {
  APP_THEME_COLOR_KEYS,
  DEFAULT_APP_THEME_COLORS,
  getFaceColorsFromAppThemeColors,
  getTailwindColorHex,
  getLogoColorCssHsl,
  getLogoColorForegroundCssHsl,
  isLogoColorToken,
  type AppThemeColorKey,
  type AppThemeColors,
  type FaceColors,
  type HexColorToken,
  type LogoColorToken,
  type LogoColorThemeMode,
} from "@/components/logoTailwindColors";
import {
  useDocumentThemeMode,
  type DocumentThemeMode,
} from "@/hooks/useDocumentThemeMode";
import { useEffect, useState } from "react";
import { z } from "zod";

export const APP_THEME_COLOR_SEARCH_KEYS = [
  "primary",
  "secondary",
  "base",
  "border",
] as const;

export type AppThemeColorSearchKey =
  (typeof APP_THEME_COLOR_SEARCH_KEYS)[number];
export type AppThemeColorSearch = Partial<
  Record<AppThemeColorSearchKey, LogoColorToken | undefined>
>;
type CssVariableName = `--${string}`;
type ThemeColorRuleSet = Record<CssVariableName, string>;
export type ResolvedAppThemeColors = Record<AppThemeColorKey, HexColorToken>;
export type ResolvedAppThemeColorState = {
  backgroundColor: HexColorToken;
  cacheKey: string;
  faceColors: FaceColors;
  resolvedThemeColors: ResolvedAppThemeColors;
  themeColors: AppThemeColors;
  themeMode: DocumentThemeMode;
};

const APP_THEME_COLOR_STYLE_ELEMENT_ID = "noter-app-theme-color-search";
// Logo renderers read computed CSS variables, so reset/style syncs must
// invalidate color state even when route search props are already clean.
const APP_THEME_COLOR_SEARCH_SYNC_EVENT = "noter:app-theme-color-search-sync";
const LOGO_COLOR_THEME_MODES = [
  "light",
  "dark",
] as const satisfies readonly LogoColorThemeMode[];

const appThemeColorSearchKeyByColorKey = {
  base: "base",
  border: "border",
  primary: "primary",
  secondary: "secondary",
} as const satisfies Record<AppThemeColorKey, AppThemeColorSearchKey>;

const colorVariableSpecs = {
  base: {
    colorVariables: [
      "--background",
      "--card",
      "--popover",
      "--sidebar-background",
    ],
    foregroundVariables: [
      "--foreground",
      "--card-foreground",
      "--popover-foreground",
      "--sidebar-foreground",
    ],
  },
  primary: {
    colorVariables: ["--primary", "--ring", "--sidebar-primary"],
    foregroundVariables: [
      "--primary-foreground",
      "--sidebar-primary-foreground",
    ],
  },
  secondary: {
    colorVariables: ["--secondary"],
    foregroundVariables: ["--secondary-foreground"],
  },
  // Border follows shared theme URLs alongside base and brand colors.
  border: {
    colorVariables: ["--border", "--input", "--sidebar-border"],
    foregroundVariables: [],
  },
} as const satisfies Record<
  AppThemeColorSearchKey,
  {
    colorVariables: readonly CssVariableName[];
    foregroundVariables: readonly CssVariableName[];
  }
>;

function readOptionalLogoColorToken(
  value: unknown,
): LogoColorToken | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return isLogoColorToken(trimmedValue) ? trimmedValue : undefined;
}

const logoColorTokenSchema = z.custom<LogoColorToken>(
  (value) => typeof value === "string" && isLogoColorToken(value),
);
const optionalLogoColorTokenSchema = z.preprocess(
  readOptionalLogoColorToken,
  logoColorTokenSchema.optional(),
);

export const appThemeColorSearchFieldSchema = z.object({
  base: optionalLogoColorTokenSchema,
  border: optionalLogoColorTokenSchema,
  primary: optionalLogoColorTokenSchema,
  secondary: optionalLogoColorTokenSchema,
});

export function readAppThemeColorSearch(
  search: AppThemeColorSearch,
): AppThemeColorSearch {
  return APP_THEME_COLOR_SEARCH_KEYS.reduce<AppThemeColorSearch>(
    (result, searchKey) => {
      const colorToken = search[searchKey];
      if (typeof colorToken === "string") {
        result[searchKey] = colorToken;
      }
      return result;
    },
    {},
  );
}

export function readAppThemeColors(
  search: AppThemeColorSearch,
): AppThemeColors {
  return {
    base: search.base ?? DEFAULT_APP_THEME_COLORS.base,
    border: search.border ?? DEFAULT_APP_THEME_COLORS.border,
    primary: search.primary ?? DEFAULT_APP_THEME_COLORS.primary,
    secondary: search.secondary ?? DEFAULT_APP_THEME_COLORS.secondary,
  };
}

function resolveAppThemeColorHexes(
  themeColors: AppThemeColors,
): ResolvedAppThemeColors {
  return {
    base: getTailwindColorHex(themeColors.base),
    border: getTailwindColorHex(themeColors.border),
    primary: getTailwindColorHex(themeColors.primary),
    secondary: getTailwindColorHex(themeColors.secondary),
  };
}

export function resolveAppThemeColorState({
  search,
  themeMode,
}: {
  search: AppThemeColorSearch;
  themeMode: DocumentThemeMode;
}): ResolvedAppThemeColorState {
  const themeColors = readAppThemeColors(search);
  const resolvedThemeColors = resolveAppThemeColorHexes(themeColors);
  const faceColors = getFaceColorsFromAppThemeColors(resolvedThemeColors);

  return {
    backgroundColor: resolvedThemeColors.base,
    cacheKey: [
      themeMode,
      ...APP_THEME_COLOR_KEYS.map((key) => resolvedThemeColors[key].slice(1)),
    ].join(":"),
    faceColors,
    resolvedThemeColors,
    themeColors,
    themeMode,
  };
}

function dispatchAppThemeColorSearchSyncEvent() {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new Event(APP_THEME_COLOR_SEARCH_SYNC_EVENT));
}

export function useResolvedAppThemeColorState(
  search: AppThemeColorSearch,
): ResolvedAppThemeColorState {
  const themeMode = useDocumentThemeMode();
  const [, setThemeColorSearchRevision] = useState(0);

  useEffect(() => {
    const handleThemeColorSearchSync = () => {
      setThemeColorSearchRevision((currentRevision) => currentRevision + 1);
    };

    window.addEventListener(
      APP_THEME_COLOR_SEARCH_SYNC_EVENT,
      handleThemeColorSearchSync,
    );
    return () => {
      window.removeEventListener(
        APP_THEME_COLOR_SEARCH_SYNC_EVENT,
        handleThemeColorSearchSync,
      );
    };
  }, []);

  return resolveAppThemeColorState({
    search,
    themeMode,
  });
}

export function buildAppThemeColorSearch(
  themeColors: AppThemeColors,
): AppThemeColorSearch {
  return APP_THEME_COLOR_KEYS.reduce<AppThemeColorSearch>(
    (result, colorKey) => {
      const searchKey = appThemeColorSearchKeyByColorKey[colorKey];
      // Own undefined properties block TanStack's retainSearchParams middleware
      // from reviving stale colors while the URL serializer still omits the
      // default-valued keys from the visible query string.
      result[searchKey] =
        themeColors[colorKey] !== DEFAULT_APP_THEME_COLORS[colorKey]
          ? themeColors[colorKey]
          : undefined;

      return result;
    },
    {},
  );
}

function removeInlineThemeColorSearchProperties() {
  const rootStyle = document.documentElement.style;
  for (const spec of Object.values(colorVariableSpecs)) {
    for (const variable of [
      ...spec.colorVariables,
      ...spec.foregroundVariables,
    ]) {
      rootStyle.removeProperty(variable);
    }
  }
}

function getThemeColorStyleElement(): HTMLStyleElement {
  const currentElement = document.getElementById(
    APP_THEME_COLOR_STYLE_ELEMENT_ID,
  );
  if (currentElement instanceof HTMLStyleElement) {
    return currentElement;
  }

  const styleElement = document.createElement("style");
  styleElement.id = APP_THEME_COLOR_STYLE_ELEMENT_ID;
  document.head.append(styleElement);
  return styleElement;
}

function readThemeColorRuleSet(
  search: AppThemeColorSearch,
  themeMode: LogoColorThemeMode,
): ThemeColorRuleSet {
  const rules: ThemeColorRuleSet = {};

  for (const searchKey of APP_THEME_COLOR_SEARCH_KEYS) {
    const colorToken = search[searchKey];
    const spec = colorVariableSpecs[searchKey];

    if (typeof colorToken !== "string") {
      continue;
    }

    const colorHsl = getLogoColorCssHsl(colorToken, themeMode);
    const foregroundHsl = getLogoColorForegroundCssHsl(colorToken, themeMode);

    if (colorHsl === null || foregroundHsl === null) {
      continue;
    }

    for (const variable of spec.colorVariables) {
      rules[variable] = colorHsl;
    }
    for (const variable of spec.foregroundVariables) {
      rules[variable] = foregroundHsl;
    }
  }

  return rules;
}

function formatThemeColorRuleSet(
  selector: string,
  rules: ThemeColorRuleSet,
): string {
  const entries = Object.entries(rules);
  if (entries.length === 0) {
    return "";
  }

  return `${selector} {\n${entries
    .map(([variable, value]) => `  ${variable}: ${value};`)
    .join("\n")}\n}`;
}

export function syncDocumentThemeColorSearch(search: AppThemeColorSearch) {
  if (typeof document === "undefined") {
    return;
  }

  removeInlineThemeColorSearchProperties();

  if (
    !APP_THEME_COLOR_SEARCH_KEYS.some((key) => typeof search[key] === "string")
  ) {
    document.getElementById(APP_THEME_COLOR_STYLE_ELEMENT_ID)?.remove();
    dispatchAppThemeColorSearchSyncEvent();
    return;
  }

  const styleElement = getThemeColorStyleElement();
  styleElement.textContent = LOGO_COLOR_THEME_MODES.map((themeMode) =>
    formatThemeColorRuleSet(
      themeMode === "light" ? ":root" : ".dark",
      readThemeColorRuleSet(search, themeMode),
    ),
  )
    .filter((ruleSet) => ruleSet.length > 0)
    .join("\n\n");
  dispatchAppThemeColorSearchSyncEvent();
}
