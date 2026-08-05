import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Circle, Loader2, TriangleAlert } from "lucide-react";
import { entries } from "@samebase/dependent/object";

import { api } from "../../convex/_generated/api";

type AccountDeletionStatus = Pick<
  Exclude<FunctionReturnType<typeof api.accountDeletion.index.status>, null>,
  "currentStep" | "latestProgressAt" | "state"
>;

const ACCOUNT_DELETION_STEP_LABELS = {
  request_accepted: "Request accepted",
  revoke_access: "Revoke access",
  delete_samebase_data: "Delete personal data",
  send_completion_email: "Send completion email",
  delete_identity: "Delete account identity",
  finish: "Finish",
} satisfies Record<AccountDeletionStatus["currentStep"], string>;

const ACCOUNT_DELETION_STEPS = entries(ACCOUNT_DELETION_STEP_LABELS).map(([step, label]) => ({
  step,
  label,
}));

export function AccountDeletionPage() {
  const status = useQuery(api.accountDeletion.index.status);

  if (status === undefined) {
    return null;
  }

  if (status === null) {
    return (
      <main className="container mx-auto w-full max-w-2xl py-6">
        <h1 className="text-xl font-semibold @2xl:text-2xl">Account deletion</h1>
        <p className="mt-4 text-sm text-muted-foreground">No account deletion is in progress.</p>
      </main>
    );
  }

  return <AccountDeletionStatusView status={status} />;
}

export function AccountDeletionStatusView({ status }: { status: AccountDeletionStatus }) {
  const needsAttention = status.state === "needs_attention";
  const currentStepIndex = ACCOUNT_DELETION_STEPS.findIndex(
    ({ step }) => step === status.currentStep,
  );

  return (
    <main data-testid="account-deletion-page" className="container mx-auto w-full max-w-2xl py-6">
      <h1 className="text-xl font-semibold @2xl:text-2xl">
        {needsAttention ? "Account deletion needs attention" : "Deleting your account"}
      </h1>
      <p className="mt-4 text-sm text-muted-foreground">
        {needsAttention
          ? "Samebase staff must retry the deletion. Your account remains locked."
          : "You can close this page. Deletion will continue."}
      </p>
      <ol className="mt-8 border-t pt-6" aria-label="Account deletion progress">
        {ACCOUNT_DELETION_STEPS.map(({ step, label }, index) => {
          const completed = index < currentStepIndex;
          const current = index === currentStepIndex;
          const stateLabel = completed
            ? "completed"
            : current && needsAttention
              ? "needs attention"
              : current
                ? "in progress"
                : "not started";
          return (
            <li
              key={step}
              data-account-deletion-step={step}
              data-step-state={completed ? "completed" : current ? "current" : "upcoming"}
              className="relative flex min-h-12 gap-3"
              aria-current={current ? "step" : undefined}
            >
              <span className="relative z-10 flex h-5 w-5 items-center justify-center bg-background">
                {completed ? (
                  <Check className="h-4 w-4" aria-hidden="true" />
                ) : current && needsAttention ? (
                  <TriangleAlert className="h-4 w-4 text-destructive" aria-hidden="true" />
                ) : current ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              {index === ACCOUNT_DELETION_STEPS.length - 1 ? null : (
                <span className="absolute top-5 bottom-0 left-2.5 border-l" aria-hidden="true" />
              )}
              <span className={current ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                {label}
                <span className="sr-only">, {stateLabel}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-sm text-muted-foreground">
        Last activity {new Date(status.latestProgressAt).toLocaleString()}
      </p>
    </main>
  );
}
