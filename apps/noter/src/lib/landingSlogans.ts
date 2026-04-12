export const DEFAULT_LANDING_SLOGAN = "the link between ChatGPT and Codex";

export function parseLandingSlogans(rawSlogans: string): string[] {
  const trimmedLines = rawSlogans
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const bulletSlogans = trimmedLines
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);

  if (bulletSlogans.length > 0) {
    return bulletSlogans;
  }

  return trimmedLines;
}

export function selectLandingSlogan(
  slogans: readonly string[],
  fallback = DEFAULT_LANDING_SLOGAN,
  random = Math.random,
): string {
  if (slogans.length === 0) {
    return fallback;
  }

  const index = Math.floor(random() * slogans.length);
  return slogans[index] ?? fallback;
}
