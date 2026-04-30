import { PublicLayoutShell } from "@/Layout";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "@/lib/landingMarkdownPreview";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";

export function LandingMarkdownPreviewPage() {
  return (
    <PublicLayoutShell>
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
