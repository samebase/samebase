import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
import {
  APP_BUILD_STATUS_BAR_TEST_ID,
  APP_BUILD_VERSION_TEST_ID,
  formatAppBuildVersionLabel,
} from "@/lib/appBuild";
import { ReactNode, useEffect, type MouseEvent } from "react";
import { useConvexAuth } from "convex/react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

export function Layout({ children }: { children: ReactNode }) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const appCommitNumber = __APP_COMMIT_NUMBER__;
  const commitLabel = formatAppBuildVersionLabel(appCommitNumber);
  const repoUrl = __APP_REPO_URL__ || "";
  const commitUrl =
    repoUrl && appCommit !== "unknown" ? `${repoUrl}/commit/${appCommit}` : "";
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const showLandingDevToggle =
    !isLoading &&
    !isAuthenticated &&
    location.pathname === "/" &&
    !searchParams.has("auth");
  const showPublicNavigation =
    !isLoading && !isAuthenticated && location.pathname !== "/";
  const landingDevToggleHref = buildLandingDevToggleHref(location);
  const landingDevToggleLabel = getLandingDevToggleLabel(searchParams);
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
    void navigate(landingDevToggleHref);
  };
  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appCommitNumber: __APP_COMMIT_NUMBER__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-border/50">
        <div
          data-testid={APP_BUILD_STATUS_BAR_TEST_ID}
          className="container flex items-center justify-end gap-2 px-3 py-1 text-[11px] text-muted-foreground"
        >
          {showPublicNavigation && (
            <Link
              to="/"
              className="inline-flex min-w-[3ch] items-center justify-center px-1 transition-colors hover:text-foreground"
            >
              Home
            </Link>
          )}
          {showLandingDevToggle && (
            <a
              href={landingDevToggleHref}
              onClick={handleLandingDevToggleClick}
              className="inline-flex min-w-[3ch] items-center justify-center corner-notch-1 px-1 hover:text-foreground transition-colors"
            >
              {landingDevToggleLabel}
            </a>
          )}
          {commitUrl ? (
            <a
              data-testid={APP_BUILD_VERSION_TEST_ID}
              className="font-mono hover:text-foreground transition-colors"
              href={commitUrl}
              target="_blank"
              rel="noreferrer noopener"
              title={appCommit}
            >
              {commitLabel}
            </a>
          ) : (
            <span
              data-testid={APP_BUILD_VERSION_TEST_ID}
              className="font-mono"
              title={appCommit}
            >
              {commitLabel}
            </span>
          )}
        </div>
      </div>
      <main className="flex grow flex-col overflow-hidden">{children}</main>
    </div>
  );
}
