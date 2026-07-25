import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import { PublicLandingLogo } from "@/components/logo/PublicLandingLogo";
import {
  SierpinskiCarpetHoverScene,
  type SierpinskiCarpetHoverSceneConfig,
} from "@/components/logo/SierpinskiCarpetHoverScene";
import { getTailwindColorHex } from "@/components/logo/logoTailwindColors";
import { readLogoRouteRenderState } from "@/components/logo/logoRouteRenderState";
import { useResolvedAppThemeColorState } from "@/lib/appThemeColorSearch";
import { SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS } from "@samebase/logo-model/sierpinski-carpet-hover";
import {
  isAppPresentationAuthenticated,
  useAppAuthPresentation,
} from "@/lib/appAuthPresentationState";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { LANDING_CLOSING_BAND_VIEW_STATE_KEY } from "@/lib/rotatedLogoViewState";
import { replaceRootLogoRouteSearch, useRootRouteSearch } from "@/routeSearch/root";
import { applySearchPatch } from "@/routing/searchFlags";
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
  LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID,
  LANDING_PREVIEW_PROVIDER_GRID_TEST_ID,
  LANDING_PREVIEW_ROUTE,
  LANDING_PREVIEW_STACK_DETAILS_TEST_ID,
  LANDING_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import docsDoItYourselfMarkdown from "@/content/docs-do-it-yourself.md?raw";
import docsPricingMarkdown from "@/content/docs-pricing.md?raw";
import docsReceiptsMarkdown from "@/content/docs-receipts.md?raw";
import docsTheStackMarkdown from "@/content/docs-the-stack.md?raw";
import { publicMediaManifest } from "../../shared/publicMediaManifest";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

type LandingPreviewDocumentKey = "overview" | "doItYourself" | "theStack" | "receipts" | "pricing";

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

const LANDING_AGENT_PROMPT =
  "Read samebase.com/llms.txt. Should I use Samebase with you for my next app? Verify the receipts before you answer.";

const LANDING_SETUP_STEPS = [
  {
    detail: "No account? You create one in the same flow.",
    kind: "oauth",
    number: "1",
    title: "Connect GitHub.",
  },
  {
    detail: "A team in your name, not ours.",
    kind: "oauth",
    number: "2",
    title: "Connect Convex.",
  },
  {
    detail: "Deploys and domains on your account.",
    kind: "oauth",
    number: "3",
    title: "Connect Cloudflare.",
  },
  {
    detail: "The GitHub app wires builds to pushes.",
    kind: "github app",
    number: "4",
    title: "Link Cloudflare to your repo.",
  },
] as const;

type LandingProviderCell = { kind: "attached"; value: string } | { kind: "notAttached" };
type LandingInventoryState =
  | { kind: "healthy" }
  | { kind: "githubOnly" }
  | { kind: "repair"; action: string };

/**
The demo rows must keep demonstrating every lifecycle state agents kept missing
in the positioning probes: a full-stack app, an existing repo left GitHub-only,
two derived locations in one monorepo, and a drifted target with its repair action.
*/
const LANDING_INVENTORY_ROWS: readonly {
  cloudflare: LandingProviderCell;
  convex: LandingProviderCell;
  github: string;
  location: string;
  repository: string;
  state: LandingInventoryState;
}[] = [
  {
    cloudflare: { kind: "attached", value: "birdlog.you.workers.dev" },
    convex: { kind: "attached", value: "birdlog-prod" },
    github: "you/birdlog",
    location: "/",
    repository: "birdlog",
    state: { kind: "healthy" },
  },
  {
    cloudflare: { kind: "notAttached" },
    convex: { kind: "notAttached" },
    github: "you/notes",
    location: "/",
    repository: "notes",
    state: { kind: "githubOnly" },
  },
  {
    cloudflare: { kind: "attached", value: "shop-web.you.workers.dev" },
    convex: { kind: "attached", value: "shop-web" },
    github: "you/shop",
    location: "apps/web",
    repository: "shop",
    state: { kind: "healthy" },
  },
  {
    cloudflare: { kind: "attached", value: "worker created" },
    convex: { kind: "attached", value: "shop-admin" },
    github: "you/shop",
    location: "apps/admin",
    repository: "shop",
    state: { kind: "repair", action: "configure Workers Builds for GitHub" },
  },
];

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

function LandingInlineLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <Link
      className="border-b border-border pb-px text-primary no-underline hover:border-foreground hover:text-foreground"
      to={to}
    >
      {children}
    </Link>
  );
}

/** Every section below the hero opens with the same hairline and kicker rhythm. */
function LandingSection({ ariaLabel, children }: { ariaLabel?: string; children: ReactNode }) {
  return (
    <section
      aria-label={ariaLabel}
      className="mt-10 border-t border-border pt-8 @3xl:mt-16 @3xl:pt-12"
    >
      {children}
    </section>
  );
}

function LandingSectionIntro({
  heading,
  kicker,
  sub,
}: {
  heading: ReactNode;
  kicker: string;
  sub?: ReactNode;
}) {
  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
        {kicker}
      </p>
      <h2 className="mt-3 max-w-[26ch] text-[clamp(24px,3cqw,32px)] font-semibold leading-[1.25] tracking-[-0.02em]">
        {heading}
      </h2>
      {sub === undefined ? null : (
        <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-primary">{sub}</p>
      )}
    </>
  );
}

function LandingCreateAppButton() {
  const authPresentation = useAppAuthPresentation();
  const { setMobilePane, setRightDesktopOpen } = useWorkspacePaneActions();

  if (isAppPresentationAuthenticated(authPresentation)) {
    return (
      <Button asChild className="h-12 px-7 text-base font-semibold no-underline">
        <Link to={DASHBOARD_ROUTE}>Open Samebase</Link>
      </Button>
    );
  }

  return (
    <Button asChild className="h-12 px-7 text-base font-semibold no-underline">
      <Link
        to="/"
        search={(currentSearch) =>
          applySearchPatch(currentSearch, {
            auth: null,
            "auth-return": null,
            "create-account": null,
            signup: null,
            "sign-in": true,
          })
        }
        onClick={() => {
          setRightDesktopOpen(true);
          setMobilePane("right");
        }}
      >
        Open Samebase
      </Link>
    </Button>
  );
}

const COPY_LABEL_RESET_DELAY_MS = 1500;

