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
  FORCE_PROD_UI_MODE_LINK_LABEL,
  FORCE_PROD_UI_QUERY_PARAM,
  isBrowserProductionPublicOrigin,
  isProdUiModeActive,
} from "@/lib/prodUiMode";
import { useOptionalPublicLandingLogoLink } from "@/hooks/useOptionalPublicLandingLogoLink";
import { MACHINE_CONNECT_ROUTE, MACHINES_ROUTE } from "@/lib/noterSync";
import { Link, useLocation } from "@tanstack/react-router";

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

type AppSidebarMetaSectionSide = "left" | "right";

const APP_SIDEBAR_META_SECTION_CLASS_NAMES = {
  left: "flex flex-col items-end gap-3 px-2 pt-3 pb-8 text-right text-sm text-muted-foreground",
  right:
    "flex flex-col items-start gap-3 px-2 pt-3 pb-8 text-left text-sm text-muted-foreground",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

const APP_SIDEBAR_META_VERSION_CLASS_NAMES = {
  left: "flex flex-row-reverse items-center gap-2 font-mono",
  right: "flex flex-row items-center gap-2 font-mono",
} as const satisfies Record<AppSidebarMetaSectionSide, string>;

/**
 * Keep build metadata and public-route escape hatches on the rail edge that
 * peeks beside the main pane in the mobile workspace carousel.
 */
export function AppSidebarMetaSection({
  showMachineLinks = false,
  side = "left",
}: {
  showMachineLinks?: boolean;
  side?: AppSidebarMetaSectionSide;
}) {
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
  const prodUiEnabled = isProdUiModeActive({
    deploymentProfile: undefined,
    productionPublicOrigin: isBrowserProductionPublicOrigin(),
    search: new URLSearchParams(location.searchStr),
  });

  const isLandingPage = location.pathname === "/";
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
      className={APP_SIDEBAR_META_SECTION_CLASS_NAMES[side]}
    >
      {prodUiEnabled ? null : (
        <Link
          id="public-landing-prod-ui-toggle"
          to={location.pathname}
          hash={location.hash}
          search={(currentSearch) => ({
            ...currentSearch,
            [FORCE_PROD_UI_QUERY_PARAM]: true,
          })}
        >
          {FORCE_PROD_UI_MODE_LINK_LABEL}
        </Link>
      )}
      <Link
        id="public-landing-dev-toggle"
        to={location.pathname}
        hash={location.hash}
        search={(currentSearch) => ({
          ...currentSearch,
          dev: landingDevEnabled ? undefined : true,
        })}
      >
        {landingDevLabel}
      </Link>

      {/* Keep query-param shortcuts visually separate so path links stay put. */}
      <div aria-hidden="true" className="h-3" />

      {/* Reserve the easter-egg row across routes so path links never reflow. */}
      <Link
        to="/logo"
        aria-hidden={showLogoLink ? undefined : true}
        className={logoLinkClassName}
        search={(currentSearch) => ({
          ...currentSearch,
          [LANDING_DEV_MODE_QUERY_PARAM]: true,
        })}
        tabIndex={showLogoLink ? undefined : -1}
      >
        /logo
      </Link>
      {/* `/home` routes through `/` to avoid a first-paint logo flash. */}
      <Link to="/">/home</Link>
      {showMachineLinks ? (
        <>
          <Link to={MACHINES_ROUTE}>{MACHINES_ROUTE}</Link>
          <Link to={MACHINE_CONNECT_ROUTE}>{MACHINE_CONNECT_ROUTE}</Link>
        </>
      ) : null}
      <Link to="/terms">/terms</Link>
      <Link to="/privacy">/privacy</Link>

      <div className={APP_SIDEBAR_META_VERSION_CLASS_NAMES[side]}>
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
