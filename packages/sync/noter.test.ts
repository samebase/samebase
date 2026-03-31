import { createServer } from 'node:http'
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, it, vi } from 'vitest'

import {
  buildMachineHeartbeatBody,
  buildNoterConnectConfigUrl,
  buildDirectConnectCommand,
  buildDirectRunCommand,
  buildMachineConnectUrl,
  createCodexLocalControlRouter,
  formatBootstrapReadyMarkdown,
  formatHelpText,
  getNoterConfigPath,
  localControlStatusIsReady,
  NOTER_SYNC_SOURCE_URL,
  parseCliArgs,
  parseCloudflaredQuickTunnelUrl,
  readLocalConfig,
  resolveEntrypointUrl,
  runHeartbeatLoop,
  startLocalCodexControlServer,
  validateConvexSiteUrl,
  validateSourceUrl,
  writeLocalConfig,
} from './noter.js'

describe('@noter-md/sync', () => {
  it('defaults the public connect command to noter.md with no extra CLI override', () => {
    expect(parseCliArgs(['connect'])).toEqual({
      command: 'connect',
      sourceUrl: null,
    })
    expect(NOTER_SYNC_SOURCE_URL).toBe('https://noter.md/noter.js')
  })

  it('accepts the run command with no extra CLI override', () => {
    expect(parseCliArgs(['run'])).toEqual({
      command: 'run',
    })
  })

  it('accepts an optional explicit source URL argument for direct hosted execution', () => {
    expect(
      parseCliArgs(['connect', 'https://preview.noter.md/noter.js']),
    ).toEqual({
      command: 'connect',
      sourceUrl: 'https://preview.noter.md/noter.js',
    })
  })

  it('accepts https deploy URLs and localhost http URLs', () => {
    expect(
      validateSourceUrl('https://preview.noter.md/noter.js').toString(),
    ).toBe('https://preview.noter.md/noter.js')
    expect(validateSourceUrl('http://127.0.0.1:5174/noter.js').toString()).toBe(
      'http://127.0.0.1:5174/noter.js',
    )
  })

  it('rejects non-https non-localhost source URLs', () => {
    expect(() => validateSourceUrl('http://example.com/noter.js')).toThrow(
      'The installer source URL must use https, except for explicit localhost testing.',
    )
  })

  it('accepts https and localhost runtime Convex URLs only', () => {
    expect(validateConvexSiteUrl('https://demo.convex.site').toString()).toBe(
      'https://demo.convex.site/',
    )
    expect(validateConvexSiteUrl('http://127.0.0.1:3210').toString()).toBe(
      'http://127.0.0.1:3210/',
    )
    expect(() => validateConvexSiteUrl('http://example.com')).toThrow(
      'The runtime Convex site URL must use https, except for explicit localhost testing.',
    )
  })

  it('rejects runtime Convex URLs with a path segment', () => {
    expect(() => validateConvexSiteUrl('https://demo.convex.site/api')).toThrow(
      'The runtime Convex site URL must be an origin with no path.',
    )
  })

  it('rejects installer source URLs with query params or hashes', () => {
    expect(() =>
      validateSourceUrl('https://noter.md/noter.js?preview=1'),
    ).toThrow(
      'The installer source URL must not include credentials, query params, or hashes.',
    )
    expect(() => validateSourceUrl('https://noter.md/noter.js#branch')).toThrow(
      'The installer source URL must not include credentials, query params, or hashes.',
    )
  })

  it('extracts a quick tunnel URL from cloudflared log lines', () => {
    expect(
      parseCloudflaredQuickTunnelUrl(
        '2026-03-31T12:47:50Z INF |  https://municipal-forests-homeless-highland.trycloudflare.com  |',
      ),
    ).toBe('https://municipal-forests-homeless-highland.trycloudflare.com')
    expect(parseCloudflaredQuickTunnelUrl('no tunnel here')).toBeNull()
  })

  it('recognizes auth-gated local control status readiness', () => {
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: 'machine_123',
              readinessProbePassed: true,
            },
            loopbackOnly: true,
          },
        },
        'machine_123',
      ),
    ).toBe(true)
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: 'machine_other',
              readinessProbePassed: true,
            },
            loopbackOnly: true,
          },
        },
        'machine_123',
      ),
    ).toBe(false)
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: null,
              readinessProbePassed: true,
            },
            loopbackOnly: true,
          },
        },
        'machine_123',
      ),
    ).toBe(true)
    expect(
      localControlStatusIsReady(
        {
          service: {
            auth: {
              enforced: true,
              machineId: 'machine_123',
            },
            loopbackOnly: true,
          },
        },
        'machine_123',
      ),
    ).toBe(false)
  })

  it('stores bootstrap state in one local config file', () => {
    expect(
      getNoterConfigPath({
        homeDirectory: '/Users/noter',
      }),
    ).toBe('/Users/noter/.noter/config.json')
  })

  it('keeps the first install timestamp when rewriting the local config file', () => {
    const homeDirectory = path.join(tmpdir(), `noter-sync-${Date.now()}`)
    const configPath = getNoterConfigPath({ homeDirectory })
    mkdirSync(path.dirname(configPath), { recursive: true })
    writeFileSync(
      configPath,
      `${JSON.stringify({ installedAt: '2026-03-01T00:00:00.000Z' }, null, 2)}\n`,
      'utf8',
    )

    try {
      expect(
        writeLocalConfig({
          codexVersion: 'codex 0.1.2',
          homeDirectory,
          machineCredential: 'mmc_123',
          machineId: 'machine_123',
          sourceUrl: 'https://preview.noter.md/noter.js',
        }),
      ).toBe(configPath)

      expect(readLocalConfig({ homeDirectory })).toMatchObject({
        codexVersion: 'codex 0.1.2',
        installedAt: '2026-03-01T00:00:00.000Z',
        machineCredential: 'mmc_123',
        machineId: 'machine_123',
        sourceUrl: 'https://preview.noter.md/noter.js',
      })
    } finally {
      rmSync(homeDirectory, { force: true, recursive: true })
    }
  })

  it.runIf(process.platform !== 'win32')(
    'writes the local config file with owner-only permissions, including rewrites',
    () => {
      const homeDirectory = path.join(tmpdir(), `noter-sync-${Date.now()}`)
      const configPath = getNoterConfigPath({ homeDirectory })

      try {
        writeLocalConfig({
          codexVersion: 'codex 0.1.2',
          homeDirectory,
          machineCredential: 'mmc_123',
          machineId: 'machine_123',
          sourceUrl: 'https://preview.noter.md/noter.js',
        })
        expect(statSync(configPath).mode & 0o777).toBe(0o600)

        chmodSync(configPath, 0o644)
        writeLocalConfig({
          codexVersion: 'codex 0.1.3',
          homeDirectory,
          machineCredential: 'mmc_456',
          machineId: 'machine_123',
          sourceUrl: 'https://preview.noter.md/noter.js',
        })
        expect(statSync(configPath).mode & 0o777).toBe(0o600)
      } finally {
        rmSync(homeDirectory, { force: true, recursive: true })
      }
    },
  )

  it('builds the browser handoff URL for the current deploy and request id', () => {
    expect(
      buildMachineConnectUrl(
        'https://preview.noter.md/noter.js',
        'request_123',
      ),
    ).toBe(
      'https://preview.noter.md/machines/connect?openedByCli&requestId=request_123',
    )
  })

  it('builds the deploy-scoped runtime config URL', () => {
    expect(
      buildNoterConnectConfigUrl('https://preview.noter.md/noter.js'),
    ).toBe('https://preview.noter.md/noter-connect.json')
  })

  it('documents the simple npm commands and advanced direct-file flows', () => {
    expect(formatHelpText()).toContain('npx @noter-md/sync connect')
    expect(formatHelpText()).toContain('npx @noter-md/sync run')
    expect(formatHelpText()).toContain('node ./noter.js connect')
    expect(formatHelpText()).toContain('node ./noter.js run')
    expect(formatHelpText()).toContain(
      `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    )
    expect(formatHelpText()).toContain(
      `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
    )
    expect(formatHelpText()).toContain(
      `curl -fsSL 'https://preview.noter.md/noter.js' | node --input-type=module - connect 'https://preview.noter.md/noter.js'`,
    )
    expect(formatHelpText()).toContain(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    )
    expect(formatHelpText()).toContain(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
    )
    expect(formatHelpText()).toContain(
      `curl.exe -fsSL 'https://preview.noter.md/noter.js' | node --input-type=module - connect 'https://preview.noter.md/noter.js'`,
    )
  })

  it('builds Windows-safe direct hosted-file commands', () => {
    expect(
      buildDirectConnectCommand('https://noter.md/noter.js', 'win32'),
    ).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect 'https://noter.md/noter.js'`,
    )
    expect(buildDirectRunCommand('https://noter.md/noter.js', 'win32')).toBe(
      `curl.exe -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
    )
  })

  it.runIf(process.platform !== 'win32')(
    'resolves symlinked entrypoints before checking direct execution',
    () => {
      const tempDirectory = path.join(tmpdir(), `noter-sync-link-${Date.now()}`)
      mkdirSync(tempDirectory, { recursive: true })
      const symlinkPath = path.join(tempDirectory, 'noter-sync')

      try {
        symlinkSync(path.resolve('packages/sync/noter.js'), symlinkPath)

        expect(resolveEntrypointUrl(symlinkPath)).toBe(
          pathToFileURL(path.resolve('packages/sync/noter.js')).href,
        )
      } finally {
        rmSync(tempDirectory, { force: true, recursive: true })
      }
    },
  )

  it('formats bootstrap status as markdown for terminal and LLM consumption', () => {
    const runCommand = buildDirectRunCommand('https://noter.md/noter.js')
    expect(
      formatBootstrapReadyMarkdown({
        codexVersion: 'codex 0.1.2',
        configPath: '/Users/noter/.noter/config.json',
        machineConnectUrl:
          'https://noter.md/machines/connect?openedByCli&requestId=request_123',
        machineId: 'machine_123',
        runCommand,
        sourceUrl: 'https://noter.md/noter.js',
      }),
    ).toBe(`# noter sync bootstrap ready

- source: https://noter.md/noter.js
- codex: codex 0.1.2
- machine: machine_123
- state: /Users/noter/.noter/config.json
- next: https://noter.md/machines/connect?openedByCli&requestId=request_123
- run: ${runCommand}`)
  })

  it('builds heartbeat payloads that advertise live-control readiness', () => {
    expect(
      buildMachineHeartbeatBody({
        connectorVersion: 'noter-sync (codex 0.1.2)',
        displayName: 'Research MacBook Pro',
        hostname: 'research-mbp.local',
        machineId: 'machine_123',
        os: 'macos',
        readLiveControlState: () => ({
          controlStatus: 'ready',
          controlStatusDetail: 'Live control ready.',
          controlUrl: 'https://research-machine.trycloudflare.com',
          controlUrlUpdatedAt: 1_775_379_530_000,
        }),
        status: 'online',
      }),
    ).toEqual({
      allowedRoots: [],
      capabilities: ['presence', 'liveControl'],
      connectorVersion: 'noter-sync (codex 0.1.2)',
      controlStatus: 'ready',
      controlStatusDetail: 'Live control ready.',
      controlUrl: 'https://research-machine.trycloudflare.com',
      controlUrlUpdatedAt: 1_775_379_530_000,
      displayName: 'Research MacBook Pro',
      hostname: 'research-mbp.local',
      machineId: 'machine_123',
      os: 'macos',
      status: 'online',
    })
  })

  it.runIf(process.platform !== 'win32')(
    'stops the heartbeat loop when the machine credential is not approved',
    async () => {
      const originalFetch = global.fetch
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(JSON.stringify({ error: 'invalid machine credential' }), {
          headers: {
            'content-type': 'application/json',
          },
          status: 401,
        }),
      )
      global.fetch = fetchMock

      try {
        await expect(
          runHeartbeatLoop({
            connectorVersion: 'noter-sync (codex 0.1.2)',
            displayName: 'Research MacBook Pro',
            heartbeatUrl:
              'https://demo.convex.site/connected-machines/heartbeat',
            hostname: 'research-mbp.local',
            machineCredential: 'mmc_invalid',
            machineId: 'machine_123',
            os: 'macos',
          }),
        ).rejects.toThrow(
          'This machine is not approved yet. Finish approval in Noter and retry `noter-sync run`.',
        )

        expect(fetchMock).toHaveBeenCalledTimes(1)
      } finally {
        global.fetch = originalFetch
      }
    },
  )

  it('routes prefixed status requests through the shared local control router', async () => {
    const statusPayload = {
      workspaceRoot: '/tmp/noter',
      codexInstalled: true,
      codexVersion: 'codex 0.1.2',
      codexInstallError: null,
      runtime: {
        running: false,
        initialized: false,
        startedAt: null,
        currentThreadId: null,
        lastError: null,
        lastExitCode: null,
        lastExitSignal: null,
        pendingRequestCount: 0,
        pendingApprovalCount: 0,
        eventCursor: 0,
      },
    }
    const runtime = {
      getStatus: vi.fn().mockResolvedValue(statusPayload),
    }
    const router = createCodexLocalControlRouter({
      routeBasePath: '/control',
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res, () => {
        res.statusCode = 404
        res.end('not found')
      })
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(
        `http://127.0.0.1:${address.port}/control/status`,
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        ...statusPayload,
        service: {
          auth: {
            allowedOrigins: [],
            enforced: false,
            machineId: null,
            mode: 'disabled',
            positiveCacheSize: 0,
          },
          loopbackOnly: false,
          routeBasePath: '/control',
        },
      })
      expect(runtime.getStatus).toHaveBeenCalledTimes(1)
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('rejects unauthenticated thread reads when machine-control auth is enabled', async () => {
    const runtime = {
      ensureRuntime: vi.fn().mockResolvedValue({
        runtime: {
          running: false,
        },
        success: true,
      }),
      listThreads: vi.fn(),
    }
    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl:
          'https://noter.md/connected-machines/control/introspect',
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Origin: 'https://noter.md',
        },
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: 'Missing bearer token.',
      })
      expect(runtime.ensureRuntime).not.toHaveBeenCalled()
      expect(runtime.listThreads).not.toHaveBeenCalled()
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://noter.md',
      )
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('returns redacted status without runtime metadata when auth is enabled', async () => {
    const runtime = {
      getStatus: vi.fn().mockResolvedValue({
        runtime: {
          running: true,
        },
        workspaceRoot: '/repo',
      }),
    }
    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl:
          'https://noter.md/connected-machines/control/introspect',
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/status`, {
        headers: {
          Origin: 'https://noter.md',
        },
      })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        service: {
          auth: {
            enforced: true,
            machineId: null,
            mode: 'machine-control',
          },
          loopbackOnly: false,
          routeBasePath: '',
        },
      })
      expect(runtime.getStatus).not.toHaveBeenCalled()
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://noter.md',
      )
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('rejects synthetic bearer tokens on /status before exposing runtime metadata', async () => {
    const runtime = {
      getStatus: vi.fn().mockResolvedValue({
        runtime: {
          running: true,
        },
        workspaceRoot: '/repo',
      }),
    }
    const introspectionServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          active: false,
        }),
      )
    })

    await new Promise((resolve, reject) => {
      introspectionServer.once('error', reject)
      introspectionServer.listen(0, '127.0.0.1', () => {
        introspectionServer.removeListener('error', reject)
        resolve(undefined)
      })
    })

    const introspectionAddress = introspectionServer.address()
    if (!introspectionAddress || typeof introspectionAddress === 'string') {
      throw new Error('Expected a TCP introspection server address')
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/status`, {
        headers: {
          Authorization: 'Bearer mmct_readiness_probe',
          Origin: 'https://noter.md',
        },
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: 'Machine control token is inactive.',
      })
      expect(runtime.getStatus).not.toHaveBeenCalled()
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
      await new Promise((resolve, reject) => {
        introspectionServer.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('returns 503 from /status when machine-control introspection is unavailable', async () => {
    const runtime = {
      getStatus: vi.fn(),
    }
    const introspectionServer = createServer((_req, res) => {
      res.statusCode = 503
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          error: 'temporarily unavailable',
        }),
      )
    })

    await new Promise((resolve, reject) => {
      introspectionServer.once('error', reject)
      introspectionServer.listen(0, '127.0.0.1', () => {
        introspectionServer.removeListener('error', reject)
        resolve(undefined)
      })
    })

    const introspectionAddress = introspectionServer.address()
    if (!introspectionAddress || typeof introspectionAddress === 'string') {
      throw new Error('Expected a TCP introspection server address')
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/status`, {
        headers: {
          Authorization: 'Bearer mmct_readiness_probe',
          Origin: 'https://noter.md',
        },
      })
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: 'Machine control introspection failed: HTTP 503.',
      })
      expect(runtime.getStatus).not.toHaveBeenCalled()
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
      await new Promise((resolve, reject) => {
        introspectionServer.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('reuses cached positive machine-control introspection results', async () => {
    const runtime = {
      ensureRuntime: vi.fn().mockResolvedValue({
        runtime: {
          running: true,
        },
        success: true,
      }),
      listThreads: vi.fn().mockResolvedValue({
        nextCursor: null,
        pinnedThreadIds: [],
        runtime: {
          currentThreadId: null,
          eventCursor: 0,
          initialized: true,
          lastError: null,
          lastExitCode: null,
          lastExitSignal: null,
          pendingApprovalCount: 0,
          pendingRequestCount: 0,
          running: true,
          startedAt: null,
        },
        threads: [],
      }),
    }
    const introspectionHits = vi.fn()
    const introspectionServer = createServer((req, res) => {
      introspectionHits()
      expect(req.method).toBe('POST')
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          active: true,
          audience: 'machine-control',
          expiresAt: Date.now() + 60_000,
          machineId: 'machine_123',
          userId: 'user_123',
        }),
      )
    })

    await new Promise((resolve, reject) => {
      introspectionServer.once('error', reject)
      introspectionServer.listen(0, '127.0.0.1', () => {
        introspectionServer.removeListener('error', reject)
        resolve(undefined)
      })
    })

    const introspectionAddress = introspectionServer.address()
    if (!introspectionAddress || typeof introspectionAddress === 'string') {
      throw new Error('Expected a TCP introspection server address')
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const headers = {
        Authorization: 'Bearer mmct_fixture',
        Origin: 'https://noter.md',
      }

      const firstResponse = await fetch(
        `http://127.0.0.1:${address.port}/threads`,
        { headers },
      )
      expect(firstResponse.status).toBe(200)

      const secondResponse = await fetch(
        `http://127.0.0.1:${address.port}/threads`,
        { headers },
      )
      expect(secondResponse.status).toBe(200)

      expect(introspectionHits).toHaveBeenCalledTimes(1)
      expect(runtime.ensureRuntime).toHaveBeenCalledTimes(2)
      expect(runtime.listThreads).toHaveBeenCalledTimes(2)
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
      await new Promise((resolve, reject) => {
        introspectionServer.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('returns 503 when machine-control introspection stays unavailable', async () => {
    const runtime = {
      ensureRuntime: vi.fn(),
      listThreads: vi.fn(),
    }
    const introspectionServer = createServer((_req, res) => {
      res.statusCode = 503
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          error: 'temporarily unavailable',
        }),
      )
    })

    await new Promise((resolve, reject) => {
      introspectionServer.once('error', reject)
      introspectionServer.listen(0, '127.0.0.1', () => {
        introspectionServer.removeListener('error', reject)
        resolve(undefined)
      })
    })

    const introspectionAddress = introspectionServer.address()
    if (!introspectionAddress || typeof introspectionAddress === 'string') {
      throw new Error('Expected a TCP introspection server address')
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Authorization: 'Bearer mmct_fixture',
          Origin: 'https://noter.md',
        },
      })
      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: 'Machine control introspection failed: HTTP 503.',
      })
      expect(runtime.ensureRuntime).not.toHaveBeenCalled()
      expect(runtime.listThreads).not.toHaveBeenCalled()
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
      await new Promise((resolve, reject) => {
        introspectionServer.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('returns 401 when machine-control introspection marks a token inactive', async () => {
    const runtime = {
      ensureRuntime: vi.fn(),
      listThreads: vi.fn(),
    }
    const introspectionServer = createServer((_req, res) => {
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          active: false,
        }),
      )
    })

    await new Promise((resolve, reject) => {
      introspectionServer.once('error', reject)
      introspectionServer.listen(0, '127.0.0.1', () => {
        introspectionServer.removeListener('error', reject)
        resolve(undefined)
      })
    })

    const introspectionAddress = introspectionServer.address()
    if (!introspectionAddress || typeof introspectionAddress === 'string') {
      throw new Error('Expected a TCP introspection server address')
    }

    const router = createCodexLocalControlRouter({
      machineControlAuth: {
        allowedOrigins: ['https://noter.md'],
        introspectionUrl: `http://127.0.0.1:${introspectionAddress.port}/introspect`,
        machineId: 'machine_123',
      },
      runtime,
    })
    const server = createServer((req, res) => {
      void router(req, res)
    })

    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolve(undefined)
      })
    })

    try {
      const address = server.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP server address')
      }

      const response = await fetch(`http://127.0.0.1:${address.port}/threads`, {
        headers: {
          Authorization: 'Bearer mmct_fixture',
          Origin: 'https://noter.md',
        },
      })
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({
        error: 'Machine control token is inactive.',
      })
      expect(runtime.ensureRuntime).not.toHaveBeenCalled()
      expect(runtime.listThreads).not.toHaveBeenCalled()
    } finally {
      await new Promise((resolve, reject) => {
        server.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
      await new Promise((resolve, reject) => {
        introspectionServer.close(error => {
          if (error) {
            reject(error)
            return
          }

          resolve(undefined)
        })
      })
    }
  })

  it('starts the local control server on loopback with 404s for unknown routes', async () => {
    const localControlServer = await startLocalCodexControlServer({
      workspaceRoot: process.cwd(),
    })

    try {
      expect(localControlServer.origin.startsWith('http://127.0.0.1:')).toBe(
        true,
      )

      const response = await fetch(`${localControlServer.origin}/missing`)
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({
        error: 'Unknown Codex research route: /missing',
      })
    } finally {
      await localControlServer.close()
    }
  })
})
