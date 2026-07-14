import { useLocation, useRouter } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import {
  clearAccountDeletionBrowserMarker,
  readAccountDeletionBrowserMarker,
  writeAccountDeletionBrowserMarker,
} from "@/lib/accountDeletionBrowserState";
import { ACCOUNT_DELETION_ROUTE } from "@/lib/accountDeletionRoute";
import { resetLocalAppData } from "@/lib/appBootRecovery";
import { resetSamebasePostHogClient } from "@/lib/posthogClient";
import { Button } from "@/components/ui/button";

type CleanupState = "idle" | "clearing" | "complete" | "cleanup_failed";

async function clearDeletedAccountBrowserData(signOut: () => Promise<void>) {
  const cleanupResults = await Promise.allSettled([signOut(), resetSamebasePostHogClient()]);

  await resetLocalAppData();

  const failure = cleanupResults.find((result) => result.status === "rejected");

  if (failure) {
    throw failure.reason;
  }
}

function AccountDeletionCompletionPage({
  action,
  state,
}: {
  action?: { label: string; onClick: () => void };
  state: Exclude<CleanupState, "idle"> | "verifying";
}) {
  const completed = state === "complete";
  return (
    <main className="container mx-auto w-full max-w-2xl py-6" aria-live="polite">
      <h1 className="text-xl font-semibold @2xl:text-2xl">
        {completed
          ? "Account deleted"
          : state === "verifying"
            ? "Checking account deletion"
            : "Finishing account deletion"}
      </h1>
      <p className="mt-4 text-sm text-muted-foreground" role="status">
        {state === "cleanup_failed"
          ? "Close other Samebase tabs, then reload this page to try clearing browser data again."
          : completed
            ? "Your Samebase account and saved browser data have been deleted."
            : state === "verifying"
              ? "Confirming that account deletion finished."
              : "Clearing saved Samebase data from this browser."}
      </p>
      {action ? (
        <Button className="mt-6" type="button" variant="outline" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </main>
  );
}

export function AccountDeletionBrowserBoundary({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
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
  const [completionCapability, setCompletionCapability] = useState<string | null>(
    () => readAccountDeletionBrowserMarker()?.completionCapability ?? null,
  );
  const completion = useQuery(
    api.accountDeletion.index.completion,
    !isLoading && completionCapability !== null ? { completionCapability } : "skip",
  );
  const [cleanupState, setCleanupState] = useState<CleanupState>("idle");
  const [showChildren, setShowChildren] = useState(false);
  const cleanupStartedRef = useRef(false);
  // A deleted initiating session can retain its cached JWT briefly. The missing user row makes
  // that authenticated browser anonymous until sign-out clears the local tokens.
  const ownsCompletionReceipt =
    completionCapability !== null &&
    (!isAuthenticated ||
      (viewerAccess?.role === "role_deleting" &&
        status?.completionCapability === completionCapability) ||
      viewerAccess?.role === "role_anonymous");
  useEffect(() => {
    if (
      pathname === ACCOUNT_DELETION_ROUTE ||
      (viewerAccess?.role !== "role_deleting" &&
        (viewerAccess?.role !== "role_anonymous" || completionCapability === null))
    ) {
      return;
    }
    void router.navigate({ href: ACCOUNT_DELETION_ROUTE, replace: true });
  }, [completionCapability, pathname, router, viewerAccess?.role]);

  useEffect(() => {
    if (
      completionCapability === null ||
      !isAuthenticated ||
      viewerAccess === undefined ||
      viewerAccess.role === "role_deleting" ||
      viewerAccess.role === "role_anonymous"
    ) {
      return;
    }
    clearAccountDeletionBrowserMarker(completionCapability);
    setCompletionCapability(null);
  }, [completionCapability, isAuthenticated, viewerAccess]);

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
    if (completion?.state !== "succeeded" || !ownsCompletionReceipt || cleanupStartedRef.current) {
      return;
    }
    cleanupStartedRef.current = true;
    setCleanupState("clearing");
    void clearDeletedAccountBrowserData(signOut)
      .then(() => setCleanupState("complete"))
      .catch(() => setCleanupState("cleanup_failed"));
  }, [completion?.state, ownsCompletionReceipt, signOut]);

  if (cleanupState !== "idle") {
    return <AccountDeletionCompletionPage state={cleanupState} />;
  }

  if (completion?.state === "succeeded" && ownsCompletionReceipt) {
    return <AccountDeletionCompletionPage state="clearing" />;
  }

  if (
    !showChildren &&
    !isLoading &&
    ownsCompletionReceipt &&
    viewerAccess?.role !== "role_deleting"
  ) {
    return (
      <AccountDeletionCompletionPage
        action={
          completion === null && !isAuthenticated
            ? {
                label: "Sign in to view status",
                onClick: () => {
                  setShowChildren(true);
                },
              }
            : undefined
        }
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
