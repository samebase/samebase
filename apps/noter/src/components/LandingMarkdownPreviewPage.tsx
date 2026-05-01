import { PublicLayoutShell } from "@/Layout";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "@/lib/landingMarkdownPreview";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";

const landingPreviewSidebarLinks = [
  { href: "#overview", label: "Overview" },
  { href: "#accounts", label: "Accounts" },
  { href: "#copy-app-code", label: "GitHub template" },
  { href: "#cloudflare-pages", label: "Cloudflare Pages" },
  { href: "#convex-project", label: "Convex project" },
  { href: "#pages-deploy", label: "Pages deploy" },
  { href: "#codex-github", label: "Codex setup" },
  { href: "#preview-deployments", label: "Preview deploys" },
  { href: "#delete-app", label: "Delete app" },
  { href: "#noter-md", label: "noter.md" },
] as const;

function LandingMarkdownPreviewSidebar() {
  return (
    <nav
      aria-label="Landing preview sections"
      data-testid={LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID}
      className="flex min-h-full flex-col gap-1 px-1 py-2 text-sm"
    >
      {landingPreviewSidebarLinks.map((link) => (
        <a
          key={link.href}
          className="block px-2 py-1.5 font-medium leading-5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          href={link.href}
        >
          {link.label}
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
          className="min-h-full"
          dataTestId={LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}
          markdown={landingPreviewMarkdown}
        />
      </div>
    </PublicLayoutShell>
  );
}
