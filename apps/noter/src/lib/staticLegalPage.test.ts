import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { PRIVACY_PAGE_METADATA, TERMS_PAGE_METADATA } from "./pageMetadata";
import { renderStaticLegalPageHtml } from "./staticLegalPage";

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

describe("renderStaticLegalPageHtml", () => {
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
    expect(html).toContain('<article class="legal-shell legal-document">');
    expect(html).toContain("<h1>Terms of Service</h1>");
    expect(html).toContain(
      "<p>These Terms of Service govern your use of noter and the noter.md website.",
    );
  });

  it("keeps the checked-in public html shells crawlable", () => {
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

    const checkedInPrivacyHtml = readFileSync(
      new URL("../../public/privacy/index.html", import.meta.url),
      "utf8",
    );
    const checkedInTermsHtml = readFileSync(
      new URL("../../public/terms/index.html", import.meta.url),
      "utf8",
    );

    expect(checkedInPrivacyHtml).toContain(
      '<link rel="canonical" href="https://noter.md/privacy" />',
    );
    expect(checkedInPrivacyHtml).toContain("<h1>Privacy Policy</h1>");
    expect(checkedInPrivacyHtml).toContain(
      '<article class="legal-shell legal-document">',
    );
    expect(collapseWhitespace(checkedInPrivacyHtml)).toContain(
      "Generated from the noter markdown source for a crawlable public legal page.",
    );

    expect(checkedInTermsHtml).toContain(
      '<link rel="canonical" href="https://noter.md/terms" />',
    );
    expect(checkedInTermsHtml).toContain("<h1>Terms of Service</h1>");
    expect(checkedInTermsHtml).toContain(
      '<article class="legal-shell legal-document">',
    );
    expect(collapseWhitespace(checkedInTermsHtml)).toContain(
      "Generated from the noter markdown source for a crawlable public legal page.",
    );

    expect(generatedPrivacyHtml).toContain("<h1>Privacy Policy</h1>");
    expect(generatedTermsHtml).toContain("<h1>Terms of Service</h1>");
  });
});
