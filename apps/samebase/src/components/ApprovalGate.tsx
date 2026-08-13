import { useAppAuthActions } from "@/authClient";
import {
  BETA_ACCESS_PENDING_HEADING,
  BetaAccessPendingDescription,
} from "@/components/BetaAccessPendingDescription";
import { Button } from "@/components/ui/button";
import type { RouteAccessViewer } from "@/routing/permissions";
import { useQuery } from "convex/react";
import { createContext, useContext, type ReactNode } from "react";
import type { ViewerRole } from "../../shared/accessModel";
import { api } from "../../convex/_generated/api";

type ApprovalGateViewerAccess = RouteAccessViewer & {
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
  const approvalPending =
    viewerAccess !== undefined &&
    (viewerAccess.role === "role_pending_access" ||
      !viewerAccess.accessKeys.some((accessKey) => accessKey !== "access_public"));
  const viewer = useQuery(api.users.viewer, approvalPending ? {} : "skip");
  const { signOut } = useAppAuthActions();

  // Avoid flashing gated content before approval state is known.
  if (viewerAccess === undefined) {
    return null;
  }

  if (approvalPending) {
    if (!viewer) {
      return null;
    }

    return (
      <div className="container my-auto">
        <div className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-xl font-semibold tracking-tight">{BETA_ACCESS_PENDING_HEADING}</h2>
          <BetaAccessPendingDescription accountIdentity={viewer.accountPresentation.label} />
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
