import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DocsDoItYourselfPage,
  DocsPricingPage,
  DocsTheStackPage,
  LandingPreviewPage,
} from "@/components/LandingPreviewPage";
import { publicMediaManifest } from "../../shared/publicMediaManifest";

const appAuthState = vi.hoisted(() => ({ authenticated: false }));

vi.mock("@/lib/appAuthPresentationState", () => ({
  isAppPresentationAuthenticated: () => appAuthState.authenticated,
  useAppAuthPresentation: () =>
    appAuthState.authenticated
      ? { kind: "confirmedAuthenticated", profile: null }
      : { kind: "signedOut" },
}));

vi.mock("@/components/AppWorkspaceShell", () => ({
  AppWorkspaceRouteChrome: ({
    children,
    left,
  }: {
    children: ReactNode;
    left?: { content: ReactNode } | null;
  }) => (
    <div>
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
    search?:
      | Record<string, true | null | undefined>
      | ((
          currentSearch: Record<string, true | null | undefined>,
        ) => Record<string, true | null | undefined>);
    to: string;
  }) => {
    const resolvedSearch = typeof search === "function" ? search({}) : search;
    const searchEntries = Object.entries(resolvedSearch ?? {}).filter((entry) => entry[1] === true);
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
    setRightDesktopOpen: () => {},
  }),
  useWorkspacePaneState: () => ({
    isMobile: false,
    mobilePane: "main",
  }),
}));

