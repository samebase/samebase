export type LandingMarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type LandingMarkdownHeading = {
  href: string;
  id: string;
  level: LandingMarkdownHeadingLevel;
  text: string;
};

const ATX_HEADING_PATTERN = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const FENCED_CODE_BLOCK_PATTERN = /^[ \t]*(`{3,}|~{3,})/;

function getSlugBase(text: string) {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "section";
}

export function createLandingMarkdownHeadingIdAllocator() {
  const seenSlugCounts = new Map<string, number>();

  return (text: string) => {
    const slugBase = getSlugBase(text);
    const nextCount = (seenSlugCounts.get(slugBase) ?? 0) + 1;
    seenSlugCounts.set(slugBase, nextCount);

    if (nextCount === 1) {
      return slugBase;
    }

    return `${slugBase}-${nextCount}`;
  };
}

function getHeadingText(rawHeadingText: string) {
  return rawHeadingText
    .replace(/[ \t]+#+[ \t]*$/g, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[`*~]/g, "")
    .trim();
}

function getHeadingLevel(marker: string): LandingMarkdownHeadingLevel {
  switch (marker.length) {
    case 1:
      return 1;
    case 2:
      return 2;
    case 3:
      return 3;
    case 4:
      return 4;
    case 5:
      return 5;
    default:
      return 6;
  }
}

export function getLandingMarkdownHeadings(
  markdown: string,
): LandingMarkdownHeading[] {
  const allocateHeadingId = createLandingMarkdownHeadingIdAllocator();
  const headings: LandingMarkdownHeading[] = [];
  let openFenceMarker: string | null = null;
  let summaryDepth = 0;

  for (const line of markdown.split("\n")) {
    const fenceMatch = line.match(FENCED_CODE_BLOCK_PATTERN);
    if (fenceMatch !== null) {
      const fenceMarker = fenceMatch[1].startsWith("`") ? "`" : "~";
      if (openFenceMarker === fenceMarker) {
        openFenceMarker = null;
      } else if (openFenceMarker === null) {
        openFenceMarker = fenceMarker;
      }
      continue;
    }

    if (openFenceMarker !== null) {
      continue;
    }

    if (/<summary\b/i.test(line)) {
      summaryDepth += 1;
    }

    const shouldSkipHeading = summaryDepth > 0;
    if (/<\/summary>/i.test(line)) {
      summaryDepth = Math.max(0, summaryDepth - 1);
    }

    if (shouldSkipHeading) {
      continue;
    }

    const headingMatch = line.match(ATX_HEADING_PATTERN);
    if (headingMatch === null) {
      continue;
    }

    const text = getHeadingText(headingMatch[2]);
    const id = allocateHeadingId(text);
    headings.push({
      href: `#${id}`,
      id,
      level: getHeadingLevel(headingMatch[1]),
      text,
    });
  }

  return headings;
}
