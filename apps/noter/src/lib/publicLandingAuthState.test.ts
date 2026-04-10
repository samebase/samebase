// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vite-plus/test'
import { shouldRenderPublicLandingWithoutAuthGate } from './publicLandingAuthState'
import { validateRootRouteSearch } from './rootRouteSearch'

const originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
  window,
  'localStorage',
)

function createMockStorage(): Storage {
  const entries = new Map<string, string>()

  return {
    clear() {
      entries.clear()
    },
    getItem(key) {
      return entries.get(String(key)) ?? null
    },
    key(index) {
      return Array.from(entries.keys())[index] ?? null
    },
    get length() {
      return entries.size
    },
    removeItem(key) {
      entries.delete(String(key))
    },
    setItem(key, value) {
      entries.set(String(key), String(value))
    },
  }
}

afterEach(() => {
  if (originalLocalStorageDescriptor) {
    Object.defineProperty(
      window,
      'localStorage',
      originalLocalStorageDescriptor,
    )
    return
  }

  Reflect.deleteProperty(window, 'localStorage')
})

describe('publicLandingAuthState', () => {
  it('keeps the anonymous landing visible even when Convex auth tokens exist', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMockStorage(),
    })
    window.localStorage.setItem('__convexAuthRefreshToken', 'anon-token')

    expect(
      shouldRenderPublicLandingWithoutAuthGate(
        '/',
        validateRootRouteSearch({}),
      ),
    ).toBe(true)
  })

  it('hides the anonymous landing after a remembered auth flow starts', () => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: createMockStorage(),
    })
    window.localStorage.setItem('noter_auth_provider', 'google')

    expect(
      shouldRenderPublicLandingWithoutAuthGate(
        '/',
        validateRootRouteSearch({}),
      ),
    ).toBe(false)
  })
})
