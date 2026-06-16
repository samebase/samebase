import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  hasSelectedAppBuildVersion,
} from "@/lib/appBuild";
import { LANDING_DEV_MODE_QUERY_PARAM, isLandingDevModeEnabled } from "@/lib/landingDevMode";
import {
  LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM,
  LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
  LANDING_MARKDOWN_PREVIEW_ROUTE,
} from "@/lib/landingMarkdownPreview";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { buildToggledRootThemeModeSearch, readRootThemeMode } from "@/lib/rootThemeModeSearch";
import { applySearchPatch, formatRouteSearchPresenceFlagLinkLabel } from "@/lib/routeSearchFlags";
import { readRootRouteSearch } from "@/lib/rootRouteSearch";
import { noterBuildConfig } from "@/lib/noterBuildConfig";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

type AppSidebarMetaLinkAlignment = "left" | "right";

const APP_SIDEBAR_META_SECTION_CLASS_NAMES = {
  left: "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-start gap-3 overflow-hidden px-2 pt-3 pb-8 text-left text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
  right:
    "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-end gap-3 overflow-hidden px-2 pt-3 pb-8 text-right text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
} as const satisfies Record<AppSidebarMetaLinkAlignment, string>;

const APP_SIDEBAR_META_VERSION_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 font-mono",
  right:
    "flex max-w-full min-w-0 flex-row-reverse flex-wrap items-center justify-end gap-x-2 gap-y-1 font-mono",
} as const satisfies Record<AppSidebarMetaLinkAlignment, string>;

const APP_SIDEBAR_META_QUERY_LINK_ROW_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row items-baseline justify-start",
  right: "flex max-w-full min-w-0 flex-row items-baseline justify-end",
} as const satisfies Record<AppSidebarMetaLinkAlignment, string>;

const APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME =
  "min-w-0 max-w-full line-clamp-2 [overflow-wrap:anywhere]";

const APP_SIDEBAR_META_QUERY_SUFFIX_CLASS_NAMES = {
  active: "pointer-events-none inline-block w-[1ch] shrink-0 select-none",
  inactive: "pointer-events-none invisible inline-block w-[1ch] shrink-0 select-none",
} as const;

function AppSidebarMetaQueryLinkRow({
  active,
  children,
  linkAlignment,
  suffixTestId,
}: {
  active: boolean;
  children: ReactNode;
  linkAlignment: AppSidebarMetaLinkAlignment;
  suffixTestId: string;
}) {
  return (
    <span className={APP_SIDEBAR_META_QUERY_LINK_ROW_CLASS_NAMES[linkAlignment]}>
      {children}
      <span
        aria-hidden="true"
        data-testid={suffixTestId}
        className={
          active
            ? APP_SIDEBAR_META_QUERY_SUFFIX_CLASS_NAMES.active
            : APP_SIDEBAR_META_QUERY_SUFFIX_CLASS_NAMES.inactive
        }
      >
        -
      </span>
    </span>
  );
}

/**
 * SSG emits the same root HTML for every query string, while hydration renders
 * against the browser's real URL. Query-derived optional nodes must therefore
 * wait until after hydration; otherwise the first client tree contains DOM
 * children that the static HTML could not contain.
 */
function useHasHydrated() {
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  return hasHydrated;
}

/**
 * Keep build metadata and public-route escape hatches on the rail edge that
 * peeks beside the main pane in the mobile workspace carousel.
 */
