export type AppBuildConfig = {
  readonly appCommit: string;
  readonly appCommitNumber: number | null;
  readonly browserConvexProxyPath: string | null;
};

export const appBuildConfig: AppBuildConfig = __APP_BUILD_CONFIG__;
