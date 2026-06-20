export type NoterBuildConfig = {
  readonly appCommit: string;
  readonly appCommitNumber: number | null;
  readonly appRepoUrl: string;
  readonly browserConvexProxyPath: string | null;
  readonly landingPageSlogan: string;
};

export const noterBuildConfig: NoterBuildConfig = __NOTER_BUILD_CONFIG__;
