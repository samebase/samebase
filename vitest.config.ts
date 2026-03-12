import path from 'path'
import { defineConfig } from 'vitest/config'
import { readPackageVersion } from './scripts/readPackageVersion.js'

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
