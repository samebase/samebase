import tailwindColors from "tailwindcss/colors";

export type FaceColorKey = "left" | "right" | "top";
export type TailwindColorFamily = string;
export type TailwindColorShade = string;
export type HexColorToken = `#${string}`;
export type LogoColorThemeMode = "dark" | "light";
type ThemeColorSource = {
  cssVariable: `--${string}`;
  fallbackHex: HexColorToken;
  fallbackHexByTheme?: Record<LogoColorThemeMode, HexColorToken>;
};
type ColorSource = string | ThemeColorSource;
type RgbColor = {
  blue: number;
  green: number;
  red: number;
};
type ForegroundColorCandidate = {
  cssHsl: string;
  rgb: RgbColor;
};

const OKLCH_COLOR_PATTERN =
  /^oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s/]+)(?:\s*\/\s*[^)]+)?\s*\)$/i;

function readOklchComponent(component: string): number | null {
  const parsedValue = Number.parseFloat(component);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return component.endsWith("%") ? parsedValue / 100 : parsedValue;
}

function readOklchColor(color: string): {
  chroma: number;
  hueDegrees: number;
  lightness: number;
} | null {
  const match = color.match(OKLCH_COLOR_PATTERN);
  if (!match) {
    return null;
  }

  const lightness = readOklchComponent(match[1]);
  const chroma = readOklchComponent(match[2]);
  const hueDegrees =
    match[3] === "none" ? 0 : Number.parseFloat(match[3].replace("deg", ""));
  if (lightness === null || chroma === null || !Number.isFinite(hueDegrees)) {
    return null;
  }

  return { chroma, hueDegrees, lightness };
}

