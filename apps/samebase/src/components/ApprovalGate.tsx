import { useNoterAuthActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import type { NoterRouteAccessViewer } from "@/routing/permissions";
import { useQuery } from "convex/react";
import { createContext, useContext, type ReactNode } from "react";
import type { ViewerRole } from "../../shared/accessModel";
import { api } from "../../convex/_generated/api";

type ApprovalGateViewerAccess = NoterRouteAccessViewer & {
  role?: ViewerRole;
};

const ApprovalGateViewerAccessContext = createContext<ApprovalGateViewerAccess | null>(null);

export function ApprovalGateViewerAccessProvider({
  children,
  viewerAccess,
}: {
  children: ReactNode;
  viewerAccess: ApprovalGateViewerAccess;
}) {
  return (
    <ApprovalGateViewerAccessContext.Provider value={viewerAccess}>
      {children}
    </ApprovalGateViewerAccessContext.Provider>
  );
}

export function ApprovalGate({ children }: { children: ReactNode }) {
  const viewerAccessContext = useContext(ApprovalGateViewerAccessContext);
  const queriedViewerAccess = useQuery(
    api.users.currentViewerAccess,
    viewerAccessContext === null ? {} : "skip",
  );
  const viewerAccess = viewerAccessContext ?? queriedViewerAccess;
  const { signOut } = useNoterAuthActions();

  // Avoid flashing gated content before approval state is known.
  if (viewerAccess === undefined) {
    return null;
  }

  if (
    viewerAccess.role === "role_waitlisted" ||
    !viewerAccess.accessKeys.some((accessKey) => accessKey !== "access_public")
  ) {
    return (
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">You're on the waitlist</h2>
          <p className="text-sm text-muted-foreground">
            We'll let you know when your spot opens up.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              void signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
