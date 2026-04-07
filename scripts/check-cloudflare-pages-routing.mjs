import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const wranglerCompatibilityDate = '2026-04-07'
const wranglerPackageSpecifier = 'wrangler@4.80.0'
const readyLinePrefix = '[wrangler:info] Ready on http://localhost:'
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const temporaryDirectories = []
const runningServers = []

try {
  await verifySpaFallbackLoopFixture()
  await verifyRootOverrideFixture()
  console.log('Cloudflare Pages routing smoke checks passed.')
} finally {
  while (runningServers.length > 0) {
    const server = runningServers.pop()
    if (server) {
      await stopServer(server)
    }
  }

  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop()
    if (directory) {
      rmSync(directory, { force: true, recursive: true })
    }
  }
}

async function verifySpaFallbackLoopFixture() {
  const fixtureDir = createFixtureDirectory({
    'index.html':
      '<!doctype html><title>root</title><div id="root-marker">root</div>\n',
    '__spa-fallback.html':
      '<!doctype html><title>fallback</title><div id="fallback-marker">fallback</div>\n',
    _redirects: '/* /__spa-fallback.html 200\n',
  })

  const port = await reservePort()
  await startPagesDevServer(fixtureDir, port)

  const rootResponse = await fetch(`http://127.0.0.1:${port}/`, {
    redirect: 'manual',
  })
  assertEqual(
    rootResponse.status,
    308,
    'Expected Cloudflare Pages to reproduce the SPA fallback redirect loop at /.',
  )
  assertEqual(
    rootResponse.headers.get('location'),
    '/__spa-fallback',
    'Expected / to redirect to /__spa-fallback in the reproduced fixture.',
  )

  const fallbackResponse = await fetch(
    `http://127.0.0.1:${port}/__spa-fallback`,
    {
      redirect: 'manual',
    },
  )
  assertEqual(
    fallbackResponse.status,
    308,
    'Expected /__spa-fallback to loop back to itself in the reproduced fixture.',
  )
  assertEqual(
    fallbackResponse.headers.get('location'),
    '/__spa-fallback',
    'Expected /__spa-fallback to point back at itself in the reproduced fixture.',
  )
}

async function verifyRootOverrideFixture() {
  const fixtureDir = createFixtureDirectory({
    'index.html':
      '<!doctype html><title>root</title><div id="root-marker">root</div>\n',
    '__spa-fallback.html':
      '<!doctype html><title>fallback</title><div id="fallback-marker">fallback</div>\n',
    _redirects: '/ /index.html 200\n/* /__spa-fallback 200\n',
  })

  const port = await reservePort()
  const server = await startPagesDevServer(fixtureDir, port)

  assertIncludes(
    server.readLogs(),
    'Infinite loop detected',
    'Expected Cloudflare Pages to reject / -> /index.html as an infinite loop.',
  )

  const rootHtml = await fetch(`http://127.0.0.1:${port}/`).then(response =>
    response.text(),
  )
  assertIncludes(
    rootHtml,
    'fallback-marker',
    'Expected / to still serve the fallback document when the root override is ignored.',
  )

  const nestedRouteHtml = await fetch(
    `http://127.0.0.1:${port}/some/client/route`,
  ).then(response => response.text())
  assertIncludes(
    nestedRouteHtml,
    'fallback-marker',
    'Expected nested client routes to serve the fallback document in the fixture.',
  )
}

function createFixtureDirectory(files) {
  const fixtureDir = mkdtempSync(path.join(tmpdir(), 'noter-pages-fixture-'))
  temporaryDirectories.push(fixtureDir)

  for (const [relativePath, contents] of Object.entries(files)) {
    writeFileSync(path.join(fixtureDir, relativePath), contents, 'utf8')
  }

  return fixtureDir
}

async function reservePort() {
  return await new Promise((resolve, reject) => {
    const server = createServer()

    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Expected TCP address while reserving a test port.'))
        return
      }

      const { port } = address
      server.close(error => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function startPagesDevServer(fixtureDir, port) {
  const child = spawn(
    pnpmCommand,
    [
      'dlx',
      wranglerPackageSpecifier,
      'pages',
      'dev',
      fixtureDir,
      '--compatibility-date',
      wranglerCompatibilityDate,
      '--port',
      String(port),
    ],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  runningServers.push(child)

  let logs = ''
  const appendLogs = chunk => {
    logs += chunk.toString()
  }

  child.stdout.on('data', appendLogs)
  child.stderr.on('data', appendLogs)

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out waiting for wrangler pages dev to start.\n\n${logs}`,
        ),
      )
    }, 30_000)

    const cleanup = () => {
      clearTimeout(timeout)
      child.stdout.off('data', onData)
      child.stderr.off('data', onData)
      child.off('exit', onExit)
    }

    const onData = () => {
      if (logs.includes(`${readyLinePrefix}${port}`)) {
        cleanup()
        resolve()
      }
    }

    const onExit = code => {
      cleanup()
      reject(
        new Error(
          `wrangler pages dev exited before becoming ready (code ${code}).\n\n${logs}`,
        ),
      )
    }

    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('exit', onExit)
  })

  return {
    process: child,
    readLogs: () => logs,
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return
  }

  await new Promise(resolve => {
    const timeout = setTimeout(() => {
      child.kill('SIGKILL')
    }, 5_000)

    child.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    child.kill('SIGTERM')
  })
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nReceived: ${actual}`)
  }
}

function assertIncludes(value, expectedSubstring, message) {
  if (!value.includes(expectedSubstring)) {
    throw new Error(
      `${message}\nExpected to find: ${expectedSubstring}\nWithin:\n${value}`,
    )
  }
}
