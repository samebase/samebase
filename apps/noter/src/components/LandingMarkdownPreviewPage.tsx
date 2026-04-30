import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { SidebarProvider } from "@/components/sidebar";
import {
  WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX,
  WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX,
  WorkspaceLayoutV2FullPage,
} from "@/components/workspace-layout-v2/WorkspaceLayoutV2";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "@/lib/landingMarkdownPreview";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";

export function LandingMarkdownPreviewPage() {
  return (
    <SidebarProvider
      defaultLeftDesktopWidthPx={
        WORKSPACE_LAYOUT_V2_DESKTOP_SIDEBAR_MIN_WIDTH_PX
      }
      defaultLeftMobileWidthPx={
        WORKSPACE_LAYOUT_V2_MOBILE_SIDEBAR_DEFAULT_WIDTH_PX
      }
      defaultOpen={false}
      defaultRightOpen={false}
      shortcutSidebarSide="right"
    >
      <WorkspaceLayoutV2FullPage
        dataTestId={LANDING_MARKDOWN_PREVIEW_TEST_ID}
        leftToggleVisibility="hidden"
        main={{
          content: (
            <MarkdownLandingDocument
              className="min-h-full"
              dataTestId={LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}
              markdown={landingPreviewMarkdown}
            />
          ),
        }}
        rightToggleVisibility="hidden"
      />
    </SidebarProvider>
  );
}
