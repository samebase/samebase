import { useEffect, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type Options as ReactMarkdownOptions,
} from "react-markdown";
import { Link, useLocation } from "@tanstack/react-router";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, {
  defaultSchema,
  type Options as RehypeSanitizeOptions,
} from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { getLandingMarkdownHeadings } from "@/lib/landingMarkdownHeadings";
import { isMarkdownVideoUrl } from "@/lib/landingMarkdownMedia";
import { cn } from "@/lib/utils";
import { guard } from "@samebase/dependent";

const SANITIZED_VIDEO_ATTRIBUTES: string[] = [
  "ariaLabel",
  "controls",
  "height",
  "loop",
  "muted",
  "playsInline",
  "poster",
  "preload",
  "src",
  "title",
  "width",
];

const SANITIZED_DETAILS_ATTRIBUTES: string[] = ["open"];
const SANITIZED_IMAGE_ATTRIBUTES: string[] = ["alt", "height", "src", "title", "width"];
const SANITIZED_SOURCE_ATTRIBUTES: string[] = ["src", "type"];

const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    details: SANITIZED_DETAILS_ATTRIBUTES,
    img: SANITIZED_IMAGE_ATTRIBUTES,
    source: SANITIZED_SOURCE_ATTRIBUTES,
    video: SANITIZED_VIDEO_ATTRIBUTES,
  },
  protocols: {
    ...defaultSchema.protocols,
    poster: ["http", "https"],
    src: ["http", "https"],
  },
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "br",
    "details",
    "small",
    "source",
    "summary",
    "video",
  ],
} satisfies RehypeSanitizeOptions;

const markdownRehypePlugins: ReactMarkdownOptions["rehypePlugins"] = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
];
const MARKDOWN_LINK_CLASS_NAME = "font-medium text-foreground underline underline-offset-4";

type MarkdownInternalLinkTarget = {
  hash: string | undefined;
  search: Record<string, string> | undefined;
  to: string;
};

function isExternalUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const isInternalRouteHref = guard<string | undefined, string>((value) => {
  if (!value) {
    return null;
  }

  return value.startsWith("?") || (value.startsWith("/") && !value.startsWith("//")) ? value : null;
});

function buildInternalLinkTarget({
  href,
  locationHash,
  pathname,
  searchStr,
}: {
  href: string;
  locationHash: string;
  pathname: string;
  searchStr: string;
}): MarkdownInternalLinkTarget {
  const baseUrl = new URL(`${pathname}${searchStr}${locationHash}`, "https://samebase.local");
  const targetUrl = new URL(href, baseUrl);
  const search: Record<string, string> = {};

  for (const [name, value] of targetUrl.searchParams.entries()) {
    search[name] = value;
  }

  return {
    hash: targetUrl.hash || undefined,
    search: targetUrl.searchParams.size > 0 ? search : undefined,
    to: targetUrl.pathname,
  };
}

function MarkdownInternalLink({
  children,
  href,
  title,
}: Pick<ComponentPropsWithoutRef<"a">, "children" | "href" | "title"> & {
  href: string;
}) {
  const location = useLocation();
  const target = buildInternalLinkTarget({
    href,
    locationHash: location.hash,
    pathname: location.pathname,
    searchStr: location.searchStr,
  });

  return (
    <Link
      className={MARKDOWN_LINK_CLASS_NAME}
      hash={target.hash}
      search={target.search}
      title={title}
      to={target.to}
    >
      {children}
    </Link>
  );
}

function MarkdownVideo({
  children,
  height,
  loop,
  muted,
  poster,
  preload,
  src,
  title,
  width,
}: Pick<
  ComponentPropsWithoutRef<"video">,
  "children" | "height" | "loop" | "muted" | "poster" | "preload" | "src" | "title" | "width"
>) {
  if (!src && children === undefined) {
    return null;
  }

  return (
    <video
      className="mx-auto max-h-[72svh] w-auto max-w-full sm:max-h-[720px]"
      controls
      height={height}
      loop={loop}
      muted={muted}
      playsInline
      poster={poster}
      preload={preload ?? "metadata"}
      src={src}
      title={title}
      width={width}
    >
      {children}
    </video>
  );
}

