export type SamebaseBuildConfig = {
  readonly appCommit: string;
  readonly appCommitNumber: number | null;
  readonly appRepoUrl: string;
  readonly browserConvexProxyPath: string | null;
  readonly landingPageSlogan: string;
};

export const samebaseBuildConfig: SamebaseBuildConfig = __SAMEBASE_BUILD_CONFIG__;
