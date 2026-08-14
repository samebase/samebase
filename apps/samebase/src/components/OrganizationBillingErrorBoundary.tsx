import { CatchBoundary, type ErrorComponentProps } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import type { ReactNode } from "react";
import { ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX } from "../../convex/billingErrors";

function OrganizationBillingIssueState({ error }: ErrorComponentProps) {
  const billingLimited =
    error instanceof ConvexError &&
    typeof error.data === "string" &&
    error.data.startsWith(ORGANIZATION_BILLING_LIMITED_ERROR_PREFIX);

  if (!billingLimited) {
    throw error;
  }

  return (
    <main className="container mx-auto w-full max-w-2xl py-6" role="alert">
      <h1 className="text-xl font-semibold @2xl:text-2xl">Organization billing needs attention</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        Billing and member management are still available in organization settings.
      </p>
    </main>
  );
}

export function OrganizationBillingErrorBoundary({
  children,
  resetKey,
}: {
  children: ReactNode;
  resetKey: string;
}) {
  return (
    <CatchBoundary errorComponent={OrganizationBillingIssueState} getResetKey={() => resetKey}>
      {children}
    </CatchBoundary>
  );
}
