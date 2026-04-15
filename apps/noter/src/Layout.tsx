import {
  buildLandingDevToggleSearch,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { buildPathWithQuery } from "@/lib/queryParams";
import { stringifyTanStackSearch } from "@/lib/tanstackSearchParams";
import { useLocation, useRouter } from "@tanstack/react-router";
import { ReactNode, useEffect, type MouseEvent } from "react";
import { useConvexAuth } from "convex/react";
import { AppPageFrame } from "@/components/AppPageFrame";
import { AppBuildStatusBar } from "@/components/AppBuildStatusBar";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";

export function Layout({ children }: { children: ReactNode }) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation();
  const router = useRouter();
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
  const landingDevToggleSearch = buildLandingDevToggleSearch(rootRouteSearch);
  // Keep the rendered href on the shipped `/?dev` contract instead of
  // TanStack's default empty-value `?dev=` serialization for boolean flags.
  const landingDevToggleHref = buildPathWithQuery({
    pathname: "/",
    search: stringifyTanStackSearch(landingDevToggleSearch),
    hash: location.hash,
  });
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
    router.history.push(landingDevToggleHref);
  };
  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appCommitNumber: __APP_COMMIT_NUMBER__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <AppPageFrame
      bottomBar={
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
      {children}
    </AppPageFrame>
  );
}
