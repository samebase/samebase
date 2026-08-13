export const BETA_ACCESS_PENDING_HEADING = "Beta access pending";

export function BetaAccessPendingDescription({ accountIdentity }: { accountIdentity: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      Samebase is currently in private beta, so access is approved manually. You’re signed in as{" "}
      <span className="[overflow-wrap:anywhere]">{accountIdentity}</span>
      {". This page will update automatically when your account is approved."}
    </p>
  );
}
