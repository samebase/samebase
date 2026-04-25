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

      return `<code class="cm-static-markdown-inline-code">${escapeHtml(segment.value)}</code>`;
    })
    .join("");
}

function renderBlockHtml(block: StaticMarkdownBlock): string {
  if (block.type === "heading") {
    const contentHtml = renderInlineSegmentsHtml(block.content);
    return `<h${block.level} class="cm-line cm-static-markdown-heading-${block.level}">${contentHtml}</h${block.level}>`;
  }

  if (block.type === "paragraph") {
    const contentHtml = renderInlineSegmentsHtml(block.content);
    return `<p class="cm-line cm-static-markdown-paragraph">${contentHtml}</p>`;
  }

  const itemsHtml = block.items
    .map((item) => {
      const contentHtml = renderInlineSegmentsHtml(item);
      return `<li class="cm-line cm-static-markdown-list"><span class="cm-rendered-list-mark" aria-hidden="true">•</span>${contentHtml}</li>`;
    })
    .join("");
  return `<ul class="cm-static-markdown-list-root">${itemsHtml}</ul>`;
}

/**
 * Emit the same static markdown DOM shape used by `StaticMarkdownDocument`.
 * Keeping this renderer app-shaped prevents the public legal route from
 * drifting away from the hydrated route while JavaScript is still loading.
 */
export function renderStaticMarkdownDocumentHtml(markdown: string): string {
  const lines = parseStaticMarkdown(markdown).flatMap((block, blockIndex) => {
    const blockHtml = renderBlockHtml(block);
    if (blockIndex === 0) {
      return [blockHtml];
    }

    return [
      `<div class="cm-line cm-static-markdown-gap" aria-hidden="true"><br /></div>`,
      blockHtml,
    ];
  });

  return `<div class="min-h-[1rem] text-sm"><div class="cm-editor cm-static-markdown"><div class="cm-scroller"><div class="cm-content cm-lineWrapping" role="document" aria-label="Markdown document">${lines.join("")}</div></div></div></div>`;
}

export function renderStaticLegalRouteRootHtml(markdown: string): string {
  return `<main class="flex min-h-svh w-full flex-col bg-background"><div class="container px-2 py-8"><div class="mx-auto max-w-3xl pb-8">${renderStaticMarkdownDocumentHtml(markdown)}</div></div></main>`;
}

function replaceRequired(
  html: string,
  pattern: RegExp,
  replacement: string,
  label: string,
): string {
  if (!pattern.test(html)) {
    throw new Error(`Unable to replace ${label} in app route shell HTML.`);
  }

  const nextHtml = html.replace(pattern, replacement);

  return nextHtml;
}

function replaceMetaContent(args: {
  content: string;
  html: string;
  key: "name" | "property";
  value: string;
}) {
  const escapedValue = args.value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return replaceRequired(
    args.html,
    new RegExp(
      `<meta\\s+${args.key}="${escapedValue}"\\s+content="[^"]*"\\s*/>`,
      "s",
    ),
    `<meta ${args.key}="${args.value}" content="${escapeHtml(args.content)}" />`,
    `${args.key}=${args.value}`,
  );
}

function replaceRouteMetadata(args: {
  html: string;
  metadata: PageMetadata;
}): string {
  const canonicalUrl = new URL(
    args.metadata.canonicalPath,
    SITE_ORIGIN,
  ).toString();
  let html = replaceRequired(
    args.html,
    /<title>[\s\S]*?<\/title>/,
    `<title>${escapeHtml(args.metadata.title)}</title>`,
    "title",
  );

  html = replaceMetaContent({
    html,
    key: "name",
    value: "description",
    content: args.metadata.description,
  });
  html = replaceMetaContent({
    html,
    key: "name",
    value: "robots",
    content: args.metadata.robots,
  });
  html = replaceRequired(
    html,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    "canonical link",
  );
  html = replaceMetaContent({
    html,
    key: "property",
    value: "og:site_name",
    content: "noter",
  });
  html = replaceMetaContent({
    html,
    key: "property",
    value: "og:type",
    content: args.metadata.openGraphType ?? "website",
  });
  html = replaceMetaContent({
    html,
    key: "property",
    value: "og:title",
    content: args.metadata.title,
  });
  html = replaceMetaContent({
    html,
    key: "property",
    value: "og:description",
    content: args.metadata.description,
  });
  html = replaceMetaContent({
    html,
    key: "property",
    value: "og:url",
    content: canonicalUrl,
  });
  html = replaceMetaContent({
    html,
    key: "property",
    value: "og:image",
    content: SOCIAL_IMAGE_URL,
  });
  html = replaceMetaContent({
    html,
    key: "name",
    value: "twitter:card",
    content: "summary_large_image",
  });
  html = replaceMetaContent({
    html,
    key: "name",
    value: "twitter:title",
    content: args.metadata.title,
  });
  html = replaceMetaContent({
    html,
    key: "name",
    value: "twitter:description",
    content: args.metadata.description,
  });
  html = replaceMetaContent({
    html,
    key: "name",
    value: "twitter:image",
    content: SOCIAL_IMAGE_URL,
  });

  return html;
}

/**
 * Builds a route-specific document from the single app HTML shell. Direct
 * `/terms` and `/privacy` loads therefore run the same app as client-side
 * navigations instead of serving a second standalone legal-page renderer.
 */
export function renderStaticPublicRouteShellHtml(args: {
  appHtml: string;
  metadata: PageMetadata;
  rootHtml: string;
}): string {
  const htmlWithMetadata = replaceRouteMetadata({
    html: args.appHtml,
    metadata: args.metadata,
  });

  return replaceRequired(
    htmlWithMetadata,
    /<div id="root"><\/div>/,
    `<div id="root">${args.rootHtml}</div>`,
    "root element",
  );
}
