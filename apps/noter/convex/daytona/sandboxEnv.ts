const DAYTONA_CONVEX_DEPLOY_KEY_ENV = "DAYTONA_CONVEX_DEPLOY_KEY";

export function buildDaytonaSandboxEnvVars(args: {
  vaultId: string;
  repo: string;
  branch: string;
  commitSha: string;
  codexHome?: string | null;
  daytonaConvexDeployKey?: string | null;
}): Record<string, string> {
  const envVars: Record<string, string> = {
    NOTER_VAULT_ID: args.vaultId,
    NOTER_REPO: args.repo,
    NOTER_BRANCH: args.branch,
    NOTER_COMMIT_SHA: args.commitSha,
  };

  if (args.codexHome) {
    envVars.CODEX_HOME = args.codexHome;
  }

  const deployKey = args.daytonaConvexDeployKey?.trim();
  if (deployKey) {
    envVars[DAYTONA_CONVEX_DEPLOY_KEY_ENV] = deployKey;
  }

  return envVars;
}
