import { describe, expect, it } from 'vitest'

import {
  buildInstallationId,
  buildMachineConnectUrl,
  formatHelpText,
  getInstallationStatePath,
  parseCliArgs,
  validateSourceUrl,
} from './noter.js'

describe('@noter-md/sync', () => {
  it('parses the public connect command shape', () => {
    expect(
      parseCliArgs(['connect', '--from', 'https://preview.noter.md/noter.js']),
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
      'The --from URL must use https, except for explicit localhost testing.',
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
      'https://preview.noter.md/machines/connect?source=https%3A%2F%2Fpreview.noter.md%2Fnoter.js&installation=preview-installation&openedByCli=1',
    )
  })

  it('documents both the npm and pipe-to-node entry forms', () => {
    expect(formatHelpText()).toContain(
      'npx @noter-md/sync connect --from https://noter.md/noter.js',
    )
    expect(formatHelpText()).toContain(
      'curl -fsSL https://noter.md/noter.js | node --input-type=module - connect --from https://noter.md/noter.js',
    )
  })
})
