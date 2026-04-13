import { createRequire } from "node:module";

export function readPackageVersion(
  packageName: string,
  fromUrl: string | URL = import.meta.url,
): string {
  const require = createRequire(fromUrl);
  const packageJson = require(`${packageName}/package.json`) as unknown;
  if (
    typeof packageJson !== "object" ||
    packageJson === null ||
    !("version" in packageJson) ||
    typeof packageJson.version !== "string"
  ) {
    throw new Error(`Package ${packageName} is missing a string version field`);
  }

  return packageJson.version;
}
