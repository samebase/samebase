import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRICING_PAGE_METADATA, applyPageMetadata } from "./pageMetadata";

class FakeHeadElement {
  readonly attributes = new Map<string, string>();

  constructor(readonly tagName: string) {}

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
          (element) =>
            element.tagName === "meta" && element.getAttribute(key) === value,
        ) ?? null
      );
    }

    const linkMatch = selector.match(/^link\[rel="([^"]+)"\]$/);
    if (linkMatch) {
      const [, value] = linkMatch;
      return (
        this.elements.find(
          (element) =>
            element.tagName === "link" && element.getAttribute("rel") === value,
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
  const existingDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  const existingWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { origin: "https://preview.noter.example" } },
  });

  try {
    run(document);
  } finally {
    if (existingDocument) {
      Object.defineProperty(globalThis, "document", existingDocument);
    } else {
      Reflect.deleteProperty(globalThis, "document");
    }

    if (existingWindow) {
      Object.defineProperty(globalThis, "window", existingWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

function getHeadAttribute(
  document: FakeDocument,
  selector: string,
  attributeName: string,
) {
  const element = document.head.querySelector(selector);
  return element?.getAttribute(attributeName) ?? null;
}

describe("page metadata", () => {
  it("pins canonical and social URLs to noter.md", () => {
    withFakeDocument((document) => {
      applyPageMetadata(PRICING_PAGE_METADATA);

      expect(document.title).toBe("Pricing | Noter");
      expect(getHeadAttribute(document, 'link[rel="canonical"]', "href")).toBe(
        "https://noter.md/pricing",
      );
      expect(
        getHeadAttribute(document, 'meta[property="og:url"]', "content"),
      ).toBe("https://noter.md/pricing");
      expect(
        getHeadAttribute(document, 'meta[property="og:image"]', "content"),
      ).toBe("https://noter.md/lumina_icon.png");
      expect(
        getHeadAttribute(document, 'meta[name="twitter:image"]', "content"),
      ).toBe("https://noter.md/lumina_icon.png");
    });
  });

  it("keeps the raw html shell non-indexable until route metadata is applied", () => {
    const html = readFileSync(new URL("../../index.html", import.meta.url), {
      encoding: "utf8",
    });

    expect(html).toContain('name="robots" content="noindex,nofollow"');
    expect(html).not.toContain(
      '<link rel="canonical" href="https://noter.md/"',
    );
    expect(html).not.toContain('property="og:url" content="https://noter.md/"');
  });
});
