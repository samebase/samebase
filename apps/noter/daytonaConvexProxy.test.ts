import { describe, expect, it } from 'vite-plus/test'

import {
  readEnvFileValue,
  resolveDaytonaConvexProxyTarget,
} from './daytonaConvexProxy'

describe('daytonaConvexProxy', () => {
  it('prefers the local Convex URL in Daytona preview mode', () => {
    expect(
      resolveDaytonaConvexProxyTarget({
        devOrigin: 'https://preview.daytona.example',
        envProxyTarget: 'http://127.0.0.1:11310',
        localEnvConvexUrl: 'http://127.0.0.1:11036',
      }),
    ).toBe('http://127.0.0.1:11036')
  })

  it('falls back to the explicit proxy target outside Daytona preview mode', () => {
    expect(
      resolveDaytonaConvexProxyTarget({
        devOrigin: undefined,
        envProxyTarget: 'http://127.0.0.1:11310',
        localEnvConvexUrl: 'http://127.0.0.1:11036',
      }),
    ).toBe('http://127.0.0.1:11310')
  })

  it('reads raw env file values without process env overrides', () => {
    const envPath = new URL(
      './fixtures/daytona-convex-proxy.env',
      import.meta.url,
    )

    expect(readEnvFileValue(envPath.pathname, 'VITE_CONVEX_URL')).toBe(
      'http://127.0.0.1:11036',
    )
  })
})
