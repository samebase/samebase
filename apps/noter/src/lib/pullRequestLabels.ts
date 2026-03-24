import type { CSSProperties } from "react";

export type PullRequestLabelInput = string | { name: string; color?: string };

export type PullRequestLabelDisplay = {
  name: string;
  color?: string;
};

function getHexColorLuminance(color: string): number {
  const [red, green, blue] = [0, 2, 4].map((index) =>
    Number.parseInt(color.slice(index + 1, index + 3), 16),
  );
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return (
    0.2126 * toLinear(red) + 0.7152 * toLinear(green) + 0.0722 * toLinear(blue)
  );
}

function getContrastRatio(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function getLabelTextColor(backgroundColor: string): string {
  const lightTextColor = "#ffffff";
  const darkTextColor = "#1f2328";
  const backgroundLuminance = getHexColorLuminance(backgroundColor);
  const lightContrast = getContrastRatio(backgroundLuminance, 1);
  const darkContrast = getContrastRatio(
    backgroundLuminance,
    getHexColorLuminance(darkTextColor),
  );

  return darkContrast >= lightContrast ? darkTextColor : lightTextColor;
}

export function normalizePullRequestLabelColor(
  color: string | undefined,
): string | undefined {
  if (typeof color !== "string") {
    return undefined;
  }

  const normalizedColor = color.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalizedColor)) {
    return undefined;
  }

  return `#${normalizedColor.toLowerCase()}`;
}

export function normalizePullRequestLabels(
  labels: PullRequestLabelInput[] | undefined,
): PullRequestLabelDisplay[] {
  const labelsByName = new Map<string, PullRequestLabelDisplay>();

  for (const label of labels ?? []) {
    const name = typeof label === "string" ? label : label.name;
    if (typeof name !== "string" || name.length === 0) {
      continue;
    }

    const color =
      typeof label === "string"
        ? undefined
        : normalizePullRequestLabelColor(label.color);
    const existing = labelsByName.get(name);
    if (!existing || (typeof color === "string" && existing.color !== color)) {
      labelsByName.set(name, { name, color });
    }
  }

  return Array.from(labelsByName.values());
}

export function buildPullRequestLabelStyle(
  color: string | undefined,
): CSSProperties | undefined {
  if (typeof color !== "string") {
    return undefined;
  }

  return {
    backgroundColor: color,
    borderColor: color,
    color: getLabelTextColor(color),
  };
}
