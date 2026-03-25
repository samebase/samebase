import type { PageMetadata } from "./pageMetadata";
import {
  parseStaticMarkdown,
  type StaticMarkdownBlock,
  type StaticMarkdownInlineSegment,
} from "./staticMarkdown";

const SITE_ORIGIN = "https://noter.md";
const SOCIAL_IMAGE_URL = new URL(
  "/noter-social-card.png",
  SITE_ORIGIN,
).toString();

const STATIC_LEGAL_PAGE_STYLES = `
:root {
  color-scheme: light;
  --background: #f7f2e8;
  --surface: #fffdf8;
  --border: #dfd5c2;
  --text: #17120a;
  --muted: #645b4b;
  --code-background: #efe5d1;
}

* {
  box-sizing: border-box;
}

html {
  font-size: 16px;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at top, #fbf6ed 0%, #f7f2e8 45%, #efe7da 100%);
  color: var(--text);
  font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino,
    "Times New Roman", serif;
  line-height: 1.65;
}

main {
  padding: 48px 20px 72px;
}

.legal-shell {
  margin: 0 auto;
  max-width: 760px;
  border: 1px solid var(--border);
  background: var(--surface);
  padding: 32px 28px 40px;
}

.legal-document h1,
.legal-document h2,
.legal-document h3,
.legal-document h4,
.legal-document h5,
.legal-document h6 {
  margin: 0 0 16px;
  line-height: 1.2;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.legal-document h1 {
  font-size: 2.5rem;
}

.legal-document h2 {
  margin-top: 32px;
  font-size: 1.5rem;
}

.legal-document h3 {
  margin-top: 24px;
  font-size: 1.125rem;
}

.legal-document p,
.legal-document ul {
  margin: 0 0 16px;
}

.legal-document ul {
  padding-left: 20px;
}

.legal-document li + li {
  margin-top: 10px;
}

.legal-document code {
  border-radius: 0;
  background: var(--code-background);
  padding: 0.1rem 0.35rem;
  font-family: "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 0.92em;
}

.legal-document a {
  color: inherit;
}

.legal-footer {
  margin: 24px auto 0;
  max-width: 760px;
  color: var(--muted);
  font-size: 0.9rem;
}
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineSegmentsHtml(
  segments: StaticMarkdownInlineSegment[],
): string {
  return segments
    .map((segment) => {
      if (segment.type === "text") {
        return escapeHtml(segment.value);
      }

      return `<code>${escapeHtml(segment.value)}</code>`;
    })
    .join("");
}

function renderBlockHtml(block: StaticMarkdownBlock): string {
  if (block.type === "heading") {
    return `<h${block.level}>${renderInlineSegmentsHtml(block.content)}</h${block.level}>`;
  }

  if (block.type === "paragraph") {
    return `<p>${renderInlineSegmentsHtml(block.content)}</p>`;
  }

  const itemsHtml = block.items
    .map((item) => `<li>${renderInlineSegmentsHtml(item)}</li>`)
    .join("");
  return `<ul>${itemsHtml}</ul>`;
}

/**
 * Renders the supported markdown subset used by public legal docs into escaped
 * HTML fragments. The parser intentionally supports only the repo-controlled
 * heading, paragraph, list, and inline-code syntax used by these pages.
 */
export function renderStaticMarkdownHtml(markdown: string): string {
  return parseStaticMarkdown(markdown).map(renderBlockHtml).join("\n");
}

/**
 * Builds a complete crawlable HTML document for a public legal page. The
 * output includes canonical/social metadata, inline styles, and the rendered
 * markdown body so `/privacy` and `/terms` work even when JavaScript is not
 * executed by crawlers or app reviewers.
 */
export function renderStaticLegalPageHtml(args: {
  metadata: PageMetadata;
  markdown: string;
}): string {
  const canonicalUrl = new URL(
    args.metadata.canonicalPath,
    SITE_ORIGIN,
  ).toString();
  const contentHtml = renderStaticMarkdownHtml(args.markdown);

  return `<!doctype html>
<html lang="en" translate="no">
  <head>
    <meta charset="UTF-8" />
    <meta name="google" content="notranslate" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(args.metadata.title)}</title>
    <meta name="description" content="${escapeHtml(args.metadata.description)}" />
    <meta name="robots" content="${escapeHtml(args.metadata.robots)}" />
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
    <link rel="icon" type="image/png" href="/favicon.png" sizes="16x16" />
    <link rel="icon" type="image/png" href="/favicon-32.png" sizes="32x32" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
    <meta property="og:site_name" content="noter" />
    <meta property="og:type" content="${escapeHtml(args.metadata.openGraphType ?? "website")}" />
    <meta property="og:title" content="${escapeHtml(args.metadata.title)}" />
    <meta property="og:description" content="${escapeHtml(args.metadata.description)}" />
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
    <meta property="og:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(args.metadata.title)}" />
    <meta name="twitter:description" content="${escapeHtml(args.metadata.description)}" />
    <meta name="twitter:image" content="${escapeHtml(SOCIAL_IMAGE_URL)}" />
    <meta name="theme-color" content="#17120a" />
    <style>
${STATIC_LEGAL_PAGE_STYLES}
    </style>
  </head>
  <body>
    <main>
      <article class="legal-shell legal-document">
${contentHtml}
      </article>
      <p class="legal-footer">Generated from the noter markdown source for a crawlable public legal page.</p>
    </main>
  </body>
</html>
`;
}
