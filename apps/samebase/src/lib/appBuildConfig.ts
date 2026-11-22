export type AppBuildConfig = {
  readonly appCommit: string;
  readonly appCommitNumber: number | null;
  readonly browserConvexProxyPath: string | null;
};

// Vite's `define` replaces it at build time (apps/samebase/vite.config.ts).
declare const __APP_BUILD_CONFIG__: AppBuildConfig;

export const appBuildConfig: AppBuildConfig = __APP_BUILD_CONFIG__;
