import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { Button } from "@/components/ui/button";
import {
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspaceMobilePane,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_ROUTE,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import { Link, useLocation } from "@tanstack/react-router";
import { useLayoutEffect, type ReactNode } from "react";

type LandingPreviewDocumentKey = "overview" | "doItYourself";

const LANDING_CORRECT_DEFINITION = [
  "samebase.com uses the exact same stack it recommends.",
  "the first customer was me, Nicu.",
  "the next customers were my close friends.",
  "there was no upselling, no funnels, no VCs.",
  "if we figured out the best way to build apps, why would we use anything else?",
  "is your current app builder giving you the same stack they use?",
  "personal and idle ideas should cost $0/month.",
] as const;

const LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: false,
  rightDesktopOpen: false,
} as const;

const DOCS_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: true,
  rightDesktopOpen: false,
} as const;

const DOCS_SIDEBAR_LINKS = [
  { label: "Overview", to: LANDING_PREVIEW_ROUTE },
  { label: "Do it yourself", to: DOCS_DO_IT_YOURSELF_ROUTE },
] as const;

function getLandingPreviewUrlMobilePane(
  search: string,
  hasLeftPaneSurface: boolean,
): WorkspaceMobilePane | null {
  const searchParams = parseTanStackSearch(search);
  const hasLeftPane = hasLeftPaneSurface && "left" in searchParams;
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
function LandingPreviewPaneUrlSync({ hasLeftPaneSurface }: { hasLeftPaneSurface: boolean }) {
  const routeSearch = useLocation({
    select: (location) => location.searchStr,
  });
  const { setMobilePane } = useWorkspacePaneActions();
  const { mobilePane } = useWorkspacePaneState();

  useLayoutEffect(() => {
    const nextMobilePane = getLandingPreviewUrlMobilePane(
      window.location.search,
      hasLeftPaneSurface,
    );
    if (nextMobilePane === null || mobilePane === nextMobilePane) {
      return;
    }

    setMobilePane(nextMobilePane);
  }, [hasLeftPaneSurface, mobilePane, routeSearch, setMobilePane]);

  return null;
}

function DocsSidebar() {
  return (
    <nav
      aria-label="Docs sections"
      data-testid={DOCS_SIDEBAR_TEST_ID}
      className="flex min-h-full flex-col gap-1 px-4 py-4 text-sm"
    >
      {DOCS_SIDEBAR_LINKS.map((link) => (
        <Link
          activeProps={{ className: "font-semibold text-foreground" }}
          className="py-1 no-underline"
          inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
          key={link.to}
          to={link.to}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

const LANDING_COST_ROWS = [
  { cost: "$0.00", note: "not $20. not even $3.", profile: "an idle idea", zeroCost: true },
  {
    cost: "≈ $0.00",
    note: "stays in free tiers",
    profile: "a silly app you use once a week",
    zeroCost: false,
  },
  { cost: "cents", note: "rounds to cents", profile: "an app with 10 users", zeroCost: false },
  {
    cost: "follows usage",
    note: "pay the providers directly",
    profile: "an app with 10,000 weekly users",
    zeroCost: false,
  },
] as const;

const LANDING_LANES = [
  { name: "local folder", prefix: "~/" },
  { name: "worktree", prefix: "+" },
  { name: "pull request", prefix: "#" },
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
      className="border-b border-border pb-px no-underline hover:border-foreground hover:text-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}

function LandingZone({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="grid grid-cols-1 gap-y-5 md:grid-cols-[168px_minmax(0,1fr)] md:gap-x-14">
      <p className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground md:pt-3">
        {label}
      </p>
      <div className="max-w-[700px]">{children}</div>
    </section>
  );
}

function LandingTrioCell({
  console: consoleHost,
  detail,
  logo,
  role,
}: {
  console: string;
  detail: string | null;
  logo: ReactNode;
  role: string;
}) {
  return (
    <div className="border-t border-border pt-6">
      <div className="flex h-[34px] items-center gap-2.5">{logo}</div>
      <p className="mt-3.5 text-[15px] leading-relaxed text-muted-foreground">
        <b className="block font-semibold text-foreground">{role}</b>
        {detail}
      </p>
      <dl className="mt-5 grid gap-1.5 font-mono text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">account owner</dt>
          <dd className="font-semibold text-secondary">you</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">console</dt>
          <dd>{consoleHost}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-muted-foreground">hidden by samebase</dt>
          <dd>nothing</dd>
        </div>
      </dl>
    </div>
  );
}

function LandingCtaRow() {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
      <Button asChild className="h-12 px-7 text-base font-semibold no-underline">
        <Link to="/">Create your first app</Link>
      </Button>
      <Link
        className="border-b border-border pb-0.5 text-base text-primary no-underline hover:border-foreground hover:text-foreground"
        to={DOCS_DO_IT_YOURSELF_ROUTE}
      >
        Do it yourself — no Samebase account needed
      </Link>
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
    <div
      className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3 md:grid-cols-[168px_minmax(0,1fr)] md:gap-x-14"
      id={fragment}
    >
      <p aria-hidden className="pt-0.5 font-mono text-sm text-secondary md:text-right">
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
      <div className="mx-auto w-full max-w-[1000px] px-6 pt-10 sm:px-10 md:pt-14">
        <section>
          <p className="flex items-center gap-2.5">
            <img alt="" className="h-6 w-6" height="24" src="/logo-static.svg" width="24" />
            <span className="text-base font-semibold tracking-[-0.01em]">Samebase</span>
          </p>
          <h1
            aria-describedby="landing-correct-definition"
            className="mt-12 text-[clamp(44px,8vw,104px)] font-bold leading-none tracking-[-0.038em] md:mt-16"
          >
            The correct
            <LandingFootnoteMark
              fragment="landing-correct-definition"
              label="footnote: correct"
              marker="*"
            />
            <br />
            way to build
            <br />
            web apps
          </h1>
          <p className="mt-9 max-w-[52ch] text-lg leading-relaxed text-primary sm:text-xl">
            Samebase is a button that turns an idea into a running app — a{" "}
            <strong className="font-semibold text-foreground">GitHub</strong> repo, a{" "}
            <strong className="font-semibold text-foreground">Convex</strong> backend, a{" "}
            <strong className="font-semibold text-foreground">Cloudflare</strong> deploy — in about
            a minute, on accounts you own. One place to watch them all. You bring the agent: Codex,
            Claude Code, Cursor, anything.
          </p>
          <div className="mt-10">
            <LandingCtaRow />
          </div>
          <p className="mt-3.5 text-sm text-muted-foreground">
            Samebase is free today; an idle app costs $0/month.
            <LandingFootnoteMark fragment="landing-note-zero" label="footnote: zero" marker="‡" />
          </p>
        </section>

        {/* Placeholder for the planned provisioning capture: connecting the three
            providers and creating the first app, in real time. Swap for the YouTube
            embed once recorded. */}
        <div className="mt-20 flex aspect-video w-full items-center justify-center bg-muted md:mt-24">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            video — connect the providers, create the first app
          </p>
        </div>

        <div className="mt-24 md:mt-32">
          <LandingZone label="01 · yours">
            <p className="text-[22px] leading-snug tracking-[-0.015em] md:text-[26px]">
              Standard, inspectable infrastructure — three real accounts, in your name.
            </p>
            <p className="mt-5 text-base text-primary">
              Every service keeps its own dashboard. Nothing is hidden behind Samebase.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-9 sm:grid-cols-3">
              <LandingTrioCell
                console="github.com"
                detail="repo + pull requests"
                logo={
                  <img
                    alt="GitHub"
                    className="h-[30px] w-auto dark:invert"
                    height="30"
                    src="/landing-preview/logos/github.svg"
                    width="131"
                  />
                }
                role="your code"
              />
              <LandingTrioCell
                console="dashboard.convex.dev"
                detail={null}
                logo={
                  <img
                    alt="Convex"
                    className="h-[26px] w-auto dark:brightness-0 dark:invert"
                    height="26"
                    src="/landing-preview/logos/convex.svg"
                    width="104"
                  />
                }
                role="realtime database + backend"
              />
              <LandingTrioCell
                console="dash.cloudflare.com"
                detail="deploys + domains + edge"
                logo={
                  <>
                    <img
                      alt=""
                      className="h-[27px] w-auto"
                      height="27"
                      src="/landing-preview/logos/cloudflare.svg"
                      width="27"
                    />
                    <span className="text-[19px] font-bold tracking-[-0.02em]">Cloudflare</span>
                  </>
                }
                role="keeps your app safe"
              />
            </div>
            <div className="mt-12">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                the leaving test
              </p>
              <p className="mt-3 max-w-[58ch] text-base text-primary">
                Create an app, then delete your Samebase account. The app keeps running — it was
                always on your GitHub, your Convex, your Cloudflare. Samebase can die tomorrow and
                your app will not notice. You can even skip the account:{" "}
                <Link
                  className="border-b border-border pb-px text-primary no-underline hover:border-foreground hover:text-foreground"
                  to={DOCS_DO_IT_YOURSELF_ROUTE}
                >
                  Do it yourself
                </Link>{" "}
                is the whole setup, by hand.
              </p>
            </div>
            <div className="mt-12 flex items-start gap-3.5">
              <img
                alt="Samebase"
                className="mt-1 h-[30px] w-[30px]"
                height="30"
                src="/logo-static.svg"
                width="30"
              />
              <p className="max-w-[44ch] text-[19px] leading-normal tracking-[-0.01em] sm:text-[21px]">
                Samebase uses <span className="font-semibold">the same base</span> it recommends —
                samebase.com runs on its own Convex deployment and Cloudflare Workers.
              </p>
            </div>
          </LandingZone>
        </div>

        <div className="mt-24 md:mt-32">
          <LandingZone label="02 · safer">
            <p className="text-[22px] leading-snug tracking-[-0.015em] md:text-[26px]">
              A web app is three boxes — database, server, frontend — and two connections. Everyone
              stares at the boxes.{" "}
              <span className="font-semibold">The connections carry the security budget.</span>
            </p>
            <div className="mt-8 grid max-w-[58ch] gap-4 text-base text-primary">
              <p>
                Firebase wires the frontend straight to the database and patches the missing server
                with a rules language that looks like JavaScript but isn't. Supabase does it with
                SQL policies bolted onto every table — off by default. Misconfigured rules keep
                leaving whole databases public. That is not hypothetical.
                <LandingFootnoteMark
                  fragment="landing-note-risk"
                  label="footnote: security risk"
                  marker="§"
                />
              </p>
              <p>
                Convex is just a backend: the database is only reachable through TypeScript
                functions you wrote, so access control is code you already know how to review.
              </p>
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              The version I tell my engineer friends:
            </p>
            <p className="mt-2 max-w-[32ch] text-[22px] font-semibold leading-snug tracking-[-0.015em] md:text-[26px]">
              At this point, if you're on Supabase or Firebase instead of Convex, your app is a
              security risk.
              <LandingFootnoteMark
                fragment="landing-note-risk"
                label="footnote: security risk"
                marker="§"
              />
            </p>
          </LandingZone>
        </div>

        <div className="mt-24 md:mt-32">
          <LandingZone label="03 · lanes">
            <div className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-3">
              {LANDING_LANES.map((lane) => (
                <div className="border-t border-border pt-6" key={lane.name}>
                  <p className="font-mono text-[15px]">
                    <span className="text-muted-foreground">{lane.prefix} </span>
                    {lane.name}
                  </p>
                  <ul className="mt-3.5 grid gap-1 font-mono text-xs text-muted-foreground">
                    <li>own code</li>
                    <li>own database</li>
                    <li>own preview deploy</li>
                  </ul>
                </div>
              ))}
            </div>
            <div className="mt-8 grid max-w-[58ch] gap-4 text-base text-primary">
              <p>
                I run several agents at once. Codex and Claude Code already understand git
                worktrees; here the stack keeps up with them — every lane gets its own everything.
                If you are not an engineer, the translation is simple:{" "}
                <span className="font-semibold text-foreground">
                  run as many agents in parallel as you want. They will not overwrite each other's
                  work.
                </span>
              </p>
              <p>Samebase also speaks MCP: your agent can create and list your apps itself.</p>
            </div>
          </LandingZone>
        </div>

        <div className="mt-24 md:mt-32">
          <LandingZone label="04 · cheaper">
            <p className="text-[22px] leading-snug tracking-[-0.015em] text-primary md:text-[26px]">
              Most app builders resell LLM tokens.
            </p>
            <p className="mt-5 text-[22px] leading-snug tracking-[-0.015em] md:text-[26px]">
              But the agent you already run is{" "}
              <span className="border-b-[3px] border-secondary pb-px font-semibold">
                cheaper and more powerful
              </span>
              <LandingFootnoteMark
                fragment="landing-note-tokens"
                label="footnote: tokens"
                marker="†"
              />{" "}
              than the chat box a builder wraps around the same models.
            </p>

            <div className="mt-10 grid max-w-[58ch] gap-4 text-base text-primary">
              <p>
                I moved my apps three times before landing here. Netlify bills every production
                deploy against a monthly credit pool
                <LandingFootnoteMark
                  fragment="landing-note-tokens"
                  label="footnote: the Netlify math"
                  marker="†"
                />{" "}
                — I didn't want a hobby optimizing deploy credits. Samebase had working Netlify
                provisioning:{" "}
                <span className="font-semibold text-foreground">
                  I built it, then I deleted it.
                </span>{" "}
                If I know something is better, why would I sell you anything else?
              </p>
              <p>
                Convex's pricing is realistic in the same way: a free tier a real app fits inside,
                <LandingFootnoteMark
                  fragment="landing-note-zero"
                  label="footnote: zero"
                  marker="‡"
                />{" "}
                and when you grow, you pay Convex directly.
              </p>
            </div>

            <div className="mt-14">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                cost follows real usage
              </p>
              <div className="mt-4 grid">
                {LANDING_COST_ROWS.map((row) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-t border-border py-3.5 md:grid-cols-[minmax(0,1fr)_13rem_auto]"
                    key={row.profile}
                  >
                    <p className="text-base">{row.profile}</p>
                    <p className="order-3 col-span-2 text-sm text-muted-foreground md:order-none md:col-span-1">
                      {row.note}
                    </p>
                    <p
                      className={
                        row.zeroCost
                          ? "text-right font-mono text-sm font-semibold text-secondary"
                          : "text-right font-mono text-sm"
                      }
                    >
                      {row.cost}
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
          </LandingZone>
        </div>

        <section className="py-24 md:py-32">
          <blockquote className="max-w-[22ch] text-[clamp(30px,4vw,44px)] font-semibold leading-tight tracking-[-0.025em]">
            If your app builder is so good, why is it not building itself?
          </blockquote>
          <p className="mt-7 max-w-[52ch] text-base text-primary">
            Samebase is. The notes below are the receipts.
          </p>
        </section>

        <section aria-label="Footnotes" className="grid gap-10 border-t border-border pt-16">
          <LandingFootnote fragment="landing-correct-definition" heading="correct" marker="*">
            <ul className="mt-3.5 grid max-w-[58ch] gap-1">
              {LANDING_CORRECT_DEFINITION.map((definition) => (
                <li
                  className="-indent-5 pl-5 text-[15px] leading-relaxed text-primary before:pr-2 before:text-muted-foreground before:content-['—']"
                  key={definition}
                >
                  {definition}
                </li>
              ))}
            </ul>
          </LandingFootnote>
          <LandingFootnote fragment="landing-note-zero" heading="$0/month" marker="‡">
            <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
              As of mid-2026: GitHub Free — unlimited private repos, 2,000 Actions minutes a month.{" "}
              <LandingReceiptLink href="https://www.convex.dev/pricing">
                Convex Free
              </LandingReceiptLink>{" "}
              — 40 deployments per team, a million function calls a month.{" "}
              <LandingReceiptLink href="https://developers.cloudflare.com/workers/platform/pricing/">
                Cloudflare Workers Free
              </LandingReceiptLink>{" "}
              — 100,000 requests a day, 3,000 build minutes a month, static assets free and
              unlimited. An idle app sits inside all three indefinitely. Samebase adds no floor of
              its own.
            </p>
          </LandingFootnote>
          <LandingFootnote fragment="landing-note-risk" heading="security risk" marker="§">
            <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
              In 2024,{" "}
              <LandingReceiptLink href="https://env.fail/posts/firewreck-1/">
                researchers found 916 sites
              </LandingReceiptLink>{" "}
              exposing about{" "}
              <LandingReceiptLink href="https://www.bleepingcomputer.com/news/security/misconfigured-firebase-instances-leaked-19-million-plaintext-passwords/">
                125 million user records
              </LandingReceiptLink>{" "}
              — roughly 20 million passwords, mostly plaintext — through misconfigured Firebase. In
              July 2025, the Tea app{" "}
              <LandingReceiptLink href="https://www.engadget.com/cybersecurity/tea-app-suffers-breach-exposing-thousands-of-user-images-190731414.html">
                leaked 72,000 images
              </LandingReceiptLink>
              , photo IDs included, from an unauthenticated Firebase storage bucket. In 2025,{" "}
              <LandingReceiptLink href="https://mattpalmer.io/posts/CVE-2025-48757/">
                170 of 1,645 scanned Lovable-built apps
              </LandingReceiptLink>{" "}
              had missing or broken Supabase row-level security (
              <LandingReceiptLink href="https://nvd.nist.gov/vuln/detail/CVE-2025-48757">
                CVE-2025-48757
              </LandingReceiptLink>
              , disputed by the vendor). Convex,{" "}
              <LandingReceiptLink href="https://stack.convex.dev/row-level-security">
                officially
              </LandingReceiptLink>
              : "your Convex database is only accessible via server functions." Rules you can
              misconfigure will be misconfigured. Prefer the argument as a video?{" "}
              <LandingReceiptLink href="https://www.youtube.com/watch?v=h6ffyfabfa8">
                Robin Ebers makes the same case
              </LandingReceiptLink>
              .
            </p>
          </LandingFootnote>{" "}
          <LandingFootnote
            fragment="landing-note-tokens"
            heading="cheaper and more powerful"
            marker="†"
          >
            <div className="mt-2 grid max-w-[58ch] gap-3 text-[15px] leading-relaxed text-primary">
              <p>
                You already pay OpenAI or Anthropic directly. A builder reselling their tokens adds
                margin, not capability — its in-app agent is a worse version of the tool you already
                have open. Samebase ships no chatbot; it is a tool your AI tool uses.
              </p>
              <p>
                The hosting math, as of mid-2026:{" "}
                <LandingReceiptLink href="https://www.netlify.com/pricing/">
                  Netlify Pro
                </LandingReceiptLink>{" "}
                is $20/month for 3,000 credits at 15 per successful production deploy — exactly 200
                a month before bandwidth and compute draw from the same pool, roughly $0.10 a deploy
                at the recharge rate. Previews and failed deploys are free; run the pool dry and
                Netlify pauses the team's projects until the next cycle or the next payment. On
                Cloudflare, the{" "}
                <LandingReceiptLink href="https://developers.cloudflare.com/workers/platform/pricing/">
                  $5 Workers plan
                </LandingReceiptLink>{" "}
                includes six concurrent builds, and Cloudflare itself says to start new projects on
                Workers.
              </p>
            </div>
          </LandingFootnote>
        </section>

        <section className="mt-24 border-t border-border pt-20 md:mt-28">
          <h2 className="max-w-[20ch] text-[clamp(28px,3.4vw,38px)] font-bold leading-tight tracking-[-0.025em]">
            Same stack. Your accounts. No magic.
          </h2>
          <div className="mt-9">
            <LandingCtaRow />
          </div>
          <p className="mt-4 max-w-[52ch] text-[15px] text-muted-foreground">
            The manual-setup article walks through every step Samebase automates, by hand. It
            doubles as the exit door.
          </p>
        </section>
      </div>
    </article>
  );
}

function DocsDoItYourselfDocument() {
  return (
    <MarkdownLandingDocument
      className="min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]"
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={docsDoItYourselfMarkdown}
    />
  );
}

function LandingPreviewDocument({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  if (documentKey === "overview") {
    return <LandingPreviewOverview />;
  }

  return <DocsDoItYourselfDocument />;
}

function LandingPreviewChromePage({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  const hasLeftPaneSurface = documentKey === "doItYourself";

  return (
    <AppWorkspaceRouteChrome
      left={hasLeftPaneSurface ? { content: <DocsSidebar /> } : null}
      leftToggleVisibility={hasLeftPaneSurface ? "desktop" : "hidden"}
      sidebarDefaultState={
        hasLeftPaneSurface ? DOCS_SIDEBAR_DEFAULT_STATE : LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE
      }
    >
      <LandingPreviewPaneUrlSync hasLeftPaneSurface={hasLeftPaneSurface} />
      <div data-testid={LANDING_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingPreviewDocument documentKey={documentKey} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function LandingPreviewPage() {
  return <LandingPreviewChromePage documentKey="overview" />;
}

export function DocsDoItYourselfPage() {
  return <LandingPreviewChromePage documentKey="doItYourself" />;
}
