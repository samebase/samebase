import { ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { UserMenu } from "@/components/UserMenu";
import { useUserMenuPlacementPreview } from "@/hooks/use-user-menu-placement-preview";

export function Layout({ children }: { children: ReactNode }) {
  const appCommit = __APP_COMMIT__ || "unknown";
  const shortCommit =
    appCommit.length > 12 ? appCommit.slice(0, 7) : appCommit;
  const repoUrl = __APP_REPO_URL__ || "";
  const commitUrl =
    repoUrl && appCommit !== "unknown" ? `${repoUrl}/commit/${appCommit}` : "";
  const viewer = useQuery(api.users.viewer);
  const isOwner = viewer?.githubUsername === "nicu-chiciuc";
  const showGuestBadge = Boolean(viewer && !isOwner);
  const [menuPlacementPreview] = useUserMenuPlacementPreview();
  const guestName =
    viewer?.githubUsername ?? viewer?.name ?? viewer?.email ?? "there";
  const userLabel = viewer?.name ?? viewer?.email ?? "Account";
  const guestTitle = viewer
    ? `Welcome, ${guestName}. You're viewing the dev build.`
    : "Viewing the dev build.";
  const showTopStripMenu =
    Boolean(viewer) && menuPlacementPreview === "top-strip";
  const showFloatingMenu =
    Boolean(viewer) && menuPlacementPreview === "floating";

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
          {showTopStripMenu && (
            <UserMenu className="ml-2 gap-1 text-xs font-normal">
              <span className="hidden sm:inline">{userLabel}</span>
            </UserMenu>
          )}
        </div>
      </div>
      <main className="flex grow flex-col overflow-hidden">{children}</main>
      {showFloatingMenu && (
        <div className="pointer-events-none fixed right-3 top-3 z-50">
          <div className="pointer-events-auto">
            <UserMenu className="gap-0 text-xs font-normal">
              <span className="sr-only">{userLabel}</span>
            </UserMenu>
          </div>
        </div>
      )}
    </div>
  );
}
