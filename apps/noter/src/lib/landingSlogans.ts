export const DEFAULT_LANDING_SLOGAN =
  "Noter is a collaborative markdown workspace on top of GitHub";

const STABLE_SLOGAN_HASH_MULTIPLIER = 31;

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

function hashStableLandingSloganSeed(seed: string): number {
  let hash = 0;

  for (const character of seed) {
    hash =
      (hash * STABLE_SLOGAN_HASH_MULTIPLIER + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

/**
 * The public landing may still vary across builds, but the root fallback and
 * hydrated route must agree within a single build so the slogan does not flip
 * during boot.
 */
export function selectStableLandingSlogan(
  slogans: readonly string[],
  seed: string,
  fallback = DEFAULT_LANDING_SLOGAN,
): string {
  if (slogans.length === 0) {
    return fallback;
  }

  const normalizedSeed = seed.trim();
  if (normalizedSeed.length === 0) {
    return slogans[0] ?? fallback;
  }

  const index = hashStableLandingSloganSeed(normalizedSeed) % slogans.length;
  return slogans[index] ?? fallback;
}
