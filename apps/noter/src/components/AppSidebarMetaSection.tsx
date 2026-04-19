import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  hasSelectedAppBuildVersion,
  installAppBuildMarkdownCopy,
} from "@/lib/appBuild";
import {
  buildLandingDevToggleSearch,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import {
  Link,
  useLocation,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useEffect, useRef, type MouseEvent } from "react";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

/**
 * Keep build metadata and public-route escape hatches in the left rail now
 * that the shared footer bar has been removed from the page shell.
 */
export function AppSidebarMetaSection() {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation();
  const navigate = useNavigate();
  const router = useRouter();
  const rootRouteSearch = useRootRouteSearch();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const showLandingDevToggle =
    !isLoading &&
    !isAuthenticated &&
    location.pathname === "/" &&
    rootRouteSearch.auth !== "google";
  // Keep the same durable footer links available in every left rail so the
  // landing page and authenticated workspaces share one simpler footer model.
  const showLandingLegalLinks =
    location.pathname !== "/terms" && location.pathname !== "/privacy";
  const showPublicNavigation = location.pathname !== "/";
  const landingDevToggleSearch = buildLandingDevToggleSearch(rootRouteSearch);
  const landingDevToggleHref = router.buildLocation({
    to: "/",
    search: landingDevToggleSearch,
    hash: true,
  }).href;
  const landingDevToggleLabel = getLandingDevToggleLabel(rootRouteSearch);
  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);
  const normalizedRepoUrl = repoUrl ? normalizeRepoUrl(repoUrl) : "";
  const commitUrl =
    normalizedRepoUrl && appCommit !== "unknown"
      ? `${normalizedRepoUrl}/commit/${appCommit}`
      : "";
  const commitLinkRef = useRef<HTMLElement | null>(null);
  const showLandingDevToggleLink =
    showLandingDevToggle &&
    typeof landingDevToggleHref === "string" &&
    landingDevToggleHref.length > 0 &&
    typeof landingDevToggleLabel === "string" &&
    landingDevToggleLabel.length > 0;

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
    // Mobile browsers can keep the sidebar toggle focused and nudge the
    // centered landing card while the query-param view swaps.
    event.currentTarget.blur();
    void navigate({
      to: "/",
      search: landingDevToggleSearch,
      hash: true,
    });
  };

  useEffect(() => {
    const commitLinkElement = commitLinkRef.current;
    if (commitLinkElement === null) {
      return;
    }

    return installAppBuildMarkdownCopy(commitLinkElement, {
      appBuildCopyLabel: commitLabel,
      commitUrl,
    });
  }, [commitLabel, commitUrl]);

  return (
    <div data-testid={APP_BUILD_STATUS_BAR_TEST_ID} className="px-3 pt-3 pb-8">
      <div className="flex flex-col gap-3 text-xs text-muted-foreground">
        {showPublicNavigation ||
        showLandingLegalLinks ||
        showLandingDevToggleLink ? (
          <div className="flex flex-col items-start gap-1">
            {showPublicNavigation ? (
              <Link
                to="/"
                className="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground"
              >
                Home
              </Link>
            ) : null}

            {showLandingLegalLinks ? (
              <>
                <Link
                  to="/terms"
                  className="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground"
                >
                  /terms
                </Link>

                <Link
                  to="/privacy"
                  className="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground"
                >
                  /privacy
                </Link>
              </>
            ) : null}

            {showLandingDevToggleLink ? (
              <a
                id="public-landing-dev-toggle"
                href={landingDevToggleHref}
                onClick={handleLandingDevToggleClick}
                className="inline-flex min-w-[3ch] items-center justify-center corner-notch-1 px-1 transition-colors hover:text-foreground"
              >
                {landingDevToggleLabel}
              </a>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono leading-none">
          <span data-testid={APP_BUILD_VERSION_TEST_ID}>
            {buildVersionLabel}
          </span>
          {commitUrl ? (
            <a
              data-testid={APP_BUILD_COMMIT_LINK_TEST_ID}
              ref={(element) => {
                commitLinkRef.current = element;
              }}
              className="select-text transition-colors hover:text-foreground"
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
            >
              {commitLabel}
            </a>
          ) : (
            <span
              data-testid={APP_BUILD_COMMIT_LINK_TEST_ID}
              ref={(element) => {
                commitLinkRef.current = element;
              }}
              className="select-text"
              title={appCommit}
            >
              {commitLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
