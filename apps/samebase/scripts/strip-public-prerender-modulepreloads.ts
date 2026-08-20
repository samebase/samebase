import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  readPrerenderHtmlOutputPath,
  type PublicPrerenderPage,
} from "./generate-cloudflare-redirects.ts";

const linkTagPattern = /<link\b[^>]*>/gi;
const relAttributePattern = /\srel\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+)/i;
const modulePreloadTextPattern = /\bmodulepreload\b/i;

type ExpectedPublicPrerenderMetadata = {
  title: string;
  description: string;
  robots: "index,follow" | "noindex,nofollow";
};

const expectedPublicPrerenderMetadataByPath: Partial<
  Record<string, ExpectedPublicPrerenderMetadata>
> = {
  "/": {
    title: "Samebase | The correct way to build web apps",
    description:
      "The correct way to build web apps. Convex + Cloudflare is all you need. You own 100% of your code and data.",
    robots: "index,follow",
  },
  "/docs": {
    title: "Docs | Samebase",
    description: "Samebase product, setup, stack, pricing, and source documentation.",
    robots: "index,follow",
  },
  "/docs/cloudflare-setup": {
    title: "Set up Cloudflare for your first Samebase app | Samebase",
    description:
      "Create the first Cloudflare Workers Builds API token, then let Samebase create the real Worker.",
    robots: "index,follow",
  },
  "/docs/do-it-yourself": {
    title: "Do it yourself | Samebase",
    description: "Deploy the Samebase stack by hand, with no Samebase account.",
    robots: "index,follow",
  },
  "/docs/receipts": {
    title: "Receipts | Samebase",
    description: "Every factual Samebase claim with its primary source and check date.",
    robots: "index,follow",
  },
  "/docs/the-stack": {
    title: "The stack | Samebase",
    description: "What the Samebase template ships and why each piece was chosen.",
    robots: "index,follow",
  },
  "/logo": {
    title: "Logo Preview | Samebase",
    description: "Developer preview for exploring Samebase logo rendering.",
    robots: "noindex,nofollow",
  },
  "/oauth/mcp/consent": {
    title: "Authorize MCP client | Samebase",
    description: "Authorization route for a Samebase MCP client.",
    robots: "noindex,nofollow",
  },
  "/pricing": {
    title: "Pricing | Samebase",
    description: "The Free and Pro connection limits, member limits, and monthly prices.",
    robots: "index,follow",
  },
  "/privacy": {
    title: "Privacy Policy | Samebase",
    description:
      "Privacy Policy for Samebase. Describes the data the current app stores, the providers it talks to, and the browser storage it uses.",
    robots: "index,follow",
  },
  "/terms": {
    title: "Terms of Service | Samebase",
    description:
      "Terms of Service for Samebase. Describes the rules, responsibilities, and legal terms for using Samebase and samebase.com.",
    robots: "index,follow",
  },
};

export function verifyPublicPrerenderMetadata(pathname: string, html: string) {
  const expected = expectedPublicPrerenderMetadataByPath[pathname];
  if (!expected) {
    return;
  }

  const canonicalUrl = new URL(pathname, "https://samebase.com").toString();
  const expectedHeadMarkup = [
    `<title>${expected.title}</title>`,
    `<meta name="description" content="${expected.description}"/>`,
    `<meta name="robots" content="${expected.robots}"/>`,
    `<link rel="canonical" href="${canonicalUrl}"/>`,
  ];

  for (const markup of expectedHeadMarkup) {
    if (!html.includes(markup)) {
      throw new Error(`Public prerender ${pathname} is missing exact head markup: ${markup}`);
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
  verifyPublicPrerenderMetadata(args.page.path, result.html);

  if (result.html !== args.html) {
    writeFileSync(htmlFilePath, result.html, "utf8");
  }
}
