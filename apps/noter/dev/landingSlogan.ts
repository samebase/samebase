import { readFileSync } from "node:fs";

type BuildLandingSlogans = readonly [string, ...string[]];

export function parseLandingSlogans(rawSlogans: string): string[] {
  return rawSlogans
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0);
}

function selectBuildLandingSlogan({
  buildSeed,
  slogans,
}: {
  buildSeed: string;
  slogans: BuildLandingSlogans;
}): string {
  return slogans[hashBuildSeed(buildSeed) % slogans.length];
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
