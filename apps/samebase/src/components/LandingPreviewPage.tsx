import { DocsSidebar } from "@/components/DocsSidebar";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { LandingHeroMenger } from "@/components/logo/LandingHeroMenger";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import { LANDING_INLINE_80_PERCENT_MARK_SVG_URL } from "@/components/compactIdentitySvgAsset";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LANDING_CLOSING_BAND_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import docsChangelogMarkdown from "@/content/docs-changelog.md?raw";
import docsTheBigMigrationMarkdown from "@/content/docs-the-big-migration.md?raw";
import docsTheStackMarkdown from "@/content/docs-the-stack.md?raw";
import { RepositoryOverviewExample } from "@/repository/dashboard/RepositoryOverviewExample";
import { MENGER_SPONGE_VOXEL_STATE } from "@samebase/logo-model/voxel";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { type ReactNode } from "react";

type LandingPreviewDocumentKey =
  | "overview"
  | "doItYourself"
  | "theBigMigration"
  | "theStack"
  | "changelog";

const LANDING_CLOSING_LOGO_ROUTE_SEARCH = {
  "auto-rotate": true,
  "auto-shuffle": true,
  depth: 2,
  shuffleMoves: 1,
  vox: MENGER_SPONGE_VOXEL_STATE,
} as const satisfies LogoRouteSearch;

const LANDING_STARTER_URL = "https://github.com/samebase/base";
const LANDING_ALCHEMY_KIT_URL =
  "https://github.com/samebase/samebase/tree/main/packages/alchemy-kit";

const LANDING_PARTS = [
  {
    name: "samebase/base",
    meta: "Template · MIT",
    description:
      "The starter: a Convex app that deploys with Alchemy, with Google sign-in and a preview for each pull request.",
    href: LANDING_STARTER_URL,
  },
  {
    name: "@samebase/alchemy-convex",
    meta: "npm · Apache-2.0",
    description:
      "Convex for Alchemy: projects, deployments, environment variables, the push, and Alchemy state in your Convex team.",
    href: "https://github.com/samebase/samebase/tree/main/packages/alchemy-convex",
  },
  {
    name: "@samebase/alchemy-kit",
    meta: "npm · Apache-2.0",
    description:
      "Parts for Alchemy: state on a branch of your GitHub repository with sealed secrets, and a run record in each stage output.",
    href: LANDING_ALCHEMY_KIT_URL,
  },
  {
    name: "@samebase/identity-broker",
    meta: "Convex component · Apache-2.0",
    description:
      "Implements RFC 7591, OAuth 2.0 Dynamic Client Registration. Use a single OIDC client, like Google sign-in, for all your apps and all their preview and development deploys.",
    href: "https://github.com/samebase/samebase/tree/main/packages/identity-broker",
  },
  {
    name: "samebase/identity-hub",
    meta: "Template · MIT",
    description:
      "Your own sign-in hub on Convex: identity-broker plus settings. The public hub is id.samebase.com.",
    href: "https://github.com/samebase/identity-hub",
  },
  {
    name: "@samebase/convex-hosting",
    meta: "Convex component · Apache-2.0",
    description:
      "Hosts a web app on Convex: static files and server-rendered TanStack Start pages, from the deployment that runs the backend.",
    href: "https://github.com/samebase/convex-hosting",
  },
  {
    name: "@samebase/sidebars",
    meta: "npm · MIT",
    description:
      "The unstyled React sidebar layout of samebase.com: left and right panes, resizing, and mobile scroll snapping.",
    href: "https://github.com/samebase/samebase/tree/main/packages/sidebars",
  },
  {
    name: "samebase/plugin",
    meta: "Agent plugin · Apache-2.0",
    description:
      "Samebase for Codex, ChatGPT, and Claude Code: list, create, and connect apps from your agent.",
    href: "https://github.com/samebase/plugin",
  },
] as const;

