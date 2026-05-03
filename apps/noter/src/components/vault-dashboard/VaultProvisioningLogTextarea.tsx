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
      rows={Math.max(4, events.length + 1)}
      className="w-full font-mono text-xs"
      value={formatProvisioningLogText(events)}
    />
  );
}
