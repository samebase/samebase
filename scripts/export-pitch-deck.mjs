import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const appDir = path.join(repoRoot, 'apps/noter')
const appDistDir = path.join(appDir, 'dist')
const outputPath = path.join(appDistDir, 'pitch-deck.pdf')
const previewPort = Number.parseInt(
  process.env.PITCH_DECK_EXPORT_PORT ?? '43129',
  10,
)
const previewUrl = `http://127.0.0.1:${previewPort}`
const requireFromApp = createRequire(path.join(appDir, 'package.json'))
const { chromium } = requireFromApp('@playwright/test')

async function waitForPreviewServer(url) {
  const deadline = Date.now() + 30_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // Keep polling until the preview server is up or the deadline expires.
    }

    await new Promise(resolve => {
      setTimeout(resolve, 250)
    })
  }

  throw new Error(`Timed out waiting for preview server at ${url}.`)
}

async function ensureBuiltAppExists() {
  await access(path.join(appDistDir, 'index.html'))
}

async function main() {
  await ensureBuiltAppExists()

  const previewProcess = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(previewPort),
    ],
    {
      cwd: appDir,
      stdio: 'inherit',
    },
  )

  try {
    await waitForPreviewServer(`${previewUrl}/pitch/print`)

    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: 900,
        },
      })
      await page.goto(`${previewUrl}/pitch/print`, {
        waitUntil: 'networkidle',
      })
      await page.emulateMedia({ media: 'screen' })
      await page.pdf({
        path: outputPath,
        printBackground: true,
        width: '13.333in',
        height: '7.5in',
        margin: {
          top: '0',
          right: '0',
          bottom: '0',
          left: '0',
        },
      })
    } finally {
      await browser.close()
    }
  } finally {
    previewProcess.kill('SIGTERM')
    await new Promise(resolve => {
      if (
        previewProcess.exitCode !== null ||
        previewProcess.signalCode !== null
      ) {
        resolve(undefined)
        return
      }

      previewProcess.once('exit', resolve)
    })
  }

  console.log(`Wrote pitch deck PDF to ${outputPath}`)
}

main().catch(error => {
  console.error(
    error instanceof Error ? error.message : 'Failed to export pitch deck PDF.',
  )
  process.exitCode = 1
})