function MarkdownImage({
  alt,
  height,
  src,
  title,
  width,
}: Pick<ComponentPropsWithoutRef<"img">, "alt" | "height" | "src" | "title" | "width">) {
  if (!src) {
    return null;
  }

  if (isMarkdownVideoUrl(src)) {
    return <MarkdownVideo src={src} title={title ?? alt} />;
  }

  const authoredSizeStyle = buildImageAuthoredSizeStyle({ height, width });

  return (
    <img
      alt={alt ?? ""}
      className="max-w-full object-contain"
      height={height}
      loading="lazy"
      src={src}
      style={authoredSizeStyle}
      title={title}
      width={width}
    />
  );
}

function MarkdownTaskCheckbox({ checked }: Pick<ComponentPropsWithoutRef<"input">, "checked">) {
  const [isChecked, setIsChecked] = useState(Boolean(checked));

  useEffect(() => {
    setIsChecked(Boolean(checked));
  }, [checked]);

  return (
    <input
      checked={isChecked}
      className="mr-2 align-middle"
      onChange={(event) => {
        setIsChecked(event.currentTarget.checked);
      }}
      type="checkbox"
    />
  );
}

function parseHtmlDimension(
  value: ComponentPropsWithoutRef<"img">["height"],
): number | string | undefined {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  if (/^\d+$/.test(trimmedValue)) {
    return Number.parseInt(trimmedValue, 10);
  }

  if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(trimmedValue)) {
    return trimmedValue;
  }

  return undefined;
}

function buildImageAuthoredSizeStyle({
  height,
  width,
}: Pick<ComponentPropsWithoutRef<"img">, "height" | "width">):
  | ComponentPropsWithoutRef<"img">["style"]
  | undefined {
  const parsedHeight = parseHtmlDimension(height);
  const parsedWidth = parseHtmlDimension(width);

  if (parsedHeight === undefined && parsedWidth === undefined) {
    return undefined;
  }

  return {
    height: parsedHeight,
    width: parsedWidth ?? "auto",
  };
}

type MarkdownHeadingNode = {
  position?: {
    start?: {
      line?: number;
    };
  };
};

function renderHeading(level: 1 | 2 | 3 | 4, children: ReactNode, headingId: string | undefined) {
  switch (level) {
    case 1:
      return (
        <h1
          data-landing-heading-id={headingId}
          id={headingId}
          className="max-w-2xl scroll-mt-4 text-4xl font-semibold leading-tight tracking-normal"
        >
          {children}
        </h1>
      );
    case 2:
      return (
        <h2
          data-landing-heading-id={headingId}
          id={headingId}
          className="mt-6 scroll-mt-4 border-t pt-8 text-2xl font-semibold leading-tight tracking-normal"
        >
          {children}
        </h2>
      );
    case 3:
      return (
        <h3
          data-landing-heading-id={headingId}
          id={headingId}
          className="scroll-mt-4 text-xl font-semibold leading-snug tracking-normal"
        >
          {children}
        </h3>
      );
    case 4:
      return (
        <h4
          data-landing-heading-id={headingId}
          id={headingId}
          className="scroll-mt-4 text-base font-semibold leading-6 tracking-normal"
        >
          {children}
        </h4>
      );
  }
}

function getHeadingId(
  node: MarkdownHeadingNode | undefined,
  headingIdsByLine: ReadonlyMap<number, string>,
) {
  const line = node?.position?.start?.line;
  if (line === undefined) {
    return undefined;
  }

  return headingIdsByLine.get(line);
}

