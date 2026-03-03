export const DEFAULT_LANDING_SLOGAN =
  "Noter is a collaborative markdown workspace on top of GitHub";

export const LANDING_SLOGAN_ROTATION_INTERVAL_MS = 8 * 60 * 60 * 1000;

export function parseLandingSlogans(rawSlogans: string): string[] {
  return rawSlogans
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        line !== "<!-- prettier-ignore-start -->" &&
        line !== "<!-- prettier-ignore-end -->",
    );
}

export function selectLandingSlogan(
  slogans: readonly string[],
  nowMs = Date.now(),
  fallback = DEFAULT_LANDING_SLOGAN,
): string {
  if (slogans.length === 0) {
    return fallback;
  }

  const bucket = Math.floor(nowMs / LANDING_SLOGAN_ROTATION_INTERVAL_MS);
  const index = ((bucket % slogans.length) + slogans.length) % slogans.length;
  return slogans[index] ?? fallback;
}
