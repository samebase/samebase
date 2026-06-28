import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { LandingDoItYourselfPage, LandingPreviewPage } from "@/components/LandingPreviewPage";

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
  Link: ({
    children,
    className,
    search,
    to,
  }: {
    children: ReactNode;
    className?: string;
    search?: Record<string, true | null | undefined>;
    to: string;
  }) => {
    const searchEntries = Object.entries(search ?? {}).filter((entry) => entry[1] === true);
    const searchSuffix =
      searchEntries.length === 0 ? "" : `?${searchEntries.map((entry) => entry[0]).join("&")}`;

    return (
      <a className={className} href={`${to}${searchSuffix}`}>
        {children}
      </a>
    );
  },
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

describe("LandingPreviewPage", () => {
  it("renders the React landing overview by default", () => {
    const markup = renderToStaticMarkup(<LandingPreviewPage />);

    expect(markup).toContain("The");
    expect(markup).toContain("correct");
    expect(markup).toContain("way to build web apps");
    expect(markup).toContain("Samebase turns GitHub, Convex, and Cloudflare");
    expect(markup).toContain("The base is a trio.");
    expect(markup).toContain("Parallel by default");
    expect(markup).toContain("A separate local database deploy for each parallel agent.");
    expect(markup).toContain("A preview deploy for the exact branch under review.");
    expect(markup).toContain("Start with Samebase");
    expect(markup).toContain("Do it yourself");
    expect(markup).toContain("/landing/do-it-yourself");
    expect(markup).toContain("GitHub");
    expect(markup).toContain("Convex");
    expect(markup).toContain("Cloudflare");
    expect(markup).toContain("Claude Code, or any editor");
    expect(markup).not.toContain('alt="OpenAI"');
    expect(markup).not.toContain("Create Github, Convex, Cloudflare");
  });

  it("keeps the help sidebar as two flat files instead of linking every heading", () => {
    const markup = renderToStaticMarkup(<LandingPreviewPage />);
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
    const markup = renderToStaticMarkup(<LandingPreviewPage />);

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
