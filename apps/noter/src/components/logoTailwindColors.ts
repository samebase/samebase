import tailwindColors from "tailwindcss/colors";

export type FaceColorKey = "left" | "right" | "top";
export type FaceColors = Record<FaceColorKey, string>;
export type TailwindColorFamily = string;
export type TailwindColorShade = string;
type ThemeColorSource = {
  cssVariable: `--${string}`;
  fallbackHex: string;
};
type ColorSource = string | ThemeColorSource;
const HEX_COLOR_TOKEN_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const CSS_COLOR_FUNCTION_PATTERN =
  /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;
const CSS_COLOR_KEYWORD_PATTERN = /^[a-z-]+$/i;
let cssColorProbeElement: HTMLSpanElement | null = null;
let cssColorCanvasContext: CanvasRenderingContext2D | null = null;

function readThemeColor(cssVariable: `--${string}`): string | null {
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

function getCssColorProbeElement(): HTMLSpanElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  if (cssColorProbeElement === null) {
    cssColorProbeElement = document.createElement("span");
    cssColorProbeElement.setAttribute("aria-hidden", "true");
    cssColorProbeElement.style.position = "absolute";
    cssColorProbeElement.style.width = "0";
    cssColorProbeElement.style.height = "0";
    cssColorProbeElement.style.overflow = "hidden";
    cssColorProbeElement.style.pointerEvents = "none";
    cssColorProbeElement.style.opacity = "0";
  }

  if (!cssColorProbeElement.isConnected) {
    document.documentElement.append(cssColorProbeElement);
  }

  return cssColorProbeElement;
}

function getCssColorCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") {
    return null;
  }

  if (cssColorCanvasContext !== null) {
    return cssColorCanvasContext;
  }

  const canvasElement = document.createElement("canvas");
  canvasElement.width = 1;
  canvasElement.height = 1;
  cssColorCanvasContext = canvasElement.getContext("2d", {
    willReadFrequently: true,
  });
  return cssColorCanvasContext;
}

function parseCssColorChannel(value: string): number | null {
  const parsedValue = Number.parseFloat(value.replace("%", ""));
  if (Number.isNaN(parsedValue)) {
    return null;
  }

  if (value.includes("%")) {
    return Math.round(Math.min(Math.max(parsedValue, 0), 100) * 2.55);
  }

  return Math.round(Math.min(Math.max(parsedValue, 0), 255));
}

function convertSrgbChannelToHex(channel: number): string {
  return Math.round(channel * 255)
    .toString(16)
    .padStart(2, "0");
}

function convertLinearSrgbChannelToSrgb(channel: number): number {
  const clampedChannel = Math.min(Math.max(channel, 0), 1);
  if (clampedChannel <= 0.0031308) {
    return clampedChannel * 12.92;
  }

  return 1.055 * clampedChannel ** (1 / 2.4) - 0.055;
}

function parseOklchColorToHex(value: string): string | null {
  const oklchMatch = value
    .trim()
    .match(
      /^oklch\(\s*([+-]?(?:\d+\.?\d*|\.\d+))%\s+([+-]?(?:\d+\.?\d*|\.\d+))\s+([+-]?(?:\d+\.?\d*|\.\d+))(?:deg)?(?:\s*\/\s*[^)]+)?\s*\)$/i,
    );
  if (oklchMatch === null) {
    return null;
  }

  const lightness = Number.parseFloat(oklchMatch[1]) / 100;
  const chroma = Number.parseFloat(oklchMatch[2]);
  const hueRadians = (Number.parseFloat(oklchMatch[3]) * Math.PI) / 180;
  if (
    Number.isNaN(lightness) ||
    Number.isNaN(chroma) ||
    Number.isNaN(hueRadians)
  ) {
    return null;
  }

  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const l = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const m = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const s = lightness - 0.0894841775 * a - 1.291485548 * b;

  const lCube = l ** 3;
  const mCube = m ** 3;
  const sCube = s ** 3;

  const redLinear =
    4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const greenLinear =
    -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const blueLinear =
    -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  const red = convertLinearSrgbChannelToSrgb(redLinear);
  const green = convertLinearSrgbChannelToSrgb(greenLinear);
  const blue = convertLinearSrgbChannelToSrgb(blueLinear);

  return `#${convertSrgbChannelToHex(red)}${convertSrgbChannelToHex(green)}${convertSrgbChannelToHex(blue)}`;
}

