import {
  APP_THEME_COLOR_KEYS,
  DEFAULT_APP_THEME_COLORS,
  DEFAULT_LOGO_THEME_COLORS,
  LOGO_THEME_COLOR_KEYS,
  getFaceColorsFromLogoThemeColors,
  getLogoColorCssHsl,
  getLogoColorForegroundCssHsl,
  getTailwindColorHex,
  isLogoColorToken,
  type AppThemeColorKey,
  type AppThemeColors,
  type FaceColors,
  type HexColorToken,
  type LogoColorToken,
  type LogoColorThemeMode,
  type LogoThemeColorKey,
  type LogoThemeColors,
} from "@/components/logo/logoTailwindColors";
import {
  useDocumentThemeMode,
  type DocumentThemeMode,
} from "@/hooks/useDocumentThemeMode";
import { useEffect, useState } from "react";
import { z } from "zod";

export const APP_THEME_COLOR_SEARCH_KEYS = APP_THEME_COLOR_KEYS;
export const LOGO_THEME_COLOR_SEARCH_KEYS = LOGO_THEME_COLOR_KEYS;
const LEGACY_APP_THEME_COLOR_SEARCH_KEYS = ["base"] as const;

export type AppThemeColorSearchKey =
  (typeof APP_THEME_COLOR_SEARCH_KEYS)[number];
export type LogoThemeColorSearchKey =
  (typeof LOGO_THEME_COLOR_SEARCH_KEYS)[number];
export type AppThemeColorSearch = Partial<
  Record<AppThemeColorSearchKey, LogoColorToken | undefined>
>;
export type LogoThemeColorSearch = Partial<
  Record<LogoThemeColorSearchKey, LogoColorToken | undefined>
>;
type LegacyAppThemeColorSearch = Partial<
  Record<
    (typeof LEGACY_APP_THEME_COLOR_SEARCH_KEYS)[number],
    LogoColorToken | undefined
  >
>;
export type LogoThemeColorSearchInput = LogoThemeColorSearch &
  LegacyAppThemeColorSearch;
type CssVariableName = `--${string}`;
type ThemeColorRuleSet = Record<CssVariableName, string>;
export type ResolvedAppThemeColors = Record<AppThemeColorKey, HexColorToken>;
export type ResolvedLogoThemeColors = Record<LogoThemeColorKey, HexColorToken>;
export type ResolvedAppThemeColorState = {
  backgroundColor: HexColorToken;
  cacheKey: string;
  faceColors: FaceColors;
  resolvedThemeColors: ResolvedLogoThemeColors;
  themeColors: LogoThemeColors;
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
  background: "background",
  border: "border",
  primary: "primary",
  secondary: "secondary",
} as const satisfies Record<AppThemeColorKey, AppThemeColorSearchKey>;

const colorVariableSpecs = {
  background: {
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
  // Border follows shared theme URLs alongside background and brand colors.
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
  background: optionalLogoColorTokenSchema,
  border: optionalLogoColorTokenSchema,
  primary: optionalLogoColorTokenSchema,
  secondary: optionalLogoColorTokenSchema,
  top: optionalLogoColorTokenSchema,
});

export function readAppThemeColorSearch(
  search: LogoThemeColorSearchInput,
): AppThemeColorSearch {
  return APP_THEME_COLOR_KEYS.reduce<AppThemeColorSearch>(
    (result, colorKey) => {
      const searchKey = appThemeColorSearchKeyByColorKey[colorKey];
      // `base` is the pre-background URL key; read it only as a fallback.
      const colorToken =
        colorKey === "background"
          ? (search.background ?? search.base)
          : search[searchKey];
      if (typeof colorToken === "string") {
        result[searchKey] = colorToken;
      }
      return result;
    },
    {},
  );
}

export function readAppThemeColors(
  search: LogoThemeColorSearchInput,
): AppThemeColors {
  return {
    background:
      search.background ?? search.base ?? DEFAULT_APP_THEME_COLORS.background,
    border: search.border ?? DEFAULT_APP_THEME_COLORS.border,
    primary: search.primary ?? DEFAULT_APP_THEME_COLORS.primary,
    secondary: search.secondary ?? DEFAULT_APP_THEME_COLORS.secondary,
  };
}

export function readLogoThemeColorSearch(
  search: LogoThemeColorSearchInput,
): LogoThemeColorSearch {
  const logoThemeColorSearch: LogoThemeColorSearch = {
    ...readAppThemeColorSearch(search),
  };

  if (typeof search.top === "string") {
    logoThemeColorSearch.top = search.top;
  }

  return logoThemeColorSearch;
}

export function readLogoThemeColors(
  search: LogoThemeColorSearchInput,
): LogoThemeColors {
  const appThemeColors = readAppThemeColors(search);

  return {
    ...appThemeColors,
    top: search.top ?? DEFAULT_LOGO_THEME_COLORS.top,
  };
}

function resolveAppThemeColorHexes(
  themeColors: AppThemeColors,
): ResolvedAppThemeColors {
  return {
    background: getTailwindColorHex(themeColors.background),
    border: getTailwindColorHex(themeColors.border),
    primary: getTailwindColorHex(themeColors.primary),
    secondary: getTailwindColorHex(themeColors.secondary),
  };
}

function resolveLogoThemeColorHexes(
  themeColors: LogoThemeColors,
): ResolvedLogoThemeColors {
  return {
    ...resolveAppThemeColorHexes(themeColors),
    top: getTailwindColorHex(themeColors.top),
  };
}

export function resolveAppThemeColorState({
  search,
  themeMode,
}: {
  search: LogoThemeColorSearchInput;
  themeMode: DocumentThemeMode;
}): ResolvedAppThemeColorState {
  const themeColors = readLogoThemeColors(search);
  const resolvedThemeColors = resolveLogoThemeColorHexes(themeColors);
  const faceColors = getFaceColorsFromLogoThemeColors(resolvedThemeColors);

  return {
    backgroundColor: resolvedThemeColors.background,
    cacheKey: [
      themeMode,
      ...LOGO_THEME_COLOR_KEYS.map((key) => resolvedThemeColors[key].slice(1)),
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
  search: LogoThemeColorSearchInput,
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

export function buildLogoThemeColorSearch(
  themeColors: LogoThemeColors,
): LogoThemeColorSearch {
  const themeColorSearch = APP_THEME_COLOR_KEYS.reduce<LogoThemeColorSearch>(
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

  themeColorSearch.top =
    themeColors.top !== DEFAULT_LOGO_THEME_COLORS.top
      ? themeColors.top
      : undefined;

  return themeColorSearch;
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
  search: LogoThemeColorSearchInput,
  themeMode: LogoColorThemeMode,
): ThemeColorRuleSet {
  const rules: ThemeColorRuleSet = {};
  const appThemeColorSearch = readAppThemeColorSearch(search);

  for (const searchKey of APP_THEME_COLOR_SEARCH_KEYS) {
    const colorToken = appThemeColorSearch[searchKey];
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

export function syncDocumentThemeColorSearch(
  search: LogoThemeColorSearchInput,
) {
  if (typeof document === "undefined") {
    return;
  }

  removeInlineThemeColorSearchProperties();
  const appThemeColorSearch = readAppThemeColorSearch(search);

  if (
    !APP_THEME_COLOR_SEARCH_KEYS.some(
      (key) => typeof appThemeColorSearch[key] === "string",
    )
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
