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

import { describe, expect, it } from 'vitest'

import {
  buildNoterConnectConfigUrl,
  buildMachineConnectUrl,
  formatBootstrapReadyMarkdown,
  formatHelpText,
  getNoterConfigPath,
  NOTER_SYNC_SOURCE_URL,
  parseCliArgs,
  readLocalConfig,
  resolveEntrypointUrl,
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
    expect(
      formatBootstrapReadyMarkdown({
        codexVersion: 'codex 0.1.2',
        configPath: '/Users/noter/.noter/config.json',
        machineConnectUrl:
          'https://noter.md/machines/connect?openedByCli&requestId=request_123',
        machineId: 'machine_123',
        runCommand: `curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`,
        sourceUrl: 'https://noter.md/noter.js',
      }),
    ).toBe(`# noter sync bootstrap ready

- source: https://noter.md/noter.js
- codex: codex 0.1.2
- machine: machine_123
- state: /Users/noter/.noter/config.json
- next: https://noter.md/machines/connect?openedByCli&requestId=request_123
- run: curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - run`)
  })
})
