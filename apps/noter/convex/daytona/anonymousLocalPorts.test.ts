import { describe, expect, it } from 'vite-plus/test'
import {
  ANONYMOUS_LOCAL_PORT_PAIR_COUNT,
  listAnonymousLocalPortCandidates,
  pickAvailableAnonymousLocalPorts,
} from '../../../../runtime/anonymousLocalPorts.js'

describe('anonymousLocalPorts', () => {
  it('returns a stable candidate order for the same worktree root', () => {
    const first = listAnonymousLocalPortCandidates(
      '/home/daytona/workspace/noter',
    )
    const second = listAnonymousLocalPortCandidates(
      '/home/daytona/workspace/noter',
    )

    expect(first).toEqual(second)
    expect(first).toHaveLength(ANONYMOUS_LOCAL_PORT_PAIR_COUNT)
  })

  it('returns distinct cloud and site ports for each candidate', () => {
    const candidates = listAnonymousLocalPortCandidates(
      '/home/daytona/workspace/noter',
    )
    expect(candidates.length).toBeGreaterThan(1)

    expect(candidates[0].site).toBe(candidates[0].cloud + 1)
    expect(new Set(candidates.map(candidate => candidate.cloud)).size).toBe(
      candidates.length,
    )
    expect(new Set(candidates.map(candidate => candidate.site)).size).toBe(
      candidates.length,
    )
  })

  it('picks the first candidate whose cloud and site ports are both free', () => {
    const candidates = listAnonymousLocalPortCandidates(
      '/home/daytona/workspace/noter',
    )
    expect(candidates.length).toBeGreaterThan(1)
    const first = candidates[0]
    const second = candidates[1]

    const picked = pickAvailableAnonymousLocalPorts(
      '/home/daytona/workspace/noter',
      port => port === first.cloud || port === first.site,
    )

    expect(picked).toEqual(second)
  })
})
