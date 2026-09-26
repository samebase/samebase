import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { APP_SIDEBAR_NAVIGATION_LINK_PROPS } from "@/components/appSidebarNavigation";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME, SignInWithOAuth } from "@/SignInWithOAuth";
import { LandingHeroMenger } from "@/components/logo/LandingHeroMenger";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { LANDING_INLINE_80_PERCENT_MARK_SVG_URL } from "@/components/compactIdentitySvgAsset";
import { buttonVariants } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import {
  isAppPresentationAuthenticated,
  useAppAuthPresentation,
} from "@/lib/appAuthPresentationState";
import { PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID } from "@/lib/publicLanding";
import { cn } from "@/lib/utils";
import { LANDING_CLOSING_BAND_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  useSidebarLayoutPresentation,
  useSidebarActions,
  type MobilePane,
} from "@samebase/sidebars/SidebarRuntime";
import {
  DOCS_CLOUDFLARE_SETUP_ROUTE,
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  DOCS_THE_STACK_ROUTE,
  LANDING_PAGE_ROUTE,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID,
  LANDING_PREVIEW_PROVIDER_GRID_TEST_ID,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import docsCloudflareSetupMarkdown from "@/content/docs-cloudflare-setup.md?raw";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import docsPricingMarkdown from "@/content/docs-pricing.md?raw";
import docsReceiptsMarkdown from "@/content/docs-receipts.md?raw";
import docsTheStackMarkdown from "@/content/docs-the-stack.md?raw";
import { MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import { Link, useLocation } from "@tanstack/react-router";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

type LandingPreviewDocumentKey =
  | "overview"
  | "cloudflareSetup"
  | "doItYourself"
  | "theStack"
  | "receipts"
  | "pricing";

const DOCS_SIDEBAR_LINKS = [
  { label: "Overview", to: LANDING_PAGE_ROUTE },
  { label: "The stack", to: DOCS_THE_STACK_ROUTE },
  { label: "Cloudflare setup", to: DOCS_CLOUDFLARE_SETUP_ROUTE },
  { label: "Do it yourself", to: DOCS_DO_IT_YOURSELF_ROUTE },
  { label: "Receipts", to: DOCS_RECEIPTS_ROUTE },
  { label: "Pricing", to: DOCS_PRICING_ROUTE },
] as const;

function getLandingPreviewUrlMobilePane(search: string): MobilePane | null {
  const searchParams = parseTanStackSearch(search);
  const hasLeftPane = "left" in searchParams;
  const hasRightPane = "right" in searchParams;

  if (hasLeftPane === hasRightPane) {
    return null;
  }

  return hasLeftPane ? "left" : "right";
}

/**
 * Landing preview pane query params preserve the open mobile pane across direct
 * loads and URL editor edits.
 */
function LandingPreviewPaneUrlSync() {
  const routeSearch = useLocation({
    select: (location) => location.searchStr,
  });
  const { setMobilePane } = useSidebarActions();
  const { mobilePane } = useSidebarLayoutPresentation();

  useLayoutEffect(() => {
    const nextMobilePane = getLandingPreviewUrlMobilePane(window.location.search);
    if (nextMobilePane === null || mobilePane === nextMobilePane) {
      return;
    }

    setMobilePane(nextMobilePane);
  }, [mobilePane, routeSearch, setMobilePane]);

  return null;
}

function DocsSidebar() {
  return (
    <nav
      aria-label="Docs sections"
      data-testid={DOCS_SIDEBAR_TEST_ID}
      className="flex min-h-full flex-col items-start gap-3 px-4 py-4 text-sm"
    >
      {DOCS_SIDEBAR_LINKS.map((link) => (
        <Link
          {...APP_SIDEBAR_NAVIGATION_LINK_PROPS}
          className="max-w-full text-primary no-underline"
          key={link.to}
          to={link.to}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

const LANDING_AGENT_PROMPT =
  "Research https://samebase.com and check if its claims are true. Based on what you know about me, should I use Samebase with you, or one of its competitors?";

const LANDING_MONOREPO_PATHS = [
  { path: "apps/storefront", resources: ["Convex", "Worker"] },
  { path: "apps/admin", resources: ["Worker"] },
  { path: "services/events", resources: ["Worker"] },
] as const;

const LANDING_CLOSING_LOGO_ROUTE_SEARCH = {
  "auto-rotate": true,
  "auto-shuffle": true,
  depth: 2,
  shuffleMoves: 1,
  vox: MENGER_SPONGE_VOXEL_STATE,
} as const satisfies LogoRouteSearch;

const LANDING_COST_ROWS = [
  { profile: "an idle idea", value: "$0.00", zeroCost: true },
  { profile: "a silly app you use once a week", value: "≈ $0.00", zeroCost: false },
  { profile: "an app with 10 users", value: "cents", zeroCost: false },
  {
    profile: "an app with 10,000 weekly users",
    value: "follows usage · paid to providers",
    zeroCost: false,
  },
] as const;

const LANDING_FAQS = [
  {
    answer:
      "You do not need Samebase to make Codex write Convex. Our basic template and skills cover the parts around the code: how to manage separate Convex previews and which hosting setup to use.",
    question: "Codex already writes Convex well. Why do I need Samebase?",
  },
  {
    answer:
      "You can. The template and skills are public. Samebase itself runs on the same base, and the public template is published automatically as we improve it while building Samebase. New Samebase apps get the current versions. Existing apps do not change unless you update them.",
    question: "Ok, but can't I just get your template and not use Samebase?",
  },
  {
    answer:
      "Even for one app, Samebase does the do-it-yourself setup for you: the GitHub repository, the Convex project and deploy keys, and the Cloudflare Worker and builds. With more apps, it gives you one place to see them, check their setup, and fix problems.",
    question: "I can just ask Codex to update my own apps. Why do I need Samebase?",
  },
  {
    answer:
      "The parts your app is made of are: the base template, the agent skills, and the plugin, all under Apache 2.0. The samebase.com control plane, which creates, connects, and tracks your apps, is not.",
    question: "Is Samebase open source?",
  },
  {
    answer: "Kinda.",
    question: "Wait, so all Samebase is, is a template and a list?",
  },
] as const;

/**
 * Book-style footnote marker: small, cyan, top-aligned against display-size
 * text, jumping to the receipts block at the bottom of the page.
 */
function LandingFootnoteMark({
  fragment,
  label,
  marker,
}: {
  fragment: string;
  label: string;
  marker: string;
}) {
  return (
    <sup className="text-[0.55em] leading-none tracking-normal">
      <a
        aria-label={label}
        className="font-semibold text-secondary no-underline"
        href={`#${fragment}`}
      >
        {marker}
      </a>
    </sup>
  );
}

/** External receipt sources open in a new tab; internal navigation stays on Link. */
function LandingReceiptLink({ children, href }: { children: ReactNode; href: string }) {
  return (
    <a
      className="underline decoration-current underline-offset-4 hover:text-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function LandingInlineLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link
      className="text-primary underline decoration-current underline-offset-4 hover:text-foreground"
      to={to}
    >
      {children}
    </Link>
  );
}

/** Every section below the hero uses the same spacing rhythm. */
function LandingSection({ ariaLabel, children }: { ariaLabel?: string; children: ReactNode }) {
  return (
    <section aria-label={ariaLabel} className="mt-10 pt-8 @3xl:mt-16 @3xl:pt-12">
      {children}
    </section>
  );
}

function LandingSectionIntro({ heading, sub }: { heading: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <h2 className="max-w-[26ch] text-[clamp(24px,3cqw,32px)] font-semibold leading-[1.25] tracking-[-0.02em]">
        {heading}
      </h2>
      {sub === undefined ? null : (
        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-primary">{sub}</p>
      )}
    </>
  );
}

const COPY_LABEL_RESET_DELAY_MS = 1500;

function LandingCopyPromptButton() {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);

  return (
    <button
      className="w-full border-t border-border px-5 py-3 text-left font-mono text-[13px] font-semibold hover:bg-muted @2xl:w-auto @2xl:border-l @2xl:border-t-0 @2xl:text-center"
      onClick={() => {
        // The label only flips on a successful write; a denied clipboard
        // permission leaves the prompt selectable and the button unchanged.
        void navigator.clipboard
          .writeText(LANDING_AGENT_PROMPT)
          .then(() => {
            setCopied(true);
            if (resetTimeoutRef.current !== null) {
              window.clearTimeout(resetTimeoutRef.current);
            }
            resetTimeoutRef.current = window.setTimeout(() => {
              setCopied(false);
            }, COPY_LABEL_RESET_DELAY_MS);
          })
          .catch(() => {});
      }}
      type="button"
    >
      {copied ? "Copied" : "Copy prompt"}
    </button>
  );
}

function LandingProviderRow({ logo, role }: { logo: ReactNode; role: string }) {
  return (
    <div>
      <div className="flex h-11 items-center gap-2">{logo}</div>
      <p className="mt-2 text-sm text-muted-foreground">{role}</p>
    </div>
  );
}

function LandingClaim({ children, heading }: { children: ReactNode; heading: ReactNode }) {
  return (
    <div>
      <h2 className="max-w-[30ch] text-[21px] font-semibold leading-[1.3] tracking-[-0.015em] @3xl:text-[23px]">
        {heading}
      </h2>
      <p className="mt-3 max-w-[52ch] text-base leading-relaxed text-primary">{children}</p>
    </div>
  );
}

function LandingRepositoryTree() {
  return (
    <div className="mt-8 max-w-[680px]">
      <p className="border-b border-border pb-3 font-mono text-sm font-semibold text-foreground">
        you/shop
      </p>
      <ul className="ml-2.5 border-l border-border pl-5">
        {LANDING_MONOREPO_PATHS.map((entry) => (
          <li
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-3"
            key={entry.path}
          >
            <span className="font-mono text-[13px] font-semibold text-foreground [overflow-wrap:anywhere]">
              {entry.path}
            </span>
            <span className="text-right font-mono text-xs text-muted-foreground">
              {entry.resources.join(" + ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LandingFootnote({
  children,
  fragment,
  heading,
  marker,
}: {
  children: ReactNode;
  fragment: string;
  heading: string;
  marker: string;
}) {
  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3" id={fragment}>
      <p aria-hidden className="pt-0.5 font-mono text-sm text-secondary">
        {marker}
      </p>
      <div>
        <h2 className="text-base font-semibold tracking-[-0.01em]">{heading}</h2>
        {children}
      </div>
    </div>
  );
}

function LandingPreviewOverview() {
  return (
    <article
      className="min-h-full shrink-0 bg-background pb-48 text-foreground"
      data-testid={LANDING_PREVIEW_ARTICLE_TEST_ID}
    >
      <div className="mx-auto w-full max-w-[1200px] px-6 pt-10 @2xl:px-10 @3xl:pt-0">
        <section>
          <div className="@3xl:grid @3xl:grid-cols-2 @3xl:gap-4">
            <div className="pb-4 @3xl:pt-4">
              <p className="flex items-center gap-1.5">
                <img
                  alt=""
                  className="h-9 w-9 dark:invert"
                  height="36"
                  src={LANDING_INLINE_80_PERCENT_MARK_SVG_URL}
                  width="36"
                />
                <span className="text-2xl font-semibold tracking-[-0.01em]">Samebase</span>
              </p>
              <h1 className="mt-10 max-w-[24ch] text-[clamp(34px,4.6cqw,56px)] font-bold leading-[1.06] tracking-[-0.035em]">
                The correct way to build web apps.
              </h1>
              <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-primary">
                One place to manage GitHub, Convex, and Cloudflare across all your apps.
              </p>
              <div className="mt-7 border border-border @2xl:flex @2xl:items-stretch">
                <p className="flex-1 bg-muted/50 px-4 py-3.5 font-mono text-[13px] leading-relaxed">
                  {LANDING_AGENT_PROMPT}
                </p>
                <LandingCopyPromptButton />
              </div>
              <div className="mt-9">
                <PublicLandingPrimaryAction />
              </div>
            </div>
            <LandingHeroMenger placement="preview" />
          </div>
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="mt-8 block aspect-[48/31] w-full border-0"
            data-testid="landing-preview-hero-video"
            referrerPolicy="strict-origin-when-cross-origin"
            src="https://www.youtube-nocookie.com/embed/UfxE8rvprqc"
            title="Founder demo: Building an app with Samebase and Codex"
          />
        </section>

        <section className="mt-10 pt-8 @3xl:mt-16 @3xl:pt-12">
          <LandingSectionIntro
            heading="GitHub + Convex + Cloudflare is the best way we've found to build an app."
            sub="Simplest, cheapest, hardest to mess up. Samebase repeats it, so you can focus on your ideas instead of your tech stack."
          />
          <div
            className="mt-8 grid gap-8 @2xl:grid-cols-3"
            data-testid={LANDING_PREVIEW_PROVIDER_GRID_TEST_ID}
          >
            <LandingProviderRow
              logo={
                <img
                  alt="GitHub"
                  className="h-6 w-auto dark:invert"
                  height="30"
                  src="/landing-preview/logos/github.svg"
                  width="131"
                />
              }
              role="your code"
            />
            <LandingProviderRow
              logo={
                <img
                  alt="Convex"
                  className="-ml-2 h-9 w-auto dark:brightness-0 dark:invert @3xl:ml-0"
                  height="26"
                  src="/landing-preview/logos/convex.svg"
                  width="104"
                />
              }
              role="database + backend"
            />
            <LandingProviderRow
              logo={
                <>
                  <img
                    alt=""
                    className="h-11 w-auto"
                    height="27"
                    src="/landing-preview/logos/cloudflare.svg"
                    width="27"
                  />
                  <span className="text-xl font-bold leading-none tracking-[-0.02em]">
                    Cloudflare
                  </span>
                </>
              }
              role="deploys + domains + edge"
            />
          </div>
        </section>

        <LandingSection>
          <div data-testid={LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID}>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              local workflow
            </p>
            <div className="mt-3 grid gap-3 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] @3xl:items-start @3xl:gap-10">
              <p className="text-lg font-semibold tracking-[-0.01em]">macOS · Linux · Windows</p>
              <p className="max-w-[48ch] text-sm leading-relaxed text-primary">
                Everything is TypeScript, even the scripts you'd usually write in Bash.
                <span className="block font-mono text-[11px] font-semibold text-secondary">
                  no Bash · no WSL
                </span>
              </p>
            </div>
            <div className="mt-6 grid gap-3 @3xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] @3xl:items-start @3xl:gap-10">
              <p className="text-lg font-semibold tracking-[-0.01em]">same web app</p>
              <p className="max-w-[48ch] text-sm leading-relaxed text-primary">
                Samebase has been one{" "}
                <LandingReceiptLink href="https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/What_is_a_progressive_web_app">
                  PWA
                </LandingReceiptLink>{" "}
                from the start. The same web app works well on desktop, iPhone, Android, and in the
                Codex browser.
              </p>
            </div>
          </div>
        </LandingSection>

        <LandingSection ariaLabel="Four claims">
          <div className="grid gap-x-14 gap-y-10 @3xl:grid-cols-2">
            <LandingClaim heading="Delete your Samebase account. Your app doesn't notice.">
              It was always on your GitHub, your Convex, your Cloudflare. We even publish the full{" "}
              <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>
                do-it-yourself recipe
              </LandingInlineLink>
              : the identical stack, no account at all.
            </LandingClaim>
            <LandingClaim
              heading={
                <>
                  No client-facing database to leave open.
                  <LandingFootnoteMark
                    fragment="landing-note-risk"
                    label="footnote: not hypothetical"
                    marker="§"
                  />
                </>
              }
            >
              Convex is only reachable through TypeScript functions you wrote, so there are no
              database rules to configure perfectly, forever. Access checks live in those functions,
              where you can read and test them.
            </LandingClaim>
            <LandingClaim heading="Run agents in parallel. Every PR gets its own preview, with its own database.">
              Local folder, worktrees, pull requests: each lane gets isolated code, data, and
              deploy. ChatGPT and Claude Code already understand worktrees; the stack keeps up.
            </LandingClaim>
            <LandingClaim
              heading={
                <>
                  We resell nothing. Not tokens, not hosting.
                  <LandingFootnoteMark
                    fragment="landing-note-tokens"
                    label="footnote: the hosting math"
                    marker="†"
                  />
                </>
              }
            >
              You already pay OpenAI or Anthropic directly; a builder's chat box adds margin, not
              capability. Providers bill you at their own prices, and idle apps sit in free tiers.
            </LandingClaim>
          </div>
        </LandingSection>

        <LandingSection ariaLabel="Monorepo">
          <LandingSectionIntro
            heading="Full monorepo support, by design."
            sub="Samebase shows each connected Worker and Convex project under its repository path."
          />
          <LandingRepositoryTree />
        </LandingSection>

        <LandingSection>
          <div className="max-w-[760px]">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              cost follows real usage
            </p>
            <div className="mt-4">
              {LANDING_COST_ROWS.map((row) => (
                <div
                  className="flex items-baseline justify-between gap-6 border-t border-border py-3"
                  key={row.profile}
                >
                  <p className="text-base">{row.profile}</p>
                  <p
                    className={
                      row.zeroCost
                        ? "text-right font-mono text-sm font-semibold text-secondary"
                        : "text-right font-mono text-sm"
                    }
                  >
                    {row.value}
                    {row.zeroCost ? (
                      <LandingFootnoteMark
                        fragment="landing-note-zero"
                        label="footnote: zero"
                        marker="‡"
                      />
                    ) : null}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </LandingSection>

        <LandingSection ariaLabel="Frequently asked questions">
          <LandingSectionIntro heading="FAQ" />
          <Accordion keepMounted className="mt-8 max-w-[960px]">
            {LANDING_FAQS.map((faq) => (
              <AccordionItem
                className="border-t border-border not-last:border-b-0"
                key={faq.question}
                value={faq.question}
              >
                <AccordionTrigger className="gap-6 rounded-none py-5 text-lg font-semibold leading-snug tracking-[-0.01em] hover:no-underline @3xl:py-6 [&_[data-slot=accordion-trigger-icon]]:mt-1 [&_[data-slot=accordion-trigger-icon]]:text-foreground">
                  <span className="max-w-[44ch]">{faq.question}</span>
                </AccordionTrigger>
                <AccordionContent className="max-w-[56ch] pb-6 pr-10 text-[15px] leading-relaxed text-primary @3xl:pb-7">
                  <p>{faq.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </LandingSection>

        <LandingSection ariaLabel="Onboarding walkthrough">
          <div className="@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_440px] @5xl:gap-x-14">
            <div className="@5xl:col-start-1 @5xl:row-start-1">
              <LandingSectionIntro heading="Watch the complete Samebase onboarding, including first-time Cloudflare setup." />
            </div>
            <div className="mt-8 @5xl:col-start-2 @5xl:row-start-1 @5xl:mt-1.5">
              <iframe
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="aspect-[48/31] w-full border-0"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                src="https://www.youtube-nocookie.com/embed/8-ZEGPpqi9Y"
                title="Samebase onboarding: Complete setup from scratch"
              />
            </div>
          </div>
        </LandingSection>

        <section className="mt-16 @3xl:mt-24">
          <blockquote className="max-w-[24ch] text-[clamp(28px,4cqw,40px)] font-semibold leading-[1.2] tracking-[-0.025em]">
            If your app builder is so good, why is it not building itself?
          </blockquote>
        </section>

        <LandingSection ariaLabel="Footnotes">
          <div className="grid gap-8 @3xl:grid-cols-2 @3xl:gap-x-14">
            <LandingFootnote fragment="landing-note-zero" heading="$0/month, receipted." marker="‡">
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                GitHub Free: unlimited private repositories.{" "}
                <LandingReceiptLink href="https://www.convex.dev/pricing">
                  Convex Free
                </LandingReceiptLink>
                : a million function calls a month.{" "}
                <LandingReceiptLink href="https://developers.cloudflare.com/workers/platform/pricing/">
                  Cloudflare Workers Free
                </LandingReceiptLink>
                : 100,000 requests a day, static assets free and unlimited. Samebase adds no floor
                of its own.
              </p>
            </LandingFootnote>
            <LandingFootnote fragment="landing-note-risk" heading="Not hypothetical." marker="§">
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                2024:{" "}
                <LandingReceiptLink href="https://env.fail/posts/firewreck-1/">
                  916 sites
                </LandingReceiptLink>{" "}
                exposing about{" "}
                <LandingReceiptLink href="https://www.bleepingcomputer.com/news/security/misconfigured-firebase-instances-leaked-19-million-plaintext-passwords/">
                  125 million user records
                </LandingReceiptLink>{" "}
                via misconfigured Firebase. 2025: the Tea app{" "}
                <LandingReceiptLink href="https://www.engadget.com/cybersecurity/tea-app-suffers-breach-exposing-thousands-of-user-images-190731414.html">
                  leaked 72,000 images
                </LandingReceiptLink>
                , and{" "}
                <LandingReceiptLink href="https://www.superblocks.com/blog/lovable-vulnerabilities">
                  170 of 1,645 scanned Lovable apps
                </LandingReceiptLink>{" "}
                had missing or broken Supabase row-level security (
                <LandingReceiptLink href="https://nvd.nist.gov/vuln/detail/CVE-2025-48757">
                  CVE-2025-48757
                </LandingReceiptLink>
                , disputed by the vendor). Convex,{" "}
                <LandingReceiptLink href="https://stack.convex.dev/row-level-security">
                  officially
                </LandingReceiptLink>
                : "your Convex database is only accessible via server functions."
              </p>
            </LandingFootnote>
            <LandingFootnote fragment="landing-note-tokens" heading="The hosting math." marker="†">
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                <LandingReceiptLink href="https://www.netlify.com/pricing/">
                  Netlify Pro
                </LandingReceiptLink>{" "}
                is $20/month for 3,000 credits at 15 per successful production deploy: about 200 a
                month before bandwidth and compute draw from the same pool. Cloudflare's{" "}
                <LandingReceiptLink href="https://developers.cloudflare.com/workers/platform/pricing/">
                  $5 Workers plan
                </LandingReceiptLink>{" "}
                includes{" "}
                <LandingReceiptLink href="https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/">
                  six concurrent builds
                </LandingReceiptLink>
                , and Cloudflare itself says to start new projects on Workers.
              </p>
            </LandingFootnote>
            <LandingFootnote
              fragment="landing-note-first-customer"
              heading="First customer: me, Nicu."
              marker="*"
            >
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                Then my close friends. No upselling, no funnels, no VCs. Every claim on this page
                links a{" "}
                <LandingInlineLink to={DOCS_RECEIPTS_ROUTE}>dated receipt</LandingInlineLink> your
                agent can verify instead of trusting us.
              </p>
            </LandingFootnote>
          </div>
        </LandingSection>

        <LandingSection>
          <div className="@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_420px] @4xl:items-center @4xl:gap-x-14">
            <div>
              <h2 className="max-w-[20ch] text-[clamp(26px,3.4cqw,36px)] font-bold leading-tight tracking-[-0.025em]">
                Same{" "}
                <del className="text-muted-foreground" aria-hidden="true">
                  stack
                </del>{" "}
                base. Your accounts. No magic.
              </h2>
              <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
                The manual-setup article walks through every step Samebase automates. It doubles as
                the exit door.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
                <div>
                  <PublicLandingPrimaryAction />
                </div>
                <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>Do it yourself</LandingInlineLink>
              </div>
            </div>
            <div className="mt-12 @4xl:mt-0">
              <PublicLandingLogo
                routeSearch={LANDING_CLOSING_LOGO_ROUTE_SEARCH}
                routeSearchSource="static"
                stage="wide"
                viewStateKey={LANDING_CLOSING_BAND_VIEW_STATE_KEY}
              />
            </div>
          </div>
        </LandingSection>
      </div>
    </article>
  );
}

function PublicLandingPrimaryAction() {
  const authPresentation = useAppAuthPresentation();
  const isAuthenticated = isAppPresentationAuthenticated(authPresentation);

  return (
    <div className="w-fit max-w-full" data-testid={PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID}>
      <div
        className={isAuthenticated ? "hidden" : undefined}
        data-public-landing-primary-action-signed-out
      >
        <SignInWithOAuth provider="github" authReturn="dashboard" markPublicSignupReturn />
      </div>
      <div
        className={isAuthenticated ? undefined : "hidden"}
        data-public-landing-primary-action-signed-in
      >
        <Link
          className={cn(buttonVariants(), SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME)}
          to={DASHBOARD_ROUTE}
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}

/**
 * MarkdownLandingDocument merges this className after its own defaults, which include py-10 and
 * @3xl:py-14. The base pb wins over py-10's bottom padding, but @3xl:py-14 sorts after every base
 * utility, so the @3xl pb duplicate is required to keep the scroll-end space that lets the last
 * heading anchor align to the top of the scrollport. The svh value itself stays viewport-based.
 */
const DOCS_DOCUMENT_CLASS_NAME =
  "min-h-full shrink-0 pb-[calc(100svh-4rem)] @3xl:pb-[calc(100svh-4rem)]";

const CLOUDFLARE_SETUP_ONBOARDING_VIDEO_URL =
  "https://www.youtube-nocookie.com/embed/8-ZEGPpqi9Y?autoplay=1";
const CLOUDFLARE_SETUP_ONBOARDING_VIDEO_TITLE = "Samebase onboarding: Complete setup from scratch";

function CloudflareSetupOnboardingVideo() {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!isPlaying) {
    return (
      <button
        aria-label="Play the complete Samebase onboarding"
        className="relative aspect-[48/31] w-full overflow-hidden border-0 p-0"
        onClick={() => setIsPlaying(true)}
        type="button"
      >
        <img
          alt=""
          className="h-full w-full object-cover"
          src="/onboarding/complete-onboarding-poster.webp"
        />
        <span className="absolute inset-0 grid place-items-center">
          <span className="bg-black/80 px-4 py-3 text-lg font-semibold text-white">
            Play YouTube video
          </span>
        </span>
      </button>
    );
  }

  return (
    <iframe
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
      className="aspect-[48/31] w-full border-0"
      referrerPolicy="strict-origin-when-cross-origin"
      src={CLOUDFLARE_SETUP_ONBOARDING_VIDEO_URL}
      title={CLOUDFLARE_SETUP_ONBOARDING_VIDEO_TITLE}
    />
  );
}

function DocsTheStackDocument() {
  return (
    <MarkdownLandingDocument
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsTheStackMarkdown}
    />
  );
}

function DocsDoItYourselfDocument() {
  return (
    <MarkdownLandingDocument
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsDoItYourselfMarkdown}
    />
  );
}

function DocsCloudflareSetupDocument() {
  return (
    <MarkdownLandingDocument
      afterTitle={<CloudflareSetupOnboardingVideo />}
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsCloudflareSetupMarkdown}
    />
  );
}

function DocsReceiptsDocument() {
  return (
    <MarkdownLandingDocument
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsReceiptsMarkdown}
    />
  );
}

function DocsPricingDocument() {
  return (
    <MarkdownLandingDocument
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsPricingMarkdown}
    />
  );
}

function LandingPreviewDocument({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  if (documentKey === "overview") {
    return <LandingPreviewOverview />;
  }

  if (documentKey === "theStack") {
    return <DocsTheStackDocument />;
  }

  if (documentKey === "cloudflareSetup") {
    return <DocsCloudflareSetupDocument />;
  }

  if (documentKey === "receipts") {
    return <DocsReceiptsDocument />;
  }

  if (documentKey === "pricing") {
    return <DocsPricingDocument />;
  }

  return <DocsDoItYourselfDocument />;
}

function LandingPreviewChromePage({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  return (
    <AppWorkspaceRouteChrome left={{ content: <DocsSidebar /> }}>
      <LandingPreviewPaneUrlSync />
      <div data-testid={LANDING_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingPreviewDocument documentKey={documentKey} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function LandingPage() {
  return <LandingPreviewChromePage documentKey="overview" />;
}

export function DocsIndexPage() {
  return (
    <AppWorkspaceRouteChrome left={null}>
      <div className="mx-auto min-h-full w-full max-w-[1100px]">
        <DocsSidebar />
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function DocsDoItYourselfPage() {
  return <LandingPreviewChromePage documentKey="doItYourself" />;
}

export function DocsCloudflareSetupPage() {
  return <LandingPreviewChromePage documentKey="cloudflareSetup" />;
}

export function DocsTheStackPage() {
  return <LandingPreviewChromePage documentKey="theStack" />;
}

export function DocsReceiptsPage() {
  return <LandingPreviewChromePage documentKey="receipts" />;
}

export function DocsPricingPage() {
  return <LandingPreviewChromePage documentKey="pricing" />;
}
