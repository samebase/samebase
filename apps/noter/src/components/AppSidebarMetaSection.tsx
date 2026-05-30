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
  type RootThemeModeSearchKey,
} from "@/lib/rootThemeModeSearch";
import { applySearchPatch } from "@/lib/routeSearchFlags";
import { readRootRouteSearch } from "@/lib/rootRouteSearch";
import { readIsomorphicOrigin } from "@/lib/isomorphic";
import { noterBuildConfig } from "@/lib/noterBuildConfig";
import { parseTanStackSearch, stringifyTanStackSearch } from "@/lib/tanstackSearchParams";
import { routePreviewLinkInteractionClassName } from "@/components/routePreviewLinkStyles";
import { Link, useLocation, useRouter } from "@tanstack/react-router";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

type AppSidebarMetaSectionSide = "left" | "right";
type AppSidebarMetaRoutePreview = {
  baseHref: string;
  targetHref: string;
};

type AppSidebarMetaRoutePreviewStore = {
  current: AppSidebarMetaRoutePreview | null;
};

const AppSidebarMetaRoutePreviewContext = createContext<AppSidebarMetaRoutePreviewStore | null>(
  null,
);

export function AppSidebarMetaRoutePreviewProvider({ children }: { children: ReactNode }) {
  const routePreviewRef = useRef<AppSidebarMetaRoutePreview | null>(null);

  return (
    <AppSidebarMetaRoutePreviewContext.Provider value={routePreviewRef}>
      {children}
    </AppSidebarMetaRoutePreviewContext.Provider>
  );
}

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
  const { appCommit, appCommitNumber, appRepoUrl } = noterBuildConfig;
  const location = useLocation();
  const router = useRouter();
  const currentHref = location.href;
  const currentHrefRef = useRef(currentHref);
  const optimisticHrefRef = useRef<string | null>(null);
  const routeNavigationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [, setRoutePreviewRenderVersion] = useState(0);
  const sharedRoutePreviewRef = useContext(AppSidebarMetaRoutePreviewContext);
  const localRoutePreviewRef = useRef<AppSidebarMetaRoutePreview | null>(null);
  const routePreviewRef = sharedRoutePreviewRef ?? localRoutePreviewRef;
  const routePreviewEnabled = side === "right";
  const routePreview = routePreviewEnabled ? routePreviewRef.current : null;
  const routePreviewBaseSearch =
    routePreview === null
      ? location.searchStr
      : new URL(routePreview.baseHref, new URL(readIsomorphicOrigin())).search;
  const rootRouteSearch = readRootRouteSearch(routePreviewBaseSearch);

  const landingDevEnabled = isLandingDevModeEnabled(rootRouteSearch);
  const landingDevLabel = landingDevEnabled
    ? LANDING_DEV_MODE_DISABLE_LINK_LABEL
    : LANDING_DEV_MODE_LINK_LABEL;
  const themeMode = readRootThemeMode(rootRouteSearch);
  const lightModeActive = themeMode === "light";
  const darkModeActive = themeMode === "dark";
  const showSearchResetLink =
    routePreviewBaseSearch.length > 0 ||
    (routePreview ? isAppSidebarMetaSearchResetHref(routePreview.targetHref) : false);
  const lightModeLabel = lightModeActive
    ? ROOT_THEME_LIGHT_MODE_DISABLE_LINK_LABEL
    : ROOT_THEME_LIGHT_MODE_LINK_LABEL;
  const darkModeLabel = darkModeActive
    ? ROOT_THEME_DARK_MODE_DISABLE_LINK_LABEL
    : ROOT_THEME_DARK_MODE_LINK_LABEL;

  const showLandingPreviewLanguageLink = location.pathname === LANDING_MARKDOWN_PREVIEW_ROUTE;

  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);
  const normalizedRepoUrl = normalizeRepoUrl(appRepoUrl);
  const commitUrl =
    normalizedRepoUrl && appCommit !== "unknown" ? `${normalizedRepoUrl}/commit/${appCommit}` : "";

  useLayoutEffect(() => {
    const latestLocationHref = router.latestLocation.href;
    if (optimisticHrefRef.current === latestLocationHref) {
      optimisticHrefRef.current = null;
    }
    if (optimisticHrefRef.current !== null) {
      return;
    }
    currentHrefRef.current = latestLocationHref;
  }, [currentHref, router]);

  const navigateRouteHref = useCallback(
    (nextHref: string, replace: boolean, navigationCurrentHref = currentHrefRef.current) => {
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const nextUrl = new URL(nextHref, appOrigin);
      const nextRouteHref = `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
      currentHrefRef.current = nextRouteHref;
      optimisticHrefRef.current = nextRouteHref;

      const runNavigation = async () => {
        const currentUrl = new URL(navigationCurrentHref, appOrigin);
        const search = () =>
          readAppSidebarMetaExactSearch({
            currentHref: navigationCurrentHref,
            nextHref,
            origin,
          });

        if (currentUrl.pathname === nextUrl.pathname) {
          await router.navigate({
            hash: readAppSidebarMetaHash(nextUrl),
            replace,
            resetScroll: false,
            search,
            to: nextUrl.pathname,
          });
        } else {
          await router.navigate({
            hash: readAppSidebarMetaHash(nextUrl),
            replace,
            search,
            to: nextUrl.pathname,
          });
        }

        if (optimisticHrefRef.current === nextRouteHref) {
          currentHrefRef.current = router.latestLocation.href;
          optimisticHrefRef.current = null;
        }
      };
      const navigation = routeNavigationQueueRef.current.then(runNavigation, runNavigation);
      routeNavigationQueueRef.current = navigation.catch(() => {});
      return navigation;
    },
    [router],
  );
  const previewRouteLink = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!routePreviewEnabled) {
        return;
      }
      // A previewed query toggle re-renders into its "disable" href; keep the first hover target.
      if (routePreviewRef.current) {
        return;
      }

      const targetHref = readAppSidebarMetaAnchorHref(event.currentTarget);
      const latestCurrentHref = currentHrefRef.current;
      if (targetHref === latestCurrentHref) {
        return;
      }

      routePreviewRef.current = {
        baseHref: latestCurrentHref,
        targetHref,
      };
      void navigateRouteHref(targetHref, true);
    },
    [navigateRouteHref, routePreviewEnabled, routePreviewRef],
  );

  const restoreRoutePreview = useCallback(() => {
    if (!routePreviewEnabled) {
      return;
    }

    const preview = routePreviewRef.current;
    if (preview === null) {
      return;
    }

    routePreviewRef.current = null;
    setRoutePreviewRenderVersion((version) => version + 1);
    const latestCurrentHref = currentHrefRef.current;
    if (preview.baseHref !== latestCurrentHref) {
      void navigateRouteHref(preview.baseHref, true, latestCurrentHref);
    }
  }, [navigateRouteHref, routePreviewEnabled, routePreviewRef]);

  const commitRoutePreview = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (!routePreviewEnabled) {
        return;
      }

      const preview = routePreviewRef.current;
      if (preview === null || shouldLetBrowserHandleClick(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      routePreviewRef.current = null;
      setRoutePreviewRenderVersion((version) => version + 1);
      event.currentTarget.href = new URL(preview.targetHref, new URL(readIsomorphicOrigin())).href;

      const latestCurrentHref = currentHrefRef.current;
      if (preview.targetHref !== latestCurrentHref) {
        void navigateRouteHref(preview.targetHref, false, latestCurrentHref);
      }
    },
    [navigateRouteHref, routePreviewEnabled, routePreviewRef],
  );

  const navigateAppSidebarLink = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (routePreviewRef.current !== null) {
        commitRoutePreview(event);
        return;
      }

      if (shouldLetBrowserHandleClick(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const nextHref = readAppSidebarMetaAnchorHref(event.currentTarget);
      event.currentTarget.href = new URL(nextHref, appOrigin).href;
      void navigateRouteHref(nextHref, false);
    },
    [commitRoutePreview, navigateRouteHref, routePreviewRef],
  );

  const toggleLandingDevMode = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      if (routePreviewRef.current !== null) {
        commitRoutePreview(event);
        return;
      }

      if (shouldLetBrowserHandleClick(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const latestHref = currentHrefRef.current;
      const latestUrl = new URL(latestHref, appOrigin);
      const latestSearch: Record<string, unknown> = parseTanStackSearch(latestUrl.search);
      const nextSearch = applySearchPatch(latestSearch, {
        [LANDING_DEV_MODE_QUERY_PARAM]: isLandingDevModeEnabled(latestSearch) ? null : true,
      });
      const nextHref = `${latestUrl.pathname}${stringifyTanStackSearch(nextSearch)}${latestUrl.hash}`;
      event.currentTarget.href = new URL(nextHref, appOrigin).href;
      void navigateRouteHref(nextHref, false, latestHref);
    },
    [commitRoutePreview, navigateRouteHref, routePreviewRef],
  );

  const toggleRootThemeMode = useCallback(
    (event: MouseEvent<HTMLAnchorElement>, nextThemeMode: RootThemeModeSearchKey) => {
      if (routePreviewRef.current !== null) {
        commitRoutePreview(event);
        return;
      }

      if (shouldLetBrowserHandleClick(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const origin = readIsomorphicOrigin();
      const appOrigin = new URL(origin);
      const latestHref = currentHrefRef.current;
      const latestUrl = new URL(latestHref, appOrigin);
      const latestSearch: Record<string, unknown> = parseTanStackSearch(latestUrl.search);
      const latestRootSearch = readRootRouteSearch(latestUrl.search);
      const nextSearch = applySearchPatch(
        latestSearch,
        buildToggledRootThemeModeSearch(latestRootSearch, nextThemeMode),
      );
      const nextHref = `${latestUrl.pathname}${stringifyTanStackSearch(nextSearch)}${latestUrl.hash}`;
      event.currentTarget.href = new URL(nextHref, appOrigin).href;
      void navigateRouteHref(nextHref, false, latestHref);
    },
    [commitRoutePreview, navigateRouteHref, routePreviewRef],
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
          onClickCapture={navigateAppSidebarLink}
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
          onClickCapture={(event) => toggleRootThemeMode(event, "light")}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
          search={() =>
            applySearchPatch(
              rootRouteSearch,
              buildToggledRootThemeModeSearch(rootRouteSearch, "light"),
            )
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
          onClickCapture={(event) => toggleRootThemeMode(event, "dark")}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
          search={() =>
            applySearchPatch(
              rootRouteSearch,
              buildToggledRootThemeModeSearch(rootRouteSearch, "dark"),
            )
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
          onClickCapture={toggleLandingDevMode}
          onMouseEnter={previewRouteLink}
          onMouseLeave={restoreRoutePreview}
          search={() =>
            applySearchPatch(rootRouteSearch, {
              [LANDING_DEV_MODE_QUERY_PARAM]: isLandingDevModeEnabled(rootRouteSearch)
                ? null
                : true,
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
          onClickCapture={navigateAppSidebarLink}
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
        onClickCapture={navigateAppSidebarLink}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /home
      </Link>
      <Link
        className={routePreviewLinkInteractionClassName}
        to="/terms"
        onClickCapture={navigateAppSidebarLink}
        onMouseEnter={previewRouteLink}
        onMouseLeave={restoreRoutePreview}
      >
        /terms
      </Link>
      <Link
        className={routePreviewLinkInteractionClassName}
        to="/privacy"
        onClickCapture={navigateAppSidebarLink}
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
