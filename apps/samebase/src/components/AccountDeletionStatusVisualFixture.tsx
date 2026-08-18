import { AccountDeletionStatusView } from "@/components/AccountDeletionPage";

export type AccountDeletionStatusVisualMode =
  | "account-deletion-queued"
  | "account-deletion-running"
  | "account-deletion-attention";

export function AccountDeletionStatusVisualFixture({
  mode,
}: {
  mode: AccountDeletionStatusVisualMode;
}) {
  return (
    <AccountDeletionStatusView
      isSigningOut={false}
      onSignOut={() => {}}
      status={{
        currentStep: "delete_samebase_data",
        latestProgressAt: Date.UTC(2026, 6, 12, 12),
        deletionStartsAt: Date.UTC(2026, 6, 19, 12),
        state:
          mode === "account-deletion-queued"
            ? "queued"
            : mode === "account-deletion-running"
              ? "running"
              : "needs_attention",
      }}
    />
  );
}