function clampUnitInterval(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function encodeSrgbChannel(linearChannel: number): number {
  const clampedChannel = clampUnitInterval(linearChannel);
  return clampedChannel <= 0.0031308
    ? 12.92 * clampedChannel
    : 1.055 * clampedChannel ** (1 / 2.4) - 0.055;
}

function srgbChannelToHex(linearChannel: number): string {
  return Math.round(encodeSrgbChannel(linearChannel) * 255)
    .toString(16)
    .padStart(2, "0");
}

function oklchToHex(color: {
  chroma: number;
  hueDegrees: number;
  lightness: number;
}): HexColorToken {
  const hueRadians = (color.hueDegrees * Math.PI) / 180;
  const oklabA = color.chroma * Math.cos(hueRadians);
  const oklabB = color.chroma * Math.sin(hueRadians);

  const long = color.lightness + 0.3963377774 * oklabA + 0.2158037573 * oklabB;
  const medium =
    color.lightness - 0.1055613458 * oklabA - 0.0638541728 * oklabB;
  const short = color.lightness - 0.0894841775 * oklabA - 1.291485548 * oklabB;

  const longCube = long ** 3;
  const mediumCube = medium ** 3;
  const shortCube = short ** 3;

  const red =
    4.0767416621 * longCube -
    3.3077115913 * mediumCube +
    0.2309699292 * shortCube;
  const green =
    -1.2684380046 * longCube +
    2.6097574011 * mediumCube -
    0.3413193965 * shortCube;
  const blue =
    -0.0041960863 * longCube -
    0.7034186147 * mediumCube +
    1.707614701 * shortCube;

  return `#${srgbChannelToHex(red)}${srgbChannelToHex(
    green,
  )}${srgbChannelToHex(blue)}`;
}

function normalizeRenderableColor(color: string): HexColorToken {
  const oklchColor = readOklchColor(color);
  if (oklchColor === null) {
    return isHexColorToken(color) ? color : "#000000";
  }

  // Three.js cannot parse Tailwind v4's OKLCH strings, so hand it sRGB hex.
  return oklchToHex(oklchColor);
}

function readThemeColor(cssVariable: `--${string}`): HexColorToken | null {
  if (typeof document === "undefined") {
    return null;
  }

  const hslValue = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(cssVariable)
    .trim();
  if (!hslValue) {
    return null;
  }

  const parts = hslValue
    .replace(/\//g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .map((part: string) => Number.parseFloat(part.replace("%", "")));
  if (parts.length !== 3 || parts.some((part: number) => Number.isNaN(part))) {
    return null;
  }

  const [hue, saturation, lightness] = parts;
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const secondary = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = normalizedLightness - chroma / 2;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue < 60) {
    red = chroma;
    green = secondary;
  } else if (hue < 120) {
    red = secondary;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = secondary;
  } else if (hue < 240) {
    green = secondary;
    blue = chroma;
  } else if (hue < 300) {
    red = secondary;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondary;
  }

  const toHex = (value: number) =>
    Math.round((value + match) * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function resolveColorSource(source: ColorSource): HexColorToken {
  if (typeof source === "string") {
    return normalizeRenderableColor(source);
  }

  return readThemeColor(source.cssVariable) ?? source.fallbackHex;
}

function resolveStaticColorSource(
  source: ColorSource,
  themeMode: LogoColorThemeMode,
): HexColorToken {
  if (typeof source === "string") {
    return normalizeRenderableColor(source);
  }

  return source.fallbackHexByTheme?.[themeMode] ?? source.fallbackHex;
}

function isHexColorToken(token: string): token is HexColorToken {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(token);
}

function readHexColor(color: string): RgbColor | null {
  if (!isHexColorToken(color)) {
    return null;
  }

  const hex =
    color.length === 4
      ? `${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color.slice(1);
  const parsedValue = Number.parseInt(hex, 16);
  if (!Number.isFinite(parsedValue)) {
    return null;
  }

  return {
    blue: parsedValue & 255,
    green: (parsedValue >> 8) & 255,
    red: (parsedValue >> 16) & 255,
  };
}

function formatCssNumber(value: number): string {
  const roundedValue = Math.round(value * 10) / 10;
  return Number.isInteger(roundedValue)
    ? `${roundedValue}`
    : roundedValue.toFixed(1);
}

function rgbToHslTriplet(color: RgbColor): string {
  const red = color.red / 255;
  const green = color.green / 255;
  const blue = color.blue / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) {
    return `0 0% ${formatCssNumber(lightness * 100)}%`;
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (max === red) {
    hue = ((green - blue) / delta) % 6;
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  const normalizedHue = (hue * 60 + 360) % 360;

  return `${formatCssNumber(normalizedHue)} ${formatCssNumber(
    saturation * 100,
  )}% ${formatCssNumber(lightness * 100)}%`;
}

function getRelativeLuminance(color: RgbColor): number {
  const readChannel = (channel: number) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : ((normalizedChannel + 0.055) / 1.055) ** 2.4;
  };

  return (
    readChannel(color.red) * 0.2126 +
    readChannel(color.green) * 0.7152 +
    readChannel(color.blue) * 0.0722
  );
}

function getContrastRatio(left: RgbColor, right: RgbColor): number {
  const leftLuminance = getRelativeLuminance(left);
  const rightLuminance = getRelativeLuminance(right);
  const lighterLuminance = Math.max(leftLuminance, rightLuminance);
  const darkerLuminance = Math.min(leftLuminance, rightLuminance);

  return (lighterLuminance + 0.05) / (darkerLuminance + 0.05);
}

const foregroundColorCandidates = [
  {
    cssHsl: "24 9.8% 10%",
    rgb: {
      blue: 23,
      green: 25,
      red: 28,
    },
  },
  {
    cssHsl: "0 0% 100%",
    rgb: {
      blue: 255,
      green: 255,
      red: 255,
    },
  },
] as const satisfies readonly ForegroundColorCandidate[];

const themeTailwindColorScales = {
  accent: {
    base: {
      cssVariable: "--accent",
      fallbackHex: "#f5f5f4",
      fallbackHexByTheme: {
        dark: "#292524",
        light: "#f5f5f4",
      },
    },
  },
  border: {
    base: {
      cssVariable: "--border",
      fallbackHex: "#e7e5e4",
      fallbackHexByTheme: {
        dark: "#292524",
        light: "#e7e5e4",
      },
    },
  },
  muted: {
    base: {
      cssVariable: "--muted",
      fallbackHex: "#f5f5f4",
      fallbackHexByTheme: {
        dark: "#292524",
        light: "#f5f5f4",
      },
    },
  },
  primary: {
    base: {
      cssVariable: "--primary",
      fallbackHex: "#394447",
      fallbackHexByTheme: {
        dark: "#ffffff",
        light: "#394447",
      },
    },
  },
  background: {
    base: {
      cssVariable: "--background",
      fallbackHex: "#ffffff",
      fallbackHexByTheme: {
        dark: "#394447",
        light: "#ffffff",
      },
    },
  },
  secondary: {
    base: {
      cssVariable: "--secondary",
      fallbackHex: "#ecfccb",
      fallbackHexByTheme: {
        dark: "#ecfccb",
        light: "#ecfccb",
      },
    },
  },
} as const satisfies Record<string, Record<string, ThemeColorSource>>;

const docsOnlyTailwindColorScales = {
  mauve: {
    "50": "#fafafa",
    "100": "#f3f1f3",
    "200": "#e7e4e7",
    "300": "#d7d0d7",
    "400": "#a89ea9",
    "500": "#79697b",
    "600": "#594c5b",
    "700": "#463947",
    "800": "#2a212c",
    "900": "#1d161e",
    "950": "#0c090c",
  },
  olive: {
    "50": "#fbfbf9",
    "100": "#f4f4f0",
    "200": "#e8e8e3",
    "300": "#d8d8d0",
    "400": "#abab9c",
    "500": "#7c7c67",
    "600": "#5b5b4b",
    "700": "#474739",
    "800": "#2b2b22",
    "900": "#1d1d16",
    "950": "#0c0c09",
  },
  mist: {
    "50": "#f9fbfb",
    "100": "#f1f3f3",
    "200": "#e3e7e8",
    "300": "#d0d6d8",
    "400": "#9ca8ab",
    "500": "#67787c",
    "600": "#4b585b",
    "700": "#394447",
    "800": "#22292b",
    "900": "#161b1d",
    "950": "#090b0c",
  },
  taupe: {
    "50": "#fbfaf9",
    "100": "#f3f1f1",
    "200": "#e8e4e3",
    "300": "#d8d2d0",
    "400": "#aba09c",
    "500": "#7c6d67",
    "600": "#5b4f4b",
    "700": "#473c39",
    "800": "#2b2422",
    "900": "#1d1816",
    "950": "#0c0a09",
  },
  black: {
    base: "#000000",
  },
  white: {
    base: "#ffffff",
  },
} as const;

const tailwindColorFamilies = [
  {
    key: "primary",
    label: "Primary",
    scale: themeTailwindColorScales.primary,
  },
  {
    key: "background",
    label: "Background",
    scale: themeTailwindColorScales.background,
  },
  {
    key: "secondary",
    label: "Secondary",
    scale: themeTailwindColorScales.secondary,
  },
  {
    key: "border",
    label: "Border",
    scale: themeTailwindColorScales.border,
  },
  {
    key: "muted",
    label: "Muted",
    scale: themeTailwindColorScales.muted,
  },
  {
    key: "accent",
    label: "Accent",
    scale: themeTailwindColorScales.accent,
  },
  { key: "slate", label: "Slate", scale: tailwindColors.slate },
  { key: "gray", label: "Gray", scale: tailwindColors.gray },
  { key: "zinc", label: "Zinc", scale: tailwindColors.zinc },
  { key: "neutral", label: "Neutral", scale: tailwindColors.neutral },
  { key: "stone", label: "Stone", scale: tailwindColors.stone },
  { key: "mauve", label: "Mauve", scale: docsOnlyTailwindColorScales.mauve },
  { key: "olive", label: "Olive", scale: docsOnlyTailwindColorScales.olive },
  { key: "mist", label: "Mist", scale: docsOnlyTailwindColorScales.mist },
  { key: "taupe", label: "Taupe", scale: docsOnlyTailwindColorScales.taupe },
  { key: "red", label: "Red", scale: tailwindColors.red },
  { key: "orange", label: "Orange", scale: tailwindColors.orange },
  { key: "amber", label: "Amber", scale: tailwindColors.amber },
  { key: "yellow", label: "Yellow", scale: tailwindColors.yellow },
  { key: "lime", label: "Lime", scale: tailwindColors.lime },
  { key: "green", label: "Green", scale: tailwindColors.green },
  { key: "emerald", label: "Emerald", scale: tailwindColors.emerald },
  { key: "teal", label: "Teal", scale: tailwindColors.teal },
  { key: "cyan", label: "Cyan", scale: tailwindColors.cyan },
  { key: "sky", label: "Sky", scale: tailwindColors.sky },
  { key: "blue", label: "Blue", scale: tailwindColors.blue },
  { key: "indigo", label: "Indigo", scale: tailwindColors.indigo },
  { key: "violet", label: "Violet", scale: tailwindColors.violet },
  { key: "purple", label: "Purple", scale: tailwindColors.purple },
  { key: "fuchsia", label: "Fuchsia", scale: tailwindColors.fuchsia },
  { key: "pink", label: "Pink", scale: tailwindColors.pink },
  { key: "rose", label: "Rose", scale: tailwindColors.rose },
  { key: "black", label: "Black", scale: docsOnlyTailwindColorScales.black },
  { key: "white", label: "White", scale: docsOnlyTailwindColorScales.white },
] as const;

type TailwindColorFamilyKey = (typeof tailwindColorFamilies)[number]["key"];
export type TailwindColorToken = `${TailwindColorFamilyKey}-${string}`;
export type LogoColorToken = TailwindColorToken | HexColorToken;
export type FaceColors = Record<FaceColorKey, LogoColorToken>;
export type AppThemeColorKey =
  | "accent"
  | "base"
  | "border"
  | "muted"
  | "primary"
  | "secondary";
export type AppThemeColors = Record<AppThemeColorKey, LogoColorToken>;

type TailwindColorOption = {
  family: TailwindColorFamily;
  familyKey: TailwindColorFamilyKey;
  source: ColorSource;
  shade: TailwindColorShade;
  token: TailwindColorToken;
};

function createTailwindColorToken(
  familyKey: TailwindColorFamilyKey,
  shade: string,
): TailwindColorToken {
  return `${familyKey}-${shade}`;
}

const tailwindColorOptions: TailwindColorOption[] =
  tailwindColorFamilies.flatMap(({ key, label, scale }) =>
    Object.entries(scale).map(([shade, source]) => ({
      family: label,
      familyKey: key,
      source,
      shade,
      token: createTailwindColorToken(key, shade),
    })),
  );

const tailwindColorOptionMap = new Map<string, TailwindColorOption>(
  tailwindColorOptions.map((option) => [option.token, option]),
);

const tailwindColorOptionsByFamily = new Map<
  TailwindColorFamily,
  TailwindColorOption[]
>();

for (const option of tailwindColorOptions) {
  const currentOptions = tailwindColorOptionsByFamily.get(option.family) ?? [];
  currentOptions.push(option);
  tailwindColorOptionsByFamily.set(option.family, currentOptions);
}

export const FACE_COLOR_KEYS = ["left", "right", "top"] as const;
export const APP_THEME_COLOR_KEYS = [
  "primary",
  "secondary",
  "base",
  "border",
  "muted",
  "accent",
] as const satisfies readonly AppThemeColorKey[];

export const DEFAULT_FACE_COLORS: FaceColors = {
  left: "secondary-base",
  right: "primary-base",
  top: "background-base",
};

export const DEFAULT_APP_THEME_COLORS: AppThemeColors = {
  accent: "accent-base",
  base: "background-base",
  border: "border-base",
  muted: "muted-base",
  primary: "primary-base",
  secondary: "secondary-base",
};

export const TAILWIND_COLOR_FAMILIES = tailwindColorFamilies.map(
  ({ label }) => label,
);

function getTailwindColorOption(
  token: string,
): TailwindColorOption | undefined {
  return tailwindColorOptionMap.get(token);
}

export function isTailwindColorToken(
  token: string,
): token is TailwindColorToken {
  return getTailwindColorOption(token) !== undefined;
}

export function isLogoColorToken(token: string): token is LogoColorToken {
  return isHexColorToken(token) || isTailwindColorToken(token);
}

function getStaticTailwindColorHex(
  token: LogoColorToken,
  themeMode: LogoColorThemeMode,
): HexColorToken {
  if (isHexColorToken(token)) {
    return token;
  }

  return resolveStaticColorSource(
    getTailwindColorOption(token)?.source ?? "#000000",
    themeMode,
  );
}

export function getTailwindColorHex(token: LogoColorToken): HexColorToken {
  if (isHexColorToken(token)) {
    return token;
  }

  return resolveColorSource(getTailwindColorOption(token)?.source ?? "#000000");
}

export function getLogoColorCssHsl(
  token: LogoColorToken,
  themeMode: LogoColorThemeMode = "light",
): string | null {
  const rgbColor = readHexColor(getStaticTailwindColorHex(token, themeMode));
  return rgbColor === null ? null : rgbToHslTriplet(rgbColor);
}

export function getLogoColorForegroundCssHsl(
  token: LogoColorToken,
  themeMode: LogoColorThemeMode = "light",
): string | null {
  const rgbColor = readHexColor(getStaticTailwindColorHex(token, themeMode));
  if (rgbColor === null) {
    return null;
  }

  let bestCandidate: ForegroundColorCandidate = foregroundColorCandidates[0];
  let bestContrastRatio = getContrastRatio(rgbColor, bestCandidate.rgb);

  for (const candidate of foregroundColorCandidates.slice(1)) {
    const contrastRatio = getContrastRatio(rgbColor, candidate.rgb);
    if (contrastRatio > bestContrastRatio) {
      bestCandidate = candidate;
      bestContrastRatio = contrastRatio;
    }
  }

  return bestCandidate.cssHsl;
}

export function getFaceColorsFromAppThemeColors(
  themeColors: AppThemeColors,
): FaceColors {
  return {
    left: themeColors.secondary,
    right: themeColors.primary,
    top: themeColors.base,
  };
}

export function getTailwindColorFamily(
  token: LogoColorToken,
): TailwindColorFamily {
  return (
    getTailwindColorOption(token)?.family ??
    getTailwindColorOption(DEFAULT_FACE_COLORS.left)?.family ??
    "Stone"
  );
}

export function getTailwindColorShade(
  token: LogoColorToken,
): TailwindColorShade {
  return (
    getTailwindColorOption(token)?.shade ??
    getTailwindColorOption(DEFAULT_FACE_COLORS.left)?.shade ??
    "100"
  );
}

export function getTailwindColorShades(
  family: TailwindColorFamily,
): TailwindColorShade[] {
  return (tailwindColorOptionsByFamily.get(family) ?? []).map(
    ({ shade }) => shade,
  );
}

export function getTailwindColorTokenForSelection(
  family: TailwindColorFamily,
  shade: TailwindColorShade,
  fallbackToken: LogoColorToken,
): LogoColorToken {
  const familyOptions = tailwindColorOptionsByFamily.get(family);
  if (!familyOptions || familyOptions.length === 0) {
    return fallbackToken;
  }

  const exactMatch = familyOptions.find((option) => option.shade === shade);
  if (exactMatch) {
    return exactMatch.token;
  }

  const targetShade = Number(shade);
  if (!Number.isNaN(targetShade)) {
    let nearestToken = familyOptions[0].token;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const option of familyOptions) {
      const optionShade = Number(option.shade);
      if (Number.isNaN(optionShade)) {
        continue;
      }

      const distance = Math.abs(optionShade - targetShade);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestToken = option.token;
      }
    }

    return nearestToken;
  }

  const defaultShadeMatch = familyOptions.find(
    (option) => option.shade === "500",
  );
  if (defaultShadeMatch) {
    return defaultShadeMatch.token;
  }

  return familyOptions[0].token;
}

export function getTailwindColorFamilyHex(family: TailwindColorFamily): string {
  return getTailwindColorHex(
    getTailwindColorTokenForSelection(family, "500", DEFAULT_FACE_COLORS.left),
  );
}
