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
    // Hero: the stack opinion, one plain product sentence, and the agent prompt.
    expect(markup).toContain("The correct way to build web apps.");
    expect(markup).toContain(
      "Samebase gives you one place to manage GitHub, Convex, and Cloudflare across all your apps.",
    );
    expect(markup).toContain("Don&#x27;t trust us, ask your agent.");
    expect(markup).toContain(
      "Research https://samebase.com. Should I use Samebase with you for my next app? Check if its claims are true before you answer.",
    );
    expect(markup).toContain("Copy</button>");
    expect(markup.split(">Continue with GitHub</span></button>").length - 1).toBe(2);
    expect(markup).not.toContain("Idle apps cost $0/month.");

    // The founder demo plays in a YouTube embed below the hero copy.
    expect(markup).toContain(
      'src="https://www.youtube-nocookie.com/embed/UfxE8rvprqc" title="Founder demo: Building an app with Samebase and Codex"',
    );
    expect(markup.indexOf("Don&#x27;t trust us, ask your agent.")).toBeLessThan(
      markup.indexOf("youtube-nocookie.com/embed/UfxE8rvprqc"),
    );

    // The opinion and provider roles stay concise.
    expect(markup).toContain(
      "GitHub + Convex + Cloudflare is the best way we&#x27;ve found to build an app.",
    );
    expect(markup).toContain(
      "Samebase repeats it, so you can focus on your ideas instead of your tech stack.",
    );
    expect(markup).toContain("deploys + domains + edge");
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

    const platformDetailsIndex = markup.indexOf('data-testid="landing-preview-platform-details"');
    const fourClaimsIndex = markup.indexOf('aria-label="Four claims"');
    expect(fourClaimsIndex).toBeGreaterThan(platformDetailsIndex);

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

    // Onboarding walkthrough.
    expect(markup).toContain(
      "Watch the complete Samebase onboarding, including first-time Cloudflare setup.",
    );
    expect(markup).toContain('aria-label="Onboarding walkthrough"');
    expect(markup).toContain(
      'src="https://www.youtube-nocookie.com/embed/8-ZEGPpqi9Y" title="Samebase onboarding: Complete setup from scratch"',
    );
    expect(markup).toContain('loading="lazy"');
    expect(markup).toContain('allowFullScreen=""');

    // Cost and the closing argument.
    expect(markup).toContain("cost follows real usage");
    expect(markup).toContain("an idle idea");

    // FAQ answers the direct-agent objection before the closing question.
    expect(markup).toContain('aria-label="Frequently asked questions"');
    expect(markup).toContain(">FAQ</h2>");
    expect(markup).toContain("Codex already writes Convex well. Why do I need Samebase?");
    expect(markup).toContain("Ok, but can&#x27;t I just get your template and not use Samebase?");
    expect(markup).toContain("Existing apps do not change unless you update them.");
    expect(markup).toContain("I can just ask Codex to update my own apps. Why do I need Samebase?");
    expect(markup).toContain("The bet is that you will build tens of apps.");
    expect(markup).toContain("Wait, so all Samebase is, is a template and a list?");
    expect(markup).toContain("Kinda.");
    expect(markup.split('data-slot="accordion-trigger"').length - 1).toBe(4);
    expect(markup.split('data-slot="accordion-content"').length - 1).toBe(4);

    const costIndex = markup.indexOf("cost follows real usage");
    const faqIndex = markup.indexOf('aria-label="Frequently asked questions"');
    const onboardingVideoIndex = markup.indexOf(
      'src="https://www.youtube-nocookie.com/embed/8-ZEGPpqi9Y"',
    );
    const closingQuestionIndex = markup.indexOf(
      "If your app builder is so good, why is it not building itself?",
    );
    expect(faqIndex).toBeGreaterThan(costIndex);
    expect(onboardingVideoIndex).toBeGreaterThan(faqIndex);
    expect(closingQuestionIndex).toBeGreaterThan(onboardingVideoIndex);

    expect(markup).toContain("If your app builder is so good, why is it not building itself?");

    // Footnote receipts.
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

    expect(markup.split('href="/repo"').length - 1).toBe(2);
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
    expect(markup).toContain("Personal account    | Free");
    expect(markup).toContain("Any owner           | Pro");
    expect(markup).toContain("Members above the included limit require Pro and an available seat.");
    expect(markup).toContain("one connected Cloudflare Worker");
    expect(markup).toContain("Samebase does not disconnect or delete existing resources.");
    expect(markup).not.toContain("FileView");
  });
});
