import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { api } from "../../convex/_generated/api";
import type { ViewerRole } from "../../shared/accessModel";

type TermsAcceptanceViewerAccess = {
  role: ViewerRole;
  termsAccepted: boolean;
};

export function TermsAcceptanceView({
  accepting,
  error,
  onAccept,
}: {
  accepting: boolean;
  error: string | null;
  onAccept: () => void;
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
        <Button disabled={accepting} onClick={onAccept}>
          {accepting ? "Continuing..." : "Agree and continue"}
        </Button>
      </div>
    </div>
  );
}

export function TermsAcceptanceScreen() {
  const acceptCurrentTerms = useMutation(api.users.acceptCurrentTerms);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <TermsAcceptanceView
      accepting={accepting}
      error={error}
      onAccept={() => {
        setError(null);
        setAccepting(true);
        void acceptCurrentTerms({})
          .catch(() => {
            setError("Samebase could not save your acceptance. Try again.");
          })
          .finally(() => {
            setAccepting(false);
          });
      }}
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
  if (
    resolvedViewerAccess.termsAccepted === false &&
    (resolvedViewerAccess.role === "role_member" || resolvedViewerAccess.role === "role_staff")
  ) {
    return <TermsAcceptanceScreen />;
  }
  return <>{children}</>;
}
