import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, Circle, Loader2, TriangleAlert } from "lucide-react";
import { entries } from "@samebase/dependent/object";
import { api } from "../../convex/_generated/api";

type AccountDeletionStatus = Pick<
  Exclude<FunctionReturnType<typeof api.accountDeletion.index.status>, null>,
  "currentStep" | "dataDeletion" | "latestProgressAt" | "state"
>;

type TrackedAccountDeletionData = Exclude<
  AccountDeletionStatus["dataDeletion"],
  { state: "legacy_unavailable" }
>;

const ACCOUNT_DELETION_STEP_LABELS = {
  request_accepted: "Request accepted",
  cancel_billing: "Cancel billing",
  revoke_access: "Revoke access",
  delete_samebase_data: "Delete account data",
  send_completion_email: "Send completion email",
  delete_identity: "Delete account identity",
  finish: "Finish",
} satisfies Record<AccountDeletionStatus["currentStep"], string>;

const ACCOUNT_DELETION_STEPS = entries(ACCOUNT_DELETION_STEP_LABELS).map(([step, label]) => ({
  step,
  label,
}));

const ACCOUNT_DELETION_DATA_GROUP_LABELS = {
  chatsAndAgentData: "Chats and agent data",
  vaultsAndStagedChanges: "Vaults and staged changes",
  connectedMachines: "Connected machines",
  preferences: "Preferences",
  appAccessAndTokens: "App access and tokens",
  accessRequestsAndHistory: "Access requests and history",
} satisfies Record<keyof TrackedAccountDeletionData, string>;

const ACCOUNT_DELETION_DATA_GROUPS = entries(ACCOUNT_DELETION_DATA_GROUP_LABELS).map(
  ([group, label]) => ({ group, label }),
);

const ACCOUNT_DELETION_VAULT_PHASE_LABELS = {
  staged_changes: "staged changes",
  vault_data: "vault data",
  source_data: "source data",
  app_data: "app data",
  access_state: "vault access",
  provisioning_history: "provisioning history",
} satisfies Record<
  Extract<
    TrackedAccountDeletionData["vaultsAndStagedChanges"],
    { state: "in_progress" }
  >["currentVaultPhase"],
  string
>;

export function AccountDeletionPage() {
  const status = useQuery(api.accountDeletion.index.status);

  if (status === undefined) {
    return null;
  }

  if (status === null) {
    return (
      <main className="container mx-auto w-full max-w-2xl py-6">
        <h1 className="text-xl font-semibold sm:text-2xl">Account deletion</h1>
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
  const dataDeletionStepIndex = ACCOUNT_DELETION_STEPS.findIndex(
    ({ step }) => step === "delete_samebase_data",
  );
  const dataDeletion = "state" in status.dataDeletion ? null : status.dataDeletion;
  const showDataDeletion = dataDeletion !== null && currentStepIndex >= dataDeletionStepIndex;
  return (
    <main data-testid="account-deletion-page" className="container mx-auto w-full max-w-2xl py-6">
      <h1 className="text-xl font-semibold sm:text-2xl">
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
              <div className="min-w-0 flex-1">
                <span className={current ? "text-sm font-medium" : "text-sm text-muted-foreground"}>
                  {label}
                  <span className="sr-only">, {stateLabel}</span>
                </span>
                {step === "delete_samebase_data" && showDataDeletion ? (
                  <ol className="mt-3 grid gap-3 pb-4" aria-label="Account data deletion progress">
                    {ACCOUNT_DELETION_DATA_GROUPS.map(({ group, label: groupLabel }) => {
                      const progress = dataDeletion[group];
                      const completed = progress.state === "completed";
                      const current = progress.state === "in_progress";
                      const groupStateLabel = completed
                        ? "completed"
                        : current && needsAttention
                          ? "needs attention"
                          : current
                            ? "in progress"
                            : "not started";
                      const vaultProgress =
                        group === "vaultsAndStagedChanges"
                          ? dataDeletion.vaultsAndStagedChanges
                          : null;
                      return (
                        <li
                          key={group}
                          data-account-deletion-data-group={group}
                          data-group-state={
                            completed ? "completed" : current ? "current" : "upcoming"
                          }
                          className="flex gap-2.5"
                          aria-current={current ? "step" : undefined}
                        >
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                            {completed ? (
                              <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            ) : current && needsAttention ? (
                              <TriangleAlert
                                className="h-3.5 w-3.5 text-destructive"
                                aria-hidden="true"
                              />
                            ) : current ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              <Circle
                                className="h-3.5 w-3.5 text-muted-foreground"
                                aria-hidden="true"
                              />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <span
                              className={
                                current ? "text-sm font-medium" : "text-sm text-muted-foreground"
                              }
                            >
                              {groupLabel}
                              <span className="sr-only">, {groupStateLabel}</span>
                            </span>
                            {vaultProgress?.state === "in_progress" ||
                            vaultProgress?.state === "completed" ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                <span className="block">
                                  {vaultProgress.deletedVaultCount}{" "}
                                  {vaultProgress.deletedVaultCount === 1 ? "vault" : "vaults"}{" "}
                                  deleted
                                </span>
                                {vaultProgress.state === "in_progress" ? (
                                  <span className="block" role="status">
                                    {needsAttention ? "Stopped while deleting" : "Deleting"}{" "}
                                    {
                                      ACCOUNT_DELETION_VAULT_PHASE_LABELS[
                                        vaultProgress.currentVaultPhase
                                      ]
                                    }
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </div>
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
