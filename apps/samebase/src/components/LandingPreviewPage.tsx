import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import {
  createFilledVoxelSet,
  MENGER_SPONGE_VOXEL_STATE,
  serializeVoxelState,
  type VoxelCoordinate,
} from "@/components/logo/logoVoxelState";
import {
  LANDING_CLOSING_BAND_VIEW_STATE_KEY,
  LANDING_ZONE_MARK_VIEW_STATE_KEYS,
  type RotatedLogoViewStateKey,
} from "@/lib/rotatedLogoViewState";
import { type LogoRouteSearch } from "@/routeSearch/logo";
import { replaceRootLogoRouteSearch, useRootRouteSearch } from "@/routeSearch/root";
import { Button } from "@/components/ui/button";
import {
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspaceMobilePane,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import {
  DOCS_DO_IT_YOURSELF_ROUTE,
  DOCS_PRICING_ROUTE,
  DOCS_RECEIPTS_ROUTE,
  DOCS_SIDEBAR_TEST_ID,
  DOCS_THE_STACK_ROUTE,
  LANDING_PREVIEW_ARTICLE_TEST_ID,
  LANDING_PREVIEW_ROUTE,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import docsPricingMarkdown from "@/content/docs-pricing.md?raw";
import docsReceiptsMarkdown from "@/content/docs-receipts.md?raw";
import docsTheStackMarkdown from "@/content/docs-the-stack.md?raw";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

type LandingPreviewDocumentKey = "overview" | "doItYourself" | "theStack" | "receipts" | "pricing";

const LANDING_CORRECT_DEFINITION = [
  "samebase.com uses the exact same stack it recommends.",
  "the first customer was me, Nicu.",
  "the next customers were my close friends.",
  "there was no upselling, no funnels, no VCs.",
  "if we figured out the best way to build apps, why would we use anything else?",
  "is your current app builder giving you the same stack they use?",
  "personal and idle ideas should cost $0/month.",
] as const;

const DOCS_SIDEBAR_LINKS = [
  { label: "Overview", to: LANDING_PREVIEW_ROUTE },
  { label: "The stack", to: DOCS_THE_STACK_ROUTE },
  { label: "Do it yourself", to: DOCS_DO_IT_YOURSELF_ROUTE },
  { label: "Receipts", to: DOCS_RECEIPTS_ROUTE },
  { label: "Pricing", to: DOCS_PRICING_ROUTE },
] as const;

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

/**
Interactive showcase logo: reads the shared logo params from the URL (the root
route retains them on every navigation) and writes drag results back, so a mark
shaped here or in /logo follows the visitor into the app.
*/
function LandingInteractiveLogo({
  autoRotate = false,
  viewStateKey,
}: {
  autoRotate?: boolean;
  viewStateKey?: RotatedLogoViewStateKey;
}) {
  const navigate = useNavigate();
  const rootRouteSearch = useRootRouteSearch();

  return (
    <PublicLandingLogo
      animateLeftFaceStripes
      autoRotate={autoRotate}
      replaceRouteSearch={(nextSearch) => {
        void navigate({
          hash: true,
          replace: true,
          search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
          state: true,
          to: ".",
        });
      }}
      routeSearch={rootRouteSearch}
      stage="wide"
      viewStateKey={viewStateKey}
    />
  );
}

/**
Three parallel pillars from the same voxel system: lanes that never touch.
*/
function createLanePillarVoxels(): ReadonlySet<string> {
  const coordinates: VoxelCoordinate[] = [];
  for (const x of [0, 2, 4]) {
    for (let y = 0; y < 5; y += 1) {
      coordinates.push([x, y, 2]);
    }
  }
  return createFilledVoxelSet(coordinates);
}

/**
The zone rails vary the same voxel base along one dimension each: the plain
mark as-is (yours), the same object seen flat-on (safer), the cubes rearranged
into parallel lanes, and the pattern recursed into a Menger sponge (cheaper).
Each mark is a live draggable scene with its own remembered orientation; the
shapes are curated, so drags stay local instead of writing the URL.
*/
const LANDING_ZONE_MARKS = [
  { routeSearch: {}, viewStateKey: LANDING_ZONE_MARK_VIEW_STATE_KEYS[0] },
  { routeSearch: { elev: 0, rot: 0 }, viewStateKey: LANDING_ZONE_MARK_VIEW_STATE_KEYS[1] },
  {
    routeSearch: { gridSize: 5, vox: serializeVoxelState(createLanePillarVoxels(), 5) },
    viewStateKey: LANDING_ZONE_MARK_VIEW_STATE_KEYS[2],
  },
  {
    routeSearch: { depth: 2, vox: MENGER_SPONGE_VOXEL_STATE },
    viewStateKey: LANDING_ZONE_MARK_VIEW_STATE_KEYS[3],
  },
] as const satisfies readonly { routeSearch: LogoRouteSearch; viewStateKey: string }[];

/**
The rail column is display-none below the @3xl container width, where a mounted
scene would still create an invisible WebGL context. CSS cannot gate the scene
load, so this effect measures the landing article, which fills the pane
container the @3xl variant reads; a viewport media query would disagree with
the pane inside workspace chrome.
*/
const ZONE_MARK_MIN_ARTICLE_WIDTH_PX = 768;

function useCanLoadZoneMarkScene(markRef: RefObject<HTMLDivElement | null>) {
  const [canLoadScene, setCanLoadScene] = useState(false);

  useEffect(() => {
    const article = markRef.current?.closest("article");
    if (!article) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setCanLoadScene(entry.contentRect.width >= ZONE_MARK_MIN_ARTICLE_WIDTH_PX);
    });
    observer.observe(article);
    return () => {
      observer.disconnect();
    };
  }, [markRef]);

  return canLoadScene;
}

