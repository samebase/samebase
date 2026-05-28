import { readFileSync } from "node:fs";
import { parseLandingSlogans } from "../src/lib/landingSlogans";

type BuildLandingSlogans = readonly [string, ...string[]];

export function selectBuildLandingSlogan({
  buildSeed,
  slogans,
}: {
  buildSeed: string;
  slogans: BuildLandingSlogans;
}): string {
  const selectedIndex = hashBuildSeed(buildSeed) % slogans.length;

  for (const [index, slogan] of slogans.entries()) {
    if (index === selectedIndex) {
      return slogan;
    }
  }

  throw new Error(`Landing slogan selection produced invalid index ${selectedIndex}.`);
}

export function readBuildLandingSlogan({
  buildSeed,
  slogansPath,
}: {
  buildSeed: string;
  slogansPath: string;
}): string {
  return selectBuildLandingSlogan({
    buildSeed,
    slogans: readBuildLandingSlogans(slogansPath),
  });
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

function hashBuildSeed(buildSeed: string): number {
  let hash = 0;

  for (const character of buildSeed) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}
