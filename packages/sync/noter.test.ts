import { describe, expect, it } from 'vitest'

import {
  buildInstallationId,
  buildMachineConnectUrl,
  formatBootstrapReadyMarkdown,
  formatHelpText,
  getInstallationStatePath,
  NOTER_SYNC_SOURCE_URL,
  parseCliArgs,
  validateSourceUrl,
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

  it('builds a stable multi-worktree installation file path', () => {
    const installationId = buildInstallationId(
      'https://preview.noter.md/noter.js',
    )
    expect(
      getInstallationStatePath({
        homeDirectory: '/Users/noter',
        installationId,
        sourceUrl: 'https://preview.noter.md/noter.js',
      }),
    ).toBe(`/Users/noter/.noter/sync/installations/${installationId}.json`)
  })

  it('builds the browser handoff URL for the current deploy', () => {
    expect(
      buildMachineConnectUrl({
        installationId: 'preview-installation',
        sourceUrl: 'https://preview.noter.md/noter.js',
      }),
    ).toBe(
      'https://preview.noter.md/machines/connect?source=https%3A%2F%2Fpreview.noter.md%2Fnoter.js&installation=preview-installation&openedByCli',
    )
  })

  it('documents the simple npm command and advanced direct-file flows', () => {
    expect(formatHelpText()).toContain('npx @noter-md/sync connect')
    expect(formatHelpText()).toContain('node ./noter.js connect')
    expect(formatHelpText()).toContain(
      'curl -fsSL https://noter.md/noter.js | node --input-type=module - connect https://noter.md/noter.js',
    )
  })

  it('formats bootstrap status as markdown for terminal and LLM consumption', () => {
    expect(
      formatBootstrapReadyMarkdown({
        codexVersion: 'codex 0.1.2',
        installationPath: '/Users/noter/.noter/sync/installations/demo.json',
        machineConnectUrl: 'https://noter.md/machines/connect?openedByCli=1',
        sourceUrl: 'https://noter.md/noter.js',
      }),
    ).toBe(`# noter sync bootstrap ready

- source: https://noter.md/noter.js
- codex: codex 0.1.2
- state: /Users/noter/.noter/sync/installations/demo.json
- next: https://noter.md/machines/connect?openedByCli=1`)
  })
})
