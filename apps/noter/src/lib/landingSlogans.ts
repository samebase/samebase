export const DEFAULT_LANDING_SLOGAN =
  "Noter is a collaborative markdown workspace on top of GitHub";

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

/**
 * Vite calls this while starting the dev server or producing a bundle so the
 * landing copy stays stable for that asset set instead of reshuffling on
 * refresh.
 */
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
