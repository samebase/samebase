import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  hasSelectedAppBuildVersion,
} from "@/lib/appBuild";
import {
  LANDING_DEV_MODE_DISABLE_LINK_LABEL,
  LANDING_DEV_MODE_LINK_LABEL,
  LANDING_DEV_MODE_QUERY_PARAM,
  isLandingDevModeEnabled,
} from "@/lib/landingDevMode";
import {
  LANDING_MARKDOWN_PREVIEW_LANGUAGE_QUERY_PARAM,
  LANDING_MARKDOWN_PREVIEW_ROMANIAN_QUERY_LINK_LABEL,
  LANDING_MARKDOWN_PREVIEW_ROUTE,
} from "@/lib/landingMarkdownPreview";
import { DASHBOARD_ROUTE } from "@/lib/dashboardRoute";
import { LOCAL_STORAGE_ROUTE } from "@/lib/localStorageRoute";
import {
  FORCE_PROD_UI_MODE_LINK_LABEL,
  FORCE_PROD_UI_QUERY_PARAM,
  isBrowserProductionPublicOrigin,
  isProdUiModeActive,
} from "@/lib/prodUiMode";
import { SEARCH_RESET_LINK_LABEL, SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import {
  ROOT_THEME_DARK_MODE_DISABLE_LINK_LABEL,
  ROOT_THEME_DARK_MODE_LINK_LABEL,
  ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL,
  ROOT_THEME_LIGHT_MODE_LINK_LABEL,
  buildToggledRootThemeModeSearch,
  readRootThemeMode,
} from "@/lib/rootThemeModeSearch";
import { applySearchPatch } from "@/lib/routeSearchFlags";
import { readRootRouteSearch } from "@/lib/rootRouteSearch";
import { useOptionalPublicLandingLogoLink } from "@/hooks/useOptionalPublicLandingLogoLink";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

type AppSidebarMetaSectionSide = "left" | "right";

const APP_SIDEBAR_META_SECTION_CLASS_NAMES = {
  left: "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-end gap-3 overflow-hidden px-2 pt-3 pb-8 text-right text-sm text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
  right:
    "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-start gap-3 overflow-hidden px-2 pt-3 pb-8 text-left text-sm text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

const APP_SIDEBAR_META_VERSION_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row-reverse flex-wrap items-center justify-end gap-x-2 gap-y-1 font-mono",
  right: "flex max-w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 font-mono",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;
const HIDDEN_PUBLIC_LINK_PLACEHOLDER_CLASS_NAME =
  "pointer-events-none select-none text-background no-underline";

/**
 * Keep build metadata and public-route escape hatches on the rail edge that
 * peeks beside the main pane in the mobile workspace carousel.
 */
export function AppSidebarMetaSection({
  showLandingPreviewLink = false,
  side = "left",
}: {
  showLandingPreviewLink?: boolean;
  side?: AppSidebarMetaSectionSide;
}) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation();
  const publicLandingLogoLink = useOptionalPublicLandingLogoLink();
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const [browserShortcutsEnabled, setBrowserShortcutsEnabled] = useState(false);

  const landingDevEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const landingDevLabel = landingDevEnabled
    ? LANDING_DEV_MODE_DISABLE_LINK_LABEL
    : LANDING_DEV_MODE_LINK_LABEL;
  const prodUiEnabled = isProdUiModeActive({
    deploymentProfile: undefined,
    productionPublicOrigin: isBrowserProductionPublicOrigin(),
    search: rootRouteSearch,
  });
  const themeMode = readRootThemeMode(rootRouteSearch);
  const showSearchResetLink = location.searchStr.length > 0;
  const lightModeLabel =
    themeMode === "light"
      ? ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL
      : ROOT_THEME_LIGHT_MODE_LINK_LABEL;
  const darkModeLabel =
    themeMode === "dark"
      ? ROOT_THEME_DARK_MODE_DISABLE_LINK_LABEL
      : ROOT_THEME_DARK_MODE_LINK_LABEL;

  useEffect(() => {
    // The prod-ui shortcut depends on the deployed browser origin. Static SPA
    // prerender cannot know that origin, so render it only after hydration.
    setBrowserShortcutsEnabled(true);
  }, []);

  const isLandingPage = location.pathname === "/";
  const showLandingPreviewLanguageLink = location.pathname === LANDING_MARKDOWN_PREVIEW_ROUTE;
  const showLogoLink = isLandingPage && publicLandingLogoLink?.isLogoLinkVisible === true;
  const logoLinkClassName = showLogoLink
    ? "animate-underline-color"
    : "pointer-events-none select-none text-background no-underline";

  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);
  const normalizedRepoUrl = repoUrl ? normalizeRepoUrl(repoUrl) : "";
  const commitUrl =
    normalizedRepoUrl && appCommit !== "unknown" ? `${normalizedRepoUrl}/commit/${appCommit}` : "";

  return (
    <div
      data-testid={APP_BUILD_STATUS_BAR_TEST_ID}
      className={APP_SIDEBAR_META_SECTION_CLASS_NAMES[side]}
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
          {SEARCH_RESET_LINK_LABEL}
        </Link>
      ) : null}
      <Link
        id="public-landing-theme-light-toggle"
        to={location.pathname}
        hash={location.hash}
        search={(currentSearch) =>
          applySearchPatch(currentSearch, buildToggledRootThemeModeSearch(currentSearch, "light"))
        }
      >
        {lightModeLabel}
      </Link>
      <Link
        id="public-landing-theme-dark-toggle"
        to={location.pathname}
        hash={location.hash}
        search={(currentSearch) =>
          applySearchPatch(currentSearch, buildToggledRootThemeModeSearch(currentSearch, "dark"))
        }
      >
        {darkModeLabel}
      </Link>
      {browserShortcutsEnabled && !prodUiEnabled ? (
        <Link
          id="public-landing-prod-ui-toggle"
          to={location.pathname}
          hash={location.hash}
          search={(currentSearch) => ({
            ...currentSearch,
            [FORCE_PROD_UI_QUERY_PARAM]: true,
          })}
        >
          {FORCE_PROD_UI_MODE_LINK_LABEL}
        </Link>
      ) : null}
      <Link
        id="public-landing-dev-toggle"
        to={location.pathname}
        hash={location.hash}
        search={(currentSearch) =>
          applySearchPatch(currentSearch, {
            [LANDING_DEV_MODE_QUERY_PARAM]: landingDevEnabled ? null : true,
          })
        }
      >
        {landingDevLabel}
      </Link>
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

      {/* Keep query-param shortcuts visually separate so path links stay put. */}
      <div aria-hidden="true" className="h-3" />

      {/* Reserve the easter-egg row across routes so path links never reflow. */}
      <Link
        to="/logo"
        aria-hidden={showLogoLink ? undefined : true}
        className={logoLinkClassName}
        search={(currentSearch) => currentSearch}
        tabIndex={showLogoLink ? undefined : -1}
      >
        /logo
      </Link>
      {/* From /?dev&prod-ui, /home keeps dev but drops the preview-only prod-ui flag. */}
      <Link to={DASHBOARD_ROUTE}>/home</Link>
      {side === "right" ? (
        <Link
          id="public-local-storage-route-link"
          to={LOCAL_STORAGE_ROUTE}
          aria-hidden={landingDevEnabled ? undefined : true}
          className={landingDevEnabled ? undefined : HIDDEN_PUBLIC_LINK_PLACEHOLDER_CLASS_NAME}
          tabIndex={landingDevEnabled ? undefined : -1}
        >
          {LOCAL_STORAGE_ROUTE}
        </Link>
      ) : null}
      {showLandingPreviewLink ? (
        <Link to={LANDING_MARKDOWN_PREVIEW_ROUTE}>{LANDING_MARKDOWN_PREVIEW_ROUTE}</Link>
      ) : null}
      <Link to="/terms">/terms</Link>
      <Link to="/privacy">/privacy</Link>

      <div className={APP_SIDEBAR_META_VERSION_CLASS_NAMES[side]}>
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

            event.clipboardData.setData("text/plain", `[${commitLabel}](${commitUrl})`);
            event.preventDefault();
          }}
        >
          {commitLabel}
        </a>
      </div>
    </div>
  );
}
