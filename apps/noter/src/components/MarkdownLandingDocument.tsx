import { type ComponentPropsWithoutRef, type ReactNode } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type Options as ReactMarkdownOptions,
} from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, {
  defaultSchema,
  type Options as RehypeSanitizeOptions,
} from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { isMarkdownVideoUrl } from "@/lib/landingMarkdownMedia";
import { cn } from "@/lib/utils";

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

const SANITIZED_SOURCE_ATTRIBUTES: string[] = ["src", "type"];

const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    source: SANITIZED_SOURCE_ATTRIBUTES,
    video: SANITIZED_VIDEO_ATTRIBUTES,
  },
  protocols: {
    ...defaultSchema.protocols,
    poster: ["http", "https"],
    src: ["http", "https"],
  },
  tagNames: [...(defaultSchema.tagNames ?? []), "source", "video"],
} satisfies RehypeSanitizeOptions;

const markdownRehypePlugins: ReactMarkdownOptions["rehypePlugins"] = [
  rehypeRaw,
  [rehypeSanitize, markdownSanitizeSchema],
];

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
  | "children"
  | "height"
  | "loop"
  | "muted"
  | "poster"
  | "preload"
  | "src"
  | "title"
  | "width"
>) {
  if (!src && children === undefined) {
    return null;
  }

  return (
    <video
      className="w-full max-w-full border bg-background"
      controls
      height={height}
      loop={loop}
      muted={muted}
      playsInline
      poster={poster}
      preload={preload ?? "metadata"}
      title={title}
      width={width}
    >
      {children === undefined && src ? <source src={src} /> : children}
    </video>
  );
}

function MarkdownImage({
  alt,
  src,
  title,
}: Pick<ComponentPropsWithoutRef<"img">, "alt" | "src" | "title">) {
  if (!src) {
    return null;
  }

  if (isMarkdownVideoUrl(src)) {
    return <MarkdownVideo src={src} title={title ?? alt} />;
  }

  return (
    <img
      alt={alt ?? ""}
      className="w-full max-w-full border bg-background object-contain"
      loading="lazy"
      src={src}
      title={title}
    />
  );
}

function renderHeading(level: 1 | 2 | 3 | 4, children: ReactNode) {
  switch (level) {
    case 1:
      return (
        <h1 className="text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">
          {children}
        </h1>
      );
    case 2:
      return (
        <h2 className="text-2xl font-semibold leading-tight tracking-normal">
          {children}
        </h2>
      );
    case 3:
      return (
        <h3 className="text-xl font-semibold leading-snug tracking-normal">
          {children}
        </h3>
      );
    case 4:
      return (
        <h4 className="text-base font-semibold leading-6 tracking-normal">
          {children}
        </h4>
      );
  }
}

const markdownComponents = {
  a({ children, href, title }) {
    if (isMarkdownVideoUrl(href)) {
      return <MarkdownVideo src={href} title={title} />;
    }

    const isExternal = isExternalUrl(href);
    return (
      <a
        className="font-medium text-foreground underline underline-offset-4"
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
      <blockquote className="border-l pl-4 text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  code({ children }) {
    return (
      <code className="border bg-accent px-1 py-0.5 font-mono text-[0.8125rem] leading-5 text-accent-foreground">
        {children}
      </code>
    );
  },
  h1({ children }) {
    return renderHeading(1, children);
  },
  h2({ children }) {
    return renderHeading(2, children);
  },
  h3({ children }) {
    return renderHeading(3, children);
  },
  h4({ children }) {
    return renderHeading(4, children);
  },
  h5({ children }) {
    return (
      <h5 className="text-sm font-semibold uppercase leading-6 tracking-normal">
        {children}
      </h5>
    );
  },
  h6({ children }) {
    return (
      <h6 className="text-xs font-semibold uppercase leading-5 tracking-normal text-muted-foreground">
        {children}
      </h6>
    );
  },
  hr() {
    return <hr className="border-border" />;
  },
  img({ alt, src, title }) {
    return <MarkdownImage alt={alt} src={src} title={title} />;
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
      <pre className="overflow-x-auto border bg-accent p-4 text-sm leading-6">
        {children}
      </pre>
    );
  },
  source({ src, type }) {
    if (!src) {
      return null;
    }

    return <source src={src} type={type} />;
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
    return (
      <td className="border-r px-3 py-2 align-top last:border-r-0">
        {children}
      </td>
    );
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

export function MarkdownLandingDocument({
  className,
  dataTestId,
  markdown,
}: {
  className?: string;
  dataTestId?: string;
  markdown: string;
}) {
  return (
    <article
      data-testid={dataTestId}
      className={cn(
        "mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 text-sm sm:px-6 lg:py-12",
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
