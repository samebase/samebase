import { describe, expect, it } from 'vite-plus/test'

import {
  buildPathWithQuery,
  buildPathWithUpdatedQuery,
  buildSearchString,
  cloneQueryParams,
  setQueryParam,
} from './queryParams'

describe('buildSearchString', () => {
  it('serializes key-only flags without adding equals signs', () => {
    const searchParams = cloneQueryParams()
    setQueryParam(searchParams, 'prod-ui', true)
    setQueryParam(searchParams, 'auth', 'google')

    expect(buildSearchString(searchParams)).toBe('?prod-ui&auth=google')
  })
})

describe('buildPathWithUpdatedQuery', () => {
  it('adds query flags without replacing unrelated params', () => {
    const nextPath = buildPathWithUpdatedQuery(
      {
        pathname: '/',
        search: '?prod-ui',
      },
      searchParams => {
        setQueryParam(searchParams, 'dev', true)
      },
    )

    expect(nextPath).toBe('/?prod-ui&dev')
  })

  it('removes only the targeted query flag', () => {
    const nextPath = buildPathWithUpdatedQuery(
      {
        pathname: '/',
        search: '?prod-ui&dev',
      },
      searchParams => {
        setQueryParam(searchParams, 'dev', false)
      },
    )

    expect(nextPath).toBe('/?prod-ui')
  })

  it('preserves unrelated params while switching review mode', () => {
    const nextPath = buildPathWithUpdatedQuery(
      {
        pathname: '/vault/octo/repo/main/src/App.tsx',
        search: '?prod-ui&review&mobileLineNumbers=1',
      },
      searchParams => {
        setQueryParam(searchParams, 'review', false)
        setQueryParam(searchParams, 'diff', true)
      },
    )

    expect(nextPath).toBe(
      '/vault/octo/repo/main/src/App.tsx?prod-ui&mobileLineNumbers=1&diff',
    )
  })
})

describe('buildPathWithQuery', () => {
  it('accepts TanStack-style hash strings without a leading number sign', () => {
    expect(
      buildPathWithQuery({
        pathname: '/',
        search: '?prod-ui',
        hash: 'section',
      }),
    ).toBe('/?prod-ui#section')
  })

  it('collapses duplicate leading number signs in hash input', () => {
    expect(
      buildPathWithQuery({
        pathname: '/',
        search: '?prod-ui',
        hash: '##section',
      }),
    ).toBe('/?prod-ui#section')
  })
})
