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
        currentStep: "revoke_access",
        latestProgressAt: Date.UTC(2026, 6, 12, 12),
        state: mode === "account-deletion-running" ? "running" : "needs_attention",
      }}
    />
  );
}
