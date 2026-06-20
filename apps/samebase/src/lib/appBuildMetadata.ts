import { appBuildConfig } from "@/lib/appBuildConfig";

export function readAppBuildCommit(): string {
  const commit = appBuildConfig.appCommit.trim();
  if (commit.length > 0 && commit !== "unknown") {
    return commit;
  }

  const appCommitNumber = appBuildConfig.appCommitNumber;
  if (appCommitNumber !== null && appCommitNumber > 0) {
    return `build-${appCommitNumber}`;
  }

  return "dev";
}
