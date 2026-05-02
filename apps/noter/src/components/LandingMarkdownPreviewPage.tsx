import { PublicLayoutShell } from "@/Layout";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { getLandingMarkdownHeadings } from "@/lib/landingMarkdownHeadings";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "@/lib/landingMarkdownPreview";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";

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

function LandingMarkdownPreviewSidebar() {
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
        >
          {heading.text}
        </a>
      ))}
    </nav>
  );
}

export function LandingMarkdownPreviewPage() {
  return (
    <PublicLayoutShell
      defaultLeftOpen
      left={{ content: <LandingMarkdownPreviewSidebar /> }}
    >
      <div
        data-testid={LANDING_MARKDOWN_PREVIEW_TEST_ID}
        className="flex min-h-0 flex-1 flex-col"
      >
        <MarkdownLandingDocument
          className="min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]"
          dataTestId={LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}
          markdown={landingPreviewMarkdown}
        />
      </div>
    </PublicLayoutShell>
  );
}
