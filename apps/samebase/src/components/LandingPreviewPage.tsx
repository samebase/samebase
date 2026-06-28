import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { FileTree, type FileTreeItem } from "@/components/FileTree";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
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
import { ArrowRight } from "lucide-react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, type MouseEvent as ReactMouseEvent } from "react";

type LandingPreviewDocumentKey = "overview" | "doItYourself";

const LANDING_STACK_PROVIDERS = [
  {
    description: "source control and pull requests",
    name: "GitHub",
    src: "/landing-preview/logos/github.svg",
  },
  {
    description: "database, backend, realtime functions",
    name: "Convex",
    src: "/landing-preview/logos/convex.svg",
  },
  {
    description: "deployment, domains, front door",
    name: "Cloudflare",
    src: "/landing-preview/logos/cloudflare.jpg",
  },
] as const;

const LANDING_WORK_LANES = [
  {
    body: "A persistent local deploy for day-to-day development.",
    label: "Local folder",
  },
  {
    body: "A separate local database deploy for each parallel agent.",
    label: "Worktree",
  },
  {
    body: "A preview deploy for the exact branch under review.",
    label: "Pull request",
  },
] as const;

const LANDING_CORRECT_PRINCIPLES = [
  {
    body: "Samebase runs on GitHub, Convex, and Cloudflare too.",
    title: "Same stack",
  },
  {
    body: "A forgotten idea should not become a monthly tax.",
    title: "Idle stays cheap",
  },
  {
    body: "Convex keeps data, backend, and realtime behavior in one model.",
    title: "Simple core",
  },
  {
    body: "Normal repo. Normal infrastructure. Replaceable tools.",
    title: "Transparent output",
  },
] as const;

const LANDING_APP_STEPS = [
  {
    body: "Connect GitHub, Convex, and Cloudflare.",
    label: "Connect",
  },
  {
    body: "Samebase creates the repo and deploy path.",
    label: "Create",
  },
  {
    body: "You keep normal code on normal infrastructure.",
    label: "Own",
  },
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

function LandingPreviewProviderGrid() {
  return (
    <div className="grid gap-px border bg-border sm:grid-cols-3">
      {LANDING_STACK_PROVIDERS.map((provider) => (
        <div
          className="flex min-h-28 flex-col justify-between bg-background p-4"
          key={provider.name}
        >
          <img
            alt={provider.name}
            className="h-8 w-fit max-w-32 bg-white object-contain px-1 py-1"
            height="32"
            src={provider.src}
            width="128"
          />
          <div>
            <div className="text-sm font-medium">{provider.name}</div>
            <div className="mt-1 text-sm leading-5 text-muted-foreground">
              {provider.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LandingWorkLanes() {
  return (
    <section className="grid gap-6 border-b pb-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-2xl font-semibold leading-8">Parallel by default</h2>
      </div>
      <div>
        <div className="grid gap-px border bg-border md:grid-cols-3">
          {LANDING_WORK_LANES.map((lane) => (
            <section className="bg-background p-5" key={lane.label}>
              <h3 className="text-lg font-semibold leading-6">{lane.label}</h3>
              <p className="mt-3 text-sm leading-5 text-muted-foreground">{lane.body}</p>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingCorrectPrinciples() {
  return (
    <section className="grid gap-6 border-b pb-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-2xl font-semibold leading-8">What correct means here</h2>
      </div>
      <div className="grid gap-px border bg-border sm:grid-cols-2">
        {LANDING_CORRECT_PRINCIPLES.map((principle) => (
          <section className="min-h-32 bg-background p-5" key={principle.title}>
            <h3 className="text-lg font-semibold leading-6">{principle.title}</h3>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">{principle.body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}

function LandingCorrectFootnote() {
  return (
    <aside className="border p-5" id="landing-correct-footnote">
      <p className="text-sm leading-6 text-muted-foreground">
        <sup>*</sup> Correct means:
      </p>
      <div className="mt-4 grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-1">
        {LANDING_CORRECT_PRINCIPLES.map((principle) => (
          <div className="bg-background px-4 py-3" key={principle.title}>
            <div className="text-sm font-medium leading-5">{principle.title}</div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function LandingAppSteps() {
  return (
    <section className="grid gap-6 border-b pb-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <h2 className="text-2xl font-semibold leading-8">What Samebase does</h2>
      <ol className="grid gap-px border bg-border md:grid-cols-3">
        {LANDING_APP_STEPS.map((step) => (
          <li className="bg-background p-5" key={step.label}>
            <h3 className="text-xl font-semibold leading-7">{step.label}</h3>
            <p className="mt-3 text-sm leading-5 text-muted-foreground">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function LandingPreviewOverview() {
  return (
    <article
      className="min-h-full shrink-0 bg-background pb-[calc(100svh-4rem)] text-foreground"
      data-testid={LANDING_PREVIEW_ARTICLE_TEST_ID}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <section className="grid gap-8 border-b pb-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
          <div className="max-w-4xl">
            <h1
              aria-describedby="landing-correct-footnote"
              className="max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl"
            >
              The correct<sup className="text-[0.25em] font-medium leading-none">*</sup> way to
              build web apps
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-7 text-muted-foreground">
              Samebase turns GitHub, Convex, and Cloudflare into a normal app you own. Use Codex,
              Claude Code, or any editor on top.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="inline-flex h-10 items-center gap-2 border border-foreground bg-foreground px-4 text-sm font-medium text-background no-underline hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                search={{ "sign-in": true }}
                to="/"
              >
                Start with Samebase
                <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />
              </Link>
              <Link
                className="inline-flex h-10 items-center border px-4 text-sm font-medium text-foreground no-underline hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to={LANDING_DO_IT_YOURSELF_ROUTE}
              >
                Do it yourself
              </Link>
            </div>
          </div>

          <LandingCorrectFootnote />
        </section>

        <section className="grid gap-6 border-b pb-10 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
          <div>
            <h2 className="max-w-2xl text-3xl font-semibold leading-10">The base is a trio.</h2>
            <p className="mt-4 max-w-xl text-base leading-6 text-muted-foreground">
              Samebase recommends the same services it uses for itself. AI tools sit above the base;
              they are not the lock-in.
            </p>
          </div>
          <LandingPreviewProviderGrid />
        </section>

        <LandingAppSteps />

        <LandingWorkLanes />

        <LandingCorrectPrinciples />

        <section className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <h2 className="text-2xl font-semibold leading-8">Manual setup proves it</h2>
          <div>
            <p className="max-w-xl text-base leading-6 text-muted-foreground">
              If the stack is correct, you should be able to build it without Samebase.
            </p>
            <Link
              className="mt-6 inline-flex h-10 items-center gap-2 border px-4 text-sm font-medium text-foreground no-underline hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              to={LANDING_DO_IT_YOURSELF_ROUTE}
            >
              Read the manual setup
              <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />
            </Link>
          </div>
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