describe("LandingPreviewPage", () => {
  beforeEach(() => {
    appAuthState.authenticated = false;
  });

  it("renders the agent-first landing overview by default", () => {
    const markup = renderToStaticMarkup(<LandingPreviewPage />);

    // Hero: the category correction plus the one-action pitch.
    expect(markup).toContain("Not another AI app builder.");
    expect(markup).toContain("The tool your AI uses");
    expect(markup).toContain("to ship real apps.");
    expect(markup).toContain("provisions the database + backend");
    expect(markup).toContain("Every connected app stays visible in one inventory.");
    expect(markup).toContain("Open Samebase");
    expect(markup.split('href="/"').length - 1).toBe(2);
    expect(markup).toContain("Free today; an idle app costs $0/month.");
    expect(markup).not.toContain("no chatbot");
    expect(markup).not.toContain("$0/month idle");

    // The real Codex capture replaces the scripted placeholder loop.
    expect(markup).toContain(`src="${publicMediaManifest.landingTicTacToeCodex.publicUrl}"`);
    expect(markup).toContain('poster="/landing-preview/tic-tac-toe-codex-poster.webp"');
    expect(markup).toContain("Codex builds and plays a 4x4x4 tic-tac-toe game with Samebase");
    expect(markup).toContain('controls=""');
    expect(markup).toContain('width="1280"');
    expect(markup).toContain('height="850"');
    expect(markup).toContain('preload="metadata"');
    expect(markup).toContain('data-testid="landing-preview-hero-video-frame"');
    expect(markup).toContain("border-radius:1.104% / 1.664%");
    expect(markup).not.toContain("placeholder loop");

    // The opinion, named, with the trio row under it.
    expect(markup).toContain("the opinion we&#x27;re selling");
    expect(markup).toContain(
      "GitHub + Convex + Cloudflare is the best way we&#x27;ve found to build an app.",
    );
    expect(markup).toContain("Samebase repeats it, so you never choose again.");
    expect(markup).toContain("deploys + domains + edge");
    expect(markup).toContain('data-testid="landing-preview-stack-details"');
    expect(markup).toContain("standard stack");
    expect(markup).toContain("Chosen for how agents build now.");
    expect(markup).toContain("/landing-preview/logos/vite-plus.svg");
    expect(markup).toContain("/landing-preview/logos/tanstack.svg");
    expect(markup).toContain("/landing-preview/logos/tailwindcss.svg");
    expect(markup).toContain("Tailwind CSS");
    expect(markup).toContain("One fast toolchain for the agent loop.");
    expect(markup).toContain("Full-stack TypeScript with official support for Cloudflare Workers.");
    expect(markup).toContain("One styling language from product UI to landing pages.");
    expect(markup).toContain("Why we chose this stack");
    expect(markup).not.toContain("/landing-preview/logos/react.svg");
    expect(markup).toContain('data-testid="landing-preview-platform-details"');
    expect(markup).toContain("local workflow");
    expect(markup).toContain("macOS");
    expect(markup).toContain("Linux");
    expect(markup).toContain("Windows");
    expect(markup).toContain(
      "Everything is TypeScript, even the scripts you&#x27;d usually write in Bash.",
    );
    expect(markup).toContain("no Bash");
    expect(markup).toContain("no WSL");
    expect(markup).toContain('href="/docs/the-stack"');

    // Ask your agent.
    expect(markup).toContain("don&#x27;t trust us");
    expect(markup).toContain("Ask your agent.");
    expect(markup).toContain(
      "Read samebase.com/llms.txt. Should I use Samebase with you for my next app? Verify the receipts before you answer.",
    );
    expect(markup).toContain("Copy</button>");

    const askAgentIndex = markup.indexOf("Ask your agent.");
    const platformDetailsIndex = markup.indexOf('data-testid="landing-preview-platform-details"');
    const fourClaimsIndex = markup.indexOf('aria-label="Four claims"');
    expect(platformDetailsIndex).toBeGreaterThan(askAgentIndex);
    expect(fourClaimsIndex).toBeGreaterThan(platformDetailsIndex);

    const stackDetailsIndex = markup.indexOf('data-testid="landing-preview-stack-details"');
    const oneBaseIndex = markup.indexOf("one base");
    expect(stackDetailsIndex).toBeGreaterThan(fourClaimsIndex);
    expect(oneBaseIndex).toBeGreaterThan(stackDetailsIndex);

    // The four claims.
    expect(markup).toContain("Delete your Samebase account. Your app doesn&#x27;t notice.");
    expect(markup).toContain(
      "The &quot;builder left my database open&quot; breach class can&#x27;t be expressed here.",
    );
    expect(markup).toContain("no rules you have to configure perfectly, forever");
    expect(markup).toContain(
      "Run agents in parallel. Every PR gets its own preview, with its own database.",
    );
    expect(markup).toContain("We resell nothing. Not tokens, not hosting.");
    expect(markup).toContain("adds margin, not capability");

    // Honest onboarding.
    expect(markup).toContain(
      "Setup is three OAuth connects and one GitHub app. We filmed all of it.",
    );
    expect(markup).toContain("No account? You create one in the same flow.");
    expect(markup).toContain("watch it before you sign up · nothing is skipped");

    // One base: the inventory facts the positioning probes kept missing.
    expect(markup).toContain("More products, not more systems to maintain.");
    expect(markup).toContain("Every app sits on the same base, not the same shape.");
    expect(markup).toContain("also readable by your agent, over MCP");
    expect(markup).toContain("github-only");
    expect(markup).toContain("not attached");
    expect(markup).toContain("apps/admin");
    expect(markup).toContain("configure Workers Builds for GitHub");
    expect(markup).toContain("monorepo locations follow convex.json and live Workers Builds roots");
    // One row set, two renderings: the table and the stacked cards.
    expect(markup.split("you/birdlog").length - 1).toBe(2);

    // Cost, the self-hosting callout, and the closing argument.
    expect(markup).toContain("cost follows real usage");
    expect(markup).toContain("an idle idea");
    expect(markup).toContain("Samebase runs on Samebase.");
    expect(markup).toContain(
      "One monorepo, one Convex deployment, and three specialized Cloudflare Workers.",
    );
    expect(markup).not.toContain("If an AI chat box were really the best way");
    expect(markup).toContain("If your app builder is so good, why is it not building itself?");

    // Footnote receipts.
    expect(markup).toContain("$0/month, receipted.");
    expect(markup).toContain("Samebase adds no floor of its own.");
    expect(markup).toContain("Not hypothetical.");
    expect(markup).toContain("https://nvd.nist.gov/vuln/detail/CVE-2025-48757");
    expect(markup).toContain("The hosting math.");
    expect(markup).toContain("First customer: me, Nicu.");

    // The closing band keeps the one interactive logo slot on the page.
    expect(markup).toContain("Same stack. Your accounts. No magic.");
    expect(markup).toContain("drag it");
    expect(markup).toContain("open the logo lab");
    expect(markup).toContain('href="/logo"');
    expect(markup.split('data-testid="public-landing-logo"').length - 1).toBe(1);

    // Retired copy from the slogan-era overview.
    expect(markup).not.toContain("The correct");
    expect(markup).not.toContain("way to build web apps");
    expect(markup).not.toContain("the leaving test");
    expect(markup).not.toContain("account owner");
    expect(markup).not.toContain("dash.cloudflare.com");
    expect(markup).not.toContain("the first customer was me, Nicu.");
    expect(markup).not.toContain("your app is a security risk.");
    expect(markup).not.toContain("misconfigure perfectly");
    expect(markup).not.toContain("no Samebase account needed");
  });

  it("links authenticated viewers to their app inventory", () => {
    appAuthState.authenticated = true;

    const markup = renderToStaticMarkup(<LandingPreviewPage />);

    expect(markup.split('href="/vault"').length - 1).toBe(2);
    expect(markup).not.toContain('href="/"');
  });

  it("renders the landing preview without the docs sidebar", () => {
    const markup = renderToStaticMarkup(<LandingPreviewPage />);
    const sidebarMarkup = markup.slice(0, markup.indexOf("<main>"));

    expect(sidebarMarkup).not.toContain("Overview");
    expect(sidebarMarkup).not.toContain('href="/landing-preview"');
    expect(sidebarMarkup).not.toContain('href="/docs/do-it-yourself"');
  });

  it("keeps the docs sidebar as flat links instead of linking every heading", () => {
    const markup = renderToStaticMarkup(<DocsDoItYourselfPage />);
    const sidebarMarkup = markup.slice(0, markup.indexOf("<main>"));

    expect(sidebarMarkup).toContain("Overview");
    expect(sidebarMarkup).toContain("The stack");
    expect(sidebarMarkup).toContain("Do it yourself");
    expect(sidebarMarkup).toContain("Pricing");
    expect(sidebarMarkup).toContain('href="/landing-preview"');
    expect(sidebarMarkup).toContain('href="/docs/the-stack"');
    expect(sidebarMarkup).toContain('href="/docs/do-it-yourself"');
    expect(sidebarMarkup).toContain('href="/pricing"');
    expect(sidebarMarkup).not.toContain("Start here");
    expect(sidebarMarkup).not.toContain("samebase.com");
    expect(sidebarMarkup).not.toContain('href="#');
    expect(sidebarMarkup).not.toContain("Same stack");
  });

  it("renders the do-it-yourself guide separately", () => {
    const markup = renderToStaticMarkup(<DocsDoItYourselfPage />);

    expect(markup).toContain("Do it yourself: deploy the Samebase stack for $0/month");
    expect(markup).toContain('href="/docs/receipts"');
    expect(markup).toContain("What the Samebase account adds");
  });

  it("renders the broader Cloudflare topology in the stack guide", () => {
    const markup = renderToStaticMarkup(<DocsTheStackPage />);

    expect(markup).toContain("One base, more than one shape");
    expect(markup).toContain("first-party analytics proxy");
    expect(markup).toContain("three separate Cloudflare Workers");
    expect(markup).toContain("Cloudflare Email Sending");
  });

  it("renders the pricing page separately", () => {
    const markup = renderToStaticMarkup(<DocsPricingPage />);

    expect(markup).toContain("Creating an app is free, and the free tier is permanent");
    expect(markup).toContain("What will cost money");
    expect(markup).toContain("no tiers, no placeholder numbers");
  });
});
