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
  {
    description: "Codex for app-building work",
    name: "OpenAI",
    src: "/landing-preview/logos/openai.svg",
  },
] as const;

const LANDING_CORRECT_PRINCIPLES = [
  {
    body: "Samebase runs on the same base it recommends. If the recipe is correct, the builder should be able to use it for itself.",
    title: "Same stack",
  },
  {
    body: "A forgotten idea should not become a monthly tax. The cost should stay close to idle when the app is idle, then scale with real usage.",
    title: "Cost follows usage",
  },
  {
    body: "Simple means fewer moving parts you have to remember. Convex keeps the backend, database, and realtime behavior in one model that can still grow.",
    title: "Simple does not mean toy",
  },
  {
    body: "The first user is me, then friends, then strangers. That order forces the app, repo, and infrastructure to stay inspectable and replaceable.",
    title: "Transparent by default",
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
    <div className="grid gap-px border bg-border sm:grid-cols-2">
      {LANDING_STACK_PROVIDERS.map((provider) => (
        <div
          className="flex min-h-32 flex-col justify-between bg-background p-4"
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

function LandingCorrectPrinciples() {
  return (
    <section className="grid gap-8 border-b pb-14 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div>
        <h2 className="text-2xl font-semibold leading-8">What correct means here</h2>
      </div>
      <div className="divide-y border-y">
        {LANDING_CORRECT_PRINCIPLES.map((principle) => (
          <section
            className="grid gap-3 py-6 md:grid-cols-[13rem_minmax(0,1fr)]"
            key={principle.title}
          >
            <h3 className="text-base font-semibold leading-6">{principle.title}</h3>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">{principle.body}</p>
          </section>
        ))}
      </div>
    </section>
  );
}

function LandingPreviewOverview() {
  return (
    <article
      className="min-h-full shrink-0 bg-background pb-[calc(100svh-4rem)] text-foreground"
      data-testid={LANDING_PREVIEW_ARTICLE_TEST_ID}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-14 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <section className="grid gap-10 border-b pb-12 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="max-w-4xl">
            <h1
              aria-describedby="landing-correct-footnote"
              className="max-w-3xl text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl"
            >
              The{" "}
              <span className="relative inline-block pr-3">
                correct
                <sup className="absolute right-0 top-1 text-[0.7rem] font-medium leading-none">
                  *
                </sup>
              </span>{" "}
              way to build web apps
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
              Samebase creates real apps from your own GitHub, Convex, Cloudflare, and OpenAI
              accounts. It chooses the same stack it runs on, then leaves you with a normal repo and
              normal infrastructure.
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

          <aside className="border-l pl-5">
            <p
              className="max-w-sm text-sm leading-6 text-muted-foreground"
              id="landing-correct-footnote"
            >
              <sup className="text-[0.7rem] font-medium leading-none">*</sup> Correct means honest
              about the stack, cheap to leave running, simple enough to understand, and transparent
              enough to replace.
            </p>
          </aside>
        </section>

        <section className="grid gap-8 border-b pb-14 lg:grid-cols-[minmax(0,1fr)_28rem] lg:items-start">
          <div>
            <h2 className="max-w-2xl text-3xl font-semibold leading-10">
              Samebase uses the exact technologies it recommends.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
              The builder is not a wrapper around a secret stack. It uses the same base it gives
              users, because recommendations should come from daily operation, not marketing pages.
            </p>
          </div>
          <LandingPreviewProviderGrid />
        </section>

        <section className="grid gap-8 border-b pb-14 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <h2 className="text-2xl font-semibold leading-8">What Samebase does</h2>
          <ol className="grid gap-px border bg-border md:grid-cols-3">
            <li className="bg-background p-5">
              <div className="font-mono text-sm text-muted-foreground">01</div>
              <h3 className="mt-5 text-base font-semibold leading-6">Connect accounts</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                GitHub for code, Convex for the backend, Cloudflare for the front door, OpenAI for
                app-building work.
              </p>
            </li>
            <li className="bg-background p-5">
              <div className="font-mono text-sm text-muted-foreground">02</div>
              <h3 className="mt-5 text-base font-semibold leading-6">Create the app</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Samebase creates the repo, provisions the services, and keeps the app editable from
                the browser.
              </p>
            </li>
            <li className="bg-background p-5">
              <div className="font-mono text-sm text-muted-foreground">03</div>
              <h3 className="mt-5 text-base font-semibold leading-6">Keep ownership</h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                The result is normal code on normal infrastructure, not a project trapped inside an
                app builder.
              </p>
            </li>
          </ol>
        </section>

        <LandingCorrectPrinciples />

        <section className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <h2 className="text-2xl font-semibold leading-8">Manual setup is proof</h2>
          <div>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              The do-it-yourself guide stays separate because it is not the landing page. It is the
              receipt: if the stack is correct, you should be able to build it without Samebase.
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