function LandingZoneMark({ index }: { index: 0 | 1 | 2 | 3 }) {
  const markRef = useRef<HTMLDivElement>(null);
  const canLoadScene = useCanLoadZoneMarkScene(markRef);
  const rootRouteSearch = useRootRouteSearch();
  const mark = LANDING_ZONE_MARKS[index];
  // Theme and color params follow the visitor's mark; the structural params
  // (shape, depth, view) stay curated per zone.
  const {
    "animate-colors": animateColors,
    background,
    border,
    dark,
    light,
    primary,
    secondary,
    top,
  } = rootRouteSearch;

  return (
    <div className="mt-7 hidden @3xl:block" ref={markRef}>
      <PublicLandingLogo
        loadInteractiveScene={canLoadScene}
        routeSearch={{
          "animate-colors": animateColors,
          background,
          border,
          dark,
          light,
          primary,
          secondary,
          top,
          ...mark.routeSearch,
        }}
        routeSearchSource="static"
        stage="rail"
        viewStateKey={mark.viewStateKey}
      />
    </div>
  );
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

function LandingZone({
  children,
  label,
  mark,
}: {
  children: ReactNode;
  label: string;
  mark?: ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 gap-y-5 @3xl:grid-cols-[168px_minmax(0,1fr)] @3xl:gap-x-14">
      <div>
        <p className="whitespace-nowrap font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground @3xl:pt-3">
          {label}
        </p>
        {mark}
      </div>
      <div className="max-w-[700px]">{children}</div>
    </section>
  );
}

function LandingTrioCell({
  dashboardUrl,
  detail,
  homepageUrl,
  logo,
  role,
}: {
  dashboardUrl: string;
  detail: string | null;
  homepageUrl: string;
  logo: ReactNode;
  role: string;
}) {
  const dashboardHost = new URL(dashboardUrl).host;

  return (
    <div className="border-t border-border pt-6">
      <a
        className="flex h-[34px] w-fit items-center gap-2.5 no-underline"
        href={homepageUrl}
        rel="noreferrer"
        target="_blank"
      >
        {logo}
      </a>
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
          <dt className="text-muted-foreground">dashboard</dt>
          <dd>{dashboardHost}</dd>
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
        Do it yourself (no Samebase account needed)
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
      className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3 @3xl:grid-cols-[168px_minmax(0,1fr)] @3xl:gap-x-14"
      id={fragment}
    >
      <p aria-hidden className="pt-0.5 font-mono text-sm text-secondary @3xl:text-right">
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
      <div className="mx-auto w-full max-w-[1000px] px-6 pt-10 @2xl:px-10 @3xl:pt-14">
        <section className="@4xl:grid @4xl:grid-cols-[minmax(0,1fr)_440px] @4xl:items-center @4xl:gap-x-14">
          <div>
            <p className="flex items-center gap-2.5">
              <img
                alt=""
                className="h-6 w-6 dark:invert"
                height="24"
                src="/brand/logo/v1-side-primary-duotone.svg"
                width="24"
              />
              <span className="text-base font-semibold tracking-[-0.01em]">Samebase</span>
            </p>
            <h1
              aria-describedby="landing-correct-definition"
              className="mt-12 text-[clamp(44px,10cqw,104px)] font-bold leading-none tracking-[-0.038em] @4xl:mt-16 @4xl:text-[clamp(40px,7cqw,84px)]"
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
            <p className="mt-9 max-w-[52ch] text-lg leading-relaxed text-primary @2xl:text-xl">
              Samebase starts a new app in about a minute on the best stack we've found:{" "}
              <strong className="font-semibold text-foreground">GitHub</strong>,{" "}
              <strong className="font-semibold text-foreground">Convex</strong>, and{" "}
              <strong className="font-semibold text-foreground">Cloudflare</strong>, in accounts you
              own. Once you've found the best stack, repeat it through the coding agent you already
              use, with one inventory for every app you connect: more products, not more systems to
              maintain.
            </p>
            <div className="mt-10">
              <LandingCtaRow />
            </div>
            <p className="mt-3.5 text-sm text-muted-foreground">
              Samebase is free today; an idle app costs $0/month.
              <LandingFootnoteMark fragment="landing-note-zero" label="footnote: zero" marker="‡" />
            </p>
          </div>
          <div className="mt-16 @4xl:mt-0">
            <LandingInteractiveLogo />
          </div>
        </section>

        {/* Placeholder for the planned provisioning capture: connecting the three
            providers and creating the first app, in real time. Swap for the YouTube
            embed once recorded. */}
        <div className="mt-20 flex aspect-video w-full items-center justify-center bg-muted @3xl:mt-24">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
            video: connect the providers, create the first app
          </p>
        </div>

        <div className="mt-24 @3xl:mt-32">
          <LandingZone label="01 · yours" mark={<LandingZoneMark index={0} />}>
            <p className="text-[22px] leading-snug tracking-[-0.015em] @3xl:text-[26px]">
              Standard, inspectable infrastructure: three real accounts, in your name.
            </p>
            <p className="mt-5 text-base text-primary">
              Samebase gives you one view of every app you connect without hiding each service's own
              dashboard. Connect an existing GitHub repo too, including several app roots in a
              monorepo, and leave it GitHub-only until you attach Convex or Cloudflare.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-9 @2xl:grid-cols-3">
              <LandingTrioCell
                dashboardUrl="https://github.com"
                detail="repo + pull requests"
                homepageUrl="https://github.com"
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
                dashboardUrl="https://dashboard.convex.dev"
                detail={null}
                homepageUrl="https://convex.dev"
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
                dashboardUrl="https://dash.cloudflare.com"
                detail="deploys + domains + edge"
                homepageUrl="https://www.cloudflare.com"
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
                Create an app, then delete your Samebase account. The app keeps running. It was
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
                className="mt-0.5 h-8 w-8"
                height="32"
                src="/brand/logo/v2-side-diagonal-duotone.svg"
                width="32"
              />
              <p className="max-w-[44ch] text-[19px] leading-normal tracking-[-0.01em] @2xl:text-[21px]">
                Samebase uses <span className="font-semibold">the same base</span> it recommends.
                samebase.com runs on its own Convex deployment and Cloudflare Workers.
              </p>
            </div>
          </LandingZone>
        </div>

        <div className="mt-24 @3xl:mt-32">
          <LandingZone label="02 · safer" mark={<LandingZoneMark index={1} />}>
            <p className="text-[22px] leading-snug tracking-[-0.015em] @3xl:text-[26px]">
              A web app is three boxes (database, server, frontend) and two connections. Everyone
              stares at the boxes.{" "}
              <span className="font-semibold">The breaches happen on the connections.</span>
            </p>
            <div className="mt-8 grid max-w-[58ch] gap-4 text-base text-primary">
              <p>
                Firebase and Supabase erase the middle box: the app running in your visitor's
                browser talks to the database directly. Anyone on the internet can send that
                database a request, and the only thing deciding what comes back is access rules you
                have to configure perfectly, forever. Firebase's rules are a language that looks
                like JavaScript but isn't; Supabase's are SQL policies, off by default.
                Misconfigured rules keep leaving whole databases public. That is not hypothetical.
                <LandingFootnoteMark
                  fragment="landing-note-risk"
                  label="footnote: security risk"
                  marker="§"
                />
              </p>
              <p>
                Convex never lets the browser near the database. The client can only call TypeScript
                functions you wrote: every request runs through your code, and anything you didn't
                expose isn't reachable. Access control stops being a second system to configure and
                becomes ordinary code you review like any other.
              </p>
            </div>
            <p className="mt-10 text-sm text-muted-foreground">
              The version I tell my engineer friends:
            </p>
            <p className="mt-2 max-w-[32ch] text-[22px] font-semibold leading-snug tracking-[-0.015em] @3xl:text-[26px]">
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

        <div className="mt-24 @3xl:mt-32">
          <LandingZone label="03 · lanes" mark={<LandingZoneMark index={2} />}>
            <p className="text-[22px] leading-snug tracking-[-0.015em] @3xl:text-[26px]">
              Every pull request gets its own preview deploy,{" "}
              <span className="font-semibold">with its own database.</span>
            </p>
            <p className="mt-5 max-w-[58ch] text-base text-primary">
              Most stacks never pull this off: previews point at one shared database, so branches
              step on each other's data. Here isolation comes provisioned: pull requests, worktrees,
              and your local folder alike.
            </p>
            <div className="mt-12 grid grid-cols-1 gap-x-10 gap-y-8 @2xl:grid-cols-3">
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
                worktrees; the stack keeps up with them. If you are not an engineer, the translation
                is simple:{" "}
                <span className="font-semibold text-foreground">
                  run as many agents in parallel as you want. They will not overwrite each other's
                  work.
                </span>
              </p>
              <p>
                Type safety used to be taste. With agents it's leverage: the template is typed end
                to end, so the compiler catches an agent's mistakes before your users do.
              </p>
              <p>
                Samebase has a dashboard for setup and inventory, and speaks MCP: your agent can
                create and list apps without leaving its own interface.
              </p>
            </div>
          </LandingZone>
        </div>

        <div className="mt-24 @3xl:mt-32">
          <LandingZone label="04 · cheaper" mark={<LandingZoneMark index={3} />}>
            <p className="text-[22px] leading-snug tracking-[-0.015em] text-primary @3xl:text-[26px]">
              Most app builders resell LLM tokens.
            </p>
            <p className="mt-5 text-[22px] leading-snug tracking-[-0.015em] @3xl:text-[26px]">
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
                />
                , and I didn't want a hobby optimizing deploy credits. Samebase had working Netlify
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
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-1 border-t border-border py-3.5 @3xl:grid-cols-[minmax(0,1fr)_13rem_auto]"
                    key={row.profile}
                  >
                    <p className="text-base">{row.profile}</p>
                    <p className="order-3 col-span-2 text-sm text-muted-foreground @3xl:order-none @3xl:col-span-1">
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

        <section className="py-24 @3xl:py-32">
          <blockquote className="max-w-[22ch] text-[clamp(30px,5cqw,44px)] font-semibold leading-tight tracking-[-0.025em]">
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
                  className="-indent-5 pl-5 text-[15px] leading-relaxed text-primary before:pr-2 before:text-muted-foreground before:content-['-']"
                  key={definition}
                >
                  {definition}
                </li>
              ))}
            </ul>
          </LandingFootnote>
          <LandingFootnote fragment="landing-note-zero" heading="$0/month" marker="‡">
            <p className="mt-2 max-w-[58ch] text-[15px] leading-relaxed text-primary">
              As of mid-2026: GitHub Free, unlimited private repos and 2,000 Actions minutes a
              month.{" "}
              <LandingReceiptLink href="https://www.convex.dev/pricing">
                Convex Free
              </LandingReceiptLink>
              , 40 deployments per team and a million function calls a month.{" "}
              <LandingReceiptLink href="https://developers.cloudflare.com/workers/platform/pricing/">
                Cloudflare Workers Free
              </LandingReceiptLink>
              , 100,000 requests a day,{" "}
              <LandingReceiptLink href="https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/">
                3,000 build minutes a month
              </LandingReceiptLink>
              , static assets free and unlimited. An idle app sits inside all three indefinitely.
              Samebase adds no floor of its own.
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
              (roughly 20 million passwords, mostly plaintext) through misconfigured Firebase. In
              July 2025, the Tea app{" "}
              <LandingReceiptLink href="https://www.engadget.com/cybersecurity/tea-app-suffers-breach-exposing-thousands-of-user-images-190731414.html">
                leaked 72,000 images
              </LandingReceiptLink>
              , photo IDs included, from an unauthenticated Firebase storage bucket. In 2025,{" "}
              <LandingReceiptLink href="https://www.superblocks.com/blog/lovable-vulnerabilities">
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
                margin, not capability: its in-app agent is a worse version of the tool you already
                have open. Samebase ships no chatbot; it is a tool your AI tool uses.
              </p>
              <p>
                The hosting math, as of mid-2026:{" "}
                <LandingReceiptLink href="https://www.netlify.com/pricing/">
                  Netlify Pro
                </LandingReceiptLink>{" "}
                is $20/month for 3,000 credits at 15 per successful production deploy: exactly 200 a
                month before bandwidth and compute draw from the same pool, roughly $0.10 a deploy
                at the recharge rate. Previews and failed deploys are free; run the pool dry and
                Netlify pauses the team's projects until the next cycle or the next payment. On
                Cloudflare, the{" "}
                <LandingReceiptLink href="https://developers.cloudflare.com/workers/platform/pricing/">
                  $5 Workers plan
                </LandingReceiptLink>{" "}
                includes{" "}
                <LandingReceiptLink href="https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/">
                  six concurrent builds
                </LandingReceiptLink>
                , and Cloudflare itself says to start new projects on Workers.
              </p>
            </div>
          </LandingFootnote>
        </section>

        <section className="mt-24 border-t border-border pt-20 @3xl:mt-28">
          <div className="mb-16">
            <LandingInteractiveLogo autoRotate viewStateKey={LANDING_CLOSING_BAND_VIEW_STATE_KEY} />
            <p className="mt-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              drag it ·{" "}
              <Link className="no-underline hover:text-foreground" to="/logo">
                open the logo lab
              </Link>
            </p>
          </div>
          <h2 className="mt-8 max-w-[20ch] text-[clamp(28px,4cqw,38px)] font-bold leading-tight tracking-[-0.025em]">
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

