export type DaytonaRuntimeEnvFileName =
  | ".env.local"
  | ".env.daytona-source.local"
  | ".env.anon-seed.local";

export type DaytonaRuntimeEnvFileManifest = {
  path: string;
  exists: boolean;
  keys: string[];
  normalizedLines: string[];
  normalizedHash: string | null;
};

export type DaytonaRuntimeManifest = {
  version: 1;
  repo: {
    dir: string;
    headSha: string;
    status: string[];
  };
  appRoot: string;
  envFiles: Record<DaytonaRuntimeEnvFileName, DaytonaRuntimeEnvFileManifest>;
  services: {
    previewPort: number;
    previewPortListening: boolean;
    localConvexConfigured: boolean;
  };
};

export const DAYTONA_RUNTIME_ENV_FILES: readonly DaytonaRuntimeEnvFileName[];

export function parseDotEnvFile(contents: string): Record<string, string>;
export function normalizeDaytonaEnvEntries(
  entries: Record<string, string>,
): string[];
export function normalizeDaytonaEnvFileContents(contents: string): {
  keys: string[];
  normalizedLines: string[];
  normalizedHash: string;
};
export function collectDaytonaRuntimeManifest(args: {
  repoDir: string;
  appRootRelativePath: string;
  previewPort?: number;
}): Promise<DaytonaRuntimeManifest>;
export function diffDaytonaRuntimeManifests(
  left: unknown,
  right: unknown,
): string[];
