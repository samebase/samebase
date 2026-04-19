import { ReactNode, useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { AppPageFrame } from "@/components/AppPageFrame";
import { AppSidebarMetaSection } from "@/components/AppSidebarMetaSection";

export function Layout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    console.info("[noter] build metadata", {
      appCommit: __APP_COMMIT__,
      appCommitNumber: __APP_COMMIT_NUMBER__,
      appRepoUrl: __APP_REPO_URL__,
    });
  }, []);

  return (
    <AppPageFrame>
      {!isAuthenticated ? (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex shrink-0 flex-col border-b border-border md:w-64 md:border-b-0 md:border-r">
            <div className="flex min-h-0 flex-1 flex-col justify-end">
              <AppSidebarMetaSection />
            </div>
          </aside>

          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </div>
      ) : (
        children
      )}
    </AppPageFrame>
  );
}
