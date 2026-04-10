import { describe, expect, it } from 'vite-plus/test'

import {
  DEFAULT_LANDING_SLOGAN,
  parseLandingSlogans,
  selectLandingSlogan,
} from './landingSlogans'

describe('parseLandingSlogans', () => {
  it('parses non-empty trimmed lines', () => {
    expect(parseLandingSlogans('\n  one  \n\n two\n')).toEqual(['one', 'two'])
  })

  it('parses markdown bullet items', () => {
    const raw = `- first
- second`
    expect(parseLandingSlogans(raw)).toEqual(['first', 'second'])
  })
})

describe('selectLandingSlogan', () => {
  it('falls back when no slogans are available', () => {
    expect(selectLandingSlogan([])).toBe(DEFAULT_LANDING_SLOGAN)
  })

  it('returns a custom fallback when provided', () => {
    expect(selectLandingSlogan([], 'custom fallback')).toBe('custom fallback')
  })

  it('selects a random slogan per call', () => {
    const slogans = ['first', 'second', 'third']

    expect(selectLandingSlogan(slogans, DEFAULT_LANDING_SLOGAN, () => 0)).toBe(
      'first',
    )
    expect(
      selectLandingSlogan(slogans, DEFAULT_LANDING_SLOGAN, () => 0.4),
    ).toBe('second')
    expect(
      selectLandingSlogan(slogans, DEFAULT_LANDING_SLOGAN, () => 0.9),
    ).toBe('third')
  })
})
