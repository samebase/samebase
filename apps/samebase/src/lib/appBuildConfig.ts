export type AppBuildConfig = {
  readonly appCommit: string;
  readonly appCommitNumber: number | null;
  readonly browserConvexProxyPath: string | null;
  readonly landingPageSlogan: string;
};

export const appBuildConfig: AppBuildConfig = __APP_BUILD_CONFIG__;
