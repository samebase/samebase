import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";

import { PRIVACY_PAGE_METADATA, TERMS_PAGE_METADATA } from "./pageMetadata";
import {
  extractStaticLegalPageAppShellHtml,
  renderStaticLegalPageHtml,
} from "./staticLegalPage";

describe("renderStaticLegalPageHtml", () => {
  it("extracts the built app boot tags for runtime legal pages", () => {
    const appShellHtml = extractStaticLegalPageAppShellHtml(`<!doctype html>
<html>
  <head>
    <link rel="modulepreload" crossorigin href="/assets/chunk.js">
    <link rel="stylesheet" crossorigin href="/assets/app.css">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" crossorigin src="/assets/app.js"></script>
  </body>
</html>`);

    expect(appShellHtml).toEqual({
      bodyHtml:
        '<script type="module" crossorigin src="/assets/app.js"></script>',
      headHtml:
        '<link rel="modulepreload" crossorigin href="/assets/chunk.js">\n<link rel="stylesheet" crossorigin href="/assets/app.css">',
    });
  });

  it("renders the terms page into a crawlable static html document", () => {
    const termsMarkdown = readFileSync(
      new URL("../content/terms-of-service.md", import.meta.url),
      "utf8",
    );

    const html = renderStaticLegalPageHtml({
      metadata: TERMS_PAGE_METADATA,
      markdown: termsMarkdown,
    });

    expect(html).toContain("<title>Terms of Service | noter</title>");
    expect(html).toContain(
      '<link rel="canonical" href="https://noter.md/terms" />',
    );
    expect(html).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(html).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />',
    );
    expect(html).toContain('<div id="root">');
    expect(html).toContain('<main class="static-legal-fallback">');
    expect(html).not.toContain("--background:");
    expect(html).toContain('<article class="legal-shell legal-document">');
    expect(html).toContain("<h1>Terms of Service</h1>");
    expect(html).toContain(
      "<p>These Terms of Service govern your use of noter and the noter.md website.",
    );
  });

  it("can include app assets while preserving the crawlable fallback", () => {
    const html = renderStaticLegalPageHtml({
      appBodyHtml:
        '<script type="module" crossorigin src="/assets/app.js"></script>',
      appHeadHtml: '<link rel="stylesheet" href="/assets/app.css">',
      metadata: TERMS_PAGE_METADATA,
      markdown: "# Terms of Service",
    });

    expect(html).toContain('<div id="root">');
    expect(html).toContain("<h1>Terms of Service</h1>");
    expect(html).toContain('<link rel="stylesheet" href="/assets/app.css">');
    expect(html).toContain(
      '<script type="module" crossorigin src="/assets/app.js"></script>',
    );
  });

  it("renders both legal pages from markdown without checked-in html shells", () => {
    const privacyMarkdown = readFileSync(
      new URL("../content/privacy-policy.md", import.meta.url),
      "utf8",
    );
    const termsMarkdown = readFileSync(
      new URL("../content/terms-of-service.md", import.meta.url),
      "utf8",
    );

    const generatedPrivacyHtml = renderStaticLegalPageHtml({
      metadata: PRIVACY_PAGE_METADATA,
      markdown: privacyMarkdown,
    });
    const generatedTermsHtml = renderStaticLegalPageHtml({
      metadata: TERMS_PAGE_METADATA,
      markdown: termsMarkdown,
    });

    expect(generatedPrivacyHtml).toContain(
      '<link rel="canonical" href="https://noter.md/privacy" />',
    );
    expect(generatedPrivacyHtml).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(generatedPrivacyHtml).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />',
    );
    expect(generatedPrivacyHtml).toContain("<h1>Privacy Policy</h1>");
    expect(generatedPrivacyHtml).toContain(
      '<article class="legal-shell legal-document">',
    );

    expect(generatedTermsHtml).toContain(
      '<link rel="canonical" href="https://noter.md/terms" />',
    );
    expect(generatedTermsHtml).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />',
    );
    expect(generatedTermsHtml).toContain(
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />',
    );
    expect(generatedTermsHtml).toContain("<h1>Terms of Service</h1>");
    expect(generatedTermsHtml).toContain(
      '<article class="legal-shell legal-document">',
    );
  });
});
