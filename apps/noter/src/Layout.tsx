import {
  buildLandingDevToggleSearch,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { useLocation, useNavigate, useRouter } from "@tanstack/react-router";
import { ReactNode, useEffect, type MouseEvent } from "react";
import { useConvexAuth } from "convex/react";
import { AppPageFrame } from "@/components/AppPageFrame";
import { AppBuildStatusBar } from "@/components/AppBuildStatusBar";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";

export function Layout({
  children,
  showLandingBottomBar = false,
}: {
  children: ReactNode;
  showLandingBottomBar?: boolean;
}) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const shouldRenderLandingBottomBar =
    showLandingBottomBar &&
    location.pathname === "/" &&
    (!isAuthenticated || isLoading);
  const showLandingDevToggle =
    shouldRenderLandingBottomBar &&
    !isLoading &&
    rootRouteSearch.auth !== "google";
  const landingDevToggleSearch = buildLandingDevToggleSearch(rootRouteSearch);
  const landingDevToggleHref = router.buildLocation({
    to: "/",
    search: landingDevToggleSearch,
    hash: true,
  }).href;
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
    void navigate({
      to: "/",
      search: landingDevToggleSearch,
      hash: true,
    });
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
        shouldRenderLandingBottomBar ? (
          <AppBuildStatusBar
            appCommit={appCommit}
            appCommitNumber={appCommitNumber}
            landingDevToggleHref={landingDevToggleHref}
            landingDevToggleLabel={landingDevToggleLabel}
            onLandingDevToggleClick={handleLandingDevToggleClick}
            repoUrl={repoUrl}
            showLandingDevToggle={showLandingDevToggle}
            showLandingLegalLinks
          />
        ) : undefined
      }
    >
      {children}
    </AppPageFrame>
  );
}
