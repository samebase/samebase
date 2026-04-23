import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  hasSelectedAppBuildVersion,
} from "@/lib/appBuild";
import {
  buildLandingDevToggleSearch,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import { useRootRouteSearch } from "@/lib/rootRouteSearch";
import { Link, useLocation } from "@tanstack/react-router";

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
  const rootRouteSearch = useRootRouteSearch();
  const location = useLocation();

  const landingDevToggleSearch = buildLandingDevToggleSearch(rootRouteSearch);
  const landingDevToggleLabel = getLandingDevToggleLabel(rootRouteSearch);

  const isNotDev = location.pathname === "/" && rootRouteSearch.dev !== true;

  const buildVersionLabel = formatAppBuildVersionLabel(appCommitNumber);
  const commitLabel = formatAppBuildCommitLabel(appCommit);
  const normalizedRepoUrl = repoUrl ? normalizeRepoUrl(repoUrl) : "";
  const commitUrl =
    normalizedRepoUrl && appCommit !== "unknown"
      ? `${normalizedRepoUrl}/commit/${appCommit}`
      : "";

  return (
    <div
      data-testid={APP_BUILD_STATUS_BAR_TEST_ID}
      className="flex flex-col gap-3 text-xs text-muted-foreground px-3 pt-3 pb-8"
    >
      <Link to="/terms">/terms</Link>
      <Link to="/privacy">/privacy</Link>

      {isNotDev ? (
        <Link
          id="public-landing-dev-toggle"
          to="/"
          search={landingDevToggleSearch}
          hash
        >
          {landingDevToggleLabel}
        </Link>
      ) : (
        <Link to="/home">/home</Link>
      )}

      <div className="flex items-center gap-2 ">
        <span data-testid={APP_BUILD_VERSION_TEST_ID}>{buildVersionLabel}</span>

        <a
          data-testid={APP_BUILD_COMMIT_LINK_TEST_ID}
          className="select-text"
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
      </div>
    </div>
  );
}