const LANDING_FAQS = [
  {
    answer:
      "Not for the starter or the packages. The dashboard needs one: sign in with GitHub and choose the repositories to connect.",
    question: "Do I need an account?",
  },
  {
    answer: (
      <>
        Stacks whose state carries a run record that names the repository. The starter writes it.
        For your own stack, put <LandingCode>withRunRecord</LandingCode> from{" "}
        <LandingExternalLink href={`${LANDING_ALCHEMY_KIT_URL}#run-record`}>
          @samebase/alchemy-kit
        </LandingExternalLink>{" "}
        over the state layer. In the Convex store, the stack name must also be{" "}
        <LandingCode>owner/name</LandingCode>.
      </>
    ),
    question: "Which stacks does the dashboard show?",
  },
  {
    answer:
      "Yes. A personal account lists up to 12 repositories, and a GitHub organization 6 with 2 members. GitHub, Convex, and Cloudflare bill their own usage.",
    question: "Is it free?",
  },
  {
    answer: (
      <>
        The packages and the templates are, under Apache-2.0 or MIT. The dashboard is
        source-available under the{" "}
        <LandingExternalLink href="https://fsl.software">FSL</LandingExternalLink>: any use except a
        competing commercial service, and each version becomes Apache-2.0 two years after its
        release.
      </>
    ),
    question: "Is it open source?",
  },
  {
    answer: "Kinda.",
    question: "Wait, so all Samebase is, is a template and a list?",
  },
] as const;

const LANDING_PARAGRAPH_CLASS_NAME = "max-w-[58ch] text-base leading-relaxed text-primary";
/** The actions are links: `no-underline` overrides the base underline of every link. */
const LANDING_ACTION_CLASS_NAME = "h-auto px-6 py-2.5 no-underline";

