import { PublicLayoutShell } from "@/Layout";
import { FileTree, type FileTreeItem } from "@/components/FileTree";
import { MarkdownLandingDocument } from "@/components/MarkdownLandingDocument";
import {
  useWorkspacePaneState,
  type WorkspaceMobilePane,
} from "@/components/workspace-layout-v2/WorkspacePaneRuntime";
import type { FolderExpansionState } from "@/lib/fileTreeState";
import {
  getLandingMarkdownHeadings,
  type LandingMarkdownHeading,
} from "@/lib/landingMarkdownHeadings";
import {
  LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_DEFAULT_LANGUAGE,
  LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID,
  LANDING_MARKDOWN_PREVIEW_TEST_ID,
  type LandingMarkdownPreviewLanguage,
} from "@/lib/landingMarkdownPreview";
import { buildPathWithTanStackSearch } from "@/lib/tanstackSearchParams";
import landingPreviewMarkdown from "@/content/landing-preview.md?raw";
import landingPreviewRomanianMarkdown from "@/content/landing-preview.ro.md?raw";
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";

const LANDING_MARKDOWN_BY_LANGUAGE = {
  en: landingPreviewMarkdown,
  ro: landingPreviewRomanianMarkdown,
} satisfies Record<LandingMarkdownPreviewLanguage, string>;

const LANDING_MARKDOWN_HEADINGS_BY_LANGUAGE = {
  en: getLandingMarkdownHeadings(landingPreviewMarkdown),
  ro: getLandingMarkdownHeadings(landingPreviewRomanianMarkdown),
} satisfies Record<LandingMarkdownPreviewLanguage, ReturnType<typeof getLandingMarkdownHeadings>>;

const LANDING_PREVIEW_HELP_CENTER_START_FOLDER = {
  label: "Start here",
  path: "01 Start here",
} as const;
const LANDING_PREVIEW_HELP_CENTER_DEPLOY_FOLDER = {
  label: "Deploy",
  path: "02 Deploy",
} as const;
const LANDING_PREVIEW_HELP_CENTER_AFTER_LAUNCH_FOLDER = {
  label: "After launch",
  path: "03 After launch",
} as const;
const LANDING_PREVIEW_HELP_CENTER_NOTER_FOLDER = {
  label: "noter.md",
  path: "04 noter.md",
} as const;
const LANDING_PREVIEW_HELP_CENTER_FOLDERS = [
  LANDING_PREVIEW_HELP_CENTER_START_FOLDER,
  LANDING_PREVIEW_HELP_CENTER_DEPLOY_FOLDER,
  LANDING_PREVIEW_HELP_CENTER_AFTER_LAUNCH_FOLDER,
  LANDING_PREVIEW_HELP_CENTER_NOTER_FOLDER,
] as const;

type LandingPreviewHelpCenterFolder = (typeof LANDING_PREVIEW_HELP_CENTER_FOLDERS)[number];

