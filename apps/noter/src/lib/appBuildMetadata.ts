export function readAppBuildCommit(): string {
  return typeof __APP_COMMIT__ === "string" && __APP_COMMIT__.length > 0
    ? __APP_COMMIT__
    : "dev";
}
