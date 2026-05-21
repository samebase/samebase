export type StaticMarkdownInlineSegment =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "code";
      value: string;
    };

export type StaticMarkdownBlock =
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      content: StaticMarkdownInlineSegment[];
    }
  | {
      type: "paragraph";
      content: StaticMarkdownInlineSegment[];
    }
  | {
      type: "list";
      items: StaticMarkdownInlineSegment[][];
    };

const headingPattern = /^(#{1,6})\s+(.*)$/;
const listItemPattern = /^-\s+(.*)$/;
const inlineTokenPattern = /`([^`]+)`/g;

function isBlankLine(line: string): boolean {
  return line.trim().length === 0;
}

function readHeadingLevel(token: string): 1 | 2 | 3 | 4 | 5 | 6 {
  switch (token.length) {
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

function isHeadingLine(line: string): boolean {
  return headingPattern.test(line.trimStart());
}

function isListItemLine(line: string): boolean {
  return listItemPattern.test(line.trimStart());
}

function isIndentedContinuationLine(line: string): boolean {
  return /^[ \t]+/.test(line);
}

function pushTextSegment(segments: StaticMarkdownInlineSegment[], value: string): void {
  if (value.length === 0) {
    return;
  }

  const lastSegment = segments.at(-1);
  if (lastSegment?.type === "text") {
    lastSegment.value += value;
    return;
  }

  segments.push({
    type: "text",
    value,
  });
}

export function parseStaticMarkdownInline(value: string): StaticMarkdownInlineSegment[] {
  const segments: StaticMarkdownInlineSegment[] = [];
  let match: RegExpExecArray | null = null;
  let lastIndex = 0;

  inlineTokenPattern.lastIndex = 0;

  while ((match = inlineTokenPattern.exec(value)) !== null) {
    if (match.index > lastIndex) {
      pushTextSegment(segments, value.slice(lastIndex, match.index));
    }

    const [token, codeValue] = match;

    segments.push({
      type: "code",
      value: codeValue,
    });

    lastIndex = match.index + token.length;
  }

  if (lastIndex < value.length) {
    pushTextSegment(segments, value.slice(lastIndex));
  }

  return segments;
}

// TODO: Replace or expand this renderer before treating arbitrary markdown as
// supported. It is intentionally limited to the controlled subset currently
// used by static docs like privacy-policy.md. Links are intentionally
// unsupported for now; if a future doc needs them, add explicit routing and
// href-safety rules instead of widening this parser implicitly.
export function parseStaticMarkdown(markdown: string): StaticMarkdownBlock[] {
  const blocks: StaticMarkdownBlock[] = [];
  const lines = markdown.replace(/\r/g, "").split("\n");
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isBlankLine(line)) {
      index += 1;
      continue;
    }

    const headingMatch = line.trimStart().match(headingPattern);
    if (headingMatch) {
      const [, tokens, headingText] = headingMatch;
      blocks.push({
        type: "heading",
        level: readHeadingLevel(tokens),
        content: parseStaticMarkdownInline(headingText.trim()),
      });
      index += 1;
      continue;
    }

    if (isListItemLine(line)) {
      const items: StaticMarkdownInlineSegment[][] = [];
      let currentItemParts: string[] = [];

      while (index < lines.length) {
        const listLine = lines[index] ?? "";
        const trimmedListLine = listLine.trim();

        if (trimmedListLine.length === 0) {
          if (currentItemParts.length > 0) {
            items.push(parseStaticMarkdownInline(currentItemParts.join(" ").trim()));
            currentItemParts = [];
          }
          index += 1;
          break;
        }

        const listItemMatch = listLine.trimStart().match(listItemPattern);
        if (listItemMatch) {
          if (currentItemParts.length > 0) {
            items.push(parseStaticMarkdownInline(currentItemParts.join(" ").trim()));
          }

          currentItemParts = [listItemMatch[1].trim()];
          index += 1;
          continue;
        }

        if (
          currentItemParts.length > 0 &&
          isIndentedContinuationLine(listLine) &&
          !isHeadingLine(listLine)
        ) {
          currentItemParts.push(trimmedListLine);
          index += 1;
          continue;
        }

        break;
      }

      if (currentItemParts.length > 0) {
        items.push(parseStaticMarkdownInline(currentItemParts.join(" ").trim()));
      }

      if (items.length > 0) {
        blocks.push({
          type: "list",
          items,
        });
      }

      continue;
    }

    const paragraphParts: string[] = [line.trim()];
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index] ?? "";

      if (isBlankLine(nextLine)) {
        index += 1;
        break;
      }

      if (isHeadingLine(nextLine) || isListItemLine(nextLine)) {
        break;
      }

      paragraphParts.push(nextLine.trim());
      index += 1;
    }

    const paragraphText = paragraphParts.join(" ").trim();
    if (paragraphText.length > 0) {
      blocks.push({
        type: "paragraph",
        content: parseStaticMarkdownInline(paragraphText),
      });
    }
  }

  return blocks;
}