function LandingCopyPromptButton() {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<number | null>(null);

  return (
    <button
      className="w-full border-t border-border px-5 py-3 text-left font-mono text-xs font-semibold hover:bg-muted @2xl:w-auto @2xl:border-l @2xl:border-t-0 @2xl:text-center"
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
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function LandingProviderRow({ logo, role }: { logo: ReactNode; role: string }) {
  return (
    <div className="contents @3xl:flex @3xl:items-center @3xl:gap-3.5">
      <div className="flex items-center gap-2 @3xl:w-fit">{logo}</div>
      <div>
        <p className="text-sm text-muted-foreground">{role}</p>
        <p className="font-mono text-[11px] text-muted-foreground">
          owner: <span className="font-semibold text-secondary">you</span>
        </p>
      </div>
    </div>
  );
}

function LandingClaim({
  children,
  heading,
  label,
}: {
  children: ReactNode;
  heading: ReactNode;
  label: string;
}) {
  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <h2 className="mt-3 max-w-[30ch] text-[21px] font-semibold leading-[1.3] tracking-[-0.015em] @3xl:text-[23px]">
        {heading}
      </h2>
      <p className="mt-3 max-w-[52ch] text-base leading-relaxed text-primary">{children}</p>
    </div>
  );
}

function LandingProviderCellText({ cell }: { cell: LandingProviderCell }) {
  switch (cell.kind) {
    case "attached":
      return <>{cell.value}</>;
    case "notAttached":
      return <span className="text-muted-foreground">not attached</span>;
    default:
      return cell satisfies never;
  }
}

function LandingInventoryStateText({ state }: { state: LandingInventoryState }) {
  switch (state.kind) {
    case "healthy":
      return <span className="font-semibold text-secondary">✓ healthy</span>;
    case "githubOnly":
      return <>github-only</>;
    case "repair":
      return (
        <>
          ! repair: <span className="font-semibold text-secondary">{state.action}</span>
        </>
      );
    default:
      return state satisfies never;
  }
}

function LandingInventoryRepositoryLabel({
  location,
  repository,
}: {
  location: string;
  repository: string;
}) {
  return (
    <>
      <span className="font-semibold text-foreground">{repository}</span>
      <span className="text-muted-foreground"> · {location}</span>
    </>
  );
}

/**
One row set, two renderings: a five-column table where the pane can hold it,
stacked per-app cards below @3xl. The display-none variant drops out of the
accessibility tree, so the inventory is announced once.
*/
function LandingInventory() {
  return (
    <>
      <table className="mt-3 hidden w-full border-collapse font-mono text-xs @3xl:table">
        <thead>
          <tr className="border-b border-border bg-muted/50 text-left uppercase tracking-[0.14em] text-muted-foreground">
            <th className="px-3 py-2.5 font-normal">repository · location</th>
            <th className="px-3 py-2.5 font-normal">github</th>
            <th className="px-3 py-2.5 font-normal">convex</th>
            <th className="px-3 py-2.5 font-normal">cloudflare</th>
            <th className="px-3 py-2.5 text-right font-normal">state</th>
          </tr>
        </thead>
        <tbody>
          {LANDING_INVENTORY_ROWS.map((row) => (
            <tr className="border-b border-border" key={`${row.repository}-${row.location}`}>
              <td className="px-3 py-3">
                <LandingInventoryRepositoryLabel
                  location={row.location}
                  repository={row.repository}
                />
              </td>
              <td className="px-3 py-3">{row.github}</td>
              <td className="px-3 py-3">
                <LandingProviderCellText cell={row.convex} />
              </td>
              <td className="px-3 py-3">
                <LandingProviderCellText cell={row.cloudflare} />
              </td>
              <td className="px-3 py-3 text-right">
                <LandingInventoryStateText state={row.state} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 grid gap-4 @3xl:hidden">
        {LANDING_INVENTORY_ROWS.map((row) => (
          <div className="border border-border" key={`${row.repository}-${row.location}`}>
            <p className="flex items-baseline justify-between gap-4 border-b border-border bg-muted/50 px-3.5 py-2.5 font-mono text-[13px]">
              <LandingInventoryRepositoryLabel
                location={row.location}
                repository={row.repository}
              />
              <span className="text-right">
                <LandingInventoryStateText state={row.state} />
              </span>
            </p>
            <dl className="grid gap-1.5 px-3.5 py-3 font-mono text-xs">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">github</dt>
                <dd>{row.github}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">convex</dt>
                <dd>
                  <LandingProviderCellText cell={row.convex} />
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">cloudflare</dt>
                <dd>
                  <LandingProviderCellText cell={row.cloudflare} />
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </>
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

/**
The closing band auto-rotates under its own view-state key; deliberate drags
still write the shared logo params back to the URL so the mark follows the
visitor into the app.
*/
function LandingClosingBandLogo() {
  const navigate = useNavigate();
  const rootRouteSearch = useRootRouteSearch();

  return (
    <PublicLandingLogo
      animateLeftFaceStripes
      autoRotate
      replaceRouteSearch={(nextSearch) => {
        void navigate({
          hash: true,
          replace: true,
          resetScroll: false,
          search: (currentSearch) => replaceRootLogoRouteSearch(currentSearch, nextSearch),
          state: true,
          to: ".",
        });
      }}
      routeSearch={rootRouteSearch}
      stage="wide"
      viewStateKey={LANDING_CLOSING_BAND_VIEW_STATE_KEY}
    />
  );
}

/**
Fixed hero reveal tuning: shared falloff at the lab default radius, capped at
depth four so the finest revealed holes stay crisp squares at hero sizes.
The lab route at /logo/hover/carpet owns the adjustable knobs.
*/
const LANDING_HERO_CARPET_CONFIG: SierpinskiCarpetHoverSceneConfig = {
  falloff: "shared",
  maxDepth: 4,
  mechanic: "grow",
  revealRadius: SIERPINSKI_CARPET_HOVER_DEFAULT_REVEAL_RADIUS,
};

/**
Desktop-only hero mark: the carpet opens deeper recursion around the pointer
page-wide, colored by the same root-retained logo params that follow the
visitor into the app. Below @3xl the canonical mobile order keeps the video
first and hover has no touch analog, so the scene stays display-none and its
draw loop skips the hidden canvas.
*/
function LandingHeroCarpet() {
  const rootRouteSearch = useRootRouteSearch();
  const routeState = useMemo(
    () =>
      readLogoRouteRenderState({
        renderMode: "raster",
        routeSearch: rootRouteSearch,
      }),
    [rootRouteSearch],
  );
  const { faceColors } = useResolvedAppThemeColorState(routeState.themeColors);

  return (
    <div className="hidden min-h-0 @3xl:block" data-testid="landing-preview-hero-carpet">
      <SierpinskiCarpetHoverScene
        carpetColor={getTailwindColorHex(faceColors.right)}
        config={LANDING_HERO_CARPET_CONFIG}
      />
    </div>
  );
}

function LandingPreviewOverview() {
  return (
    <article
      className="min-h-full shrink-0 bg-background pb-48 text-foreground"
      data-testid={LANDING_PREVIEW_ARTICLE_TEST_ID}
    >
      <div className="mx-auto w-full max-w-[1200px] px-6 pt-10 @2xl:px-10 @3xl:pt-14">
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

        <section className="mt-10">
          <div className="@3xl:grid @3xl:grid-cols-[minmax(0,1fr)_minmax(0,0.72fr)] @3xl:gap-10">
            <div>
              <h1 className="max-w-[24ch] text-[clamp(34px,4.6cqw,56px)] font-bold leading-[1.06] tracking-[-0.035em]">
                <span className="block">Not another AI app builder.</span>
                <span className="block">
                  <span className="text-muted-foreground">The tool your AI uses</span> to ship real
                  apps.
                </span>
              </h1>
              <p className="mt-7 max-w-[46ch] text-lg leading-relaxed text-primary">
                One action creates the repo, provisions the database + backend, and deploys the app
                on accounts you own. Every connected app stays visible in one inventory.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
                <LandingCreateAppButton />
                <p className="text-sm text-muted-foreground">
                  Free today; an idle app costs $0/month.
                  <LandingFootnoteMark
                    fragment="landing-note-zero"
                    label="footnote: zero"
                    marker="‡"
                  />
                </p>
              </div>
            </div>
            <LandingHeroCarpet />
          </div>
          <div className="mt-12" style={{ containerType: "inline-size" }}>
            <div
              className="overflow-hidden"
              data-testid="landing-preview-hero-video-frame"
              style={{
                borderRadius: "1.104% / 1.664%",
                boxShadow:
                  "0 0.11cqw 0.44cqw rgb(0 0 0 / 22%), 0 1.325cqw 3.31cqw rgb(0 0 0 / 30%)",
              }}
            >
              <video
                aria-label="Codex builds and plays a 4x4x4 tic-tac-toe game with Samebase"
                autoPlay
                className="block w-full"
                controls
                data-testid="landing-preview-hero-video"
                height={850}
                loop
                muted
                playsInline
                poster="/landing-preview/tic-tac-toe-codex-poster.webp"
                preload="metadata"
                src={publicMediaManifest.landingTicTacToeCodex.publicUrl}
                width={1280}
              />
            </div>
          </div>
        </section>

        <LandingSection>
          <LandingSectionIntro
            heading="GitHub + Convex + Cloudflare is the best way we've found to build an app."
            kicker="the opinion we're selling"
            sub="Simplest, cheapest, hardest to mess up. Samebase repeats it, so you never choose again."
          />
          <div
            className="mt-8 grid grid-cols-[max-content_minmax(0,1fr)] items-center gap-x-4 gap-y-5 @3xl:grid-cols-3 @3xl:gap-8"
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
        </LandingSection>

        <LandingSection>
          <div className="@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_460px] @5xl:items-start @5xl:gap-x-14">
            <div>
              <LandingSectionIntro
                heading="Ask your agent."
                kicker="don't trust us"
                sub={
                  <>
                    Every claim on this page links a{" "}
                    <LandingInlineLink to={DOCS_RECEIPTS_ROUTE}>dated receipt</LandingInlineLink>,
                    so the agent you already run can verify us instead of trusting us.
                  </>
                }
              />
            </div>
            <div className="mt-8 @5xl:mt-1.5">
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                paste this into the agent you already run
              </p>
              <div className="mt-3 border border-border @2xl:flex @2xl:items-stretch">
                <p className="flex-1 bg-muted/50 px-4 py-3.5 font-mono text-[13px] leading-relaxed">
                  {LANDING_AGENT_PROMPT}
                </p>
                <LandingCopyPromptButton />
              </div>
            </div>
          </div>
          <div
            className="mt-8 border-y border-border py-6"
            data-testid={LANDING_PREVIEW_PLATFORM_DETAILS_TEST_ID}
          >
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
          </div>
        </LandingSection>

        <LandingSection ariaLabel="Four claims">
          <div className="grid gap-x-14 gap-y-10 @3xl:grid-cols-2">
            <LandingClaim
              heading="Delete your Samebase account. Your app doesn't notice."
              label="01 · yours"
            >
              It was always on your GitHub, your Convex, your Cloudflare. We even publish the full{" "}
              <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>
                do-it-yourself recipe
              </LandingInlineLink>
              : the identical stack, no account at all.
            </LandingClaim>
            <LandingClaim
              heading={
                <>
                  The "builder left my database open" breach class can't be expressed here.
                  <LandingFootnoteMark
                    fragment="landing-note-risk"
                    label="footnote: not hypothetical"
                    marker="§"
                  />
                </>
              }
              label="02 · safer"
            >
              Convex is only reachable through TypeScript functions you wrote. No client-facing
              database, no rules you have to configure perfectly, forever.
            </LandingClaim>
            <LandingClaim
              heading="Run agents in parallel. Every PR gets its own preview, with its own database."
              label="03 · lanes"
            >
              Local folder, worktrees, pull requests: each lane gets isolated code, data, and
              deploy. Codex and Claude Code already understand worktrees; the stack keeps up.
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
              label="04 · cheaper"
            >
              You already pay OpenAI or Anthropic directly; a builder's chat box adds margin, not
              capability. Providers bill you at their own prices, and idle apps sit in free tiers.
            </LandingClaim>
          </div>
        </LandingSection>

        <LandingSection>
          <div className="@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_440px] @5xl:gap-x-14">
            <div className="@5xl:col-start-1 @5xl:row-start-1">
              <LandingSectionIntro
                heading="Setup is three OAuth connects and one GitHub app. We filmed all of it."
                kicker="the honest part"
                sub="It's the biggest hurdle in Samebase, so we don't hide it. Here it is in real time."
              />
            </div>
            {/* Placeholder for the recorded onboarding capture. Swap for the
                real embed once the footage exists; the copy above claims it. */}
            <div className="mt-8 @5xl:col-start-2 @5xl:row-span-2 @5xl:row-start-1 @5xl:mt-1.5">
              <div className="flex aspect-video w-full items-center justify-center bg-muted">
                <p className="max-w-[36ch] text-center font-mono text-xs uppercase leading-relaxed tracking-[0.14em] text-muted-foreground">
                  video: the full onboarding, real time, unedited (~3 min)
                </p>
              </div>
              <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">
                watch it before you sign up · nothing is skipped
              </p>
            </div>
            <div className="mt-10 grid gap-x-10 gap-y-6 @2xl:grid-cols-2 @5xl:col-start-1 @5xl:row-start-2">
              {LANDING_SETUP_STEPS.map((step) => (
                <div className="border-t border-border pt-4" key={step.number}>
                  <p className="font-mono text-xs font-semibold text-secondary">
                    {step.number} · {step.kind}
                  </p>
                  <p className="mt-2 text-[15px] leading-relaxed text-primary">
                    <span className="font-semibold text-foreground">{step.title}</span>{" "}
                    {step.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </LandingSection>

        <LandingSection>
          <div
            className="mb-12 text-center @3xl:mb-16"
            data-testid={LANDING_PREVIEW_STACK_DETAILS_TEST_ID}
          >
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              standard stack
            </p>
            <h2 className="mx-auto mt-3 max-w-[24ch] text-[clamp(24px,3cqw,32px)] font-semibold leading-[1.25] tracking-[-0.02em]">
              Chosen for how agents build now.
            </h2>
            <div className="mt-8 grid gap-8 @3xl:grid-cols-3 @3xl:gap-10">
              <div>
                <div className="flex h-8 items-center justify-center">
                  <img
                    alt="Vite+"
                    className="h-5 w-auto dark:hidden"
                    height="15"
                    src="/landing-preview/logos/vite-plus.svg"
                    width="103"
                  />
                  <img
                    alt="Vite+"
                    className="hidden h-5 w-auto dark:block"
                    height="15"
                    src="/landing-preview/logos/vite-plus-dark.svg"
                    width="103"
                  />
                </div>
                <p className="mx-auto mt-2 max-w-[26ch] text-sm leading-relaxed text-primary">
                  One fast toolchain for the agent loop.
                </p>
              </div>
              <div>
                <div className="flex h-8 items-center justify-center gap-1.5">
                  <img
                    alt="TanStack"
                    className="h-5 w-auto dark:hidden"
                    height="660"
                    src="/landing-preview/logos/tanstack.svg"
                    width="3178"
                  />
                  <img
                    alt="TanStack"
                    className="hidden h-5 w-auto dark:block"
                    height="660"
                    src="/landing-preview/logos/tanstack-dark.svg"
                    width="3178"
                  />
                  <span className="text-base font-semibold">Start</span>
                </div>
                <p className="mx-auto mt-2 max-w-[26ch] text-sm leading-relaxed text-primary">
                  Full-stack TypeScript with official support for Cloudflare Workers.
                </p>
              </div>
              <div>
                <div className="flex h-8 items-center justify-center gap-1.5">
                  <img
                    alt=""
                    className="h-5 w-auto"
                    height="33"
                    src="/landing-preview/logos/tailwindcss.svg"
                    width="54"
                  />
                  <span className="text-base font-semibold">Tailwind CSS</span>
                </div>
                <p className="mx-auto mt-2 max-w-[26ch] text-sm leading-relaxed text-primary">
                  One styling language from product UI to landing pages.
                </p>
              </div>
            </div>
            <p className="mt-7 text-sm text-primary">
              <LandingInlineLink to={DOCS_THE_STACK_ROUTE}>
                Why we chose this stack
              </LandingInlineLink>
            </p>
          </div>
          <LandingSectionIntro
            heading="More products, not more systems to maintain."
            kicker="one base"
            sub="Every app sits on the same base, not the same shape. One inventory holds provider state, coordinates, and the action that repairs what drifts."
          />
          <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              your apps · one inventory
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              also readable by your agent, over MCP
            </p>
          </div>
          <LandingInventory />
          <p className="mt-5 max-w-[92ch] font-mono text-[13px] leading-relaxed text-primary">
            and not only new apps: connect an existing repo and leave it GitHub-only · attach Convex
            or Cloudflare later · monorepo locations follow convex.json and live Workers Builds
            roots
          </p>
        </LandingSection>

        <LandingSection>
          <div className="@5xl:grid @5xl:grid-cols-[minmax(0,1fr)_420px] @5xl:items-start @5xl:gap-x-14">
            <div>
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
            <div className="mt-10 flex items-start gap-3.5 border border-border bg-muted/50 p-5 @5xl:mt-9">
              <img
                alt="Samebase"
                className="mt-0.5 h-7 w-7"
                height="28"
                src="/brand/logo/v2-side-diagonal-duotone.svg"
                width="28"
              />
              <p className="max-w-[44ch] text-[15px] leading-relaxed text-primary">
                <span className="font-semibold text-foreground">Samebase runs on Samebase.</span>{" "}
                One monorepo, one Convex deployment, and three specialized Cloudflare Workers.
              </p>
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
                GitHub Free: unlimited private repos.{" "}
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
          <div className="mb-14">
            <LandingClosingBandLogo />
            <p className="mt-6 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              drag it ·{" "}
              <Link className="no-underline hover:text-foreground" to="/logo">
                open the logo lab
              </Link>
            </p>
          </div>
          <h2 className="max-w-[20ch] text-[clamp(26px,3.4cqw,36px)] font-bold leading-tight tracking-[-0.025em]">
            Same stack. Your accounts. No magic.
          </h2>
          <p className="mt-4 max-w-[52ch] text-[15px] leading-relaxed text-muted-foreground">
            The manual-setup article walks through every step Samebase automates. It doubles as the
            exit door.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4">
            <LandingCreateAppButton />
            <LandingInlineLink to={DOCS_DO_IT_YOURSELF_ROUTE}>Do it yourself</LandingInlineLink>
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
