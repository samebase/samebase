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
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { parseTanStackSearch } from "@/lib/tanstackSearchParams";
import { useOptionalPublicLandingLogoLink } from "@/hooks/useOptionalPublicLandingLogoLink";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, type MouseEvent } from "react";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

type AppSidebarMetaSectionSide = "left" | "right";
type AppSidebarMetaRoutePreview = {
  baseHref: string;
  targetHref: string;
};

const APP_SIDEBAR_META_SECTION_CLASS_NAMES = {
  left: "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-end gap-3 overflow-hidden px-2 pt-3 pb-8 text-right text-sm text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
  right:
    "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-start gap-3 overflow-hidden px-2 pt-3 pb-8 text-left text-sm text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

const APP_SIDEBAR_META_VERSION_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row-reverse flex-wrap items-center justify-end gap-x-2 gap-y-1 font-mono",
  right: "flex max-w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 font-mono",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

function readAppSidebarMetaExactSearch(args: {
  currentHref: string;
  nextHref: string;
  origin: string;
}): Record<string, unknown> {
  const appOrigin = new URL(args.origin);
  const currentUrl = new URL(args.currentHref, appOrigin);
  const nextUrl = new URL(args.nextHref, appOrigin);
  const currentSearch = parseTanStackSearch(currentUrl.search);
  const nextSearch: Record<string, unknown> = parseTanStackSearch(nextUrl.search);

  for (const key of Object.keys(currentSearch)) {
    if (!(key in nextSearch)) {
      nextSearch[key] = undefined;
    }
  }

  return nextSearch;
}

function readAppSidebarMetaHash(url: URL): string {
  return url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
}

function readAppSidebarMetaAnchorHref(anchor: HTMLAnchorElement): string {
  const url = new URL(anchor.href);
  return `${url.pathname}${url.search}${url.hash}`;
}

function shouldLetBrowserHandleClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

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
  const router = useRouter();
  const publicLandingLogoLink = useOptionalPublicLandingLogoLink();
  const currentHref = location.href;
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const routePreviewRef = useRef<AppSidebarMetaRoutePreview | null>(null);

  const landingDevEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const landingDevLabel = landingDevEnabled
    ? LANDING_DEV_MODE_DISABLE_LINK_LABEL
    : LANDING_DEV_MODE_LINK_LABEL;
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

  const isLandingPage = location.pathname === "/";
  const routePreviewEnabled = side === "right";
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

  const navigateRouteHref = useCallback(
    (nextHref: string, replace: boolean, navigationCurrentHref = currentHref) => {
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const currentUrl = new URL(navigationCurrentHref, appOrigin);
      const nextUrl = new URL(nextHref, appOrigin);
      const search = () =>
        readAppSidebarMetaExactSearch({
          currentHref: navigationCurrentHref,
          nextHref,
          origin,
        });

      if (currentUrl.pathname === nextUrl.pathname) {
        return router.navigate({
          hash: readAppSidebarMetaHash(nextUrl),
          replace,
          resetScroll: false,
          search,
          to: nextUrl.pathname,
        });
      }

      return router.navigate({
        hash: readAppSidebarMetaHash(nextUrl),
        replace,
        search,
        to: nextUrl.pathname,
      });
    },
    [currentHref, router],
  );
  const currentHrefRef = useRef(currentHref);
  const navigateRouteHrefRef = useRef(navigateRouteHref);

  useEffect(() => {
    currentHrefRef.current = currentHref;
    navigateRouteHrefRef.current = navigateRouteHref;
  }, [currentHref, navigateRouteHref]);

  // If a path preview unmounts this rail before pointer leave, restore the base URL.
  useEffect(
    () => () => {
      const preview = routePreviewRef.current;
      if (preview === null) {
        return;
      }

      routePreviewRef.current = null;
      void navigateRouteHrefRef.current(preview.baseHref, true, currentHrefRef.current);
    },
    [],
  );

  const previewRouteLink = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!routePreviewEnabled) {
        return;
      }

      const targetHref = readAppSidebarMetaAnchorHref(event.currentTarget);
      if (targetHref === currentHref) {
        return;
      }

      routePreviewRef.current = {
        baseHref: routePreviewRef.current?.baseHref ?? currentHref,
        targetHref,
      };
      void navigateRouteHref(targetHref, true);
    },
    [currentHref, navigateRouteHref, routePreviewEnabled],
  );

  const restoreRoutePreview = useCallback(() => {
    const preview = routePreviewRef.current;
    if (preview === null) {
      return;
    }

    routePreviewRef.current = null;
    if (preview.baseHref !== currentHref) {
      void navigateRouteHref(preview.baseHref, true);
    }
  }, [currentHref, navigateRouteHref]);

  const commitRoutePreview = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      const preview = routePreviewRef.current;
      if (preview === null || shouldLetBrowserHandleClick(event)) {
        return;
      }

      event.preventDefault();
      routePreviewRef.current = null;

      const commitPreview = async () => {
        if (preview.baseHref !== currentHref) {
          await navigateRouteHref(preview.baseHref, true);
        }
        if (preview.targetHref !== preview.baseHref) {
          await navigateRouteHref(preview.targetHref, false, preview.baseHref);
        }
      };
      void commitPreview();
    },
    [currentHref, navigateRouteHref],
  );

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
          onClick={commitRoutePreview}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
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
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
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
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
        search={(currentSearch) =>
          applySearchPatch(currentSearch, buildToggledRootThemeModeSearch(currentSearch, "dark"))
        }
      >
        {darkModeLabel}
      </Link>
      <Link
        id="public-landing-dev-toggle"
        to={location.pathname}
        hash={location.hash}
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
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
          onClick={commitRoutePreview}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
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
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
        search={(currentSearch) => currentSearch}
        tabIndex={showLogoLink ? undefined : -1}
      >
        /logo
      </Link>
      {/* Path links live below query-param shortcuts. */}
      <Link
        to={DASHBOARD_ROUTE}
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /home
      </Link>
      {showLandingPreviewLink ? (
        <Link
          to={LANDING_MARKDOWN_PREVIEW_ROUTE}
          onClick={commitRoutePreview}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
        >
          {LANDING_MARKDOWN_PREVIEW_ROUTE}
        </Link>
      ) : null}
      <Link
        to="/terms"
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /terms
      </Link>
      <Link
        to="/privacy"
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /privacy
      </Link>

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
