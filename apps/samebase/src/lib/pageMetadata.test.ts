import { describe, expect, it, vi } from "vite-plus/test";
import { buildRootHead } from "@/lib/rootHead";

import {
  APP_PAGE_METADATA,
  applyPageMetadata,
  buildLogoLabPageHead,
  buildPageHead,
  DOCS_DO_IT_YOURSELF_PAGE_METADATA,
  DOCS_INDEX_PAGE_METADATA,
  DOCS_PRICING_PAGE_METADATA,
  DOCS_RECEIPTS_PAGE_METADATA,
  DOCS_THE_BIG_MIGRATION_PAGE_METADATA,
  DOCS_THE_STACK_PAGE_METADATA,
  PRIVACY_PAGE_METADATA,
  resolveAppPageTitle,
  resolveNotFoundPageMetadata,
  resolvePageMetadata,
  TERMS_PAGE_METADATA,
} from "./pageMetadata";
import { SAMEBASE_BRAND_COPY } from "./samebaseBrandCopy";

class FakeHeadElement {
  readonly attributes = new Map<string, string>();
  readonly tagName: string;

  constructor(tagName: string) {
    this.tagName = tagName;
  }

  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }

  getAttribute(key: string) {
    return this.attributes.get(key) ?? null;
  }
}

class FakeHead {
  private readonly elements: FakeHeadElement[] = [];

  querySelector(selector: string) {
    const metaMatch = selector.match(/^meta\[(name|property)="([^"]+)"\]$/);
    if (metaMatch) {
      const [, key, value] = metaMatch;
      return (
        this.elements.find(
          (element) => element.tagName === "meta" && element.getAttribute(key) === value,
        ) ?? null
      );
    }

    const linkMatch = selector.match(/^link\[rel="([^"]+)"\]$/);
    if (linkMatch) {
      const [, value] = linkMatch;
      return (
        this.elements.find(
          (element) => element.tagName === "link" && element.getAttribute("rel") === value,
        ) ?? null
      );
    }

    return null;
  }

  appendChild(element: FakeHeadElement) {
    this.elements.push(element);
    return element;
  }
}

class FakeDocument {
  title = "";
  readonly head = new FakeHead();

  createElement(tagName: string) {
    return new FakeHeadElement(tagName);
  }
}

function withFakeDocument(run: (document: FakeDocument) => void) {
  const document = new FakeDocument();

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { location: { origin: "https://preview.samebase.example" } });

  try {
    run(document);
  } finally {
    vi.unstubAllGlobals();
  }
}

function getHeadAttribute(document: FakeDocument, selector: string, attributeName: string) {
  const element = document.head.querySelector(selector);
  return element?.getAttribute(attributeName) ?? null;
}

