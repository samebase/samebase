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
