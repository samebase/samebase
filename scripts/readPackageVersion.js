import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * @param {string} packageName
 * @returns {string}
 */
export function readPackageVersion(packageName) {
  const packageJson = /** @type {unknown} */ (
    require(`${packageName}/package.json`)
  )
  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    !('version' in packageJson) ||
    typeof packageJson.version !== 'string'
  ) {
    throw new Error(`Package ${packageName} is missing a string version field`)
  }

  return packageJson.version
}
