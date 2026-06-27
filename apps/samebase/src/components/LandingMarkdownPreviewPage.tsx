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
  LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
  type LandingMarkdownPreviewLanguage,
} from "@/routeSearch/landingPreview";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";
import landingPreviewRomanianMarkdown from "@/content/landing-preview.ro.md?raw";
import { useLocation } from "@tanstack/react-router";
import { useLayoutEffect } from "react";

const LANDING_MARKDOWN_BY_LANGUAGE = {
  en: landingPreviewMarkdown,
  ro: landingPreviewRomanianMarkdown,
} satisfies Record<LandingMarkdownPreviewLanguage, string>;

type LandingPreviewHelpCenter = {
  items: FileTreeItem[];
  selectedFile: string;
};

function createLandingPreviewHelpCenter({
  buildManualLabel,
  overviewLabel,
}: {
  buildManualLabel: string;
  overviewLabel: string;
}): LandingPreviewHelpCenter {
  const overviewPath = "01 Overview.md";
  const buildManualPath = "02 Build it yourself.md";

  return {
    items: [
      {
        label: overviewLabel,
        originalPath: overviewPath,
        path: overviewPath,
        type: "blob",
      },
      {
        label: buildManualLabel,
        originalPath: buildManualPath,
        path: buildManualPath,
        type: "blob",
      },
    ],
    selectedFile: overviewPath,
  };
}

const LANDING_PREVIEW_HELP_CENTER_BY_LANGUAGE = {
  en: createLandingPreviewHelpCenter({
    buildManualLabel: "Build it yourself",
    overviewLabel: "Overview",
  }),
  ro: createLandingPreviewHelpCenter({
    buildManualLabel: "Manual",
    overviewLabel: "Prezentare",
  }),
} satisfies Record<LandingMarkdownPreviewLanguage, LandingPreviewHelpCenter>;
const LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE = {
  leftDesktopOpen: false,
  rightDesktopOpen: false,
} as const;

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

function LandingMarkdownPreviewSidebar({ language }: { language: LandingMarkdownPreviewLanguage }) {
  const landingPreviewHelpCenter = LANDING_PREVIEW_HELP_CENTER_BY_LANGUAGE[language];

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
      />
    </nav>
  );
}

function LandingMarkdownPreviewDocument({
  language,
}: {
  language: LandingMarkdownPreviewLanguage;
}) {
  return (
    <MarkdownLandingDocument
      className="min-h-full shrink-0 pb-[calc(100svh-4rem)] lg:pb-[calc(100svh-4rem)]"
      dataTestId={LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}
      markdown={LANDING_MARKDOWN_BY_LANGUAGE[language]}
    />
  );
}

export function LandingMarkdownPreviewPage({
  language = LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE,
}: {
  language?: LandingMarkdownPreviewLanguage;
}) {
  return (
    <AppWorkspaceRouteChrome
      left={{ content: <LandingMarkdownPreviewSidebar language={language} /> }}
      sidebarDefaultState={LANDING_PREVIEW_SIDEBAR_DEFAULT_STATE}
    >
      <LandingMarkdownPreviewPaneUrlSync />
      <div data-testid={LANDING_MARKDOWN_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingMarkdownPreviewDocument language={language} />
      </div>
    </AppWorkspaceRouteChrome>
  );
}
