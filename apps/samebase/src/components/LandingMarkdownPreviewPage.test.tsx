import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { LandingMarkdownPreviewPage } from "@/components/LandingMarkdownPreviewPage";
import { LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL } from "@/routeSearch/landingPreview";

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({
    children,
    left,
    sidebarDefaultState,
  }: {
    children: ReactNode;
    left?: { content: ReactNode };
    sidebarDefaultState?: {
      leftDesktopOpen?: boolean;
      rightDesktopOpen?: boolean;
    };
  }) => (
    <div data-sidebar-default-state={JSON.stringify(sidebarDefaultState)}>
      <aside>{left?.content}</aside>
      <main>{children}</main>
    </div>
  ),
}));

vi.mock("@/components/MarkdownLandingDocument", () => ({
  MarkdownLandingDocument: ({ markdown }: { markdown: string }) => <article>{markdown}</article>,
}));

vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { searchStr: string }) => string }) =>
    select({ searchStr: "" }),
}));

vi.mock("@/components/workspace-layout-v2/WorkspacePaneRuntime", () => ({
  useWorkspacePaneActions: () => ({
    setMobilePane: () => {},
  }),
  useWorkspacePaneState: () => ({
    isMobile: false,
    mobilePane: "main",
  }),
}));

describe("LandingMarkdownPreviewPage", () => {
  it("renders the English preview by default", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage />);

    expect(markup).toContain("Deploy a production-ready");
    expect(markup).toContain("Language: English");
    expect(markup).toContain(LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL);
  });

  it("keeps the help sidebar as two flat files instead of linking every heading", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage />);
    const sidebarMarkup = markup.slice(0, markup.indexOf("<main>"));

    expect(sidebarMarkup).toContain("Overview");
    expect(sidebarMarkup).toContain("Build it yourself");
    expect(sidebarMarkup).not.toContain("Start here");
    expect(sidebarMarkup).not.toContain("samebase.com");
    expect(sidebarMarkup).not.toContain('href="#');
    expect(sidebarMarkup).not.toContain("Same stack");
  });

  it("starts the landing preview with both desktop sidebars closed", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage />);

    expect(markup).toContain(
      `data-sidebar-default-state="{&quot;leftDesktopOpen&quot;:false,&quot;rightDesktopOpen&quot;:false}"`,
    );
  });

  it("renders the Romanian preview when selected", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage language="ro" />);

    expect(markup).toContain("Lansează o aplicație web");
    expect(markup).toContain("/landing-preview/step-1-create-accounts.mp4");
    expect(markup).toContain("Prezentare");
    expect(markup).toContain("Manual");
  });
});
