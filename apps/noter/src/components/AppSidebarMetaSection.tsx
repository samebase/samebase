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
import { useOptionalPublicLandingLogoLink } from "@/hooks/useOptionalPublicLandingLogoLink";
import { buildPathWithUpdatedQuery, setQueryParam } from "@/lib/queryParams";
import { Link, useLocation } from "@tanstack/react-router";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

/**
 * Keep build metadata and public-route escape hatches on the rail edge that
 * peeks beside the main pane in the mobile workspace carousel.
 */
export function AppSidebarMetaSection() {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const repoUrl = __APP_REPO_URL__ || "";
  const location = useLocation();
  const publicLandingLogoLink = useOptionalPublicLandingLogoLink();

  const landingDevEnabled = isLandingDevModeEnabled(
    new URLSearchParams(location.searchStr),
  );
  const landingDevLabel = landingDevEnabled
    ? LANDING_DEV_MODE_DISABLE_LINK_LABEL
    : LANDING_DEV_MODE_LINK_LABEL;
  const landingDevPath = buildPathWithUpdatedQuery(
    {
      pathname: location.pathname,
      search: location.searchStr,
      hash: location.hash,
    },
    (searchParams) => {
      setQueryParam(
        searchParams,
        LANDING_DEV_MODE_QUERY_PARAM,
        !landingDevEnabled,
      );
    },
  );

  const isLandingPage = location.pathname === "/";
  const shouldReserveLogoLink = isLandingPage;
  const showLogoLink =
    isLandingPage && publicLandingLogoLink?.isLogoLinkVisible === true;
  const logoLinkClassName = showLogoLink
    ? "animate-underline-color"
    : "pointer-events-none select-none text-background no-underline";

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
      className="flex flex-col items-end gap-3 px-1 pt-3 pb-8 text-right text-xs text-muted-foreground"
    >
      <Link id="public-landing-dev-toggle" to={landingDevPath}>
        {landingDevLabel}
      </Link>

      {/* Keep query-param shortcuts visually separate so path links stay put. */}
      <div aria-hidden="true" className="h-3" />

      {/* Reserve the easter-egg row so revealing it does not move path links. */}
      {shouldReserveLogoLink ? (
        <Link
          to="/logo"
          aria-hidden={showLogoLink ? undefined : true}
          className={logoLinkClassName}
          tabIndex={showLogoLink ? undefined : -1}
        >
          /logo
        </Link>
      ) : null}
      {/* `/home` routes through `/` to avoid a first-paint logo flash. */}
      <Link to="/">/home</Link>
      <Link to="/terms">/terms</Link>
      <Link to="/privacy">/privacy</Link>

      <div className="flex flex-row-reverse items-center gap-2 font-mono">
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
          onCopy={(event) => {
            if (
              !commitUrl ||
              !hasSelectedAppBuildVersion(event.currentTarget)
            ) {
              return;
            }

            event.clipboardData.setData(
              "text/plain",
              `[${commitLabel}](${commitUrl})`,
            );
            event.preventDefault();
          }}
        >
          {commitLabel}
        </a>
      </div>
    </div>
  );
}
