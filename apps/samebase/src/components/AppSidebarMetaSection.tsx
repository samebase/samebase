import {
  APP_BUILD_COMMIT_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
} from "@/lib/appBuild";
import { SEARCH_RESET_QUERY_PARAM } from "@/lib/searchReset";
import { formatRouteSearchPresenceFlagLinkLabel } from "@/routing/searchFlags";
import { appBuildConfig } from "@/lib/appBuildConfig";
import { SAMEBASE_PUBLIC_LINKS } from "@/lib/publicLinks";
import { Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type AppSidebarMetaLinkAlignment = "left" | "right";

const APP_SIDEBAR_META_SECTION_CLASS_NAMES = {
  left: "repository-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-start gap-3 overflow-hidden px-2 pt-3 pb-8 text-left text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
  right:
    "repository-dashboard-sidebar-meta flex min-w-0 max-w-full flex-col items-end gap-3 overflow-hidden px-2 pt-3 pb-8 text-right text-base text-muted-foreground [&>a]:max-w-full [&>a]:line-clamp-2 [&>a]:[overflow-wrap:anywhere]",
} as const satisfies Record<AppSidebarMetaLinkAlignment, string>;

const APP_SIDEBAR_META_VERSION_CLASS_NAMES = {
  left: "flex max-w-full min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1 font-mono",
  right:
    "flex max-w-full min-w-0 flex-row-reverse flex-wrap items-center justify-end gap-x-2 gap-y-1 font-mono",
} as const satisfies Record<AppSidebarMetaLinkAlignment, string>;

const APP_SIDEBAR_META_COMMUNITY_LINKS_CLASS_NAMES = {
  left: "flex max-w-full flex-wrap items-center justify-start gap-3",
  right: "flex max-w-full flex-wrap items-center justify-end gap-3",
} as const satisfies Record<AppSidebarMetaLinkAlignment, string>;

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
  const { appCommit, appCommitNumber } = appBuildConfig;
  const location = useLocation();

  const hasHydrated = useHasHydrated();
  const showSearchResetLink = hasHydrated && location.searchStr.length > 0;

  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);

  return (
    <div
      data-testid={APP_BUILD_STATUS_BAR_TEST_ID}
      className={APP_SIDEBAR_META_SECTION_CLASS_NAMES[linkAlignment]}
    >
      {showSearchResetLink ? (
        <>
          <Link
            id="public-landing-search-reset"
            resetScroll={false}
            to={location.pathname}
            hash={location.hash}
            search={() => ({
              [SEARCH_RESET_QUERY_PARAM]: true as const,
            })}
          >
            {formatRouteSearchPresenceFlagLinkLabel(SEARCH_RESET_QUERY_PARAM, true)}
          </Link>
          <div aria-hidden="true" className="h-3" />
        </>
      ) : null}

      <div className={APP_SIDEBAR_META_COMMUNITY_LINKS_CLASS_NAMES[linkAlignment]}>
        <a
          className="text-foreground"
          href="https://x.com/samebasecom"
          rel="noreferrer"
          target="_blank"
        >
          X.com
        </a>
        <a
          className="text-[#FF0000]"
          href={SAMEBASE_PUBLIC_LINKS.youtube.path}
          rel="noreferrer"
          target="_blank"
        >
          YouTube
        </a>
      </div>
      <Link to="/terms">/terms</Link>
      <Link to="/privacy">/privacy</Link>
      <Link to="/pricing">/pricing</Link>
      <Link to="/">/landing</Link>

      <div className={APP_SIDEBAR_META_VERSION_CLASS_NAMES[linkAlignment]}>
        <span className="shrink-0" data-testid={APP_BUILD_VERSION_TEST_ID}>
          {buildVersionLabel}
        </span>

        <span
          data-testid={APP_BUILD_COMMIT_TEST_ID}
          className="min-w-0 max-w-full truncate select-text"
          title={appCommit}
        >
          {commitLabel}
        </span>
      </div>
    </div>
  );
}
