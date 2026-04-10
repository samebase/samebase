import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'

import {
  APP_PAGE_METADATA,
  applyPageMetadata,
  resolveAppPageTitle,
  resolveNotFoundPageMetadata,
  resolvePageMetadata,
} from './pageMetadata'

class FakeHeadElement {
  readonly attributes = new Map<string, string>()

  constructor(readonly tagName: string) {}

  setAttribute(key: string, value: string) {
    this.attributes.set(key, value)
  }

  getAttribute(key: string) {
    return this.attributes.get(key) ?? null
  }
}

class FakeHead {
  private readonly elements: FakeHeadElement[] = []

  querySelector(selector: string) {
    const metaMatch = selector.match(/^meta\[(name|property)="([^"]+)"\]$/)
    if (metaMatch) {
      const [, key, value] = metaMatch
      return (
        this.elements.find(
          element =>
            element.tagName === 'meta' && element.getAttribute(key) === value,
        ) ?? null
      )
    }

    const linkMatch = selector.match(/^link\[rel="([^"]+)"\]$/)
    if (linkMatch) {
      const [, value] = linkMatch
      return (
        this.elements.find(
          element =>
            element.tagName === 'link' && element.getAttribute('rel') === value,
        ) ?? null
      )
    }

    return null
  }

  appendChild(element: FakeHeadElement) {
    this.elements.push(element)
    return element
  }
}

class FakeDocument {
  title = ''
  readonly head = new FakeHead()

  createElement(tagName: string) {
    return new FakeHeadElement(tagName)
  }
}

function withFakeDocument(run: (document: FakeDocument) => void) {
  const document = new FakeDocument()
  const existingDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    'document',
  )
  const existingWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')

  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { location: { origin: 'https://preview.noter.example' } },
  })

  try {
    run(document)
  } finally {
    if (existingDocument) {
      Object.defineProperty(globalThis, 'document', existingDocument)
    } else {
      Reflect.deleteProperty(globalThis, 'document')
    }

    if (existingWindow) {
      Object.defineProperty(globalThis, 'window', existingWindow)
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
}

function getHeadAttribute(
  document: FakeDocument,
  selector: string,
  attributeName: string,
) {
  const element = document.head.querySelector(selector)
  return element?.getAttribute(attributeName) ?? null
}

describe('page metadata', () => {
  it('pins canonical and social URLs to noter.md', () => {
    withFakeDocument(document => {
      applyPageMetadata({
        ...APP_PAGE_METADATA,
        canonicalPath: '/vault/acme/demo',
        title: resolveAppPageTitle('/vault/acme/demo'),
      })

      expect(document.title).toBe('Workspace | noter')
      expect(getHeadAttribute(document, 'link[rel="canonical"]', 'href')).toBe(
        'https://noter.md/vault/acme/demo',
      )
      expect(
        getHeadAttribute(document, 'meta[property="og:url"]', 'content'),
      ).toBe('https://noter.md/vault/acme/demo')
      expect(getHeadAttribute(document, 'meta[name="robots"]', 'content')).toBe(
        'noindex,nofollow',
      )
      expect(
        getHeadAttribute(document, 'meta[property="og:image"]', 'content'),
      ).toBe('https://noter.md/noter-social-card.png')
      expect(
        getHeadAttribute(document, 'meta[name="twitter:image"]', 'content'),
      ).toBe('https://noter.md/noter-social-card.png')
    })
  })

  it('keeps the privacy page crawlable with its own canonical URL', () => {
    withFakeDocument(document => {
      applyPageMetadata(
        resolvePageMetadata({
          pathname: '/privacy',
          isAuthenticated: false,
        }),
      )

      expect(document.title).toBe('Privacy Policy | noter')
      expect(getHeadAttribute(document, 'link[rel="canonical"]', 'href')).toBe(
        'https://noter.md/privacy',
      )
      expect(getHeadAttribute(document, 'meta[name="robots"]', 'content')).toBe(
        'index,follow',
      )
      expect(
        getHeadAttribute(document, 'meta[property="og:url"]', 'content'),
      ).toBe('https://noter.md/privacy')
    })
  })

  it('keeps the terms page crawlable with its own canonical URL', () => {
    withFakeDocument(document => {
      applyPageMetadata(
        resolvePageMetadata({
          pathname: '/terms',
          isAuthenticated: false,
        }),
      )

      expect(document.title).toBe('Terms of Service | noter')
      expect(getHeadAttribute(document, 'link[rel="canonical"]', 'href')).toBe(
        'https://noter.md/terms',
      )
      expect(getHeadAttribute(document, 'meta[name="robots"]', 'content')).toBe(
        'index,follow',
      )
      expect(
        getHeadAttribute(document, 'meta[property="og:url"]', 'content'),
      ).toBe('https://noter.md/terms')
    })
  })

  it('keeps the pitch deck routes public but non-indexed', () => {
    const deckPaths = [
      {
        pathname: '/pitch',
        title: 'Pitch Deck | Noter',
        canonicalUrl: 'https://noter.md/pitch',
      },
      {
        pathname: '/pitch/print',
        title: 'Pitch Deck Print | Noter',
        canonicalUrl: 'https://noter.md/pitch/print',
      },
      {
        pathname: '/pitch/print/mobile',
        title: 'Pitch Deck Mobile Print | Noter',
        canonicalUrl: 'https://noter.md/pitch/print/mobile',
      },
    ] as const

    for (const deckPath of deckPaths) {
      withFakeDocument(document => {
        applyPageMetadata(
          resolvePageMetadata({
            pathname: deckPath.pathname,
            isAuthenticated: false,
          }),
        )

        expect(document.title).toBe(deckPath.title)
        expect(
          getHeadAttribute(document, 'link[rel="canonical"]', 'href'),
        ).toBe(deckPath.canonicalUrl)
        expect(
          getHeadAttribute(document, 'meta[name="robots"]', 'content'),
        ).toBe('noindex,nofollow')
        expect(
          getHeadAttribute(document, 'meta[property="og:url"]', 'content'),
        ).toBe(deckPath.canonicalUrl)
      })
    }
  })

  it('returns a dedicated title for the machine connect route', () => {
    expect(resolveAppPageTitle('/machines/connect')).toBe(
      'Connect This Machine | noter',
    )
  })

  it('returns a dedicated title for the machines route', () => {
    expect(resolveAppPageTitle('/machines')).toBe('Machines | noter')
  })

  it('builds dedicated not-found metadata without indexing the missing path', () => {
    expect(resolveNotFoundPageMetadata('/missing')).toEqual({
      canonicalPath: '/missing',
      description: 'The requested noter page could not be found.',
      openGraphType: 'website',
      robots: 'noindex,nofollow',
      title: 'Page not found | noter',
    })
  })

  it('gives the codex research route a dedicated app title', () => {
    expect(resolveAppPageTitle('/research/codex-app-server')).toBe(
      'Codex App Server Research | noter',
    )
  })

  it('gives the codex browser research route a dedicated app title', () => {
    expect(resolveAppPageTitle('/research/codex-app-server/browser')).toBe(
      'Codex Thread Browser Research | noter',
    )
  })
  it('keeps the raw html shell aligned with the real public homepage', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), {
      encoding: 'utf8',
    })

    expect(html).toContain('name="robots" content="index,follow"')
    expect(html).toContain('<link rel="canonical" href="https://noter.md/"')
    expect(html).toContain('property="og:url" content="https://noter.md/"')
    expect(html).toContain(
      'property="og:image"\n      content="https://noter.md/noter-social-card.png"',
    )
    expect(html).toContain('name="twitter:image"')
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"')
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />',
    )
  })
})
