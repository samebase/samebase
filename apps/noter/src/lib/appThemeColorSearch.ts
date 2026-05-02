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
import { z } from "zod";

export const APP_THEME_COLOR_SEARCH_KEYS = [
  "primary",
  "secondary",
  "base",
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
const LOGO_COLOR_THEME_MODES = [
  "light",
  "dark",
] as const satisfies readonly LogoColorThemeMode[];

const appThemeColorSearchKeyByColorKey = {
  base: "base",
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

export const appThemeColorSearchFieldSchema = z.object({
  base: z.preprocess(
    readOptionalLogoColorToken,
    logoColorTokenSchema.optional(),
  ),
  primary: z.preprocess(
    readOptionalLogoColorToken,
    logoColorTokenSchema.optional(),
  ),
  secondary: z.preprocess(
    readOptionalLogoColorToken,
    logoColorTokenSchema.optional(),
  ),
});

export function readAppThemeColorSearch(
  search: AppThemeColorSearch,
): AppThemeColorSearch {
  return {
    ...(typeof search.base === "string" ? { base: search.base } : {}),
    ...(typeof search.primary === "string" ? { primary: search.primary } : {}),
    ...(typeof search.secondary === "string"
      ? { secondary: search.secondary }
      : {}),
  };
}

export function readAppThemeColors(
  search: AppThemeColorSearch,
): AppThemeColors {
  return {
    base: search.base ?? DEFAULT_APP_THEME_COLORS.base,
    primary: search.primary ?? DEFAULT_APP_THEME_COLORS.primary,
    secondary: search.secondary ?? DEFAULT_APP_THEME_COLORS.secondary,
  };
}

function resolveAppThemeColorHexes(
  themeColors: AppThemeColors,
): ResolvedAppThemeColors {
  return {
    base: getTailwindColorHex(themeColors.base),
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
    cacheKey: `${themeMode}:${resolvedThemeColors.base.slice(1)}:${resolvedThemeColors.primary.slice(1)}:${resolvedThemeColors.secondary.slice(1)}`,
    faceColors,
    resolvedThemeColors,
    themeColors,
    themeMode,
  };
}

export function useResolvedAppThemeColorState(
  search: AppThemeColorSearch,
): ResolvedAppThemeColorState {
  const themeMode = useDocumentThemeMode();
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
}
