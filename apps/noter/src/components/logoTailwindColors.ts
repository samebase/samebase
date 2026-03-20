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

function resolveColorSource(source: ColorSource): string {
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

function getTailwindColorOption(
  token: string,
): TailwindColorOption | undefined {
  return tailwindColorOptionMap.get(token);
}

export function getTailwindColorHex(token: string): string {
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(token)) {
    return token;
  }

  return resolveColorSource(getTailwindColorOption(token)?.source ?? "#000000");
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
