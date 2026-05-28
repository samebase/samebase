import { readFileSync } from "node:fs";
import { DEFAULT_LANDING_SLOGAN, parseLandingSlogans } from "../src/lib/landingSlogans";

export const BUILD_SELECTED_LANDING_SLOGAN_ENV = "NOTER_BUILD_SELECTED_LANDING_SLOGAN";

export function selectBuildLandingSlogan({
  random,
  slogans,
}: {
  random: () => number;
  slogans: readonly string[];
}): string {
  if (slogans.length === 0) {
    return DEFAULT_LANDING_SLOGAN;
  }

  const index = Math.floor(random() * slogans.length);
  return slogans[index] ?? DEFAULT_LANDING_SLOGAN;
}

export function readBuildLandingSlogan({
  random,
  slogansPath,
}: {
  random: () => number;
  slogansPath: string;
}): string {
  const cachedSlogan = process.env[BUILD_SELECTED_LANDING_SLOGAN_ENV]?.trim();
  if (cachedSlogan) {
    return cachedSlogan;
  }

  const selectedSlogan = selectBuildLandingSlogan({
    random,
    slogans: parseLandingSlogans(readFileSync(slogansPath, "utf8")),
  });
  process.env[BUILD_SELECTED_LANDING_SLOGAN_ENV] = selectedSlogan;
  return selectedSlogan;
}
