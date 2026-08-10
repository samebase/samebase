import { useLocation, useRouter } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { ConvexClient } from "convex/browser";
import { useConvex, useConvexAuth, useQuery_experimental } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import {
  AUTHENTICATED_ACCOUNT_DELETED,
  AUTHENTICATED_ACCOUNT_REFERENCE_INVALID,
} from "../../shared/authenticatedAccountAvailability";
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
type AccountDeletionCompletion = FunctionReturnType<typeof api.accountDeletion.index.completion>;
type PublicCompletionState =
  | {
      completionCapability: string;
      state: "success";
      value: AccountDeletionCompletion;
    }
  | {
      completionCapability: string;
      state: "error";
    };

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
  const convex = useConvex();
  const pathname = useLocation({ select: (location) => location.pathname });
  const router = useRouter();
  const viewerAccessQuery = useQuery_experimental({
    query: api.users.currentViewerAccess,
    args: isAuthenticated && !isLoading ? {} : "skip",
  });
  const viewerAccess = viewerAccessQuery.status === "success" ? viewerAccessQuery.data : undefined;
  const authenticatedAccountDeleted =
    viewerAccessQuery.status === "error" &&
    viewerAccessQuery.error instanceof ConvexError &&
    viewerAccessQuery.error.data === AUTHENTICATED_ACCOUNT_DELETED;
  const authenticatedAccountReferenceInvalid =
    viewerAccessQuery.status === "error" &&
    viewerAccessQuery.error instanceof ConvexError &&
    viewerAccessQuery.error.data === AUTHENTICATED_ACCOUNT_REFERENCE_INVALID;
  const statusQuery = useQuery_experimental({
    query: api.accountDeletion.index.status,
    args: isAuthenticated && !isLoading && viewerAccess?.role === "role_deleting" ? {} : "skip",
  });
  const status = statusQuery.status === "success" ? statusQuery.data : undefined;
  const [completionCapability, setCompletionCapability] = useState<string | null>(
    () => readAccountDeletionBrowserMarker()?.completionCapability ?? null,
  );
  const [publicCompletionState, setPublicCompletionState] = useState<PublicCompletionState>();
  useEffect(() => {
    if (isLoading || completionCapability === null) {
      return;
    }
    const capability = completionCapability;
    const publicClient = new ConvexClient(convex.url, { unsavedChangesWarning: false });
    const unsubscribe = publicClient.onUpdate(
      api.accountDeletion.index.completion,
      { completionCapability: capability },
      (value) => {
        setPublicCompletionState({
          completionCapability: capability,
          state: "success",
          value,
        });
      },
      () => {
        setPublicCompletionState({
          completionCapability: capability,
          state: "error",
        });
      },
    );
    return () => {
      unsubscribe();
      void publicClient.close();
    };
  }, [completionCapability, convex.url, isLoading]);
  const completion =
    publicCompletionState?.completionCapability === completionCapability &&
    publicCompletionState.state === "success"
      ? publicCompletionState.value
      : undefined;
  const [cleanupState, setCleanupState] = useState<CleanupState>("idle");
  const [showChildren, setShowChildren] = useState(false);
  const cleanupStartedRef = useRef(false);
  // The terminal transaction rejects the cached JWT. The capability can read only the scrubbed
  // receipt through an unauthenticated connection before sign-out clears the local tokens.
  const ownsCompletionReceipt =
    completionCapability !== null &&
    (!isAuthenticated ||
      (viewerAccess?.role === "role_deleting" &&
        status?.completionCapability === completionCapability) ||
      authenticatedAccountDeleted);
  useEffect(() => {
    if (
      pathname === ACCOUNT_DELETION_ROUTE ||
      (viewerAccess?.role !== "role_deleting" &&
        (!authenticatedAccountDeleted || completionCapability === null))
    ) {
      return;
    }
    void router.navigate({ href: ACCOUNT_DELETION_ROUTE, replace: true });
  }, [authenticatedAccountDeleted, completionCapability, pathname, router, viewerAccess?.role]);

  useEffect(() => {
    if (
      completionCapability === null ||
      !isAuthenticated ||
      viewerAccess === undefined ||
      viewerAccess.role === "role_deleting"
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
    if (
      (!authenticatedAccountDeleted &&
        (completion?.state !== "succeeded" || !ownsCompletionReceipt)) ||
      cleanupStartedRef.current
    ) {
      return;
    }
    cleanupStartedRef.current = true;
    setCleanupState("clearing");
    void clearDeletedAccountBrowserData(signOut)
      .then(() => setCleanupState("complete"))
      .catch(() => setCleanupState("cleanup_failed"));
  }, [authenticatedAccountDeleted, completion?.state, ownsCompletionReceipt, signOut]);

  if (
    viewerAccessQuery.status === "error" &&
    !authenticatedAccountDeleted &&
    !authenticatedAccountReferenceInvalid
  ) {
    throw viewerAccessQuery.error;
  }

  if (cleanupState !== "idle") {
    return <AccountDeletionCompletionPage state={cleanupState} />;
  }

  if (authenticatedAccountDeleted || (completion?.state === "succeeded" && ownsCompletionReceipt)) {
    return <AccountDeletionCompletionPage state="clearing" />;
  }

  if (authenticatedAccountReferenceInvalid) {
    return (
      <main className="container mx-auto w-full max-w-2xl py-6" aria-live="polite">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Account unavailable</h1>
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          This session refers to a Samebase user record that is not available.
        </p>
        <Button
          className="mt-6"
          type="button"
          variant="outline"
          onClick={() => {
            if (completionCapability !== null) {
              clearAccountDeletionBrowserMarker(completionCapability);
              setCompletionCapability(null);
            }
            void signOut();
          }}
        >
          Sign out
        </Button>
      </main>
    );
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
