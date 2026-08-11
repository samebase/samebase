import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";
import { readVaultDeletionState } from "./vault/deletion/state";

const { id, literal, object, union } = v;

export const vVaultProviderWorkflowAuthority = union(
  object({
    kind: literal("provisioning"),
    runId: id("workflow_vaultProvisioning_runs"),
    userId: id("users"),
    vaultId: id("vaults"),
  }),
  object({
    kind: literal("deletion"),
    runId: id("workflow_vaultDeletion_runs"),
  }),
);
export type VaultProviderWorkflowAuthority = Infer<typeof vVaultProviderWorkflowAuthority>;

export type ActiveVaultProvisioningAuthority = {
  run: Doc<"workflow_vaultProvisioning_runs">;
  vault: Doc<"vaults">;
  organizationId: Id<"organizations">;
};

export async function requireActiveVaultProvisioningAuthority(
  db: DatabaseReader,
  args: {
    runId: Id<"workflow_vaultProvisioning_runs">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<ActiveVaultProvisioningAuthority> {
  const [run, vault] = await Promise.all([db.get(args.runId), db.get(args.vaultId)]);
  if (
    run === null ||
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (run.state !== "queued" && run.state !== "running")
  ) {
    throw new Error("Provisioning run does not authorize vault access.");
  }
  if (vault === null || run.organizationId !== vault.organizationId) {
    throw new Error("Provisioning run does not match its vault.");
  }
  return { run, vault, organizationId: run.organizationId };
}

export type ActiveVaultDeletionAuthority = {
  run: Extract<Doc<"workflow_vaultDeletion_runs">, { state: "queued" | "running" }>;
  vault: Doc<"vaults">;
  organizationId: Id<"organizations">;
};

export async function requireActiveVaultDeletionRun(
  db: DatabaseReader,
  args: { runId: Id<"workflow_vaultDeletion_runs"> },
): Promise<Extract<Doc<"workflow_vaultDeletion_runs">, { state: "queued" | "running" }>> {
  const run = await db.get(args.runId);
  if (run === null || (run.state !== "queued" && run.state !== "running")) {
    throw new Error("Vault deletion run does not authorize vault access.");
  }
  return run;
}

export async function requireActiveVaultDeletionAuthority(
  db: DatabaseReader,
  args: { runId: Id<"workflow_vaultDeletion_runs"> },
): Promise<ActiveVaultDeletionAuthority> {
  const run = await requireActiveVaultDeletionRun(db, args);
  const vault = await db.get(run.vaultId);
  if (vault === null || vault.organizationId !== run.organizationId) {
    throw new Error("Vault deletion run does not match its vault.");
  }
  const deletion = readVaultDeletionState(vault);
  if (deletion.state !== "deleting" || deletion.runId !== run._id) {
    throw new Error("Vault deletion gate does not match run.");
  }
  return { run, vault, organizationId: run.organizationId };
}

export async function requireVaultProviderWorkflowAuthority(
  db: DatabaseReader,
  authority: VaultProviderWorkflowAuthority,
): Promise<ActiveVaultProvisioningAuthority | ActiveVaultDeletionAuthority> {
  switch (authority.kind) {
    case "provisioning":
      return await requireActiveVaultProvisioningAuthority(db, authority);
    case "deletion":
      return await requireActiveVaultDeletionAuthority(db, authority);
    default:
      authority satisfies never;
      throw new Error("Vault provider workflow authority is invalid.");
  }
}
