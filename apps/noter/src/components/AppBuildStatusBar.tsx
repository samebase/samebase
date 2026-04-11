import { useEffect, useRef, type MouseEventHandler } from "react";
import { Link } from "@tanstack/react-router";
import {
  APP_BUILD_COMMIT_LINK_TEST_ID,
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildCommitLabel,
  formatAppBuildVersionLabel,
  hasSelectedAppBuildVersion,
  installAppBuildMarkdownCopy,
} from "@/lib/appBuild";

type AppBuildStatusBarProps = {
  appCommit: string;
  appCommitNumber: number | null;
  landingDevToggleHref?: string;
  landingDevToggleLabel?: string;
  onLandingDevToggleClick?: MouseEventHandler<HTMLAnchorElement>;
  repoUrl?: string;
  showLandingDevToggle?: boolean;
  showLandingLegalLinks?: boolean;
  showPublicNavigation?: boolean;
};

function normalizeRepoUrl(repoUrl: string): string {
  return repoUrl.endsWith(".git") ? repoUrl.slice(0, -4) : repoUrl;
}

export function AppBuildStatusBar({
  appCommit,
  appCommitNumber,
  landingDevToggleHref,
  landingDevToggleLabel,
  onLandingDevToggleClick,
  repoUrl = "",
  showLandingDevToggle = false,
  showLandingLegalLinks = false,
  showPublicNavigation = false,
}: AppBuildStatusBarProps) {
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
    <div
      data-testid={APP_BUILD_STATUS_BAR_TEST_ID}
      className="flex w-full items-center gap-2"
    >
      {showLandingLegalLinks ? (
        <div className="flex items-center gap-3">
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
        </div>
      ) : null}

      {showPublicNavigation ? (
        <Link
          to="/"
          className="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground"
        >
          Home
        </Link>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        {showLandingDevToggleLink ? (
          <a
            id="public-landing-dev-toggle"
            href={landingDevToggleHref}
            onClick={onLandingDevToggleClick}
            className="inline-flex min-w-[3ch] items-center justify-center corner-notch-1 px-1 transition-colors hover:text-foreground"
          >
            {landingDevToggleLabel}
          </a>
        ) : null}
        <div className="inline-flex select-text items-center gap-2 font-mono">
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
          ) : null}
          {!commitUrl ? (
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
          ) : null}
        </div>
      </div>
    </div>
  );
}
