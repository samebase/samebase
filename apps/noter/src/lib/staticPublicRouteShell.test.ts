import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { TERMS_PAGE_METADATA } from "./pageMetadata";
import {
  renderStaticLegalRouteRootHtml,
  renderStaticPublicRouteShellHtml,
} from "./staticPublicRouteShell";

const appHtml = `<!doctype html>
<html lang="en" translate="no">
  <head>
    <title>noter | GitHub-backed markdown notes and AI workspace</title>
    <meta name="description" content="home description" />
    <meta name="robots" content="index,follow" />
    <link rel="canonical" href="https://noter.md/" />
    <meta property="og:site_name" content="noter" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="home title" />
    <meta property="og:description" content="home description" />
    <meta property="og:url" content="https://noter.md/" />
    <meta property="og:image" content="https://noter.md/noter-social-card.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="home title" />
    <meta name="twitter:description" content="home description" />
    <meta name="twitter:image" content="https://noter.md/noter-social-card.png" />
    <script type="module" crossorigin src="/assets/app.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/app.css" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

describe("renderStaticPublicRouteShellHtml", () => {
  it("stamps legal route metadata onto the app html shell", () => {
    const termsMarkdown = readFileSync(
      new URL("../content/terms-of-service.md", import.meta.url),
      "utf8",
    );

    const html = renderStaticPublicRouteShellHtml({
      appHtml,
      metadata: TERMS_PAGE_METADATA,
      rootHtml: renderStaticLegalRouteRootHtml(termsMarkdown),
    });

    expect(html).toContain("<title>Terms of Service | noter</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://noter.md/terms" />',
    );
    expect(html).toContain(
      '<script type="module" crossorigin src="/assets/app.js"></script>',
    );
    expect(html).toContain(
      '<link rel="stylesheet" crossorigin href="/assets/app.css" />',
    );
    expect(html).toContain('<div id="root"><main class="flex min-h-svh');
    expect(html).toContain("cm-editor cm-static-markdown");
    expect(html).toContain(
      '<h1 class="cm-line cm-static-markdown-heading-1">Terms of Service</h1>',
    );
    expect(html).not.toContain("legal-shell");
  });
});
