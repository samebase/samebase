import { includes } from "@samebase/dependent";

import { trackedFilePaths, type TrackedFilePath } from "../generated/trackedFilePaths.generated.ts";

type StripTrackedPrefix<
  Path extends string,
  Prefix extends string,
> = Path extends `${Prefix}/${infer Rest}` ? Rest : never;

export type TrackedPathUnder<Prefix extends string> = StripTrackedPrefix<TrackedFilePath, Prefix>;
export type SamebaseAppFilePath = TrackedPathUnder<"apps/samebase">;

export function isTrackedFilePath(filePath: unknown) {
  return includes(trackedFilePaths, filePath);
}

// eslint-disable-next-line samebase/no-hand-written-type-predicate -- membership is checked on the derived `apps/samebase/${filePath}` string, so control flow earns only `string`; the prefixed hit makes the suffix claim sound by construction
export function isSamebaseAppFilePath(filePath: unknown): filePath is SamebaseAppFilePath {
  return typeof filePath === "string" && isTrackedFilePath(`apps/samebase/${filePath}`);
}

/**
 * Mark static repo file references in scripts so regenerated git-tracked path
 * types catch stale literals after a file is removed or renamed. The generated
 * snapshot may be stale in CI; only wrapped literals are the protected contract.
 */
export function trackedFilePath<const Path extends TrackedFilePath>(filePath: Path): Path {
  if (!isTrackedFilePath(filePath)) {
    throw new Error(`Untracked file path: ${String(filePath)}`);
  }
  return filePath;
}

export function samebaseAppFilePath<const Path extends SamebaseAppFilePath>(filePath: Path): Path {
  if (!isSamebaseAppFilePath(filePath)) {
    throw new Error(`Untracked Samebase app file path: ${String(filePath)}`);
  }
  return filePath;
}