/**
 * MarkdownLandingDocument merges this className after its own defaults, which include py-10 and
 * lg:py-14. The base pb wins over py-10's bottom padding, but lg:py-14 sorts after every base
 * utility, so the lg pb duplicate is required to keep the scroll-end space that lets the last
 * heading anchor align to the top of the scrollport.
 */
const DOCS_DOCUMENT_CLASS_NAME =
  "min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]";

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

function LandingPreviewDocument({ documentKey }: { documentKey: LandingPreviewDocumentKey }) {
  if (documentKey === "overview") {
    return <LandingPreviewOverview />;
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

  return <DocsDoItYourselfDocument />;
}

function LandingPreviewChromePage({
  documentKey,
  showDocsSidebar,
}: {
  documentKey: LandingPreviewDocumentKey;
  showDocsSidebar: boolean;
}) {
  return (
    <AppWorkspaceRouteChrome left={showDocsSidebar ? { content: <DocsSidebar /> } : null}>
      <LandingPreviewPaneUrlSync />
      <div data-testid={LANDING_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingPreviewDocument documentKey={documentKey} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function LandingPreviewPage() {
  return <LandingPreviewChromePage documentKey="overview" showDocsSidebar={false} />;
}

export function DocsDoItYourselfPage() {
  return <LandingPreviewChromePage documentKey="doItYourself" showDocsSidebar />;
}

export function DocsTheStackPage() {
  return <LandingPreviewChromePage documentKey="theStack" showDocsSidebar />;
}

export function DocsReceiptsPage() {
  return <LandingPreviewChromePage documentKey="receipts" showDocsSidebar />;
}

export function DocsPricingPage() {
  return <LandingPreviewChromePage documentKey="pricing" showDocsSidebar />;
}
