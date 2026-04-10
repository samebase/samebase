import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite-plus'
import { readPackageVersion } from './scripts/readPackageVersion.js'
import { vitePlusFormatterConfig } from './scripts/vitePlusFormatting.js'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

const daytonaSdkVersion = readPackageVersion(
  '@daytonaio/sdk',
  new URL('./apps/noter/package.json', import.meta.url),
)

export default defineConfig({
  define: {
    __DAYTONA_SDK_VERSION__: JSON.stringify(daytonaSdkVersion),
  },
  run: {
    tasks: {
      'noter-dev': {
        command: 'vp run --filter noter dev',
        env: [
          'CONVEX_DEPLOY_KEY',
          'CONVEX_AGENT_MODE',
          'DEV_ENV_ORIGIN',
          'NOTER_DEV_ALLOWED_HOSTS',
          'NOTER_DEV_PORT',
          'NOTER_DEV_STRICT_PORT',
          'VITE_PORT',
          'NOTER_DAYTONA_BROWSER_CONVEX_PROXY_TARGET',
        ],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './apps/noter/src'),
    },
  },
  staged: {
    '*.{cjs,css,html,js,json,jsx,md,mdx,mjs,scss,ts,tsx}': 'vp fmt',
  },
  fmt: vitePlusFormatterConfig,
  test: {
    globals: true,
    environment: 'node',
    include: [
      'scripts/**/*.test.js',
      'apps/**/*.test.ts',
      'apps/**/*.test.tsx',
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
    ],
    exclude: ['**/node_modules/**', 'dist', 'dev-dist'],
  },
})
