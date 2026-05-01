import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { formatProvisioningLogText } from "@/lib/provisioningLog";

export function VaultProvisioningLogTextarea(props: {
  repositoryFullName: string;
  vaultId: Id<"vaults">;
}) {
  const events = useQuery(api.appProvisioningEvents.listForVault, {
    vaultId: props.vaultId,
  });
  if (!events || events.length === 0) {
    return null;
  }

  return (
    <textarea
      aria-label={`Provisioning log for ${props.repositoryFullName}`}
      readOnly
      rows={Math.min(8, Math.max(4, events.length + 1))}
      className="max-h-52 min-h-20 w-full resize-y overflow-auto whitespace-pre-wrap corner-notch-1 border bg-background/70 p-2 font-mono text-xs text-muted-foreground"
      value={formatProvisioningLogText(events)}
    />
  );
}