function resolveCssColorToHexWithCanvas(value: string): string | null {
  const probeElement = getCssColorProbeElement();
  const canvasContext = getCssColorCanvasContext();
  if (probeElement === null || canvasContext === null) {
    return null;
  }

  probeElement.style.color = "";
  probeElement.style.color = value;
  if (probeElement.style.color.length === 0) {
    return null;
  }

  canvasContext.clearRect(0, 0, 1, 1);
  canvasContext.fillStyle = value;
  canvasContext.fillRect(0, 0, 1, 1);
  const [red, green, blue] = canvasContext.getImageData(0, 0, 1, 1).data;

  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function parseComputedCssColorToHex(value: string): string | null {
  const normalizedHexToken = normalizeHexColorToken(value);
  if (normalizedHexToken !== null) {
    return normalizedHexToken;
  }

  const rgbMatch = value.trim().match(/^rgba?\((.*)\)$/i);
  if (rgbMatch === null) {
    return null;
  }

  const channels = rgbMatch[1]
    .replace(/\//g, " ")
    .split(/[\s,]+/)
    .filter((channel) => channel.length > 0)
    .slice(0, 3)
    .map(parseCssColorChannel);

  if (channels.length !== 3 || channels.some((channel) => channel === null)) {
    return null;
  }

  const numericChannels = channels.filter(
    (channel): channel is number => channel !== null,
  );
  if (numericChannels.length !== 3) {
    return null;
  }

  return `#${numericChannels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function resolveCssColorToHex(value: string): string | null {
  const normalizedHexToken = normalizeHexColorToken(value);
  if (normalizedHexToken !== null) {
    return normalizedHexToken;
  }

  const canvasHexToken = resolveCssColorToHexWithCanvas(value);
  if (canvasHexToken !== null) {
    return canvasHexToken;
  }

  const oklchHexToken = parseOklchColorToHex(value);
  if (oklchHexToken !== null) {
    return oklchHexToken;
  }

  const probeElement = getCssColorProbeElement();
  if (probeElement === null) {
    return null;
  }

  probeElement.style.color = "";
  probeElement.style.color = value;
  if (probeElement.style.color.length === 0) {
    return null;
  }

  return parseComputedCssColorToHex(
    window.getComputedStyle(probeElement).color,
  );
}

function resolveColorSourceToCssValue(source: ColorSource): string {
  if (typeof source === "string") {
    return source;
  }

  return readThemeColor(source.cssVariable) ?? source.fallbackHex;
}

const themeTailwindColorScales = {
  primary: {
    base: {
      cssVariable: "--primary",
      fallbackHex: "#394447",
    },
  },
  background: {
    base: {
      cssVariable: "--background",
      fallbackHex: "#ffffff",
    },
  },
  secondary: {
    base: {
      cssVariable: "--secondary",
      fallbackHex: "#ecfccb",
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

type TailwindColorOption = {
  family: TailwindColorFamily;
  familyKey: TailwindColorFamilyKey;
  source: ColorSource;
  shade: TailwindColorShade;
  token: string;
};

const tailwindColorOptions: TailwindColorOption[] =
  tailwindColorFamilies.flatMap(({ key, label, scale }) =>
    Object.entries(scale).map(([shade, source]) => ({
      family: label,
      familyKey: key,
      source,
      shade,
      token: `${key}-${shade}`,
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

export const DEFAULT_FACE_COLORS: FaceColors = {
  left: "secondary-base",
  right: "primary-base",
  top: "background-base",
};

export const TAILWIND_COLOR_FAMILIES = tailwindColorFamilies.map(
  ({ label }) => label,
);

export function normalizeHexColorToken(token: string): string | null {
  const trimmedToken = token.trim();
  if (!HEX_COLOR_TOKEN_PATTERN.test(trimmedToken)) {
    return null;
  }

  const lowercaseToken = trimmedToken.toLowerCase();
  if (lowercaseToken.length === 4) {
    return `#${lowercaseToken
      .slice(1)
      .split("")
      .map((character) => `${character}${character}`)
      .join("")}`;
  }

  return lowercaseToken;
}

export function isHexColorToken(token: string): boolean {
  return normalizeHexColorToken(token) !== null;
}

function isSupportedCssColorValue(value: string): boolean {
  if (typeof document !== "undefined") {
    const probeElement = getCssColorProbeElement();
    if (probeElement === null) {
      return false;
    }

    probeElement.style.color = "";
    probeElement.style.color = value;
    return probeElement.style.color.length > 0;
  }

  return (
    CSS_COLOR_FUNCTION_PATTERN.test(value) ||
    CSS_COLOR_KEYWORD_PATTERN.test(value)
  );
}

export function isTailwindColorToken(token: string): boolean {
  return tailwindColorOptionMap.has(token.trim());
}

// Preserve preset tokens as tokens, but let custom inputs store any CSS color
// string the browser accepts.
export function normalizeFaceColorValue(value: string): string | null {
  const trimmedValue = value.trim();
  const normalizedHexToken = normalizeHexColorToken(trimmedValue);
  if (normalizedHexToken !== null) {
    return normalizedHexToken;
  }

  if (tailwindColorOptionMap.has(trimmedValue)) {
    return trimmedValue;
  }

  return isSupportedCssColorValue(trimmedValue) ? trimmedValue : null;
}

function getTailwindColorOption(
  token: string,
): TailwindColorOption | undefined {
  return tailwindColorOptionMap.get(token.trim());
}

export function getTailwindColorHex(token: string): string {
  const normalizedHexToken = normalizeHexColorToken(token);
  if (normalizedHexToken !== null) {
    return normalizedHexToken;
  }

  const cssColorValue = getTailwindColorOption(token)?.source;
  return (
    resolveCssColorToHex(
      cssColorValue === undefined
        ? token.trim()
        : resolveColorSourceToCssValue(cssColorValue),
    ) ?? "#000000"
  );
}

export function getFaceColorCssValue(token: string): string {
  const normalizedFaceColorValue = normalizeFaceColorValue(token);
  if (normalizedFaceColorValue === null) {
    return "#000000";
  }

  return resolveColorSourceToCssValue(
    getTailwindColorOption(normalizedFaceColorValue)?.source ??
      normalizedFaceColorValue,
  );
}

export function getTailwindColorFamily(token: string): TailwindColorFamily {
  return (
    getTailwindColorOption(token)?.family ??
    getTailwindColorOption(DEFAULT_FACE_COLORS.left)?.family ??
    "Stone"
  );
}

export function getTailwindColorShade(token: string): TailwindColorShade {
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
  fallbackToken: string,
): string {
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

  return familyOptions[0].token;
}

export function getTailwindColorFamilyHex(family: TailwindColorFamily): string {
  return getTailwindColorHex(
    getTailwindColorTokenForSelection(family, "500", DEFAULT_FACE_COLORS.left),
  );
}