type LandingPreviewHelpCenter = {
  items: FileTreeItem[];
  folderExpansionStates: FolderExpansionState[];
  pathByHeadingId: Partial<Record<string, string>>;
  headingByPath: Partial<Record<string, LandingMarkdownHeading>>;
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

function getLandingPreviewStepNumber(heading: LandingMarkdownHeading) {
  const stepMatch = heading.text.match(/^(\d+):/);
  return stepMatch === null ? null : Number(stepMatch[1]);
}

function getLandingPreviewHelpCenterFolder(
  heading: LandingMarkdownHeading,
): LandingPreviewHelpCenterFolder {
  if (heading.level === 1) {
    return LANDING_PREVIEW_HELP_CENTER_START_FOLDER;
  }

  const stepNumber = getLandingPreviewStepNumber(heading);
  if (stepNumber !== null && stepNumber <= 5) {
    return LANDING_PREVIEW_HELP_CENTER_DEPLOY_FOLDER;
  }

  if (stepNumber !== null && stepNumber <= 8) {
    return LANDING_PREVIEW_HELP_CENTER_AFTER_LAUNCH_FOLDER;
  }

  return LANDING_PREVIEW_HELP_CENTER_NOTER_FOLDER;
}

function getLandingPreviewHelpCenterFileName(heading: LandingMarkdownHeading) {
  if (heading.level === 1) {
    return "README.md";
  }

  const stepNumber = getLandingPreviewStepNumber(heading);
  const order = String(stepNumber ?? heading.line).padStart(2, "0");
  const safeHeadingText = heading.text.replace(/\//g, "-");
  return `${order} ${safeHeadingText}.md`;
}

function getLandingPreviewHelpCenter({
  headings,
  includeElementIds,
}: {
  headings: LandingMarkdownHeading[];
  includeElementIds: boolean;
}): LandingPreviewHelpCenter {
  const items: FileTreeItem[] = LANDING_PREVIEW_HELP_CENTER_FOLDERS.map((folder) => ({
    label: folder.label,
    originalPath: folder.path,
    path: folder.path,
    type: "tree",
  }));
  const pathByHeadingId: Partial<Record<string, string>> = {};
  const headingByPath: Partial<Record<string, LandingMarkdownHeading>> = {};

  for (const heading of headings) {
    const folder = getLandingPreviewHelpCenterFolder(heading);
    const path = `${folder.path}/${getLandingPreviewHelpCenterFileName(heading)}`;

    pathByHeadingId[heading.id] = path;
    headingByPath[path] = heading;
    items.push({
      elementId: includeElementIds ? heading.id : undefined,
      href: heading.href,
      label: heading.text,
      originalPath: path,
      path,
      type: "blob",
    });
  }

  return {
    folderExpansionStates: LANDING_PREVIEW_HELP_CENTER_FOLDERS.map((folder) => ({
      folderPath: folder.path,
      isExpanded: true,
    })),
    headingByPath,
    items,
    pathByHeadingId,
  };
}

function getLandingPreviewSelectedHelpCenterPath(pathByHeadingId: Partial<Record<string, string>>) {
  if (typeof window === "undefined") {
    return undefined;
  }

  const headingId = window.location.hash.replace(/^#/, "");
  return pathByHeadingId[headingId];
}

function buildLandingPreviewPaneHashPath({
  hash,
  mobilePane,
}: {
  hash: string;
  mobilePane: WorkspaceMobilePane | null;
}) {
  const searchParams = new URLSearchParams(window.location.search);
  if (mobilePane !== null) {
    if (mobilePane === "left") {
      searchParams.set("left", "");
    } else {
      searchParams.delete("left");
    }

    if (mobilePane === "right") {
      searchParams.set("right", "");
    } else {
      searchParams.delete("right");
    }
  }

  return buildPathWithTanStackSearch({
    hash,
    pathname: window.location.pathname,
    search: Object.fromEntries(searchParams.entries()),
  });
}

function getLandingPreviewDefaultMobilePane(): WorkspaceMobilePane {
  if (typeof window === "undefined") {
    return "main";
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("left")) {
    return "left";
  }
  if (searchParams.has("right")) {
    return "right";
  }

  return "main";
}

function getLandingPreviewArticleHeading(headingId: string) {
  const article = document.querySelector<HTMLElement>(
    `[data-testid="${LANDING_MARKDOWN_PREVIEW_ARTICLE_TEST_ID}"]`,
  );
  return (
    article?.querySelector<HTMLElement>(`[data-landing-heading-id="${CSS.escape(headingId)}"]`) ??
    null
  );
}

function getLandingPreviewMobileCarousel() {
  return document.querySelector<HTMLElement>(
    '[data-workspace-layout-v2="mobile"] [data-testid="workspace-layout-v2-pane-main"]',
  );
}

function getVerticalScrollContainer(target: HTMLElement) {
  let node = target.parentElement;
  while (node !== null) {
    const style = window.getComputedStyle(node);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }

    node = node.parentElement;
  }

  return document.scrollingElement instanceof HTMLElement
    ? document.scrollingElement
    : document.documentElement;
}

function scrollHeadingWithinCurrentPane(target: HTMLElement) {
  const scrollContainer = getVerticalScrollContainer(target);
  const targetBounds = target.getBoundingClientRect();
  const containerBounds =
    scrollContainer === document.documentElement
      ? { top: 0 }
      : scrollContainer.getBoundingClientRect();
  const scrollMarginTop = Number.parseFloat(window.getComputedStyle(target).scrollMarginTop) || 0;

  scrollContainer.scrollTop += targetBounds.top - containerBounds.top - scrollMarginTop;
}

function LandingMarkdownPreviewSidebar({ language }: { language: LandingMarkdownPreviewLanguage }) {
  const { isMobile, mobilePane } = useWorkspacePaneState();
  const landingPreviewHeadings = LANDING_MARKDOWN_HEADINGS_BY_LANGUAGE[language];
  const landingPreviewHelpCenter = useMemo(
    () =>
      getLandingPreviewHelpCenter({
        headings: landingPreviewHeadings,
        includeElementIds: isMobile,
      }),
    [isMobile, landingPreviewHeadings],
  );
  const [folderExpansionStates, setFolderExpansionStates] = useState(
    () => landingPreviewHelpCenter.folderExpansionStates,
  );
  const [selectedFile, setSelectedFile] = useState(() =>
    getLandingPreviewSelectedHelpCenterPath(landingPreviewHelpCenter.pathByHeadingId),
  );

  useEffect(() => {
    function syncSelectedFileWithLocation() {
      setSelectedFile(
        getLandingPreviewSelectedHelpCenterPath(landingPreviewHelpCenter.pathByHeadingId),
      );
    }

    window.addEventListener("hashchange", syncSelectedFileWithLocation);
    window.addEventListener("popstate", syncSelectedFileWithLocation);
    syncSelectedFileWithLocation();

    return () => {
      window.removeEventListener("hashchange", syncSelectedFileWithLocation);
      window.removeEventListener("popstate", syncSelectedFileWithLocation);
    };
  }, [landingPreviewHelpCenter.pathByHeadingId]);

  return (
    <nav
      aria-label="Landing preview sections"
      data-testid={LANDING_MARKDOWN_PREVIEW_SIDEBAR_TEST_ID}
      className="flex min-h-full flex-col px-1 py-2 text-sm"
    >
      <FileTree
        items={landingPreviewHelpCenter.items}
        selectedFile={selectedFile}
        folderExpansionStates={folderExpansionStates}
        onFolderToggle={(folderPath, isExpanded) => {
          setFolderExpansionStates((currentStates) => {
            const existingStateIndex = currentStates.findIndex(
              (state) => state.folderPath === folderPath,
            );

            if (existingStateIndex === -1) {
              return [
                ...currentStates,
                {
                  folderPath,
                  isExpanded,
                },
              ];
            }

            return currentStates.map((state, index) =>
              index === existingStateIndex
                ? {
                    folderPath,
                    isExpanded,
                  }
                : state,
            );
          });
        }}
        onFileSelect={(path, _status, event) => {
          const heading = landingPreviewHelpCenter.headingByPath[path];
          if (heading === undefined || event === undefined || shouldUseNativeLinkClick(event)) {
            return;
          }

          const target = getLandingPreviewArticleHeading(heading.id);
          if (target === null) {
            return;
          }

          event.preventDefault();
          setSelectedFile(path);
          const mobileCarousel = isMobile ? getLandingPreviewMobileCarousel() : null;
          const mobileCarouselScrollLeft = mobileCarousel?.scrollLeft ?? 0;
          window.history.pushState(
            window.history.state,
            "",
            buildLandingPreviewPaneHashPath({
              hash: heading.href,
              mobilePane: isMobile ? mobilePane : null,
            }),
          );
          if (mobileCarousel !== null) {
            mobileCarousel.scrollLeft = mobileCarouselScrollLeft;
          }
          scrollHeadingWithinCurrentPane(target);
        }}
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
    <PublicLayoutShell
      defaultMobilePane={getLandingPreviewDefaultMobilePane()}
      left={{ content: <LandingMarkdownPreviewSidebar language={language} /> }}
    >
      <div data-testid={LANDING_MARKDOWN_PREVIEW_TEST_ID} className="flex min-h-0 flex-1 flex-col">
        <LandingMarkdownPreviewDocument language={language} />
      </div>
    </PublicLayoutShell>
  );
}
