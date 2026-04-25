import type { PageMetadata } from "./pageMetadata";

const SITE_ORIGIN = "https://noter.md";
const SOCIAL_IMAGE_URL = new URL(
  "/noter-social-card.png",
  SITE_ORIGIN,
).toString();

function collectHtmlTags(html: string, pattern: RegExp): string[] {
  const tags: string[] = [];
  for (const match of html.matchAll(pattern)) {
    const tag = match[0];
    if (tag.length > 0) {
      tags.push(tag);
    }
  }
  return tags;
}

/**
 * Extract only the built Vite app assets from `dist/index.html` so the
 * crawlable legal fallback can be replaced by the routed app in real browsers.
 */
export function extractStaticLegalPageAppShellHtml(indexHtml: string): {
  bodyHtml: string;
  headHtml: string;
} {
  const headTags = [
    ...collectHtmlTags(
      indexHtml,
      /<link\b(?=[^>]*\brel="modulepreload")(?=[^>]*\bhref="\/assets\/)[^>]*>/g,
    ),
    ...collectHtmlTags(
      indexHtml,
      /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="\/assets\/)[^>]*>/g,
    ),
  ];
  const bodyTags = collectHtmlTags(
    indexHtml,
    /<script\b(?=[^>]*\btype="module")(?=[^>]*\bsrc="\/assets\/)[^>]*><\/script>/g,
  );

  if (bodyTags.length === 0) {
    throw new Error(
      "Expected built app index.html to include a module script.",
    );
  }

  return {
    bodyHtml: bodyTags.join("\n"),
    headHtml: headTags.join("\n"),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds a complete crawlable HTML document for a public legal page. The
 * output includes canonical/social metadata and the server-rendered public app
 * shell so `/privacy` and `/terms` first paint like the hydrated SPA.
 */
export function renderStaticLegalPageHtml(args: {
  appBodyHtml?: string;
  appHeadHtml?: string;
  appRootHtml: string;
  metadata: PageMetadata;
}): string {
  const canonicalUrl = new URL(
    args.metadata.canonicalPath,
    SITE_ORIGIN,
  ).toString();

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
${args.appHeadHtml ? `${args.appHeadHtml}\n` : ""}
  </head>
  <body>
    <div id="root">${args.appRootHtml}</div>
${args.appBodyHtml ? `${args.appBodyHtml}\n` : ""}  </body>
</html>
`;
}
