export type FaceColorKey = "left" | "right" | "top";
export type FaceColors = Record<FaceColorKey, string>;
export type TailwindColorFamily = string;
export type TailwindColorShade = string;

type TailwindColorOption = {
  family: string;
  hex: string;
  token: string;
};

const tailwindColorOptions = [
  { family: "Stone", token: "stone-50", hex: "#fafaf9" },
  { family: "Stone", token: "stone-100", hex: "#f5f5f4" },
  { family: "Stone", token: "stone-200", hex: "#e7e5e4" },
  { family: "Stone", token: "stone-300", hex: "#d6d3d1" },
  { family: "Slate", token: "slate-100", hex: "#f1f5f9" },
  { family: "Slate", token: "slate-200", hex: "#e2e8f0" },
  { family: "Slate", token: "slate-300", hex: "#cbd5e1" },
  { family: "Slate", token: "slate-400", hex: "#94a3b8" },
  { family: "Sky", token: "sky-200", hex: "#bae6fd" },
  { family: "Sky", token: "sky-300", hex: "#7dd3fc" },
  { family: "Sky", token: "sky-400", hex: "#38bdf8" },
  { family: "Blue", token: "blue-200", hex: "#bfdbfe" },
  { family: "Blue", token: "blue-300", hex: "#93c5fd" },
  { family: "Blue", token: "blue-400", hex: "#60a5fa" },
  { family: "Indigo", token: "indigo-200", hex: "#c7d2fe" },
  { family: "Indigo", token: "indigo-300", hex: "#a5b4fc" },
  { family: "Indigo", token: "indigo-400", hex: "#818cf8" },
  { family: "Violet", token: "violet-200", hex: "#ddd6fe" },
  { family: "Violet", token: "violet-300", hex: "#c4b5fd" },
  { family: "Violet", token: "violet-400", hex: "#a78bfa" },
  { family: "Emerald", token: "emerald-200", hex: "#a7f3d0" },
  { family: "Emerald", token: "emerald-300", hex: "#6ee7b7" },
  { family: "Emerald", token: "emerald-400", hex: "#34d399" },
  { family: "Teal", token: "teal-200", hex: "#99f6e4" },
  { family: "Teal", token: "teal-300", hex: "#5eead4" },
  { family: "Teal", token: "teal-400", hex: "#2dd4bf" },
  { family: "Amber", token: "amber-200", hex: "#fde68a" },
  { family: "Amber", token: "amber-300", hex: "#fcd34d" },
  { family: "Amber", token: "amber-400", hex: "#fbbf24" },
  { family: "Rose", token: "rose-200", hex: "#fecdd3" },
  { family: "Rose", token: "rose-300", hex: "#fda4af" },
  { family: "Rose", token: "rose-400", hex: "#fb7185" },
] as const satisfies readonly TailwindColorOption[];

const tailwindColorOptionMap = new Map<string, TailwindColorOption>(
  tailwindColorOptions.map((option) => [option.token, option]),
);

export const FACE_COLOR_KEYS = ["left", "right", "top"] as const;

export const DEFAULT_FACE_COLORS: FaceColors = {
  left: "stone-100",
  right: "violet-400",
  top: "violet-300",
};

const tailwindColorOptionsByFamily = new Map<
  TailwindColorFamily,
  TailwindColorOption[]
>();

for (const option of tailwindColorOptions) {
  const currentOptions = tailwindColorOptionsByFamily.get(option.family) ?? [];
  currentOptions.push(option);
  tailwindColorOptionsByFamily.set(option.family, currentOptions);
}

export const TAILWIND_COLOR_FAMILIES = Array.from(
  tailwindColorOptionsByFamily.keys(),
);

export function getTailwindColorHex(token: string): string {
  return tailwindColorOptionMap.get(token)?.hex ?? "#000000";
}

function getTailwindColorOption(
  token: string,
): TailwindColorOption | undefined {
  return tailwindColorOptionMap.get(token);
}

function readTailwindColorShade(token: string): string {
  const option = tailwindColorOptionMap.get(token);
  if (!option) {
    return "";
  }

  const [, shade = ""] = option.token.split("-");
  return shade;
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
    readTailwindColorShade(token) ||
    readTailwindColorShade(DEFAULT_FACE_COLORS.left) ||
    "100"
  );
}

export function getTailwindColorShades(
  family: TailwindColorFamily,
): TailwindColorShade[] {
  return (tailwindColorOptionsByFamily.get(family) ?? []).map((option) =>
    readTailwindColorShade(option.token),
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

  const exactMatch = familyOptions.find(
    (option) => readTailwindColorShade(option.token) === shade,
  );
  if (exactMatch) {
    return exactMatch.token;
  }

  const targetShade = Number(shade);
  if (!Number.isNaN(targetShade)) {
    let nearestToken = familyOptions[0].token;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (const option of familyOptions) {
      const optionShade = Number(readTailwindColorShade(option.token));
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
