import { readFileSync } from "node:fs";
import { parseLandingSlogans } from "../src/lib/landingSlogans";

declare global {
  var noterBuildSelectedLandingSlogan: string | undefined;
}

type BuildLandingSlogans = readonly [string, ...string[]];

export function selectBuildLandingSlogan({
  random,
  slogans,
}: {
  random: () => number;
  slogans: BuildLandingSlogans;
}): string {
  const index = Math.floor(random() * slogans.length);
  const selectedSlogan = slogans[index];

  if (!selectedSlogan) {
    throw new Error(`Landing slogan selection produced invalid index ${index}.`);
  }

  return selectedSlogan;
}

export function readBuildLandingSlogan({
  random,
  slogansPath,
}: {
  random: () => number;
  slogansPath: string;
}): string {
  if (globalThis.noterBuildSelectedLandingSlogan) {
    return globalThis.noterBuildSelectedLandingSlogan;
  }

  const selectedSlogan = selectBuildLandingSlogan({
    random,
    slogans: readBuildLandingSlogans(slogansPath),
  });
  globalThis.noterBuildSelectedLandingSlogan = selectedSlogan;
  return selectedSlogan;
}

function readBuildLandingSlogans(slogansPath: string): BuildLandingSlogans {
  const slogans = parseLandingSlogans(readFileSync(slogansPath, "utf8"));
  const firstSlogan = slogans[0];

  if (!firstSlogan) {
    throw new Error(
      `No landing slogans found in ${slogansPath}. Add at least one markdown bullet.`,
    );
  }

  return [firstSlogan, ...slogans.slice(1)];
}
