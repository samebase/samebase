import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildMachineConnectUrl,
  formatBootstrapReadyMarkdown,
  formatHelpText,
  getNoterConfigPath,
  NOTER_SYNC_SOURCE_URL,
  parseCliArgs,
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
          sourceUrl: 'https://preview.noter.md/noter.js',
        }),
      ).toBe(configPath)

      expect(JSON.parse(readFileSync(configPath, 'utf8'))).toMatchObject({
        codexVersion: 'codex 0.1.2',
        installedAt: '2026-03-01T00:00:00.000Z',
        sourceUrl: 'https://preview.noter.md/noter.js',
      })
    } finally {
      rmSync(homeDirectory, { force: true, recursive: true })
    }
  })

  it('builds the browser handoff URL for the current deploy', () => {
    expect(buildMachineConnectUrl('https://preview.noter.md/noter.js')).toBe(
      'https://preview.noter.md/machines/connect?openedByCli',
    )
  })

  it('documents the simple npm command and advanced direct-file flows', () => {
    expect(formatHelpText()).toContain('npx @noter-md/sync connect')
    expect(formatHelpText()).toContain('node ./noter.js connect')
    expect(formatHelpText()).toContain(
      "curl -fsSL 'https://noter.md/noter.js' | node --input-type=module - connect",
    )
    expect(formatHelpText()).toContain(
      `SCRIPT_URL='https://preview.noter.md/noter.js'; curl -fsSL "$SCRIPT_URL" | node --input-type=module - connect "$SCRIPT_URL"`,
    )
  })

  it('formats bootstrap status as markdown for terminal and LLM consumption', () => {
    expect(
      formatBootstrapReadyMarkdown({
        codexVersion: 'codex 0.1.2',
        configPath: '/Users/noter/.noter/config.json',
        machineConnectUrl: 'https://noter.md/machines/connect?openedByCli',
        sourceUrl: 'https://noter.md/noter.js',
      }),
    ).toBe(`# noter sync bootstrap ready

- source: https://noter.md/noter.js
- codex: codex 0.1.2
- state: /Users/noter/.noter/config.json
- next: https://noter.md/machines/connect?openedByCli`)
  })
})
