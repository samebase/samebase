import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

import { buildNoterSyncPublicScript } from '../../noterSyncPublicScript'

describe('noter sync public script', () => {
  it('keeps the committed noter.js asset byte-for-byte in sync with the package source', () => {
    const publicScript = readFileSync(
      new URL('../../public/noter.js', import.meta.url),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .trimEnd()
    const packageScript = readFileSync(
      new URL('../../../../packages/sync/noter.js', import.meta.url),
      'utf8',
    )
      .replace(/\r\n/g, '\n')
      .trimEnd()
    const mirroredPublicScript = buildNoterSyncPublicScript({
      packageScript,
    }).trimEnd()

    expect(publicScript).toBe(packageScript)
    expect(publicScript).toBe(mirroredPublicScript)
  })
})
