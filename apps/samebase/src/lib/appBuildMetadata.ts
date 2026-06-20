import { samebaseBuildConfig } from "@/lib/samebaseBuildConfig";

export function readAppBuildCommit(): string {
  const commit = samebaseBuildConfig.appCommit.trim();
  if (commit.length > 0 && commit !== "unknown") {
    return commit;
  }

  const appCommitNumber = samebaseBuildConfig.appCommitNumber;
  if (appCommitNumber !== null && appCommitNumber > 0) {
    return `build-${appCommitNumber}`;
  }

  return "dev";
}
