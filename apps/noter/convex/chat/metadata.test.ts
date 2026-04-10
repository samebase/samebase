import { describe, expect, it } from 'vite-plus/test'

import { buildCommitProposalPayload, parseCommitPayload } from './metadata'

describe('commit proposal metadata', () => {
  it('preserves branch when present', () => {
    const payload = buildCommitProposalPayload({
      message: 'feat: add branch metadata',
      branch: 'feature/branch-aware-commit',
    })

    const parsed = parseCommitPayload(JSON.stringify(payload))
    expect(parsed?.branch).toBe('feature/branch-aware-commit')
    expect(parsed?.message).toBe('feat: add branch metadata')
  })

  it('keeps backward compatibility when branch is omitted', () => {
    const parsed = parseCommitPayload(
      JSON.stringify({
        type: 'commit_proposal',
        message: 'chore: keep old payload shape',
      }),
    )

    expect(parsed?.message).toBe('chore: keep old payload shape')
    expect(parsed?.branch).toBeUndefined()
  })
})
