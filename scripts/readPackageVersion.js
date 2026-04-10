import { createRequire } from "node:module";

/**
 * @param {string} packageName
 * @param {string | URL=} fromUrl
 * @returns {string}
 */
export function readPackageVersion(packageName, fromUrl = import.meta.url) {
  const require = createRequire(fromUrl);
  const packageJson = /** @type {unknown} */ (
    require(`${packageName}/package.json`)
  );
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
