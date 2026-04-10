import { describe, expect, it } from 'vite-plus/test'

import {
  listTouchedBranchesForRefresh,
  runPostCommitTreeRefresh,
  selectBatchReadRepositoryTree,
} from './fileStagingActions'

const featureTree = [
  {
    path: 'src/feature.ts',
    mode: '100644',
    type: 'blob',
    sha: 'feature-sha',
  },
]

const defaultTree = [
  {
    path: 'src/main.ts',
    mode: '100644',
    type: 'blob',
    sha: 'main-sha',
  },
]

describe('selectBatchReadRepositoryTree', () => {
  it('uses the branch tree when available', () => {
    expect(
      selectBatchReadRepositoryTree({
        requestedBranch: 'feature/login',
        defaultBranch: 'main',
        branchTree: featureTree,
        legacyTree: defaultTree,
      }),
    ).toEqual(featureTree)
  })

  it('falls back to legacy tree when no branch is requested', () => {
    expect(
      selectBatchReadRepositoryTree({
        defaultBranch: 'main',
        branchTree: featureTree,
        legacyTree: defaultTree,
      }),
    ).toEqual(defaultTree)
  })

  it('allows legacy fallback only for default branch requests', () => {
    expect(
      selectBatchReadRepositoryTree({
        requestedBranch: 'main',
        defaultBranch: 'main',
        branchTree: null,
        legacyTree: defaultTree,
      }),
    ).toEqual(defaultTree)
  })

  it('throws when non-default branch cache is missing', () => {
    expect(() =>
      selectBatchReadRepositoryTree({
        requestedBranch: 'feature/login',
        defaultBranch: 'main',
        branchTree: null,
        legacyTree: defaultTree,
      }),
    ).toThrow('Branch tree is not cached for "feature/login"')
  })
})

describe('listTouchedBranchesForRefresh', () => {
  it('deduplicates branches while preserving first-seen order', () => {
    expect(
      listTouchedBranchesForRefresh([
        'main',
        'feature/a',
        'main',
        'feature/b',
        'feature/a',
      ]),
    ).toEqual(['main', 'feature/a', 'feature/b'])
  })
})

describe('runPostCommitTreeRefresh', () => {
  it('returns updated vault when refresh succeeds', async () => {
    const calls: string[] = []
    const result = await runPostCommitTreeRefresh({
      refreshBranchTree: async () => {
        calls.push('branch')
      },
      refreshLegacyTree: async () => {
        calls.push('legacy')
      },
      loadUpdatedVault: async () => {
        calls.push('load')
        return { treeSHA: 'abc' }
      },
      onWarning: () => {
        throw new Error('Unexpected warning callback')
      },
    })

    expect(calls).toEqual(['branch', 'legacy', 'load'])
    expect(result).toEqual({ treeSHA: 'abc' })
  })

  it('swallows refresh errors and returns null', async () => {
    const warnings: unknown[] = []
    const result = await runPostCommitTreeRefresh({
      refreshBranchTree: async () => {
        throw new Error('network')
      },
      refreshLegacyTree: async () => undefined,
      loadUpdatedVault: async () => ({ treeSHA: 'abc' }),
      onWarning: error => {
        warnings.push(error)
      },
    })

    expect(result).toBeNull()
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toBeInstanceOf(Error)
  })
})
