import { useAppAuthActions } from "@/authClient";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";

type TermsAcceptanceViewerAccess = {
  termsAccepted: boolean;
};

export function TermsAcceptanceView({
  error,
  onAccept,
  onSignOut,
  pendingAction,
}: {
  error: string | null;
  onAccept: () => void;
  onSignOut: () => void;
  pendingAction: "accept" | "sign-out" | null;
}) {
  return (
    <div className="container my-auto" data-testid="terms-acceptance">
      <div className="mx-auto flex max-w-[384px] flex-col items-center gap-4 py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Terms of Service</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {"By selecting Agree and continue, you agree to the "}
          <Link
            className="underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
            to="/terms"
          >
            Terms of Service
          </Link>
          {" and acknowledge the "}
          <Link
            className="underline underline-offset-4"
            rel="noreferrer"
            target="_blank"
            to="/privacy"
          >
            Privacy Policy
          </Link>
          {"."}
        </p>
        {error === null ? null : <p className="text-sm text-destructive">{error}</p>}
        <div className="flex items-center gap-2">
          <Button disabled={pendingAction !== null} onClick={onAccept}>
            {pendingAction === "accept" ? "Continuing..." : "Agree and continue"}
          </Button>
          <Button disabled={pendingAction !== null} onClick={onSignOut} variant="outline">
            {pendingAction === "sign-out" ? "Signing out..." : "Sign out"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TermsAcceptanceScreen() {
  const acceptCurrentTerms = useMutation(api.users.acceptCurrentTerms);
  const { signOut } = useAppAuthActions();
  const [pendingAction, setPendingAction] = useState<"accept" | "sign-out" | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <TermsAcceptanceView
      error={error}
      onAccept={() => {
        setError(null);
        setPendingAction("accept");
        void acceptCurrentTerms({})
          .catch(() => {
            setError("Samebase could not save your acceptance. Try again.");
          })
          .finally(() => {
            setPendingAction(null);
          });
      }}
      onSignOut={() => {
        setError(null);
        setPendingAction("sign-out");
        void Promise.resolve(signOut())
          .catch(() => {
            setError("Samebase could not sign you out. Try again.");
          })
          .finally(() => {
            setPendingAction(null);
          });
      }}
      pendingAction={pendingAction}
    />
  );
}

export function TermsAcceptanceGate({
  children,
  viewerAccess,
}: {
  children: ReactNode;
  viewerAccess?: TermsAcceptanceViewerAccess;
}) {
  const queriedViewerAccess = useQuery(
    api.users.currentViewerAccess,
    viewerAccess === undefined ? {} : "skip",
  );
  const resolvedViewerAccess = viewerAccess ?? queriedViewerAccess;

  if (resolvedViewerAccess === undefined) {
    return null;
  }
  if (resolvedViewerAccess.termsAccepted === false) {
    return <TermsAcceptanceScreen />;
  }
  return <>{children}</>;
}
