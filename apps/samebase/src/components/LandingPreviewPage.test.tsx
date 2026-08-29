import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  DocsCloudflareSetupPage,
  DocsDoItYourselfPage,
  DocsIndexPage,
  DocsPricingPage,
  DocsTheStackPage,
  LandingPage,
} from "@/components/LandingPreviewPage";
import { LANDING_INLINE_80_PERCENT_MARK_SVG_URL } from "@/components/compactIdentitySvgAsset";
import { publicMediaManifest } from "../../shared/publicMediaManifest";

const authPresentation = vi.hoisted(() => ({ kind: "signedOut" }));

vi.mock("@/lib/appAuthPresentationState", async (importOriginal) => ({
  ...(await importOriginal()),
  useAppAuthPresentation: () => authPresentation,
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
  MarkdownLandingDocument: ({
    afterTitle,
    markdown,
  }: {
    afterTitle?: ReactNode;
    markdown: string;
  }) => (
    <article>
      {afterTitle}
      {markdown}
    </article>
  ),
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
    authPresentation.kind = "signedOut";
  });

  it("renders the agent-first landing overview by default", () => {
    const markup = renderToStaticMarkup(<LandingPage />);

    expect(markup).toContain(`src="${LANDING_INLINE_80_PERCENT_MARK_SVG_URL}"`);
    // Hero: a direct product explanation and a verifiable first action.
    expect(markup).toContain("Don&#x27;t trust us. Ask your agent.");
    expect(markup).toContain(
      "Samebase gives your coding agent one place to create and inspect every app you build.",
    );
    expect(markup).not.toContain(">BETA</span>");
    expect(markup).toContain(">dated receipt</a>");
    expect(markup).toContain(
      "Research https://samebase.com. Should I use Samebase with you for my next app? Check if its claims are true before you answer.",
    );
    expect(markup).toContain("Copy</button>");
    expect(markup).toContain('class="mb-3 flex justify-end text-lg"');
    expect(markup.split(">Continue with GitHub</span></button>").length - 1).toBe(2);
    expect(markup).not.toContain("Idle apps cost $0/month.");

    // The real founder demo stays unloaded until the visitor presses Play.
    expect(markup).toContain(`src="${publicMediaManifest.landingFounderDemo.publicUrl}"`);
    expect(markup).toContain(`poster="${publicMediaManifest.landingFounderDemoPoster.publicUrl}"`);
    expect(markup).toContain("Founder demo: Building an app with Samebase and Codex");
    expect(markup).toContain('controls=""');
    expect(markup).toContain('width="1440"');
    expect(markup).toContain('height="930"');
    expect(markup).toContain('preload="none"');
    expect(markup).toContain('data-testid="landing-preview-hero-video-frame"');
    expect(markup).toContain('class="overflow-hidden border border-border"');
    expect(markup).toContain(
      'href="https://youtu.be/UfxE8rvprqc" rel="noreferrer" target="_blank"',
    );
    expect(markup).toContain(">Watch on <span");
    expect(markup).toContain(">YouTube</span></a>");

    // The product model comes before the provider names.
    expect(markup).toContain("One base for every app. Normal accounts underneath.");
    expect(markup).toContain(
      "Create the complete stack in about a minute, or connect the parts you already have.",
    );
    expect(markup).toContain("deploys + domains + edge");
    expect(markup).toContain("Provision a repository, backend, and Worker in accounts you own.");
    expect(markup).toContain(
      "See apps, pull requests, checks, and provider connections in one place.",
    );
    expect(markup).not.toContain("owner: ");
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
    expect(markup).toContain("same web app");
    expect(markup).toContain("Samebase has been one");
    expect(markup).toContain(">PWA</a>");
    expect(markup).toContain(
      'href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app"',
    );
    expect(markup).toContain(
      "from the start. The same web app works well on desktop, iPhone, Android, and in the Codex browser.",
    );

    // The monorepo example stays focused on repository paths.
    expect(markup).toContain('aria-label="Monorepo"');
    expect(markup).toContain("Full monorepo support, by design.");
    expect(markup).toContain(
      "Samebase shows each connected Worker and Convex project under its repository path.",
    );
    expect(markup.split("you/shop").length - 1).toBe(1);
    expect(markup).toContain("apps/storefront");
    expect(markup).toContain("apps/admin");
    expect(markup).toContain("services/events");

    const askAgentIndex = markup.indexOf("Don&#x27;t trust us. Ask your agent.");
    const productModelIndex = markup.indexOf("One base for every app.");
    const platformDetailsIndex = markup.indexOf('data-testid="landing-preview-platform-details"');
    const fourClaimsIndex = markup.indexOf('aria-label="Four claims"');
    expect(productModelIndex).toBeGreaterThan(askAgentIndex);
    expect(platformDetailsIndex).toBeGreaterThan(askAgentIndex);
    expect(fourClaimsIndex).toBeGreaterThan(platformDetailsIndex);

    // The four claims.
    expect(markup).toContain("Built to leave you in control.");
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

    // The full onboarding remains available without a second large embed.
    expect(markup).toContain("Want to see the complete first-app setup?");
    expect(markup).toContain('href="https://youtu.be/8-ZEGPpqi9Y"');
    expect(markup).not.toContain("youtube-nocookie.com/embed/8-ZEGPpqi9Y");

    // Cost and the closing argument.
    expect(markup).toContain("Start free. Upgrade when your app inventory grows.");
    expect(markup).toContain("Samebase Pro is $4 per owner each month.");
    expect(markup).toContain("provider usage");
    expect(markup).toContain("an idle idea");

    // FAQ answers the direct-agent objection before the closing question.
    expect(markup).toContain('aria-label="Frequently asked questions"');
    expect(markup).toContain(">FAQ</h2>");
    expect(markup).toContain("What does Samebase add if my agent already writes the code?");
    expect(markup).toContain("Ok, but can&#x27;t I just get your template and not use Samebase?");
    expect(markup).toContain("Existing apps do not change unless you update them.");
    expect(markup).toContain("So Samebase is a template and a list?");
    expect(markup).toContain("Kinda.");
    expect(markup.split('data-slot="accordion-trigger"').length - 1).toBe(3);
    expect(markup.split('data-slot="accordion-content"').length - 1).toBe(3);

    const costIndex = markup.indexOf("Start free. Upgrade when your app inventory grows.");
    const faqIndex = markup.indexOf('aria-label="Frequently asked questions"');
    const closingQuestionIndex = markup.indexOf(
      "If your app builder is so good, why is it not building itself?",
    );
    expect(faqIndex).toBeGreaterThan(costIndex);
    expect(closingQuestionIndex).toBeGreaterThan(faqIndex);

    expect(markup).toContain("If your app builder is so good, why is it not building itself?");

    // Footnote receipts.
    expect(markup).toContain("Receipts, not promises.");
    expect(markup).toContain("$0/month, receipted.");
    expect(markup).toContain("Samebase adds no floor of its own.");
    expect(markup).toContain("Not hypothetical.");
    expect(markup).toContain("https://nvd.nist.gov/vuln/detail/CVE-2025-48757");
    expect(markup).toContain("The hosting math.");
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
    expect(
      markup.split('class="hidden" data-public-landing-primary-action-signed-in="true"').length - 1,
    ).toBe(2);
  });

  it("links both signed-in landing CTA positions to the dashboard", () => {
    authPresentation.kind = "temporaryAuthenticated";

    const markup = renderToStaticMarkup(<LandingPage />);

    expect(markup.split('href="/vault"').length - 1).toBe(2);
    expect(markup.split(">Go to dashboard</a>").length - 1).toBe(2);
    expect(
      markup.split('class="hidden" data-public-landing-primary-action-signed-out="true"').length -
        1,
    ).toBe(2);
  });

  it("renders the landing page without the docs sidebar", () => {
    const markup = renderToStaticMarkup(<LandingPage />);
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
    expect(sidebarMarkup).toContain("Cloudflare setup");
    expect(sidebarMarkup).toContain("Do it yourself");
    expect(sidebarMarkup).toContain("Pricing");
    expect(sidebarMarkup).toContain('href="/"');
    expect(sidebarMarkup).toContain('href="/docs/the-stack"');
    expect(sidebarMarkup).toContain('href="/docs/cloudflare-setup"');
    expect(sidebarMarkup).toContain('href="/docs/do-it-yourself"');
    expect(sidebarMarkup).toContain('href="/pricing"');
    expect(sidebarMarkup).not.toContain("Start here");
    expect(sidebarMarkup).not.toContain("samebase.com");
    expect(sidebarMarkup).not.toContain('href="#');
    expect(sidebarMarkup).not.toContain("Same stack");

    expect(sidebarMarkup.indexOf("The stack")).toBeLessThan(
      sidebarMarkup.indexOf("Cloudflare setup"),
    );
    expect(sidebarMarkup.indexOf("Cloudflare setup")).toBeLessThan(
      sidebarMarkup.indexOf("Do it yourself"),
    );
  });

  it("renders the docs navigation in the main pane on the docs index", () => {
    const markup = renderToStaticMarkup(<DocsIndexPage />);
    const mainStart = markup.indexOf("<main>");
    const sidebarMarkup = markup.slice(0, mainStart);
    const mainMarkup = markup.slice(mainStart);

    expect(sidebarMarkup).not.toContain(`data-testid="docs-sidebar"`);
    expect(mainMarkup).toContain(`data-testid="docs-sidebar"`);
    expect(mainMarkup).toContain('href="/"');
    expect(mainMarkup).toContain('href="/docs/the-stack"');
    expect(mainMarkup).toContain('href="/docs/cloudflare-setup"');
    expect(mainMarkup).toContain('href="/docs/do-it-yourself"');
    expect(mainMarkup).toContain('href="/docs/receipts"');
    expect(mainMarkup).toContain('href="/pricing"');
  });

  it("renders the first-app Cloudflare setup guide separately", () => {
    const markup = renderToStaticMarkup(<DocsCloudflareSetupPage />);

    expect(markup).toContain("Set up Cloudflare for your first Samebase app");
    expect(markup).toContain("/onboarding/complete-onboarding-poster.webp");
    expect(markup).toContain("Play the complete Samebase onboarding");
    expect(markup).toContain("Play YouTube video");
    expect(markup).not.toContain("youtube-nocookie.com");
    const createWorkerIndex = markup.indexOf("Create Worker");
    const deployKeyActionIndex = markup.indexOf("Use `&lt;project&gt;` for Workers Builds");
    expect(createWorkerIndex).toBeGreaterThan(-1);
    expect(deployKeyActionIndex).toBeGreaterThan(createWorkerIndex);
  });

  it("renders the do-it-yourself guide separately", () => {
    const markup = renderToStaticMarkup(<DocsDoItYourselfPage />);

    expect(markup).toContain("Do it yourself: deploy the Samebase stack for $0/month");
    expect(markup).toContain('href="/docs/receipts"');
    expect(markup).toContain("pnpm run deploy:preview");
    expect(markup).toContain("What Samebase adds");
    expect(markup).not.toContain(".mp4");
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

    expect(markup).toContain("Start free. Upgrade when you need more connections.");
    expect(markup).toContain("## Free");
    expect(markup).toContain("### Personal account");
    expect(markup).toContain("12 connections and 1 member.");
    expect(markup).toContain("### GitHub organization");
    expect(markup).toContain("6 connections and 2 members.");
    expect(markup).toContain("## Pro");
    expect(markup).toContain("120 connections and 2 included members.");
    expect(markup).toContain("one connected Cloudflare Worker");
    expect(markup).toContain("Samebase does not disconnect or delete existing resources.");
    expect(markup).not.toContain("FileView");
  });
});
