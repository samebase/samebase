import { useLocation, useRouter } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import {
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import { resetLocalAppData } from "@/lib/appBootRecovery";
import { resetSamebasePostHogClient } from "@/lib/posthogClient";
import { Button } from "@/components/ui/button";

type CompletionState = "idle" | "verifying" | "clearing" | "complete" | "cleanup_failed";

function AccountDeletionCompletionPage({
  onSignIn,
  state,
}: {
  onSignIn?: () => void;
  state: Exclude<CompletionState, "idle">;
}) {
  const completed = state === "complete";
  return (
    <main className="container mx-auto w-full max-w-2xl py-6" aria-live="polite">
      <h1 className="text-xl font-semibold sm:text-2xl">
        {completed
          ? "Account deleted"
          : state === "verifying"
            ? "Checking account deletion"
            : "Finishing account deletion"}
      </h1>
      <p className="mt-4 text-sm text-muted-foreground" role="status">
        {state === "cleanup_failed"
          ? "Close other Samebase tabs, then reload this page to finish clearing browser data."
          : completed
            ? "Your Samebase account and saved browser data have been deleted."
            : state === "verifying"
              ? "Confirming that account deletion finished."
              : "Clearing saved Samebase data from this browser."}
      </p>
      {onSignIn ? (
        <Button className="mt-6" type="button" variant="outline" onClick={onSignIn}>
          Sign in to view status
        </Button>
      ) : null}
    </main>
  );
}

export function AccountDeletionBrowserBoundary({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const viewerAccess = useQuery(
    api.users.currentViewerAccess,
    isAuthenticated && !isLoading ? {} : "skip",
  );
  const status = useQuery(
    api.accountDeletion.index.status,
    isAuthenticated && !isLoading && viewerAccess?.role === "role_deleting" ? {} : "skip",
  );
  const marker = readAccountDeletionBrowserMarker();
  const [completionCapability, setCompletionCapability] = useState<string | null>(
    marker?.completionCapability ?? null,
  );
  const completion = useQuery(
    api.accountDeletion.index.completion,
    !isLoading && !isAuthenticated && completionCapability !== null
      ? { completionCapability }
      : "skip",
  );
  const [completionState, setCompletionState] = useState<CompletionState>("idle");
  const [showSignedOutChildren, setShowSignedOutChildren] = useState(false);
  useEffect(() => {
    if (viewerAccess?.role !== "role_deleting" || pathname === ACCOUNT_DELETION_ROUTE) {
      return;
    }
    void router.navigate({ href: ACCOUNT_DELETION_ROUTE, replace: true });
  }, [pathname, router, viewerAccess?.role]);

  useEffect(() => {
    if (
      status === undefined ||
      status === null ||
      viewerAccess?.role !== "role_deleting" ||
      completionCapability === status.completionCapability
    ) {
      return;
    }
    setCompletionCapability(status.completionCapability);
    writeAccountDeletionBrowserMarker(status.completionCapability);
  }, [completionCapability, status, viewerAccess?.role]);

  useEffect(() => {
    if (completion?.state !== "succeeded" || completionState !== "idle") {
      return;
    }
    setCompletionState("clearing");
    void resetSamebasePostHogClient()
      .then(resetLocalAppData)
      .then(() => setCompletionState("complete"))
      .catch(() => setCompletionState("cleanup_failed"));
  }, [completion?.state, completionState]);

  if (completionState !== "idle") {
    return <AccountDeletionCompletionPage state={completionState} />;
  }

  if (completion?.state === "succeeded") {
    return <AccountDeletionCompletionPage state="clearing" />;
  }

  if (!showSignedOutChildren && !isLoading && !isAuthenticated && completionCapability !== null) {
    return (
      <AccountDeletionCompletionPage
        onSignIn={completion === null ? () => setShowSignedOutChildren(true) : undefined}
        state="verifying"
      />
    );
  }

  if (
    (isAuthenticated && viewerAccess === undefined) ||
    (viewerAccess?.role === "role_deleting" && pathname !== ACCOUNT_DELETION_ROUTE)
  ) {
    return null;
  }

  return children;
}
