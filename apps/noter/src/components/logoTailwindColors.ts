import tailwindColors from "tailwindcss/colors";

export type FaceColorKey = "left" | "right" | "top";
export type FaceColors = Record<FaceColorKey, string>;
export type TailwindColorFamily = string;
export type TailwindColorShade = string;

const tailwindColorFamilies = [
  { key: "slate", label: "Slate" },
  { key: "gray", label: "Gray" },
  { key: "zinc", label: "Zinc" },
  { key: "neutral", label: "Neutral" },
  { key: "stone", label: "Stone" },
  { key: "red", label: "Red" },
  { key: "orange", label: "Orange" },
  { key: "amber", label: "Amber" },
  { key: "yellow", label: "Yellow" },
  { key: "lime", label: "Lime" },
  { key: "green", label: "Green" },
  { key: "emerald", label: "Emerald" },
  { key: "teal", label: "Teal" },
  { key: "cyan", label: "Cyan" },
  { key: "sky", label: "Sky" },
  { key: "blue", label: "Blue" },
  { key: "indigo", label: "Indigo" },
  { key: "violet", label: "Violet" },
  { key: "purple", label: "Purple" },
  { key: "fuchsia", label: "Fuchsia" },
  { key: "pink", label: "Pink" },
  { key: "rose", label: "Rose" },
] as const;

type TailwindColorFamilyKey = (typeof tailwindColorFamilies)[number]["key"];

type TailwindColorOption = {
  family: TailwindColorFamily;
  familyKey: TailwindColorFamilyKey;
  hex: string;
  shade: TailwindColorShade;
  token: string;
};

function getTailwindColorScale(
  familyKey: TailwindColorFamilyKey,
): Record<string, string> {
  return tailwindColors[familyKey];
}

const tailwindColorOptions: TailwindColorOption[] =
  tailwindColorFamilies.flatMap(({ key, label }) =>
    Object.entries(getTailwindColorScale(key)).map(([shade, hex]) => ({
      family: label,
      familyKey: key,
      hex,
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
  left: "stone-100",
  right: "violet-400",
  top: "violet-300",
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
  return getTailwindColorOption(token)?.hex ?? "#000000";
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
