import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import {
  LandingDoItYourselfPage,
  LandingMarkdownPreviewPage,
} from "@/components/LandingMarkdownPreviewPage";

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
  useNavigate: () => () => {},
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

    expect(markup).toContain("The correct");
    expect(markup).toContain("Do it yourself");
    expect(markup).toContain("/landing/do-it-yourself");
    expect(markup).not.toContain("Language: English");
    expect(markup).not.toContain("Create Github, Convex, Cloudflare");
  });

  it("keeps the help sidebar as two flat files instead of linking every heading", () => {
    const markup = renderToStaticMarkup(<LandingMarkdownPreviewPage />);
    const sidebarMarkup = markup.slice(0, markup.indexOf("<main>"));

    expect(sidebarMarkup).toContain("Overview");
    expect(sidebarMarkup).toContain("Do it yourself");
    expect(sidebarMarkup).toContain('href="/landing-preview"');
    expect(sidebarMarkup).toContain('href="/landing/do-it-yourself"');
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

  it("renders the do-it-yourself guide separately", () => {
    const markup = renderToStaticMarkup(<LandingDoItYourselfPage />);

    expect(markup).toContain("Do it yourself: Deploy a production-ready");
    expect(markup).toContain("/landing-preview/step-1-create-accounts.mp4");
    expect(markup).toContain("Manual setup TLDR");
  });
});