/** External links open in a new tab; internal navigation stays on Link. */
function LandingExternalLink({ children, href }: { children: ReactNode; href: string }) {
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

/** The inline code style of the docs pages (`MarkdownLandingDocument`). */
function LandingCode({ children }: { children: ReactNode }) {
  return (
    <code className="border bg-accent px-1 py-0.5 font-mono text-[0.8125rem] leading-5 text-accent-foreground">
      {children}
    </code>
  );
}

function LandingStarterAction() {
  return (
    <a
      className={cn(buttonVariants(), LANDING_ACTION_CLASS_NAME)}
      href={LANDING_STARTER_URL}
      rel="noreferrer"
      target="_blank"
    >
      Use the starter
    </a>
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

function LandingSectionIntro({ heading }: { heading: ReactNode }) {
  return (
    <h2 className="max-w-[26ch] text-[clamp(24px,3cqw,32px)] font-semibold leading-[1.25] tracking-[-0.02em]">
      {heading}
    </h2>
  );
}

function LandingHalf({ children, heading }: { children: ReactNode; heading: string }) {
  return (
    <div>
      <h2 className="max-w-[30ch] text-[21px] font-semibold leading-[1.3] tracking-[-0.015em] @3xl:text-[23px]">
        {heading}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

/**
The dashboard's own repository page with example data. A visitor can open its pull requests, checks,
and menus. `RepositoryOverviewExample` turns off what the example cannot do.
*/
function LandingDashboardExample() {
  return (
    <figure
      aria-label="The Samebase repository page of acme/pantry: the production stack at pantry.acme.dev with its Convex deployment and a Cloudflare Worker, the deployed commit with passing checks, and three open pull requests with their preview deployments."
      className="mt-10 border-x border-t border-border @3xl:mt-12"
    >
      <RepositoryOverviewExample />
      {/* The bottom edge comes after the example in the HTML. On a slow network the browser paints
      the example while it arrives, and a bottom border of the figure would move down with it. */}
      <div aria-hidden="true" className="border-b border-border" />
    </figure>
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
                A dashboard for Alchemy.
              </h1>
              <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-primary">
                Samebase reads the state that{" "}
                <LandingExternalLink href="https://alchemy.run">Alchemy</LandingExternalLink> keeps
                and shows every app you deploy: its URL, the deployed commit, its checks, and the
                preview of each pull request.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <LandingStarterAction />
                <a
                  className={cn(buttonVariants({ variant: "outline" }), LANDING_ACTION_CLASS_NAME)}
                  href="https://github.com/samebase"
                  rel="noreferrer"
                  target="_blank"
                >
                  Source on GitHub
                </a>
              </div>
            </div>
            <LandingHeroMenger placement="preview" />
          </div>
          <LandingDashboardExample />
        </section>

        <LandingSection ariaLabel="Why I build it">
          <LandingSectionIntro heading="Why I build it" />
          <div className="mt-6 space-y-4">
            <p className={LANDING_PARAGRAPH_CLASS_NAME}>
              I'm Nicu. I like building stuff, from static pages to distributed systems. Coding
              agents build an app fast, but I still lose track of where each one is deployed, how,
              and whether it is up to date.
            </p>
            <p className={LANDING_PARAGRAPH_CLASS_NAME}>
              Samebase is how I keep track of mine. I think Alchemy is the correct way to deploy an
              app, so everything here is built on it. samebase.com deploys itself with Alchemy too.
            </p>
            <p className={LANDING_PARAGRAPH_CLASS_NAME}>It is in beta, as Alchemy 2 is.</p>
          </div>
        </LandingSection>

        <LandingSection ariaLabel="What it does">
          <div className="grid gap-x-14 gap-y-10 @3xl:grid-cols-2">
            <LandingHalf heading="See every app">
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                Alchemy records every resource that it deploys. Samebase reads that record for each
                repository you connect.
              </p>
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                The state can live in a Convex project, in Cloudflare, or on a branch of the
                repository.
              </p>
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                Your apps run in your own GitHub, Convex, and Cloudflare accounts. Deploys run in
                your GitHub Actions, and you fix a failed one there, yourself or with your agent.
              </p>
            </LandingHalf>
            <LandingHalf heading="Start an app">
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                <LandingExternalLink href={LANDING_STARTER_URL}>samebase/base</LandingExternalLink>{" "}
                is a GitHub template. Add one secret, <LandingCode>CONVEX_ACCESS_TOKEN</LandingCode>
                , and push. Alchemy creates the Convex project and deploys the site from GitHub
                Actions.
              </p>
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                Each pull request gets its own deployment with its own data. Google sign-in works on
                every one of them.
              </p>
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                Convex is the default backend and host. Any other Alchemy resource goes in{" "}
                <LandingCode>alchemy.run.ts</LandingCode>, a Cloudflare Worker for example.
              </p>
              <p className={LANDING_PARAGRAPH_CLASS_NAME}>
                In the dashboard, New App does the same steps for you.{" "}
                <LandingInlineLink to={DOCS_THE_STACK_ROUTE}>The stack</LandingInlineLink> lists
                what the starter ships, and{" "}
                <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>Do it yourself</LandingInlineLink>{" "}
                is the same steps by hand.
              </p>
            </LandingHalf>
          </div>
        </LandingSection>

        <LandingSection ariaLabel="The parts">
          <LandingSectionIntro heading="The parts" />
          <ul className="mt-8 grid gap-4 @3xl:grid-cols-2">
            {LANDING_PARTS.map((part) => (
              <li key={part.name}>
                <a
                  className="block h-full border border-border p-5 no-underline hover:bg-muted"
                  href={part.href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <p className="font-mono text-[15px] font-semibold">{part.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{part.meta}</p>
                  <p className="mt-3 text-[15px] leading-relaxed text-primary">
                    {part.description}
                  </p>
                </a>
              </li>
            ))}
          </ul>
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

        <LandingSection>
          <div className="@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_420px] @4xl:items-center @4xl:gap-x-14">
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
              <LandingStarterAction />
              <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>Do it yourself</LandingInlineLink>
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

export function DocsChangelogPage() {
  return <LandingPreviewChromePage documentKey="changelog" />;
}
