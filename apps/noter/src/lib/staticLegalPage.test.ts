import { describe, expect, it } from "vite-plus/test";

import { PRIVACY_PAGE_METADATA, TERMS_PAGE_METADATA } from "./pageMetadata";
import {
  extractStaticLegalPageAppShellHtml,
  renderStaticLegalPageHtml,
} from "./staticLegalPage";
import { renderStaticLegalPageAppHtml } from "./staticLegalPageApp";

const PRIVACY_MARKDOWN = `# Privacy Policy

This Privacy Policy explains how noter handles privacy.`;
const TERMS_MARKDOWN = `# Terms of Service

These Terms of Service govern your use of noter and the noter.md website.`;

describe("renderStaticLegalPageHtml", () => {
  function renderTermsAppRootHtml() {
    return renderStaticLegalPageAppHtml({
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
      appRepoUrl: "https://github.com/noter-md/noter",
      markdown: TERMS_MARKDOWN,
      pathname: "/terms",
    });
  }

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
    const html = renderStaticLegalPageHtml({
      appRootHtml: renderTermsAppRootHtml(),
      metadata: TERMS_PAGE_METADATA,
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
    expect(html).toContain('data-testid="workspace-layout-v2-pane-main"');
    expect(html).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(html).not.toContain("--background:");
    expect(html).not.toContain(
      "Generated from the noter markdown source for a crawlable public legal page.",
    );
    expect(html).toContain(">Terms of Service</h1>");
    expect(html).toContain(
      "These Terms of Service govern your use of noter and the noter.md website.",
    );
  });

  it("can include app assets while preserving the crawlable fallback", () => {
    const html = renderStaticLegalPageHtml({
      appBodyHtml:
        '<script type="module" crossorigin src="/assets/app.js"></script>',
      appHeadHtml: '<link rel="stylesheet" href="/assets/app.css">',
      appRootHtml: renderTermsAppRootHtml(),
      metadata: TERMS_PAGE_METADATA,
    });

    expect(html).toContain('<div id="root">');
    expect(html).toContain(">Terms of Service</h1>");
    expect(html).toContain('<link rel="stylesheet" href="/assets/app.css">');
    expect(html).toContain(
      '<script type="module" crossorigin src="/assets/app.js"></script>',
    );
  });

  it("renders both legal pages from app components without checked-in html shells", () => {
    const generatedPrivacyHtml = renderStaticLegalPageHtml({
      appRootHtml: renderStaticLegalPageAppHtml({
        appCommit: "0123456789abcdef",
        appCommitNumber: 463,
        appRepoUrl: "https://github.com/noter-md/noter",
        markdown: PRIVACY_MARKDOWN,
        pathname: "/privacy",
      }),
      metadata: PRIVACY_PAGE_METADATA,
    });
    const generatedTermsHtml = renderStaticLegalPageHtml({
      appRootHtml: renderTermsAppRootHtml(),
      metadata: TERMS_PAGE_METADATA,
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
    expect(generatedPrivacyHtml).toContain(">Privacy Policy</h1>");
    expect(generatedPrivacyHtml).toContain(
      'data-testid="workspace-layout-v2-pane-right"',
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
    expect(generatedTermsHtml).toContain(">Terms of Service</h1>");
    expect(generatedTermsHtml).toContain(
      'data-testid="workspace-layout-v2-pane-right"',
    );
  });

  it("server-renders trailing-slash legal paths through the public app shell", () => {
    const html = renderStaticLegalPageAppHtml({
      appCommit: "0123456789abcdef",
      appCommitNumber: 463,
      appRepoUrl: "https://github.com/noter-md/noter",
      markdown: TERMS_MARKDOWN,
      pathname: "/terms/",
    });

    expect(html).toContain('data-testid="workspace-layout-v2-pane-main"');
    expect(html).toContain('data-testid="workspace-layout-v2-pane-right"');
    expect(html).toContain("<h1");
    expect(html).toContain("Terms of Service");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});
