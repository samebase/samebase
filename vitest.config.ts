import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
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
