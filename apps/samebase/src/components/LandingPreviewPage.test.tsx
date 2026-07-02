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
    expect(markup).toContain("way to build");
    expect(markup).toContain("web apps");
    expect(markup).toContain("cheaper and more powerful");
    expect(markup).toContain("cost follows real usage");
    expect(markup).toContain("an idle idea");
    expect(markup).toContain("account owner");
    expect(markup).toContain("hidden by samebase");
    expect(markup).toContain("samebase.com uses the exact same stack it recommends.");
    expect(markup).toContain("the first customer was me, Nicu.");
    expect(markup).toContain("personal and idle ideas should cost $0/month.");
    expect(markup).toContain("If your app builder is so good, why is it not building itself?");
    expect(markup).toContain("adds margin, not capability");
    expect(markup).toContain("I built it, then I deleted it.");
    expect(markup).toContain("your app is a security risk.");
    expect(markup).toContain("the leaving test");
    expect(markup).toContain("Samebase adds no floor of its own.");
    expect(markup).toContain("GitHub");
    expect(markup).toContain("Convex");
    expect(markup).toContain("Cloudflare");
    expect(markup).toContain("Samebase");
    expect(markup).not.toContain("The base is a trio.");
    expect(markup).not.toContain("Parallel by default");
    expect(markup).not.toContain("Manual setup proves it");
    expect(markup).not.toContain("Start with Samebase");
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
