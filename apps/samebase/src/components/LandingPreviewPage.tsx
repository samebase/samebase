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
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, type MouseEvent as ReactMouseEvent } from "react";

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

function LandingPreviewProviderTriangle() {
  return (
    <section aria-label="Samebase provider base" className="pt-4">
      <div className="relative mx-auto aspect-[16/8] w-full max-w-4xl">
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full text-border"
          fill="none"
          viewBox="0 0 100 50"
        >
          <path d="M50 7L18 41H82L50 7Z" stroke="currentColor" strokeWidth="0.45" />
        </svg>

        <div className="absolute left-1/2 top-[14%] flex w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-background px-3 py-3">
          <img
            alt="GitHub"
            className="h-auto w-32 bg-white object-contain"
            height="32"
            src="/landing-preview/logos/github.svg"
            width="128"
          />
        </div>

        <div className="absolute left-[18%] top-[82%] flex w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-background px-3 py-3">
          <img
            alt="Convex"
            className="h-auto w-28 bg-white object-contain"
            height="28"
            src="/landing-preview/logos/convex.svg"
            width="112"
          />
        </div>

        <div className="absolute left-[82%] top-[82%] flex w-36 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-background px-3 py-3">
          <img
            alt="Cloudflare"
            className="h-auto w-28 bg-white object-contain"
            height="38"
            src="/landing-preview/logos/cloudflare.jpg"
            width="112"
          />
        </div>

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-background px-5 py-4">
          <img
            alt="Samebase"
            className="h-24 w-24 object-contain sm:h-28 sm:w-28"
            height="112"
            src="/icon-512.png"
            width="112"
          />
        </div>
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 sm:px-8 lg:px-12 lg:py-14">
        <section>
          <div className="max-w-5xl">
            <h1
              aria-describedby="landing-correct-definition"
              className="max-w-4xl text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-6xl"
            >
              The correct<sup>*</sup> way to build web apps
            </h1>
          </div>
        </section>

        <LandingPreviewProviderTriangle />

        <section className="border-t pt-6" id="landing-correct-definition">
          <h2 className="text-lg font-semibold leading-7">* correct</h2>
          <ul className="mt-4 grid gap-2 text-base leading-7 text-muted-foreground">
            {LANDING_CORRECT_DEFINITION.map((definition) => (
              <li className="list-inside list-disc" key={definition}>
                {definition}
              </li>
            ))}
          </ul>
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
