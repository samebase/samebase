import { AccountDeletionStatusView } from "@/components/AccountDeletionPage";

export type AccountDeletionStatusVisualMode =
  | "account-deletion-running"
  | "account-deletion-attention";

export function AccountDeletionStatusVisualFixture({
  mode,
}: {
  mode: AccountDeletionStatusVisualMode;
}) {
  return (
    <AccountDeletionStatusView
      status={{
        currentStep: "delete_samebase_data",
        dataDeletion: {
          chatsAndAgentData: {
            state: "completed",
            startedAt: Date.UTC(2026, 6, 12, 11, 55),
            completedAt: Date.UTC(2026, 6, 12, 11, 56),
          },
          vaultsAndStagedChanges: {
            state: "in_progress",
            startedAt: Date.UTC(2026, 6, 12, 11, 56),
            updatedAt: Date.UTC(2026, 6, 12, 12),
            deletedVaultCount: 1,
            currentVaultPhase: "staged_changes",
          },
          preferences: { state: "not_started" },
          appAccessAndTokens: { state: "not_started" },
          accessRequestsAndHistory: { state: "not_started" },
        },
        latestProgressAt: Date.UTC(2026, 6, 12, 12),
        state: mode === "account-deletion-running" ? "running" : "needs_attention",
      }}
    />
  );
}
