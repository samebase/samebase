import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DocsDoItYourselfPage,
  DocsIndexPage,
  DocsChangelogPage,
  DocsPricingPage,
  DocsTheBigMigrationPage,
  DocsTheStackPage,
  LandingPage,
} from "@/components/LandingPreviewPage";
import { DOCS_ROUTE_CHROME } from "@/components/DocsSidebar";
import { LANDING_INLINE_80_PERCENT_MARK_SVG_URL } from "@/components/compactIdentitySvgAsset";
import { type PublicDeploymentAuthPolicy } from "../../convex/deploymentProfile";

const authState = vi.hoisted(() => ({ isAuthenticated: false, isLoading: false }));
const policyState = vi.hoisted<{
  deploymentAuthPolicy: PublicDeploymentAuthPolicy | undefined;
}>(() => ({ deploymentAuthPolicy: undefined }));

vi.mock("convex/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("convex/react")>()),
  useConvexAuth: () => authState,
}));

// The page reads one query: the root loader's deployment auth policy.
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: policyState.deploymentAuthPolicy }),
}));

// This server render has no Start request.
vi.mock("@/lib/isomorphic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/isomorphic")>()),
  readIsomorphicOrigin: () => "http://127.0.0.1:4173",
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

vi.mock("@/authClient", () => ({
  isInIframe: () => false,
  openAuthPopup: () => {},
  useAppSignInActions: () => ({
    signInWithOAuth: () => {},
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    search,
    to,
  }: {
    children: ReactNode | ((state: { isActive: boolean }) => ReactNode);
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
        {typeof children === "function" ? children({ isActive: false }) : children}
      </a>
    );
  },
  useLocation: ({ select }: { select: (location: { searchStr: string }) => string }) =>
    select({ searchStr: "" }),
  useMatchRoute: () => () => false,
  useNavigate: () => () => {},
  useRouter: () => ({
    buildLocation: () => ({ href: "/?auth-return=dashboard&signup=github" }),
  }),
}));

vi.mock("@samebase/sidebars/SidebarRuntime", () => ({
  useSidebarLayoutPresentation: () => ({
    isMobile: false,
    mobileMergeProgress: null,
    mobilePane: "main",
    mobilePaneScrollProgress: 0,
  }),
  useSidebarActions: () => ({
    setMobilePane: () => {},
  }),
}));