export function AppSidebarMetaSection({
  linkAlignment = "right",
}: {
  linkAlignment?: AppSidebarMetaLinkAlignment;
}) {
  const { appCommit, appCommitNumber, appRepoUrl } = noterBuildConfig;
  const location = useLocation();
  const rootRouteSearch = readRootRouteSearch(location.searchStr);

  const hasHydrated = useHasHydrated();
  const landingDevEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const themeMode = readRootThemeMode(rootRouteSearch);
  const showSearchResetLink = hasHydrated && location.searchStr.length > 0;

  const showLandingPreviewLanguageLink = location.pathname === LANDING_MARKDOWN_PREVIEW_ROUTE;

  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);
  const normalizedRepoUrl = normalizeRepoUrl(appRepoUrl);
  const commitUrl =
    normalizedRepoUrl && appCommit !== "unknown" ? `${normalizedRepoUrl}/commit/${appCommit}` : "";

  return (
    <div
      data-testid={APP_BUILD_STATUS_BAR_TEST_ID}
      className={APP_SIDEBAR_META_SECTION_CLASS_NAMES[linkAlignment]}
    >
      {showSearchResetLink ? (
        <Link
          id="public-landing-search-reset"
          to={location.pathname}
          hash={location.hash}
          search={() => ({
            [SEARCH_RESET_QUERY_PARAM]: true as const,
          })}
        >
          {formatRouteSearchPresenceFlagLinkLabel(SEARCH_RESET_QUERY_PARAM, true)}
        </Link>
      ) : null}
      <AppSidebarMetaQueryLinkRow
        active={themeMode === "light"}
        linkAlignment={linkAlignment}
        suffixTestId="public-landing-theme-light-toggle-suffix"
      >
        <Link
          id="public-landing-theme-light-toggle"
          className={APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME}
          aria-label={formatRouteSearchPresenceFlagLinkLabel("light", themeMode !== "light")}
          to={location.pathname}
          hash={location.hash}
          search={() =>
            applySearchPatch(
              rootRouteSearch,
              buildToggledRootThemeModeSearch(rootRouteSearch, "light"),
            )
          }
        >
          {formatRouteSearchPresenceFlagLinkLabel("light", true)}
        </Link>
      </AppSidebarMetaQueryLinkRow>
      <AppSidebarMetaQueryLinkRow
        active={themeMode === "dark"}
        linkAlignment={linkAlignment}
        suffixTestId="public-landing-theme-dark-toggle-suffix"
      >
        <Link
          id="public-landing-theme-dark-toggle"
          className={APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME}
          aria-label={formatRouteSearchPresenceFlagLinkLabel("dark", themeMode !== "dark")}
          to={location.pathname}
          hash={location.hash}
          search={() =>
            applySearchPatch(
              rootRouteSearch,
              buildToggledRootThemeModeSearch(rootRouteSearch, "dark"),
            )
          }
        >
          {formatRouteSearchPresenceFlagLinkLabel("dark", true)}
        </Link>
      </AppSidebarMetaQueryLinkRow>
      <AppSidebarMetaQueryLinkRow
        active={landingDevEnabled}
        linkAlignment={linkAlignment}
        suffixTestId="public-landing-dev-toggle-suffix"
      >
        <Link
          id="public-landing-dev-toggle"
          className={APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME}
          aria-label={formatRouteSearchPresenceFlagLinkLabel(
            LANDING_DEV_MODE_QUERY_PARAM,
            !landingDevEnabled,
          )}
          to={location.pathname}
          hash={location.hash}
          search={() =>
            applySearchPatch(rootRouteSearch, {
              [LANDING_DEV_MODE_QUERY_PARAM]: isLandingDevModeEnabled(rootRouteSearch)
                ? null
                : true,
            })
          }
        >
          {formatRouteSearchPresenceFlagLinkLabel(LANDING_DEV_MODE_QUERY_PARAM, true)}
        </Link>
      </AppSidebarMetaQueryLinkRow>
      {showLandingPreviewLanguageLink ? (
        <Link
          id="landing-preview-romanian-toggle"
          to={location.pathname}
          hash={location.hash}
          search={(currentSearch) => ({
            ...currentSearch,
            [LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM]: "ro",
          })}
        >
          {LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL}
        </Link>
      ) : null}

      {/* Keep query-param shortcuts visually separate from path links. */}
      <div aria-hidden="true" className="h-3" />

      {/* Path links live below query-param shortcuts. */}
      <Link to={DASHBOARD_ROUTE}>/home</Link>
      <Link to="/terms">/terms</Link>
      <Link to="/privacy">/privacy</Link>

      <div className={APP_SIDEBAR_META_VERSION_CLASS_NAMES[linkAlignment]}>
        <span className="shrink-0" data-testid={APP_BUILD_VERSION_TEST_ID}>
          {buildVersionLabel}
        </span>

        <a
          data-testid={APP_BUILD_COMMIT_LINK_TEST_ID}
          className="min-w-0 max-w-full truncate select-text"
          href={commitUrl}
          target="_blank"
          rel="noreferrer noopener"
          draggable={false}
          title={appCommit}
          onDragStart={(event) => {
            event.preventDefault();
          }}
          onClick={(event) => {
            if (hasSelectedAppBuildVersion(event.currentTarget)) {
              event.preventDefault();
            }
          }}
          onCopy={(event) => {
            if (!commitUrl || !hasSelectedAppBuildVersion(event.currentTarget)) {
              return;
            }

            event.clipboardData.setData("text/plain", `[${buildVersionLabel}](${commitUrl})`);
            event.preventDefault();
          }}
        >
          {commitLabel}
        </a>
      </div>
    </div>
  );
}
