import { includes } from "@noter-md/dependent";

import { trackedFilePaths, type TrackedFilePath } from "../generated/trackedFilePaths.generated.ts";

type StripTrackedPrefix<
  Path extends string,
  Prefix extends string,
> = Path extends `${Prefix}/${infer Rest}` ? Rest : never;

export type TrackedPathUnder<Prefix extends string> = StripTrackedPrefix<TrackedFilePath, Prefix>;
export type NoterAppFilePath = TrackedPathUnder<"apps/noter">;

export function isTrackedFilePath(filePath: unknown) {
  return includes(trackedFilePaths, filePath);
}

// eslint-disable-next-line noter/no-hand-written-type-predicate -- membership is checked on the derived `apps/noter/${filePath}` string, so control flow earns only `string`; the prefixed hit makes the suffix claim sound by construction
export function isNoterAppFilePath(filePath: unknown): filePath is NoterAppFilePath {
  return typeof filePath === "string" && isTrackedFilePath(`apps/noter/${filePath}`);
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

export function noterAppFilePath<const Path extends NoterAppFilePath>(filePath: Path): Path {
  if (!isNoterAppFilePath(filePath)) {
    throw new Error(`Untracked Noter app file path: ${String(filePath)}`);
  }
  return filePath;
}
