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
import { routePreviewLinkInteractionClassName } from "@/components/routePreviewLinkStyles";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, type MouseEvent, type ReactNode } from "react";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

type AppSidebarMetaSectionSide = "left" | "right";
type AppSidebarMetaRoutePreview = {
  baseHref: string;
  targetHref: string;
};

const APP_SIDEBAR_META_SECTION_CLASS_NAMES = {
  left: "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-end gap-3 overflow-hidden px-2 pt-3 pb-8 text-right text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
  right:
    "vault-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-start gap-3 overflow-hidden px-2 pt-3 pb-8 text-left text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

const APP_SIDEBAR_META_VERSION_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row-reverse flex-wrap items-center justify-end gap-x-2 gap-y-1 font-mono",
  right: "flex max-w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 font-mono",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

const APP_SIDEBAR_META_QUERY_LINK_ROW_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row items-baseline justify-end",
  right: "flex max-w-full min-w-0 flex-row items-baseline justify-start",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

const APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME =
  "min-w-0 max-w-full line-clamp-2 [overflow-wrap:anywhere]";

const APP_SIDEBAR_META_QUERY_SUFFIX_CLASS_NAMES = {
  active: "pointer-events-none inline-block w-[1ch] shrink-0 select-none",
  inactive: "pointer-events-none invisible inline-block w-[1ch] shrink-0 select-none",
} as const;

function AppSidebarMetaQueryLinkRow({
  active,
  children,
  side,
  suffixTestId,
}: {
  active: boolean;
  children: ReactNode;
  side: AppSidebarMetaSectionSide;
  suffixTestId: string;
}) {
  return (
    <span className={APP_SIDEBAR_META_QUERY_LINK_ROW_CLASS_NAMES[side]}>
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

function isAppSidebarMetaSearchResetHref(href: string): boolean {
  const origin = readIsomorphicOrigin();
  const appOrigin = new URL(origin);
  const url = new URL(href, appOrigin);

  return SEARCH_RESET_QUERY_PARAM in parseTanStackSearch(url.search);
}

/**
 * Keep build metadata and public-route escape hatches on the rail edge that
 * peeks beside the main pane in the mobile workspace carousel.
 */
export function AppSidebarMetaSection({ side = "left" }: { side?: AppSidebarMetaSectionSide }) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const rootRouteSearch = readRootRouteSearch(location.searchStr);
  const routePreviewRef = useRef<AppSidebarMetaRoutePreview | null>(null);

  const landingDevEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const landingDevLabel = landingDevEnabled
    ? LANDING_DEV_MODE_DISABLE_LINK_LABEL
    : LANDING_DEV_MODE_LINK_LABEL;
  const themeMode = readRootThemeMode(rootRouteSearch);
  const lightModeActive = themeMode === "light";
  const darkModeActive = themeMode === "dark";
  const routePreview = routePreviewRef.current;
  const showSearchResetLink =
    location.searchStr.length > 0 ||
    (routePreview ? isAppSidebarMetaSearchResetHref(routePreview.targetHref) : false);
  const lightModeLabel = lightModeActive
    ? ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL
    : ROOT_THEME_LIGHT_MODE_LINK_LABEL;
  const darkModeLabel = darkModeActive
    ? ROOT_THEME_DARK_MODE_DISABLE_LINK_LABEL
    : ROOT_THEME_DARK_MODE_LINK_LABEL;

  const routePreviewEnabled = side === "right";
  const showLandingPreviewLanguageLink = location.pathname === LANDING_MARKDOWN_PREVIEW_ROUTE;

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
          className={routePreviewLinkInteractionClassName}
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
      <AppSidebarMetaQueryLinkRow
        active={lightModeActive}
        side={side}
        suffixTestId="public-landing-theme-light-toggle-suffix"
      >
        <Link
          id="public-landing-theme-light-toggle"
          className={`${routePreviewLinkInteractionClassName} ${APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME}`}
          aria-label={lightModeLabel}
          to={location.pathname}
          hash={location.hash}
          onClick={commitRoutePreview}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
          search={(currentSearch) =>
            applySearchPatch(currentSearch, buildToggledRootThemeModeSearch(currentSearch, "light"))
          }
        >
          {ROOT_THEME_LIGHT_MODE_LINK_LABEL}
        </Link>
      </AppSidebarMetaQueryLinkRow>
      <AppSidebarMetaQueryLinkRow
        active={darkModeActive}
        side={side}
        suffixTestId="public-landing-theme-dark-toggle-suffix"
      >
        <Link
          id="public-landing-theme-dark-toggle"
          className={`${routePreviewLinkInteractionClassName} ${APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME}`}
          aria-label={darkModeLabel}
          to={location.pathname}
          hash={location.hash}
          onClick={commitRoutePreview}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
          search={(currentSearch) =>
            applySearchPatch(currentSearch, buildToggledRootThemeModeSearch(currentSearch, "dark"))
          }
        >
          {ROOT_THEME_DARK_MODE_LINK_LABEL}
        </Link>
      </AppSidebarMetaQueryLinkRow>
      <AppSidebarMetaQueryLinkRow
        active={landingDevEnabled}
        side={side}
        suffixTestId="public-landing-dev-toggle-suffix"
      >
        <Link
          id="public-landing-dev-toggle"
          className={`${routePreviewLinkInteractionClassName} ${APP_SIDEBAR_META_QUERY_LINK_LAYOUT_CLASS_NAME}`}
          aria-label={landingDevLabel}
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
          {LANDING_DEV_MODE_LINK_LABEL}
        </Link>
      </AppSidebarMetaQueryLinkRow>
      {showLandingPreviewLanguageLink ? (
        <Link
          id="landing-preview-romanian-toggle"
          className={routePreviewLinkInteractionClassName}
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

      {/* Keep query-param shortcuts visually separate from path links. */}
      <div aria-hidden="true" className="h-3" />

      {/* Path links live below query-param shortcuts. */}
      <Link
        className={routePreviewLinkInteractionClassName}
        to={DASHBOARD_ROUTE}
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /home
      </Link>
      <Link
        className={routePreviewLinkInteractionClassName}
        to="/terms"
        onClick={commitRoutePreview}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /terms
      </Link>
      <Link
        className={routePreviewLinkInteractionClassName}
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
