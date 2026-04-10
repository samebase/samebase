import { describe, expect, it } from 'vite-plus/test'
import {
  buildDaytonaDepsImageName,
  resolveDaytonaDepsImageCandidates,
} from './depsImage'

describe('daytonaDepsImage', () => {
  it('derives the canonical GHCR image name from owner repo and hash', () => {
    expect(
      buildDaytonaDepsImageName({
        owner: 'OpenAI',
        repo: 'Noter',
        tag: 'abc123',
      }),
    ).toBe('ghcr.io/openai/noter-daytona-deps:abc123')
  })

  it('returns input-hash and lock-hash candidates in order', () => {
    expect(
      resolveDaytonaDepsImageCandidates({
        owner: 'OpenAI',
        repo: 'Noter',
        inputHash: 'input-hash',
        lockHash: 'lock-hash',
      }),
    ).toEqual([
      'ghcr.io/openai/noter-daytona-deps:input-hash',
      'ghcr.io/openai/noter-daytona-deps:lock-hash',
    ])
  })

  it('deduplicates identical hashes and skips blank values', () => {
    expect(
      resolveDaytonaDepsImageCandidates({
        owner: 'OpenAI',
        repo: 'Noter',
        inputHash: ' shared-hash ',
        lockHash: 'shared-hash',
      }),
    ).toEqual(['ghcr.io/openai/noter-daytona-deps:shared-hash'])

    expect(
      resolveDaytonaDepsImageCandidates({
        owner: 'OpenAI',
        repo: 'Noter',
        inputHash: null,
        lockHash: ' ',
      }),
    ).toEqual([])
  })

  it('returns no candidates when owner or repo are blank', () => {
    expect(
      resolveDaytonaDepsImageCandidates({
        owner: ' ',
        repo: 'Noter',
        inputHash: 'input-hash',
        lockHash: null,
      }),
    ).toEqual([])

    expect(
      resolveDaytonaDepsImageCandidates({
        owner: 'OpenAI',
        repo: ' ',
        inputHash: 'input-hash',
        lockHash: null,
      }),
    ).toEqual([])
  })
})
