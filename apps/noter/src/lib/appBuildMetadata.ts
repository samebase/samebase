export function readAppBuildCommit(): string {
  const commit =
    typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__.trim() : "";
  if (commit.length > 0 && commit !== "unknown") {
    return commit;
  }

  if (
    typeof __APP_COMMIT_NUMBER__ === "number" &&
    Number.isFinite(__APP_COMMIT_NUMBER__) &&
    __APP_COMMIT_NUMBER__ > 0
  ) {
    return `build-${__APP_COMMIT_NUMBER__}`;
  }

  return "dev";
}
