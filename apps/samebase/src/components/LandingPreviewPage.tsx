import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { FileTree, type FileTreeItem } from "@/components/FileTree";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { Button } from "@/components/ui/button";
import {
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspaceMobilePane,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import {
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_DO_IT_YOURSELF_ROUTE,
  LANDING_PREVIEW_ROUTE,
  LANDING_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import landingDoItYourselfMarkdown from "@/content/landing-do-it-yourself.md?raw";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

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

type LandingPreviewHelpCenter = {
  items: FileTreeItem[];
  selectedFile: string;
};

type LandingPreviewClickEvent = Pick<
  ReactMouseEvent<HTMLElement>,
  "altKey" | "button" | "ctrlKey" | "defaultPrevented" | "metaKey" | "shiftKey"
>;

function shouldUseNativeLinkClick(event: LandingPreviewClickEvent) {
  return (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.altKey ||
    event.ctrlKey ||
    event.shiftKey
  );
}

function createLandingPreviewHelpCenter({
  documentKey,
}: {
  documentKey: LandingPreviewDocumentKey;
}): LandingPreviewHelpCenter {
  const overviewPath = "01 Overview.md";
  const doItYourselfPath = "02 Do it yourself.md";

  return {
    items: [
      {
        href: LANDING_PREVIEW_ROUTE,
        label: "Overview",
        originalPath: overviewPath,
        path: overviewPath,
        type: "blob",
      },
      {
        href: LANDING_DO_IT_YOURSELF_ROUTE,
        label: "Do it yourself",
        originalPath: doItYourselfPath,
        path: doItYourselfPath,
        type: "blob",
      },
    ],
    selectedFile: documentKey === "overview" ? overviewPath : doItYourselfPath,
  };
}

const LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: false,
  rightDesktopOpen: false,
} as const;
const LANDING_ROUTE_BY_HELP_CENTER_PATH = new Map([
  ["01 Overview.md", LANDING_PREVIEW_ROUTE],
  ["02 Do it yourself.md", LANDING_DO_IT_YOURSELF_ROUTE],
]);

function getLandingPreviewUrlMobilePane(search: string): WorkspaceMobilePane | null {
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
  const { setMobilePane } = useWorkspacePaneActions();
  const { mobilePane } = useWorkspacePaneState();

  useLayoutEffect(() => {
    const nextMobilePane = getLandingPreviewUrlMobilePane(window.location.search);
    if (nextMobilePane === null || mobilePane === nextMobilePane) {
      return;
    }

    setMobilePane(nextMobilePane);
  }, [mobilePane, routeSearch, setMobilePane]);

  return null;
}

function LandingPreviewSidebar({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  const landingPreviewHelpCenter = createLandingPreviewHelpCenter({ documentKey });
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Landing preview sections"
      data-testid={LANDING_PREVIEW_SIDEBAR_TEST_ID}
      className="flex min-h-full flex-col px-1 py-2 text-sm"
    >
      <FileTree
        items={landingPreviewHelpCenter.items}
        selectedFile={landingPreviewHelpCenter.selectedFile}
        folderExpansionStates={[]}
        onFileSelect={(path, _status, event) => {
          const route = LANDING_ROUTE_BY_HELP_CENTER_PATH.get(path);
          if (route === undefined || event === undefined || shouldUseNativeLinkClick(event)) {
            return;
          }

          event.preventDefault();
          void navigate({ to: route });
        }}
      />
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
        <Link to="/">Sign in</Link>
      </Button>
      <Link
        className="border-b border-border pb-0.5 text-base text-primary no-underline hover:border-foreground hover:text-foreground"
        to={LANDING_DO_IT_YOURSELF_ROUTE}
      >
        Do it yourself
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
      className="min-h-full shrink-0 bg-background pb-[calc(100svh-4rem)] text-foreground"
      data-testid={LANDING_PREVIEW_ARTICLE_TEST_ID}
    >
      <div className="mx-auto w-full max-w-[1000px] px-6 pt-16 sm:px-10 md:pt-24">
        <section>
          <h1
            aria-describedby="landing-correct-definition"
            className="text-[clamp(44px,8vw,104px)] font-bold leading-none tracking-[-0.038em]"
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
          <p className="mt-9 max-w-[46ch] text-lg leading-relaxed text-primary sm:text-xl">
            A full stack —{" "}
            <strong className="font-semibold text-foreground">
              GitHub, Convex, Cloudflare
            </strong> —
            provisioned around accounts you own. Bring your own AI tool: Codex, Claude Code, Cursor,
            anything.
          </p>
          <div className="mt-10">
            <LandingCtaRow />
          </div>
        </section>

        <div className="mt-24 md:mt-32">
          <LandingZone label="01 · cheaper">
            <p className="text-[22px] leading-snug tracking-[-0.015em] text-primary md:text-[26px]">
              Most app builders resell LLM tokens.
            </p>
            <p className="mt-5 text-[22px] leading-snug tracking-[-0.015em] md:text-[26px]">
              But Codex, Claude, etc. are{" "}
              <span className="border-b-[3px] border-secondary pb-px font-semibold">
                cheaper and more powerful
              </span>
              <LandingFootnoteMark
                fragment="landing-note-tokens"
                label="footnote: tokens"
                marker="†"
              />{" "}
              than anything an app-builder can provide.
            </p>
            <p className="mt-5 text-[22px] leading-snug tracking-[-0.015em] text-primary md:text-[26px]">
              So why would you pay more for less?
            </p>

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

        <div className="mt-24 md:mt-32">
          <LandingZone label="02 · the stack">
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
                    className="h-[26px] w-auto dark:bg-white dark:px-1"
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
            <div className="mt-14 flex items-start gap-3.5">
              <img
                alt="Samebase"
                className="mt-1 h-[30px] w-[30px]"
                height="30"
                src="/icon-512.png"
                width="30"
              />
              <p className="text-[19px] leading-normal tracking-[-0.01em] sm:text-[21px]">
                Samebase uses <span className="font-semibold">the same base</span> it recommends.
              </p>
            </div>
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
            <p className="mt-8 max-w-[58ch] text-base text-primary">
              Multiple agents can work in parallel without stepping on each other.
            </p>
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
          <LandingFootnote
            fragment="landing-note-tokens"
            heading="cheaper and more powerful"
            marker="†"
          >
            <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
              You already pay OpenAI or Anthropic directly. A builder that resells their tokens adds
              margin, not capability.
            </p>
          </LandingFootnote>
          <LandingFootnote fragment="landing-note-zero" heading="$0/month" marker="‡">
            <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
              GitHub, Convex, and Cloudflare each hold an idle app on their free tiers. Samebase
              adds no floor of its own.
            </p>
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
            The manual-setup article walks through every step Samebase automates — proof there is no
            magic.
          </p>
        </section>
      </div>
    </article>
  );
}

function LandingDoItYourselfDocument() {
  return (
    <MarkdownLandingDocument
      className="min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]"
      dataTestId={LANDING_PREVIEW_ARTICLE_TEST_ID}
      markdown={landingDoItYourselfMarkdown}
    />
  );
}

function LandingPreviewDocument({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  if (documentKey === "overview") {
    return <LandingPreviewOverview />;
  }

  return <LandingDoItYourselfDocument />;
}

function LandingPreviewChromePage({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  return (
    <AppWorkspaceRouteChrome
      left={{ content: <LandingPreviewSidebar documentKey={documentKey} /> }}
      sidebarDefaultState={LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE}
    >
      <LandingPreviewPaneUrlSync />
      <div data-testid={LANDING_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingPreviewDocument documentKey={documentKey} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function LandingPreviewPage() {
  return <LandingPreviewChromePage documentKey="overview" />;
}

export function LandingDoItYourselfPage() {
  return <LandingPreviewChromePage documentKey="doItYourself" />;
}
