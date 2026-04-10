import { describe, expect, it } from 'vite-plus/test'

import { buildMonacoFileUri } from './monacoFileUri'

describe('buildMonacoFileUri', () => {
  it('encodes branch as a single URI segment', () => {
    const uri = buildMonacoFileUri({
      vaultId: 'vault_123',
      branch: 'feature/foo',
      filePath: 'src/index.ts',
    })

    expect(uri).toBe('file:///vault_123/feature%2Ffoo/src/index.ts')
  })

  it('keeps branch/file boundaries distinct', () => {
    const left = buildMonacoFileUri({
      vaultId: 'vault_123',
      branch: 'feature/foo',
      filePath: 'bar.ts',
    })
    const right = buildMonacoFileUri({
      vaultId: 'vault_123',
      branch: 'feature',
      filePath: 'foo/bar.ts',
    })

    expect(left).not.toBe(right)
  })
})