describe("LandingPage", () => {
  afterEach(() => {
    authState.isAuthenticated = false;
    policyState.deploymentAuthPolicy = undefined;
  });

  it("renders the agent-first landing overview by default", () => {
    const markup = renderToStaticMarkup(<LandingPage />);

    expect(markup).toContain(`src="${LANDING_INLINE_80_PERCENT_MARK_SVG_URL}"`);
    // Hero: the agent heading, what you get, who deploys it, the template link, and the agent prompt.
    expect(markup).toContain(">BETA</span>");
    expect(markup).toContain("Give your coding agent a working app.");
    expect(markup).toContain(
      "A repository in your GitHub, a Convex project in your team, a live URL, Google sign-in, and a preview per pull request. Deployed by Alchemy from your own GitHub Actions.",
    );
    expect(markup).toContain(
      'href="https://github.com/samebase/base" rel="noreferrer" target="_blank">samebase/base</a> template without an account.',
    );
    expect(markup).toContain(
      "Research https://samebase.com and check if its claims are true. Based on what you know about me, should I use Samebase with you, or one of its competitors?",
    );
    expect(markup).toContain("Copy prompt</button>");
    expect(markup.split(">Continue with GitHub</span></button>").length - 1).toBe(2);

    // The logo film plays in a YouTube embed below the hero copy.
    expect(markup).toContain(
      'src="https://www.youtube-nocookie.com/embed/ovMWyoajRMk" title="Samebase logo film"',
    );
    expect(markup.indexOf("Research https://samebase.com and check")).toBeLessThan(
      markup.indexOf("youtube-nocookie.com/embed/ovMWyoajRMk"),
    );

    // The sections that sold the old setup are gone: the three pillars, the platform block, the
    // monorepo tree, the onboarding video, and the Workers Builds hosting math.
    expect(markup).not.toContain("GitHub + Convex + Cloudflare");
    expect(markup).not.toContain("local workflow");
    expect(markup).not.toContain('aria-label="Monorepo"');
    expect(markup).not.toContain('aria-label="Onboarding walkthrough"');
    expect(markup).not.toContain("youtube-nocookie.com/embed/8-ZEGPpqi9Y");
    expect(markup).not.toContain("The hosting math.");

    // How it works: the opinion, the five steps, and what Samebase does not do.
    expect(markup).toContain('aria-label="How it works"');
    expect(markup).toContain("An opinionated way to use Alchemy.");
    expect(markup).toContain('href="https://alchemy.run"');
    expect(markup).toContain("its state lives in Convex, so one OAuth click is enough");
    expect(markup).toContain("Connect GitHub and Convex.");
    expect(markup).toContain("Create an app.");
    expect(markup).toContain("The first push deploys.");
    expect(markup).toContain("Samebase reads the state.");
    expect(markup).toContain("Every pull request deploys too.");
    expect(markup).toContain("writes CONVEX_ACCESS_TOKEN into it");
    expect(markup).toContain("alchemy-state-store");
    expect(markup).toContain("Your repository deploys, your agent fixes.");

    const howItWorksIndex = markup.indexOf('aria-label="How it works"');
    const fourClaimsIndex = markup.indexOf('aria-label="Four claims"');
    expect(fourClaimsIndex).toBeGreaterThan(howItWorksIndex);

    // The four claims.
    expect(markup).toContain("Delete your Samebase account. Your app keeps running.");
    expect(markup).toContain("It keeps deploying too.");
    expect(markup).toContain("before you revoke Samebase at Convex");
    expect(markup).toContain("New Google sign-ins through Samebase stop.");
    expect(markup).toContain(">do-it-yourself recipe</a>");
    expect(markup).toContain("No client-facing database to leave open.");
    expect(markup).toContain("Access checks live in code you can read and test.");
    expect(markup).toContain(
      "Run agents in parallel. Every PR gets its own preview, with its own database.",
    );
    expect(markup).toContain("We resell nothing. Not tokens, not hosting.");
    expect(markup).toContain("Idle apps sit in free tiers.");

    // Cost rows carry a heading, not an eyebrow label.
    expect(markup).toContain('aria-label="What it costs"');
    expect(markup).toContain(">What it costs</h2>");
    expect(markup).not.toContain("cost follows real usage");
    expect(markup).toContain("an idle idea");

    // FAQ.
    expect(markup).toContain('aria-label="Frequently asked questions"');
    expect(markup).toContain(">FAQ</h2>");
    expect(markup).toContain("Codex already writes Convex well. Why do I need Samebase?");
    expect(markup).toContain("You don&#x27;t, for the code.");
    expect(markup).toContain("Ok, but can&#x27;t I just get your template and not use Samebase?");
    expect(markup).toContain("Existing apps do not change unless you update them.");
    expect(markup).toContain("Why is the Alchemy state in Convex?");
    expect(markup).toContain("A Convex OAuth token has no expiry date");
    expect(markup).toContain('href="/docs/the-big-migration"');
    expect(markup).toContain("Can I use Cloudflare?");
    expect(markup).toContain("CLOUDFLARE_API_TOKEN");
    expect(markup).toContain("Is Samebase stable?");
    expect(markup).toContain("Is Samebase open source?");
    expect(markup).toContain("Wait, so all Samebase is, is a template and a list?");
    expect(markup).toContain("Kinda.");
    expect(markup.split('data-slot="accordion-trigger"').length - 1).toBe(7);
    expect(markup.split('data-slot="accordion-content"').length - 1).toBe(7);

    const costIndex = markup.indexOf('aria-label="What it costs"');
    const faqIndex = markup.indexOf('aria-label="Frequently asked questions"');
    const closingQuestionIndex = markup.indexOf(
      "If your app builder is so good, why is it not building itself?",
    );
    expect(faqIndex).toBeGreaterThan(costIndex);
    expect(closingQuestionIndex).toBeGreaterThan(faqIndex);
    expect(markup).toContain(
      "samebase.com deploys itself with Alchemy from its own GitHub Actions.",
    );

    // Footnote receipts.
    expect(markup).toContain("$0/month, receipted.");
    expect(markup).toContain("2,000 Actions minutes");
    expect(markup).toContain("Samebase adds no floor of its own.");
    expect(markup).toContain("Not hypothetical.");
    expect(markup).toContain("https://nvd.nist.gov/vuln/detail/CVE-2025-48757");
    expect(markup).toContain("First customer: me, Nicu.");

    // The closing band keeps one fractal logo without logo-lab helper copy.
    expect(markup).toContain(
      'Same <del class="text-muted-foreground" aria-hidden="true">stack</del> base. Your accounts. No magic.',
    );
    expect(markup.split('data-testid="public-landing-logo"').length - 1).toBe(1);
  });

  it("reuses the GitHub OAuth action in both signed-out landing CTA positions", () => {
    const markup = renderToStaticMarkup(<LandingPage />);

    expect(markup.split(">Continue with GitHub</span></button>").length - 1).toBe(2);
    expect(markup.split('<div class="hidden"><a').length - 1).toBe(2);
  });

  it("links both signed-in landing CTA positions to the dashboard", () => {
    authState.isAuthenticated = true;

    const markup = renderToStaticMarkup(<LandingPage />);

    expect(markup.split('href="/repo"').length - 1).toBe(2);
    expect(markup.split(">Go to dashboard</a>").length - 1).toBe(2);
    expect(markup.split('<div class="hidden"><button').length - 1).toBe(2);
  });

  it("keeps the docs sidebar in the routes' static left pane, not in the page", () => {
    const sidebarMarkup = renderToStaticMarkup(DOCS_ROUTE_CHROME.leftPane.content);

    expect(sidebarMarkup).toContain('data-testid="docs-sidebar"');
    expect(sidebarMarkup).toContain('href="/docs/do-it-yourself"');
    expect(renderToStaticMarkup(<LandingPage />)).not.toContain('data-testid="docs-sidebar"');
  });

  it("nests the docs pages under a docs folder instead of linking every heading", () => {
    const sidebarMarkup = renderToStaticMarkup(DOCS_ROUTE_CHROME.leftPane.content);

    expect(sidebarMarkup).toContain("Overview");
    expect(sidebarMarkup).toContain("The stack");
    expect(sidebarMarkup).not.toContain("Cloudflare setup");
    expect(sidebarMarkup).not.toContain("Worker Previews migration");
    expect(sidebarMarkup).toContain("Do it yourself");
    expect(sidebarMarkup).toContain("Pricing");
    expect(sidebarMarkup).toContain("Changelog");
    expect(sidebarMarkup).toContain('href="/"');
    expect(sidebarMarkup).not.toContain('href="/docs"');
    expect(sidebarMarkup).toContain('aria-label="Collapse Docs"');
    expect(sidebarMarkup).toContain('href="/docs/the-big-migration"');
    expect(sidebarMarkup).toContain('href="/docs/the-stack"');
    expect(sidebarMarkup).toContain('href="/docs/do-it-yourself"');
    expect(sidebarMarkup).toContain('href="/pricing"');
    expect(sidebarMarkup).toContain('href="/privacy"');
    expect(sidebarMarkup).toContain('href="/terms"');
    expect(sidebarMarkup).toContain('href="https://x.com/samebasecom"');
    expect(sidebarMarkup).toContain('href="https://www.youtube.com/@samebasecom"');
    expect(sidebarMarkup.indexOf("Changelog")).toBeLessThan(sidebarMarkup.indexOf("Privacy"));
    expect(sidebarMarkup).not.toContain("Start here");
    expect(sidebarMarkup).not.toContain("samebase.com");
    expect(sidebarMarkup).not.toContain('href="#');
    expect(sidebarMarkup).not.toContain("Same stack");

    expect(sidebarMarkup.indexOf("The stack")).toBeLessThan(
      sidebarMarkup.indexOf("Do it yourself"),
    );
  });

  it("renders the docs navigation in the main pane on the docs index", () => {
    // The docs index has no static left pane (routeAccessMetadata.test.ts), so the list is its page.
    const mainMarkup = renderToStaticMarkup(<DocsIndexPage />);

    expect(mainMarkup).toContain(`data-testid="docs-sidebar"`);
    expect(mainMarkup).toContain('href="/"');
    expect(mainMarkup).toContain('href="/docs/the-stack"');
    expect(mainMarkup).toContain('href="/docs/do-it-yourself"');
    expect(mainMarkup).toContain('href="/docs/receipts"');
    expect(mainMarkup).toContain('href="/pricing"');
  });

  it("renders the do-it-yourself guide separately", () => {
    const markup = renderToStaticMarkup(<DocsDoItYourselfPage />);

    expect(markup).toContain("# Do it yourself");
    expect(markup).toContain("## 1. Copy the starter");
    expect(markup).toContain("## 3. Push to main");
    expect(markup).toContain("gh secret set CONVEX_ACCESS_TOKEN");
    expect(markup).not.toContain("## 4.");
    expect(markup).not.toContain("Workers Builds");
  });

  it("lists the starter's pieces in the stack guide", () => {
    const markup = renderToStaticMarkup(<DocsTheStackPage />);

    expect(markup).toContain("**Alchemy deploys.**");
    expect(markup).toContain("convex-hosting");
    expect(markup).toContain("Cloudflare is optional.");
    expect(markup).not.toContain("Workers Builds");
  });

  it("renders the big migration article with its diagrams", () => {
    const markup = renderToStaticMarkup(<DocsTheBigMigrationPage />);

    expect(markup).toContain("The big migration");
    expect(markup).toContain("Move a Worker site");
    expect(markup).toContain("/big-migration/old-setup.svg");
    expect(markup).toContain("/big-migration/how-it-works.svg");
  });

  it("renders the changelog with its newest entry", () => {
    const markup = renderToStaticMarkup(<DocsChangelogPage />);

    expect(markup).toContain("Changelog");
    expect(markup).toContain("2026-11-01");
    expect(markup).toContain("Google sign-in for new apps.");
  });

  it("renders the pricing page separately", () => {
    const markup = renderToStaticMarkup(<DocsPricingPage />);

    expect(markup).toContain("Samebase is free during the beta. New Pro subscriptions are paused.");
    expect(markup).toContain("Personal account    |                     12 |       1");
    expect(markup).toContain("GitHub organization |                      6 |       2");
    expect(markup).not.toContain("$4");
    expect(markup).not.toContain("FileView");
  });
});
