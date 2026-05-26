import type { TrackedFilePath } from "../generated/trackedFilePaths.generated.ts";

type StripTrackedPrefix<
  Path extends string,
  Prefix extends string,
> = Path extends `${Prefix}/${infer Rest}` ? Rest : never;

export type TrackedPathUnder<Prefix extends string> = StripTrackedPrefix<TrackedFilePath, Prefix>;
export type NoterAppFilePath = TrackedPathUnder<"apps/noter">;

/**
 * Mark static repo file references in scripts so regenerated git-tracked path
 * types catch stale literals after a file is removed or renamed.
 */
export function trackedFilePath<const Path extends TrackedFilePath>(filePath: Path): Path {
  return filePath;
}

export function noterAppFilePath<const Path extends NoterAppFilePath>(filePath: Path): Path {
  return filePath;
}
