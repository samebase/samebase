import {
  buildLandingDevToggleHref,
  getLandingDevToggleLabel,
} from "@/lib/landingDevMode";
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
  const shortCommit = appCommit.length > 12 ? appCommit.slice(0, 7) : appCommit;
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
    void navigate(landingDevToggleHref);
  };
  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-border/50">
        <div className="container flex items-center justify-end gap-2 px-3 py-1 text-[11px] text-muted-foreground">
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
          <span>Commit</span>
          {commitUrl ? (
            <a
              className="font-mono hover:text-foreground transition-colors"
              href={commitUrl}
              target="_blank"
              rel="noreferrer noopener"
              title={appCommit}
            >
              {shortCommit}
            </a>
          ) : (
            <span className="font-mono" title={appCommit}>
              {shortCommit}
            </span>
          )}
        </div>
      </div>
      <main className="flex grow flex-col overflow-hidden">{children}</main>
    </div>
  );
}
