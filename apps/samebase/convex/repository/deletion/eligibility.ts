import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  readRepositoryInfrastructureState,
  type RepositoryInfrastructureState,
} from "../infrastructureOperation";

export type RepositoryDeletionEligibility =
  | {
      state: "eligible";
    }
  | {
      state: "blocked";
      reason: string;
    };

export function resolveRepositoryDeletionEligibility(
  repository: Doc<"repositories">,
  infrastructure: RepositoryInfrastructureState,
  hasActiveProvisioningRun: boolean,
): RepositoryDeletionEligibility {
  const deletion = repository.deletion;
  if (deletion.state !== "not_deleting") {
    return {
      state: "blocked",
      reason: "Removal from Samebase is already in progress.",
    };
  }
  if (repository.state === "not_connected") {
    return {
      state: "blocked",
      reason: "This repository is not ready for removal yet.",
    };
  }
  if (repository.state === "provisioning") {
    return {
      state: "blocked",
      reason: "Repository setup is still running.",
    };
  }

  switch (infrastructure.operation.kind) {
    case "none":
      return hasActiveProvisioningRun
        ? {
            state: "blocked",
            reason: "Repository setup is still running.",
          }
        : { state: "eligible" };
    case "managed_run":
      return {
        state: "blocked",
        reason:
          infrastructure.operation.run?.state === "queued"
            ? "Repository setup is still queued."
            : "Repository setup is still running.",
      };
    case "manual_provider_write":
      return {
        state: "blocked",
        reason: "A provider change is still running.",
      };
    default:
      infrastructure.operation satisfies never;
      throw new Error("Unknown repository infrastructure operation.");
  }
}

export async function hasActiveRepositoryProvisioningRun(
  ctx: Pick<QueryCtx, "db">,
  repositoryId: Id<"repositories">,
): Promise<boolean> {
  const [queuedRun, runningRun] = await Promise.all([
    ctx.db
      .query("workflow_repositoryProvisioning_runs")
      .withIndex("by_repository_and_state", (q) =>
        q.eq("repositoryId", repositoryId).eq("state", "queued"),
      )
      .first(),
    ctx.db
      .query("workflow_repositoryProvisioning_runs")
      .withIndex("by_repository_and_state", (q) =>
        q.eq("repositoryId", repositoryId).eq("state", "running"),
      )
      .first(),
  ]);
  return queuedRun !== null || runningRun !== null;
}

export async function readRepositoryDeletionEligibility(
  ctx: Pick<QueryCtx, "db">,
  repository: Doc<"repositories">,
): Promise<RepositoryDeletionEligibility> {
  const [infrastructure, hasActiveProvisioningRun] = await Promise.all([
    readRepositoryInfrastructureState(ctx, repository),
    hasActiveRepositoryProvisioningRun(ctx, repository._id),
  ]);
  return resolveRepositoryDeletionEligibility(repository, infrastructure, hasActiveProvisioningRun);
}
