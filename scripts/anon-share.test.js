import { describe, expect, it } from 'vitest'
import {
  parseCloudflaredQuickTunnelUrl,
  readLocalConvexUrlFromEnvContents,
} from './anon-share.js'

describe('anon-share', () => {
  it('extracts a quick tunnel URL from cloudflared output', () => {
    expect(
      parseCloudflaredQuickTunnelUrl(
        '2026-04-03T12:00:00Z INF | https://gentle-cinder-harbor.trycloudflare.com |',
      ),
    ).toBe('https://gentle-cinder-harbor.trycloudflare.com')
  })

  it('ignores unrelated cloudflared log lines', () => {
    expect(
      parseCloudflaredQuickTunnelUrl(
        '2026-04-03T12:00:00Z INF Registered tunnel connection',
      ),
    ).toBe(null)
  })

  it('prefers VITE_CONVEX_URL when reading the local anon env file', () => {
    expect(
      readLocalConvexUrlFromEnvContents(
        [
          'CONVEX_DEPLOYMENT=anonymous:anonymous-agent',
          'VITE_CONVEX_URL=http://127.0.0.1:11622',
          'VITE_CONVEX_SITE_URL=http://127.0.0.1:11623',
          '',
        ].join('\n'),
      ),
    ).toBe('http://127.0.0.1:11622')
  })

  it('falls back to CONVEX_URL when VITE_CONVEX_URL is absent', () => {
    expect(
      readLocalConvexUrlFromEnvContents(
        ['CONVEX_URL=http://127.0.0.1:3210', ''].join('\n'),
      ),
    ).toBe('http://127.0.0.1:3210')
  })
})
