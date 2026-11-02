import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type InfrastructureOperationReadCtx = Pick<QueryCtx, "db">;
type ProviderWrite = Doc<"workflow_repositoryProvisioning_writeLocks">;
type ProvisioningRun = Doc<"workflow_repositoryProvisioning_runs">;

/** The refusal while another provider operation runs. It holds no provider text, so MCP shows it. */
export const INFRASTRUCTURE_OPERATION_ACTIVE_MESSAGE =
  "Another Samebase setup or provider change is running for this repository, so nothing changed. Try again after it finishes.";

export type RepositoryInfrastructureOperation =
  | { kind: "none" }
  | {
      kind: "managed_run";
      runId: Id<"workflow_repositoryProvisioning_runs">;
      run: ProvisioningRun | null;
      updatedAt: number;
    };

export type RepositoryInfrastructureState = {
  operation: RepositoryInfrastructureOperation;
  providerWrite: ProviderWrite | null;
};

/**
 * Reads the one repository-level operation that can change provider intent or
 * infrastructure. A provisioning plan is not an operation.
 *
 * Only a managed run holds the lock now. A row with a `manual_provider_write`
 * owner is a finished record in any state: nothing can end one that still says
 * `active`, and reporting it would block Remove from Samebase for good.
 */
export async function readRepositoryInfrastructureState(
  ctx: InfrastructureOperationReadCtx,
  repository: Doc<"repositories">,
): Promise<RepositoryInfrastructureState> {
  const providerWrite = await ctx.db
    .query("workflow_repositoryProvisioning_writeLocks")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repository._id))
    .unique();
  if (providerWrite?.owner.kind === "managed_run" && providerWrite.state === "active") {
    const run = await ctx.db.get(providerWrite.owner.runId);
    return {
      operation: {
        kind: "managed_run",
        runId: providerWrite.owner.runId,
        run,
        updatedAt: providerWrite.updatedAt,
      },
      providerWrite,
    };
  }
  return { operation: { kind: "none" }, providerWrite };
}
