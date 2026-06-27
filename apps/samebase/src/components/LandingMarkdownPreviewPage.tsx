import { AppWorkspaceRouteChrome } from "@/components/AppWorkspaceShell";
import { FileTree, type FileTreeItem } from "@/components/FileTree";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import {
  useWorkspacePaneActions,
  useWorkspacePaneState,
  type WorkspaceMobilePane,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_DO_IT_YOURSELF_ROUTE,
  LANDING_MARKDOWN_PREVIEW_ROUTE,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
} from "@/routeSearch/landingPreview";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import landingDoItYourselfMarkdown from "@/content/landing-do-it-yourself.md?raw";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useLayoutEffect, type MouseEvent as ReactMouseEvent } from "react";

type LandingMarkdownDocumentKey = "overview" | "doItYourself";

const LANDING_MARKDOWN_BY_DOCUMENT_KEY = {
  doItYourself: landingDoItYourselfMarkdown,
  overview: landingPreviewMarkdown,
} satisfies Record<LandingMarkdownDocumentKey, string>;

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
  documentKey: LandingMarkdownDocumentKey;
}): LandingPreviewHelpCenter {
  const overviewPath = "01 Overview.md";
  const doItYourselfPath = "02 Do it yourself.md";

  return {
    items: [
      {
        href: LANDING_MARKDOWN_PREVIEW_ROUTE,
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
  ["01 Overview.md", LANDING_MARKDOWN_PREVIEW_ROUTE],
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
function LandingMarkdownPreviewPaneUrlSync() {
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

function LandingMarkdownPreviewSidebar({
  documentKey,
}: {
  documentKey: LandingMarkdownDocumentKey;
}) {
  const landingPreviewHelpCenter = createLandingPreviewHelpCenter({ documentKey });
  const navigate = useNavigate();

  return (
    <nav
      aria-label="Landing preview sections"
      data-testid={LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID}
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

function LandingMarkdownPreviewDocument({
  documentKey,
}: {
  documentKey: LandingMarkdownDocumentKey;
}) {
  return (
    <MarkdownLandingDocument
      className="min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]"
      dataTestId={LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}
      markdown={LANDING_MARKDOWN_BY_DOCUMENT_KEY[documentKey]}
    />
  );
}

function LandingMarkdownPage({ documentKey }: { documentKey: LandingMarkdownDocumentKey }) {
  return (
    <AppWorkspaceRouteChrome
      left={{ content: <LandingMarkdownPreviewSidebar documentKey={documentKey} /> }}
      sidebarDefaultState={LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE}
    >
      <LandingMarkdownPreviewPaneUrlSync />
      <div data-testid={LANDING_MARKDOWN_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingMarkdownPreviewDocument documentKey={documentKey} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}

export function LandingMarkdownPreviewPage() {
  return <LandingMarkdownPage documentKey="overview" />;
}

export function LandingDoItYourselfPage() {
  return <LandingMarkdownPage documentKey="doItYourself" />;
}
