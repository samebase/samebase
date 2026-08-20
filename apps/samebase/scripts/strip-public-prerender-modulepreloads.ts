import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  readPrerenderHtmlOutputPath,
  type PublicPrerenderPage,
} from "./generate-cloudflare-redirects.ts";

const linkTagPattern = /<link\b[^>]*>/gi;
const relAttributePattern = /\srel\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/i;
const modulePreloadTextPattern = /\bmodulepreload\b/i;

export function verifyPublicPrerenderMetadata(page: PublicPrerenderPage, html: string) {
  const { expectedMetadata: expected, path: pathname } = page;
  const canonicalUrl = new URL(pathname, "https://samebase.com").toString();
  const headEndIndex = html.indexOf("</head>");
  if (headEndIndex === -1) {
    throw new Error(`Public prerender ${pathname} has no closing head tag.`);
  }
  const head = html.slice(0, headEndIndex);
  const expectedHeadElements = [
    {
      expectedMarkup: `<title>${expected.title}</title>`,
      pattern: /<title\b[^>]*>[^<]*<\/title>/gi,
    },
    {
      expectedMarkup: `<meta name="description" content="${expected.description}"/>`,
      pattern: /<meta\b(?=[^>]*\bname=["']description["'])[^>]*>/gi,
    },
    {
      expectedMarkup: `<meta name="robots" content="${expected.robots}"/>`,
      pattern: /<meta\b(?=[^>]*\bname=["']robots["'])[^>]*>/gi,
    },
    {
      expectedMarkup: `<link rel="canonical" href="${canonicalUrl}"/>`,
      pattern: /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/gi,
    },
  ];

  for (const element of expectedHeadElements) {
    const matches = head.match(element.pattern) ?? [];
    if (matches.length !== 1 || matches[0] !== element.expectedMarkup) {
      throw new Error(
        `Public prerender ${pathname} must contain one exact head element: ${element.expectedMarkup}`,
      );
    }
  }
}

function readRelAttributeValue(linkTag: string) {
  const match = relAttributePattern.exec(linkTag);
  if (!match) {
    return null;
  }

  const rawValue = match[1];
  if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
    return rawValue.slice(1, -1);
  }
  if (rawValue.startsWith("'") && rawValue.endsWith("'")) {
    return rawValue.slice(1, -1);
  }

  return rawValue;
}

function isModulePreloadLink(linkTag: string) {
  const relValue = readRelAttributeValue(linkTag);
  if (relValue === null) {
    return false;
  }

  return relValue
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .includes("modulepreload");
}

/**
Strips modulepreload link tags from prerendered public HTML while preserving
stylesheets and the module entry script that hydrates the page.

@example
```ts
stripModulePreloadLinks(
  '<link rel="modulepreload" href="/assets/index.js"/>' +
    '<script type="module">import("/assets/index.js");</script>',
);
// {
//   html: '<script type="module">import("/assets/index.js");</script>',
//   strippedLinkCount: 1,
// }
```

@example
```ts
stripModulePreloadLinks(
  '<link href="/assets/index.js" crossorigin rel="modulepreload">' +
    '<link rel="stylesheet" href="/assets/index.css"/>',
);
// {
//   html: '<link rel="stylesheet" href="/assets/index.css"/>',
//   strippedLinkCount: 1,
// }
```
*/
export function stripModulePreloadLinks(html: string) {
  let strippedLinkCount = 0;
  const nextHtml = html.replace(linkTagPattern, (linkTag) => {
    if (!isModulePreloadLink(linkTag)) {
      return linkTag;
    }

    strippedLinkCount += 1;
    return "";
  });

  if (modulePreloadTextPattern.test(nextHtml)) {
    throw new Error("Failed to strip every modulepreload reference from public prerender HTML.");
  }

  return {
    html: nextHtml,
    strippedLinkCount,
  };
}

/**
Overwrites the public prerender that TanStack Start just wrote. The caller owns
selecting configured public pages so the separate production SPA mask page is
never passed here.
*/
export function writePublicPrerenderWithoutModulePreloads(args: {
  clientDistDir: string;
  html: string;
  page: PublicPrerenderPage;
}) {
  const htmlOutputPath = readPrerenderHtmlOutputPath(args.page);
  const htmlFilePath = path.resolve(args.clientDistDir, htmlOutputPath.slice(1));
  const relativePath = path.relative(args.clientDistDir, htmlFilePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Prerender output path escapes dist/client: ${htmlOutputPath}`);
  }

  const result = stripModulePreloadLinks(args.html);
  verifyPublicPrerenderMetadata(args.page, result.html);

  if (result.html !== args.html) {
    writeFileSync(htmlFilePath, result.html, "utf8");
  }
}
