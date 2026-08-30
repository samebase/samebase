import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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
  onProductUpdateEmailsChange,
  onTermsAcceptedChange,
  productUpdateEmails,
  termsAccepted,
}: {
  accepting: boolean;
  error: string | null;
  onAccept: () => void;
  onProductUpdateEmailsChange: (checked: boolean) => void;
  onTermsAcceptedChange: (checked: boolean) => void;
  productUpdateEmails: boolean;
  termsAccepted: boolean;
}) {
  return (
    <div className="container my-auto" data-testid="terms-acceptance">
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-5 py-16">
        <h1 className="text-xl font-semibold tracking-tight">Terms of Service</h1>
        <div className="w-full space-y-4 text-left">
          <div className="flex items-start gap-3">
            <Checkbox
              checked={termsAccepted}
              disabled={accepting}
              id="terms-acceptance-required"
              onCheckedChange={(checked) => onTermsAcceptedChange(checked === true)}
            />
            <Label
              className="block text-sm font-normal leading-6"
              htmlFor="terms-acceptance-required"
            >
              {"I agree to the "}
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
            </Label>
          </div>
          <div className="flex items-start gap-3">
            <Checkbox
              aria-describedby="product-update-emails-description"
              checked={productUpdateEmails}
              disabled={accepting}
              id="product-update-emails"
              onCheckedChange={(checked) => onProductUpdateEmailsChange(checked === true)}
            />
            <div>
              <Label className="text-sm font-normal leading-6" htmlFor="product-update-emails">
                Send me occasional Samebase product updates and announcements.
              </Label>
              <p
                className="mt-1 text-sm leading-6 text-muted-foreground"
                id="product-update-emails-description"
              >
                Optional. You can unsubscribe at any time in Account settings.
              </p>
            </div>
          </div>
        </div>
        {error === null ? null : <p className="text-sm text-destructive">{error}</p>}
        <Button disabled={accepting || !termsAccepted} onClick={onAccept}>
          {accepting ? "Continuing..." : "Continue"}
        </Button>
      </div>
    </div>
  );
}

export function TermsAcceptanceScreen() {
  const acceptCurrentTerms = useMutation(api.users.acceptCurrentTerms);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productUpdateEmails, setProductUpdateEmails] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  return (
    <TermsAcceptanceView
      accepting={accepting}
      error={error}
      onProductUpdateEmailsChange={setProductUpdateEmails}
      onTermsAcceptedChange={setTermsAccepted}
      onAccept={() => {
        setError(null);
        setAccepting(true);
        void acceptCurrentTerms({
          termsAccepted: true,
          productUpdateEmailConsent: productUpdateEmails ? "granted" : "denied",
        })
          .catch(() => {
            setError("Samebase could not save your acceptance. Try again.");
          })
          .finally(() => {
            setAccepting(false);
          });
      }}
      productUpdateEmails={productUpdateEmails}
      termsAccepted={termsAccepted}
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
  if (resolvedViewerAccess.role === "role_terms_pending") {
    return <TermsAcceptanceScreen />;
  }
  return <>{children}</>;
}
