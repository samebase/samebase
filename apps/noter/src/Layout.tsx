import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ReactNode, useEffect, type MouseEvent } from "react";
import { useConvexAuth } from "convex/react";
import { AppBuildStatusBar } from "@/components/AppBuildStatusBar";
import { WorkspaceLayoutV2PageFrame } from "@/components/workspace-layout-v2/WorkspaceLayoutV2PageFrame";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";

export function Layout({ children }: { children: ReactNode }) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation({
    select: (location) => ({
      // TODO(tanstack-router-cleanup): remove this browser-style location shim
      // once landing toggle URL building reads native TanStack pathname/search/
      // hash fields directly instead of reconstructing PathWithSearch.
      hash: location.hash.length > 0 ? `#${location.hash}` : "",
      pathname: location.pathname,
      search: location.searchStr,
    }),
  });
  const navigate = useNavigate();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const showLandingDevToggle =
    !isLoading &&
    !isAuthenticated &&
    location.pathname === "/" &&
    rootRouteSearch.auth !== "google";
  // Keep legal links available on every unauthenticated sign-in surface while
  // auth is still resolving so they never disappear during startup or route
  // handoffs.
  const showLandingLegalLinks =
    !isAuthenticated &&
    location.pathname !== "/terms" &&
    location.pathname !== "/privacy";
  const showPublicNavigation =
    !isLoading && !isAuthenticated && location.pathname !== "/";
  const landingDevToggleHref = buildLandingDevToggleHref(location);
  const landingDevToggleLabel = getLandingDevToggleLabel(rootRouteSearch);
  const handleLandingDevToggleClick = (
    event: MouseEvent<HTMLAnchorElement>,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.currentTarget.target === "_blank"
    ) {
      return;
    }
    event.preventDefault();
    // Mobile browsers can keep the header toggle focused and nudge the
    // vertically centered landing card while the query-param view swaps.
    event.currentTarget.blur();
    // TODO(tanstack-router-cleanup): replace this raw href escape with typed
    // root-route search navigation once the landing dev toggle stops relying on
    // browser-style query helpers.
    void navigate({ href: landingDevToggleHref });
  };
  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appCommitNumber: __APP_COMMIT_NUMBER__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <WorkspaceLayoutV2PageFrame
      topBar={
        <AppBuildStatusBar
          appCommit={appCommit}
          appCommitNumber={appCommitNumber}
          landingDevToggleHref={landingDevToggleHref}
          landingDevToggleLabel={landingDevToggleLabel}
          onLandingDevToggleClick={handleLandingDevToggleClick}
          repoUrl={repoUrl}
          showLandingDevToggle={showLandingDevToggle}
          showLandingLegalLinks={showLandingLegalLinks}
          showPublicNavigation={showPublicNavigation}
        />
      }
    >
      <main className="flex h-full flex-col overflow-hidden">{children}</main>
    </WorkspaceLayoutV2PageFrame>
  );
}