describe("page metadata", () => {
  it("pins canonical and social URLs to samebase.com", () => {
    withFakeDocument((document) => {
      applyPageMetadata({
        ...APP_PAGE_METADATA,
        canonicalPath: "/repo/acme/demo",
        title: resolveAppPageTitle("/repo/acme/demo"),
      });

      expect(document.title).toBe(resolveAppPageTitle("/repo/acme/demo"));
      expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
        "https://samebase.com/repo/acme/demo",
      );
      expect(getHeadAttribute(document, 'meta[property="og:url"]', "content")).toBe(
        "https://samebase.com/repo/acme/demo",
      );
      expect(getHeadAttribute(document, 'meta[name="robots"]', "content")).toBe("noindex,nofollow");
      expect(getHeadAttribute(document, 'meta[property="og:image"]', "content")).toBe(
        "https://samebase.com/samebase-social-card.png",
      );
      expect(getHeadAttribute(document, 'meta[name="twitter:image"]', "content")).toBe(
        "https://samebase.com/samebase-social-card.png",
      );
    });
  });

  it("keeps the privacy page crawlable with its own canonical URL", () => {
    withFakeDocument((document) => {
      applyPageMetadata(
        resolvePageMetadata({
          pathname: "/privacy",
          isAuthenticated: false,
        }),
      );

      expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
        "https://samebase.com/privacy",
      );
      expect(getHeadAttribute(document, 'meta[name="robots"]', "content")).toBe("index,follow");
      expect(getHeadAttribute(document, 'meta[property="og:url"]', "content")).toBe(
        "https://samebase.com/privacy",
      );
    });
  });

  it("keeps the terms page crawlable with its own canonical URL", () => {
    withFakeDocument((document) => {
      applyPageMetadata(
        resolvePageMetadata({
          pathname: "/terms",
          isAuthenticated: false,
        }),
      );

      expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
        "https://samebase.com/terms",
      );
      expect(getHeadAttribute(document, 'meta[name="robots"]', "content")).toBe("index,follow");
      expect(getHeadAttribute(document, 'meta[property="og:url"]', "content")).toBe(
        "https://samebase.com/terms",
      );
    });
  });

  it("keeps the pitch deck routes public but non-indexed", () => {
    const deckPaths = [
      {
        pathname: "/pitch",
        canonicalUrl: "https://samebase.com/pitch",
      },
      {
        pathname: "/pitch/print",
        canonicalUrl: "https://samebase.com/pitch/print",
      },
      {
        pathname: "/pitch/print/mobile",
        canonicalUrl: "https://samebase.com/pitch/print/mobile",
      },
    ] as const;

    for (const deckPath of deckPaths) {
      withFakeDocument((document) => {
        applyPageMetadata(
          resolvePageMetadata({
            pathname: deckPath.pathname,
            isAuthenticated: false,
          }),
        );

        expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
          deckPath.canonicalUrl,
        );
        expect(getHeadAttribute(document, 'meta[name="robots"]', "content")).toBe(
          "noindex,nofollow",
        );
        expect(getHeadAttribute(document, 'meta[property="og:url"]', "content")).toBe(
          deckPath.canonicalUrl,
        );
      });
    }
  });

  it("keeps the trailing-slash handoff route non-indexed and canonical", () => {
    expect(
      resolvePageMetadata({
        pathname: "/agents/connect/",
        isAuthenticated: false,
      }),
    ).toMatchObject({
      canonicalPath: "/agents/connect",
      robots: "noindex,nofollow",
    });
  });

  it("keeps the MCP consent route non-indexed and canonical", () => {
    expect(
      resolvePageMetadata({
        pathname: "/oauth/mcp/consent",
        isAuthenticated: false,
      }),
    ).toMatchObject({
      canonicalPath: "/oauth/mcp/consent",
      robots: "noindex,nofollow",
    });
  });

  it("keeps the public root metadata separate from the dashboard app metadata", () => {
    expect(resolveAppPageTitle("/repo/")).toBe(resolveAppPageTitle("/repo"));
    expect(resolveAppPageTitle("/org/")).toBe(resolveAppPageTitle("/org"));
    expect(
      resolvePageMetadata({
        pathname: "/",
        isAuthenticated: true,
      }),
    ).toEqual({
      canonicalPath: "/",
      description: SAMEBASE_BRAND_COPY.homepage.description,
      openGraphType: "website",
      robots: "index,follow",
      title: SAMEBASE_BRAND_COPY.homepage.title,
    });
  });

  it("uses dedicated metadata for the docs index", () => {
    expect(
      resolvePageMetadata({
        pathname: "/docs",
        isAuthenticated: false,
      }),
    ).toEqual(DOCS_INDEX_PAGE_METADATA);
  });

  it("builds crawlable server metadata for each public decision page", () => {
    const pageMetadata = [
      DOCS_INDEX_PAGE_METADATA,
      DOCS_DO_IT_YOURSELF_PAGE_METADATA,
      DOCS_RECEIPTS_PAGE_METADATA,
      DOCS_THE_BIG_MIGRATION_PAGE_METADATA,
      DOCS_THE_STACK_PAGE_METADATA,
      DOCS_PRICING_PAGE_METADATA,
      PRIVACY_PAGE_METADATA,
      TERMS_PAGE_METADATA,
    ];

    for (const metadata of pageMetadata) {
      const head = buildPageHead(metadata);
      const canonicalUrl = new URL(metadata.canonicalPath, "https://samebase.com").toString();

      expect(head.links).toEqual([{ rel: "canonical", href: canonicalUrl }]);
      expect(head.meta).toContainEqual({ title: metadata.title });
      expect(head.meta).toContainEqual({
        name: "description",
        content: metadata.description,
      });
      expect(head.meta).toContainEqual({ name: "robots", content: "index,follow" });
      expect(head.meta).toContainEqual({ property: "og:url", content: canonicalUrl });
    }
  });

  it("builds non-indexed server metadata for public logo labs", () => {
    const head = buildLogoLabPageHead("/logo/iso", "Logo ISO Preview");

    expect(head.meta).toContainEqual({
      title: "Logo ISO Preview | Samebase",
    });
    expect(head.meta).toContainEqual({
      name: "robots",
      content: "noindex,nofollow",
    });
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: "https://samebase.com/logo/iso",
    });
    expect(head.links).toEqual([
      {
        rel: "canonical",
        href: "https://samebase.com/logo/iso",
      },
    ]);
  });

  it("keeps the root logo preview metadata after hydration", () => {
    expect(
      resolvePageMetadata({
        pathname: "/logo",
        isAuthenticated: false,
      }),
    ).toMatchObject({
      canonicalPath: "/logo",
      robots: "noindex,nofollow",
    });
  });

  it("omits the homepage canonical from nested route document shells", () => {
    expect(buildRootHead({ includeHomeCanonical: false }).links).not.toContainEqual({
      rel: "canonical",
      href: "https://samebase.com/",
    });
  });

  it("keeps the localStorage diagnostic route public but non-indexed", () => {
    withFakeDocument((document) => {
      applyPageMetadata(
        resolvePageMetadata({
          pathname: "/localStorage",
          isAuthenticated: false,
        }),
      );

      expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
        "https://samebase.com/localStorage",
      );
      expect(getHeadAttribute(document, 'meta[name="robots"]', "content")).toBe("noindex,nofollow");
    });
  });

  it("keeps the indexedDB diagnostic route public but non-indexed", () => {
    withFakeDocument((document) => {
      applyPageMetadata(
        resolvePageMetadata({
          pathname: "/indexDB",
          isAuthenticated: false,
        }),
      );

      expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
        "https://samebase.com/indexDB",
      );
      expect(getHeadAttribute(document, 'meta[name="robots"]', "content")).toBe("noindex,nofollow");
    });
  });

  it("builds dedicated not-found metadata without indexing the missing path", () => {
    expect(resolveNotFoundPageMetadata("/missing")).toMatchObject({
      canonicalPath: "/missing",
      robots: "noindex,nofollow",
    });
  });

  it("keeps the Start document shell aligned with the real public homepage", () => {
    const rootHead = buildRootHead();

    expect(rootHead.meta).toContainEqual({
      name: "robots",
      content: "index,follow",
    });
    expect(rootHead.links).toContainEqual({
      rel: "canonical",
      href: "https://samebase.com/",
    });
    const structuredDataScript = rootHead.scripts.find(
      (script) => script.type === "application/ld+json",
    );
    if (!structuredDataScript) {
      throw new Error("Expected structured identity metadata.");
    }
    expect(structuredDataScript.children).toContain(
      '"logo":"https://samebase.com/samebase-icon.svg"',
    );
    expect(structuredDataScript.children).toContain('"sameAs":["https://github.com/samebase"]');
    expect(structuredDataScript.children).not.toContain("github.com/samebase/samebase");
    expect(rootHead.meta).toContainEqual({
      property: "og:url",
      content: "https://samebase.com/",
    });
    expect(rootHead.meta).toContainEqual({
      property: "og:image",
      content: "https://samebase.com/samebase-social-card.png",
    });
    expect(rootHead.meta).toContainEqual({
      name: "twitter:image",
      content: "https://samebase.com/samebase-social-card.png",
    });
    expect(rootHead.links).toContainEqual({
      rel: "manifest",
      href: "/manifest.webmanifest",
    });
    expect(rootHead.links).toContainEqual({
      rel: "icon",
      type: "image/png",
      href: "/favicon.png",
      sizes: "16x16",
    });
    expect(rootHead.links).toContainEqual({
      rel: "icon",
      type: "image/png",
      href: "/favicon-32.png",
      sizes: "32x32",
    });
    expect(rootHead.links).toContainEqual({
      rel: "icon",
      type: "image/png",
      href: "/icon-192.png",
      sizes: "192x192",
    });
    const stylesheetLinks = rootHead.links.filter((link) => link.rel === "stylesheet");
    expect(stylesheetLinks).toEqual(
      import.meta.env.DEV
        ? [
            {
              rel: "stylesheet",
              href: "/src/index.css",
            },
          ]
        : [],
    );
    expect(
      stylesheetLinks.some(
        (link) => link.href.includes("/assets/") || link.href.includes("index.css?url"),
      ),
    ).toBe(false);
    expect(rootHead.meta).toContainEqual({
      name: "theme-color",
      content: "#ffffff",
    });
    expect(
      rootHead.scripts.some((script) =>
        script.children.includes('window.addEventListener("beforeinstallprompt", (event) => {'),
      ),
    ).toBe(true);
    expect(
      rootHead.scripts.some((script) => script.children.includes("event.preventDefault();")),
    ).toBe(true);
    expect(
      rootHead.scripts.some((script) =>
        script.children.includes("data-public-landing-logo-static-fallback-hidden"),
      ),
    ).toBe(true);
    expect(rootHead.links).toContainEqual({
      rel: "apple-touch-icon",
      href: "/apple-touch-icon.png",
      sizes: "180x180",
    });
  });
});