function getMarkdownComponents(headingIdsByLine: ReadonlyMap<number, string>) {
  return {
    a({ children, href, title }) {
      if (isMarkdownVideoUrl(href)) {
        return <MarkdownVideo src={href} title={title} />;
      }

      if (isInternalRouteHref(href)) {
        return (
          <MarkdownInternalLink href={href} title={title}>
            {children}
          </MarkdownInternalLink>
        );
      }

      const isExternal = isExternalUrl(href);
      return (
        <a
          className={MARKDOWN_LINK_CLASS_NAME}
          href={href}
          rel={isExternal ? "noopener noreferrer" : undefined}
          target={isExternal ? "_blank" : undefined}
          title={title}
        >
          {children}
        </a>
      );
    },
    blockquote({ children }) {
      return (
        <blockquote className="border-l-2 border-foreground py-1 pl-4 [&_p]:text-muted-foreground">
          {children}
        </blockquote>
      );
    },
    br() {
      return <br />;
    },
    code({ children }) {
      return (
        <code className="border bg-accent px-1 py-0.5 font-mono text-[0.8125rem] leading-5 text-accent-foreground">
          {children}
        </code>
      );
    },
    details({ children, open }) {
      return (
        <details className="open:pb-3" open={open}>
          {children}
        </details>
      );
    },
    h1({ children, node }) {
      return renderHeading(1, children, getHeadingId(node, headingIdsByLine));
    },
    h2({ children, node }) {
      return renderHeading(2, children, getHeadingId(node, headingIdsByLine));
    },
    h3({ children, node }) {
      return renderHeading(3, children, getHeadingId(node, headingIdsByLine));
    },
    h4({ children, node }) {
      return renderHeading(4, children, getHeadingId(node, headingIdsByLine));
    },
    h5({ children, node }) {
      const headingId = getHeadingId(node, headingIdsByLine);
      return (
        <h5
          data-landing-heading-id={headingId}
          id={headingId}
          className="scroll-mt-4 text-sm font-semibold uppercase leading-6 tracking-normal"
        >
          {children}
        </h5>
      );
    },
    h6({ children, node }) {
      const headingId = getHeadingId(node, headingIdsByLine);
      return (
        <h6
          data-landing-heading-id={headingId}
          id={headingId}
          className="scroll-mt-4 text-xs font-semibold uppercase leading-5 tracking-normal text-muted-foreground"
        >
          {children}
        </h6>
      );
    },
    hr() {
      return <hr className="border-border" />;
    },
    img({ alt, height, src, title, width }) {
      return <MarkdownImage alt={alt} height={height} src={src} title={title} width={width} />;
    },
    input({ checked, disabled, type }) {
      if (type !== "checkbox") {
        return <input checked={checked} disabled={disabled} type={type} />;
      }

      return <MarkdownTaskCheckbox checked={checked} />;
    },
    li({ children }) {
      return <li className="pl-1 leading-7">{children}</li>;
    },
    ol({ children }) {
      return <ol className="list-decimal space-y-1 pl-6">{children}</ol>;
    },
    p({ children }) {
      return <p className="leading-7 text-foreground">{children}</p>;
    },
    pre({ children }) {
      return (
        <pre className="overflow-x-auto border bg-accent p-4 text-sm leading-6">{children}</pre>
      );
    },
    source({ src, type }) {
      if (!src) {
        return null;
      }

      return <source src={src} type={type} />;
    },
    small({ children }) {
      return (
        <small className="block max-w-2xl text-sm leading-6 text-muted-foreground">
          {children}
        </small>
      );
    },
    summary({ children }) {
      return (
        <summary className="cursor-pointer select-none text-sm font-medium leading-6">
          {children}
        </summary>
      );
    },
    sup({ children }) {
      const content = children === "\\*" ? "*" : children;

      return (
        <sup className="ml-0.5 align-super text-[0.625rem] font-medium leading-none">{content}</sup>
      );
    },
    table({ children }) {
      return (
        <div className="overflow-x-auto border">
          <table className="w-full border-collapse text-sm">{children}</table>
        </div>
      );
    },
    tbody({ children }) {
      return <tbody className="divide-y">{children}</tbody>;
    },
    td({ children }) {
      return <td className="border-r px-3 py-2 align-top last:border-r-0">{children}</td>;
    },
    th({ children }) {
      return (
        <th className="border-r bg-accent px-3 py-2 text-left font-medium last:border-r-0">
          {children}
        </th>
      );
    },
    thead({ children }) {
      return <thead className="border-b">{children}</thead>;
    },
    tr({ children }) {
      return <tr>{children}</tr>;
    },
    ul({ children }) {
      return <ul className="list-disc space-y-1 pl-6">{children}</ul>;
    },
    video({ children, height, loop, muted, poster, preload, src, title, width }) {
      return (
        <MarkdownVideo
          height={height}
          loop={loop}
          muted={muted}
          poster={poster}
          preload={preload}
          src={src}
          title={title}
          width={width}
        >
          {children}
        </MarkdownVideo>
      );
    },
  } satisfies Components;
}

export function MarkdownLandingDocument({
  className,
  dataTestId,
  markdown,
}: {
  className?: string;
  dataTestId?: string;
  markdown: string;
}) {
  const headingIdsByLine = new Map(
    getLandingMarkdownHeadings(markdown).map((heading) => [heading.line, heading.id]),
  );
  const markdownComponents = getMarkdownComponents(headingIdsByLine);

  return (
    <article
      data-testid={dataTestId}
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-10 text-sm sm:px-6 lg:py-14",
        className,
      )}
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={markdownRehypePlugins}
        remarkPlugins={[remarkGfm]}
        urlTransform={defaultUrlTransform}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
