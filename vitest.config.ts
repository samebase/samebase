import { createRequire } from 'node:module'
import path from 'path'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

function readPackageVersion(packageName: string): string {
  const packageJson: unknown = require(`${packageName}/package.json`)
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

const daytonaSdkVersion = readPackageVersion('@daytonaio/sdk')

export default defineConfig({
  define: {
    __DAYTONA_SDK_VERSION__: JSON.stringify(daytonaSdkVersion),
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', 'dist', 'dev-dist'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './apps/noter/src'),
    },
  },
})
