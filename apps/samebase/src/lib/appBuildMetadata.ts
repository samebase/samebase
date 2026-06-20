import { noterBuildConfig } from "@/lib/noterBuildConfig";

export function readAppBuildCommit(): string {
  const commit = noterBuildConfig.appCommit.trim();
  if (commit.length > 0 && commit !== "unknown") {
    return commit;
  }

  const appCommitNumber = noterBuildConfig.appCommitNumber;
  if (appCommitNumber !== null && appCommitNumber > 0) {
    return `build-${appCommitNumber}`;
  }

  return "dev";
}
