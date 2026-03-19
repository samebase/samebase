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

    return (
      <code
        key={`code-${index}-${segment.value}`}
        className="cm-static-markdown-inline-code"
      >
        {segment.value}
      </code>
    );
  });
}

function renderHeading(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  key: string,
  children: ReactNode[],
) {
  const className = getHeadingClassName(level);

  switch (level) {
    case 1:
      return (
        <h1 key={key} className={className}>
          {children}
        </h1>
      );
    case 2:
      return (
        <h2 key={key} className={className}>
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 key={key} className={className}>
          {children}
        </h3>
      );
    case 4:
      return (
        <h4 key={key} className={className}>
          {children}
        </h4>
      );
    case 5:
      return (
        <h5 key={key} className={className}>
          {children}
        </h5>
      );
    case 6:
      return (
        <h6 key={key} className={className}>
          {children}
        </h6>
      );
  }
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
        renderHeading(
          block.level,
          `heading-${blockIndex}`,
          renderInlineContent(block.content),
        ),
      );
      return;
    }

    if (block.type === "paragraph") {
      lines.push(
        <p
          key={`paragraph-${blockIndex}`}
          className="cm-line cm-static-markdown-paragraph"
        >
          {renderInlineContent(block.content)}
        </p>,
      );
      return;
    }

    lines.push(
      <ul
        key={`list-group-${blockIndex}`}
        className="cm-static-markdown-list-root"
      >
        {block.items.map((item, itemIndex) => (
          <li
            key={`list-${blockIndex}-${itemIndex}`}
            className="cm-line cm-static-markdown-list"
          >
            <span className="cm-rendered-list-mark" aria-hidden="true">
              •
            </span>
            {renderInlineContent(item)}
          </li>
        ))}
      </ul>,
    );
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
