import { PublicLayoutShell } from "@/Layout";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { useSidebar, type MobileSidebarPane } from "@/hooks/use-sidebar";
import { getLandingMarkdownHeadings } from "@/lib/landingMarkdownHeadings";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "@/lib/landingMarkdownPreview";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";
import type { MouseEvent as ReactMouseEvent } from "react";

const landingPreviewHeadings = getLandingMarkdownHeadings(
  landingPreviewMarkdown,
);

const landingPreviewSidebarLinkClassNames = {
  1: "block px-2 py-1.5 text-sm font-medium leading-5 text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  2: "block px-2 py-1.5 text-sm font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  3: "block px-5 py-1 text-xs font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  4: "block px-7 py-1 text-xs font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  5: "block px-8 py-1 text-xs font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  6: "block px-8 py-1 text-xs font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
} satisfies Record<(typeof landingPreviewHeadings)[number]["level"], string>;

function shouldUseNativeLinkClick(event: ReactMouseEvent<HTMLAnchorElement>) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

function buildLandingPreviewPaneHashPath({
  hash,
  mobilePane,
}: {
  hash: string;
  mobilePane: MobileSidebarPane | null;
}) {
  const searchParams = new URLSearchParams(window.location.search);
  if (mobilePane !== null) {
    if (mobilePane === "left") {
      searchParams.set("left", "");
    } else {
      searchParams.delete("left");
    }

    if (mobilePane === "right") {
      searchParams.set("right", "");
    } else {
      searchParams.delete("right");
    }
  }

  return buildPathWithTanStackSearch({
    hash,
    pathname: window.location.pathname,
    search: Object.fromEntries(searchParams.entries()),
  });
}

function getLandingPreviewDefaultMobilePane(): MobileSidebarPane {
  if (typeof window === "undefined") {
    return "main";
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("left")) {
    return "left";
  }
  if (searchParams.has("right")) {
    return "right";
  }

  return "main";
}

function getLandingPreviewArticleHeading(headingId: string) {
  const article = document.querySelector<HTMLElement>(
    `[data-testid="${LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}"]`,
  );
  return (
    article?.querySelector<HTMLElement>(
      `[data-landing-heading-id="${CSS.escape(headingId)}"]`,
    ) ?? null
  );
}

function getLandingPreviewMobileCarousel() {
  return document.querySelector<HTMLElement>(
    '[data-workspace-layout-v2="mobile"] [data-testid="workspace-layout-v2-pane-main"]',
  );
}

function getVerticalScrollContainer(target: HTMLElement) {
  let node = target.parentElement;
  while (node !== null) {
    const style = window.getComputedStyle(node);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }

    node = node.parentElement;
  }

  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function scrollHeadingWithinCurrentPane(target: HTMLElement) {
  const scrollContainer = getVerticalScrollContainer(target);
  const targetBounds = target.getBoundingClientRect();
  const containerBounds =
    scrollContainer === document.documentElement
      ? { top: 0 }
      : scrollContainer.getBoundingClientRect();
  const scrollMarginTop =
    Number.parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;

  scrollContainer.scrollTop +=
    targetBounds.top - containerBounds.top - scrollMarginTop;
}

function LandingMarkdownPreviewSidebar() {
  const { isMobile, mobilePane } = useSidebar();

  return (
    <nav
      aria-label="Landing preview sections"
      data-testid={LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID}
      className="flex min-h-full flex-col gap-1 px-1 py-2 text-sm"
    >
      {landingPreviewHeadings.map((heading) => (
        <a
          key={heading.id}
          className={landingPreviewSidebarLinkClassNames[heading.level]}
          href={heading.href}
          // Mobile hash updates should resolve in the sidebar so the carousel
          // does not reveal the article pane while the user is using the TOC.
          id={isMobile ? heading.id : undefined}
          onClick={(event) => {
            if (shouldUseNativeLinkClick(event)) {
              return;
            }

            const target = getLandingPreviewArticleHeading(heading.id);
            if (target === null) {
              return;
            }

            event.preventDefault();
            const mobileCarousel = isMobile
              ? getLandingPreviewMobileCarousel()
              : null;
            const mobileCarouselScrollLeft = mobileCarousel?.scrollLeft ?? 0;
            window.history.pushState(
              window.history.state,
              "",
              buildLandingPreviewPaneHashPath({
                hash: heading.href,
                mobilePane: isMobile ? mobilePane : null,
              }),
            );
            if (mobileCarousel !== null) {
              mobileCarousel.scrollLeft = mobileCarouselScrollLeft;
            }
            scrollHeadingWithinCurrentPane(target);
          }}
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

function LandingMarkdownPreviewDocument() {
  return (
    <MarkdownLandingDocument
      className="min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]"
      dataTestId={LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}
      markdown={landingPreviewMarkdown}
    />
  );
}

export function LandingMarkdownPreviewPage() {
  return (
    <PublicLayoutShell
      defaultLeftOpen
      defaultMobilePane={getLandingPreviewDefaultMobilePane()}
      left={{ content: <LandingMarkdownPreviewSidebar /> }}
    >
      <div
        data-testid={LANDING_MARKDOWN_PREVIEW_TEST_ID}
        className="flex min-h-0 flex-1 flex-col"
      >
        <LandingMarkdownPreviewDocument />
      </div>
    </PublicLayoutShell>
  );
}
