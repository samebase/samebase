import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  parseStaticMarkdown,
  type StaticMarkdownInlineSegment,
} from "@/lib/staticMarkdown";

type StaticMarkdownDocumentProps = {
  value: string;
  className?: string;
};

function isExternalHref(href: string): boolean {
  return /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i.test(href);
}

function getHeadingClassName(level: 1 | 2 | 3 | 4 | 5 | 6): string {
  switch (level) {
    case 1:
      return "cm-line cm-static-markdown-heading-1";
    case 2:
      return "cm-line cm-static-markdown-heading-2";
    case 3:
      return "cm-line cm-static-markdown-heading-3";
    case 4:
      return "cm-line cm-static-markdown-heading-4";
    case 5:
      return "cm-line cm-static-markdown-heading-5";
    case 6:
      return "cm-line cm-static-markdown-heading-6";
  }
}

function renderInlineContent(
  segments: StaticMarkdownInlineSegment[],
): ReactNode[] {
  return segments.map((segment, index) => {
    if (segment.type === "text") {
      return (
        <Fragment key={`text-${index}-${segment.value}`}>
          {segment.value}
        </Fragment>
      );
    }

    if (segment.type === "code") {
      return (
        <code
          key={`code-${index}-${segment.value}`}
          className="cm-static-markdown-inline-code"
        >
          {segment.value}
        </code>
      );
    }

    const isExternalLink = isExternalHref(segment.href);

    return (
      <a
        key={`link-${index}-${segment.href}-${segment.text}`}
        href={segment.href}
        target={isExternalLink ? "_blank" : undefined}
        rel={isExternalLink ? "noreferrer noopener" : undefined}
        className="cm-static-markdown-link"
      >
        {segment.text}
      </a>
    );
  });
}

export function StaticMarkdownDocument({
  value,
  className,
}: StaticMarkdownDocumentProps) {
  const blocks = parseStaticMarkdown(value);
  const lines: ReactNode[] = [];

  blocks.forEach((block, blockIndex) => {
    if (blockIndex > 0) {
      lines.push(
        <div
          key={`gap-${blockIndex}`}
          className="cm-line cm-static-markdown-gap"
          aria-hidden="true"
        >
          <br />
        </div>,
      );
    }

    if (block.type === "heading") {
      lines.push(
        <div
          key={`heading-${blockIndex}`}
          className={getHeadingClassName(block.level)}
        >
          {renderInlineContent(block.content)}
        </div>,
      );
      return;
    }

    if (block.type === "paragraph") {
      lines.push(
        <div
          key={`paragraph-${blockIndex}`}
          className="cm-line cm-static-markdown-paragraph"
        >
          {renderInlineContent(block.content)}
        </div>,
      );
      return;
    }

    block.items.forEach((item, itemIndex) => {
      lines.push(
        <div
          key={`list-${blockIndex}-${itemIndex}`}
          className="cm-line cm-static-markdown-list"
        >
          <span className="cm-rendered-list-mark" aria-hidden="true">
            •
          </span>
          {renderInlineContent(item)}
        </div>,
      );
    });
  });

  return (
    <div className={cn("min-h-[1rem] text-sm", className)}>
      <div className="cm-editor cm-static-markdown">
        <div className="cm-scroller">
          <div
            className="cm-content cm-lineWrapping"
            role="document"
            aria-label="Markdown document"
          >
            {lines}
          </div>
        </div>
      </div>
    </div>
  );
}
