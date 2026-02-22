import { ReactNode, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

export function Layout({ children }: { children: ReactNode }) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const shortCommit = appCommit.length > 12 ? appCommit.slice(0, 7) : appCommit;
  const repoUrl = __APP_REPO_URL__ || "";
  const commitUrl =
    repoUrl && appCommit !== "unknown" ? `${repoUrl}/commit/${appCommit}` : "";
  const viewer = useQuery(api.users.viewer);
  const isOwner = viewer?.githubUsername === "nicu-chiciuc";
  const showGuestBadge = Boolean(viewer && !isOwner);
  const guestName =
    viewer?.githubUsername ?? viewer?.name ?? viewer?.email ?? "there";
  const guestTitle = viewer
    ? `Welcome, ${guestName}. You're viewing the dev build.`
    : "Viewing the dev build.";

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="border-b border-border/50">
        <div className="container flex items-center justify-end gap-2 px-3 py-1 text-[11px] text-muted-foreground">
          {showGuestBadge && (
            <span
              className="rounded-full border border-border/60 bg-muted/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70"
              title={guestTitle}
            >
              Curious Mode
            </span>
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
