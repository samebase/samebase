import { DocsSidebar } from "@/components/DocsSidebar";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { SIGN_IN_WITH_OAUTH_BUTTON_CLASS_NAME, SignInWithOAuth } from "@/SignInWithOAuth";
import { LandingHeroMenger } from "@/components/logo/LandingHeroMenger";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { LANDING_INLINE_80_PERCENT_MARK_SVG_URL } from "@/components/compactIdentitySvgAsset";
import { buttonVariants } from "@/components/ui/button";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { useConvexAuth } from "convex/react";
import { PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID } from "@/lib/publicLanding";
import { cn } from "@/lib/utils";
import { LANDING_CLOSING_BAND_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_THE_BIG_MIGRATION_ROUTE,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import docsChangelogMarkdown from "@/content/docs-changelog.md?raw";
import docsPricingMarkdown from "@/content/docs-pricing.md?raw";
import docsReceiptsMarkdown from "@/content/docs-receipts.md?raw";
import docsTheBigMigrationMarkdown from "@/content/docs-the-big-migration.md?raw";
import docsTheStackMarkdown from "@/content/docs-the-stack.md?raw";
import { MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

type LandingPreviewDocumentKey =
  | "overview"
  | "doItYourself"
  | "theBigMigration"
  | "theStack"
  | "receipts"
  | "pricing"
  | "changelog";

const LANDING_AGENT_PROMPT =
  "Research https://samebase.com and check if its claims are true. Based on what you know about me, should I use Samebase with you, or one of its competitors?";

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

const LANDING_STEPS = [
  { heading: "Connect GitHub and Convex.", body: "One OAuth token, no expiry, nothing to paste." },
  {
    heading: "Create an app.",
    body: "Samebase creates the repository and writes CONVEX_ACCESS_TOKEN into it.",
  },
  {
    heading: "The first push deploys.",
    body: "Alchemy creates the Convex project and the site. About 90 seconds.",
  },
  {
    heading: "Samebase reads the state.",
    body: "URL, deployed commit, checks, and pull requests, from alchemy-state-store.",
  },
  {
    heading: "Every pull request deploys too.",
    body: "Its own deployment and data, deleted when the pull request closes.",
  },
] as const;

const LANDING_FAQS = [
  {
    answer:
      "You don't, for the code. Samebase does the part around it: the repository, the deploy, Google sign-in, previews, and one list of what every app deployed.",
    question: "Codex already writes Convex well. Why do I need Samebase?",
  },
  {
    answer:
      "You can. The template is public and published from the Samebase repository. Existing apps do not change unless you update them.",
    question: "Ok, but can't I just get your template and not use Samebase?",
  },
  {
    answer: (
      <>
        So you connect with one click. A Convex OAuth token has no expiry date; a Cloudflare one
        lasts an hour.{" "}
        <LandingInlineLink to={DOCS_THE_BIG_MIGRATION_ROUTE}>The big migration</LandingInlineLink>{" "}
        has the details.
      </>
    ),
    question: "Why is the Alchemy state in Convex?",
  },
  {
    answer:
      "Yes. Declare a Worker in alchemy.run.ts and add CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID to your repository.",
    question: "Can I use Cloudflare?",
  },
  {
    answer: (
      <>
        It's in beta, and so is{" "}
        <LandingReceiptLink href="https://alchemy.run">Alchemy 2</LandingReceiptLink>. Your apps
        keep running either way.
      </>
    ),
    question: "Is Samebase stable?",
  },
  {
    answer:
      "The Samebase app is AGPL-3.0. The template and the agent plugin are Apache 2.0. Other folders have their own licenses.",
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

function LandingStep({ body, heading, index }: { body: string; heading: string; index: number }) {
  return (
    <li className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3">
      <p aria-hidden className="pt-0.5 font-mono text-sm text-secondary">
        {index}
      </p>
      <div>
        <h3 className="text-base font-semibold tracking-[-0.01em]">{heading}</h3>
        <p className="mt-1 max-w-[58ch] text-[15px] leading-relaxed text-primary">{body}</p>
      </div>
    </li>
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
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 @3xl:pt-4">
            <p className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <img
                  alt=""
                  className="h-9 w-9 dark:invert"
                  height="36"
                  src={LANDING_INLINE_80_PERCENT_MARK_SVG_URL}
                  width="36"
                />
                <span className="text-2xl font-semibold tracking-[-0.01em]">Samebase</span>
              </span>
              <Badge className="h-7 -rotate-3 rounded-none border-0 bg-blue-600 px-3 py-0 text-sm font-semibold text-white">
                BETA
              </Badge>
            </p>
            <a
              className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-foreground"
              href="https://github.com/samebase/samebase"
              rel="noreferrer"
              target="_blank"
            >
              <Star aria-hidden className="size-4 fill-amber-400 text-amber-400" />
              Star on GitHub
            </a>
          </div>
          <div className="@3xl:grid @3xl:grid-cols-2 @3xl:gap-4">
            <div className="pb-4">
              <h1 className="mt-10 max-w-[24ch] text-[clamp(34px,4.6cqw,56px)] font-bold leading-[1.06] tracking-[-0.035em]">
                Give your coding agent a working app.
              </h1>
              <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-primary">
                A repository in your GitHub, a Convex project in your team, a live URL, Google
                sign-in, and a preview per pull request. Deployed by Alchemy from your own GitHub
                Actions.
              </p>
              <p className="mt-4 max-w-[46ch] text-lg leading-relaxed text-primary">
                Or use the{" "}
                <a
                  className="underline decoration-current underline-offset-4 hover:text-foreground"
                  href="https://github.com/samebase/base"
                  rel="noreferrer"
                  target="_blank"
                >
                  samebase/base
                </a>{" "}
                template without an account.
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
            className="mt-8 block aspect-video w-full border-0"
            data-testid="landing-preview-hero-video"
            referrerPolicy="strict-origin-when-cross-origin"
            src="https://www.youtube-nocookie.com/embed/ovMWyoajRMk"
            title="Samebase logo film"
          />
        </section>

        <LandingSection ariaLabel="How it works">
          <LandingSectionIntro
            heading="An opinionated way to use Alchemy."
            sub={
              <>
                <LandingReceiptLink href="https://alchemy.run">Alchemy</LandingReceiptLink> deploys
                your app from one file. The opinion: its state lives in Convex, so one OAuth click
                is enough.
              </>
            }
          />
          <ol className="mt-8 grid gap-5 @3xl:grid-cols-2 @3xl:gap-x-14">
            {LANDING_STEPS.map((step, index) => (
              <LandingStep
                body={step.body}
                heading={step.heading}
                index={index + 1}
                key={step.heading}
              />
            ))}
          </ol>
          <p className="mt-8 max-w-[58ch] text-base leading-relaxed text-primary">
            After setup, Samebase changes nothing in your accounts. Your repository deploys, your
            agent fixes.
          </p>
        </LandingSection>

        <LandingSection ariaLabel="Four claims">
          <div className="grid gap-x-14 gap-y-10 @3xl:grid-cols-2">
            <LandingClaim heading="Delete your Samebase account. Your app keeps running.">
              It keeps deploying too. Swap CONVEX_ACCESS_TOKEN for your own team token before you
              revoke Samebase at Convex. New Google sign-ins through Samebase stop. The{" "}
              <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>
                do-it-yourself recipe
              </LandingInlineLink>{" "}
              is the same stack with no account.
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
              Convex is reachable only through functions you wrote. Access checks live in code you
              can read and test.
            </LandingClaim>
            <LandingClaim heading="Run agents in parallel. Every PR gets its own preview, with its own database.">
              Local folder, worktrees, pull requests: each lane has isolated code, data, and deploy.
            </LandingClaim>
            <LandingClaim heading="We resell nothing. Not tokens, not hosting.">
              Providers bill you at their own prices. Idle apps sit in free tiers.
            </LandingClaim>
          </div>
        </LandingSection>

        <LandingSection ariaLabel="What it costs">
          <LandingSectionIntro heading="What it costs" />
          <div className="mt-6 max-w-[760px]">
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

        <section className="mt-16 @3xl:mt-24">
          <blockquote className="max-w-[24ch] text-[clamp(28px,4cqw,40px)] font-semibold leading-[1.2] tracking-[-0.025em]">
            If your app builder is so good, why is it not building itself?
          </blockquote>
          <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-primary">
            samebase.com deploys itself with Alchemy from its own GitHub Actions.
          </p>
        </section>

        <LandingSection ariaLabel="Footnotes">
          <div className="grid gap-8 @3xl:grid-cols-2 @3xl:gap-x-14">
            <LandingFootnote fragment="landing-note-zero" heading="$0/month, receipted." marker="‡">
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                GitHub Free: unlimited private repositories and{" "}
                <LandingReceiptLink href="https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions">
                  2,000 Actions minutes
                </LandingReceiptLink>{" "}
                a month.{" "}
                <LandingReceiptLink href="https://www.convex.dev/pricing">
                  Convex Free
                </LandingReceiptLink>
                : a million function calls a month. Samebase adds no floor of its own.
              </p>
            </LandingFootnote>
            <LandingFootnote fragment="landing-note-risk" heading="Not hypothetical." marker="§">
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                2024:{" "}
                <LandingReceiptLink href="https://env.fail/posts/firewreck-1/">
                  916 sites
                </LandingReceiptLink>{" "}
                leaked about 125 million records through misconfigured Firebase. 2025:{" "}
                <LandingReceiptLink href="https://www.superblocks.com/blog/lovable-vulnerabilities">
                  170 of 1,645 scanned Lovable apps
                </LandingReceiptLink>{" "}
                had broken Supabase row-level security (
                <LandingReceiptLink href="https://nvd.nist.gov/vuln/detail/CVE-2025-48757">
                  CVE-2025-48757
                </LandingReceiptLink>
                ).
              </p>
            </LandingFootnote>
            <LandingFootnote
              fragment="landing-note-first-customer"
              heading="First customer: me, Nicu."
              marker="*"
            >
              <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
                Then my close friends. No funnels, no VCs. Every claim links a{" "}
                <LandingInlineLink to={DOCS_RECEIPTS_ROUTE}>dated receipt</LandingInlineLink> your
                agent can verify.
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
                Do it yourself is every step Samebase automates. It doubles as the exit door.
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
  // The landing is prerendered without a session, so it shows the sign-in until the browser's
  // provider confirms one.
  const { isAuthenticated } = useConvexAuth();

  return (
    <div className="w-fit max-w-full" data-testid={PUBLIC_LANDING_PRIMARY_ACTION_TEST_ID}>
      <div className={isAuthenticated ? "hidden" : undefined}>
        <SignInWithOAuth provider="github" authReturn="dashboard" markPublicSignupReturn />
      </div>
      <div className={isAuthenticated ? undefined : "hidden"}>
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

function DocsTheBigMigrationDocument() {
  return (
    <MarkdownLandingDocument
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsTheBigMigrationMarkdown}
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

function DocsChangelogDocument() {
  return (
    <MarkdownLandingDocument
      className={DOCS_DOCUMENT_CLASS_NAME}
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsChangelogMarkdown}
    />
  );
}

function LandingPreviewDocument({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  if (documentKey === "overview") {
    return <LandingPreviewOverview />;
  }

  if (documentKey === "theBigMigration") {
    return <DocsTheBigMigrationDocument />;
  }

  if (documentKey === "theStack") {
    return <DocsTheStackDocument />;
  }

  if (documentKey === "receipts") {
    return <DocsReceiptsDocument />;
  }

  if (documentKey === "pricing") {
    return <DocsPricingDocument />;
  }

  if (documentKey === "changelog") {
    return <DocsChangelogDocument />;
  }

  return <DocsDoItYourselfDocument />;
}

/** The docs list of these pages is their route's static left pane (`DOCS_ROUTE_CHROME`). */
function LandingPreviewChromePage({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  return (
    <div data-testid={LANDING_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
      <LandingPreviewDocument documentKey={documentKey} />
    </div>
  );
}

export function LandingPage() {
  return <LandingPreviewChromePage documentKey="overview" />;
}

export function DocsIndexPage() {
  return (
    <div className="mx-auto min-h-full w-full max-w-[1100px]">
      <DocsSidebar />
    </div>
  );
}

export function DocsDoItYourselfPage() {
  return <LandingPreviewChromePage documentKey="doItYourself" />;
}

export function DocsTheBigMigrationPage() {
  return <LandingPreviewChromePage documentKey="theBigMigration" />;
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

export function DocsChangelogPage() {
  return <LandingPreviewChromePage documentKey="changelog" />;
}
