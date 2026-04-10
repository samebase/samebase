import { defineConfig } from 'vite-plus'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function readBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined
  }
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false
  }
  return undefined
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const devHost = process.env.NOTER_DEV_HOST?.trim() || undefined
const devPortRaw = process.env.NOTER_DEV_PORT?.trim()
const devPort = devPortRaw ? Number(devPortRaw) : undefined
const devStrictPort = readBooleanEnv(process.env.NOTER_DEV_STRICT_PORT)

const serverConfig = (() => {
  const server: { host?: string; port?: number; strictPort?: boolean } = {}
  if (devHost) {
    server.host = devHost
  }
  if (devPort !== undefined && !Number.isNaN(devPort)) {
    server.port = devPort
  }
  if (devStrictPort !== undefined) {
    server.strictPort = devStrictPort
  }
  return Object.keys(server).length > 0 ? server : undefined
})()

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(currentDir, './src'),
    },
  },
  server: serverConfig,
  staged: {
    '*.{cjs,css,html,js,json,jsx,md,mdx,mjs,scss,ts,tsx}': 'vp fmt',
  },
})
