import { Infer, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type DatabaseReader, type MutationCtx } from "./_generated/server";
import { requireOrganizationNotBillingLimited } from "./organizationBillingLimits";

const { id, literal, object, union } = v;

export const vRepositoryProviderWorkflowAuthority = union(
  object({
    kind: literal("provisioning"),
    runId: id("workflow_repositoryProvisioning_runs"),
    userId: id("users"),
    repositoryId: id("repositories"),
  }),
  object({
    kind: literal("deletion"),
    runId: id("workflow_repositoryDeletion_runs"),
  }),
);
export type RepositoryProviderWorkflowAuthority = Infer<
  typeof vRepositoryProviderWorkflowAuthority
>;

export type ActiveRepositoryProvisioningAuthority = {
  run: Doc<"workflow_repositoryProvisioning_runs">;
  repository: Doc<"repositories">;
  organizationId: Id<"organizations">;
};

export async function requireActiveRepositoryProvisioningRun(
  db: DatabaseReader,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
): Promise<ActiveRepositoryProvisioningAuthority> {
  const [run, repository] = await Promise.all([db.get(args.runId), db.get(args.repositoryId)]);
  if (
    run === null ||
    run.userId !== args.userId ||
    run.repositoryId !== args.repositoryId ||
    (run.state !== "queued" && run.state !== "running")
  ) {
    throw new Error("Provisioning run does not authorize repository access.");
  }
  if (repository === null || run.organizationId !== repository.organizationId) {
    throw new Error("Provisioning run does not match its repository.");
  }
  return { run, repository, organizationId: run.organizationId };
}

export async function requireActiveRepositoryProvisioningAuthority(
  db: DatabaseReader,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
): Promise<ActiveRepositoryProvisioningAuthority> {
  const authority = await requireActiveRepositoryProvisioningRun(db, args);
  await requireOrganizationNotBillingLimited(db, authority.organizationId);
  return authority;
}

export type ActiveRepositoryDeletionAuthority = {
  run: Extract<Doc<"workflow_repositoryDeletion_runs">, { state: "queued" | "running" }>;
  repository: Doc<"repositories">;
  organizationId: Id<"organizations">;
};

export async function requireActiveRepositoryDeletionRun(
  db: DatabaseReader,
  args: { runId: Id<"workflow_repositoryDeletion_runs"> },
): Promise<Extract<Doc<"workflow_repositoryDeletion_runs">, { state: "queued" | "running" }>> {
  const run = await db.get(args.runId);
  if (run === null || (run.state !== "queued" && run.state !== "running")) {
    throw new Error("Repository deletion run does not authorize repository access.");
  }
  return run;
}

export async function requireActiveRepositoryDeletionAuthority(
  db: DatabaseReader,
  args: { runId: Id<"workflow_repositoryDeletion_runs"> },
): Promise<ActiveRepositoryDeletionAuthority> {
  const run = await requireActiveRepositoryDeletionRun(db, args);
  const repository = await db.get(run.repositoryId);
  if (repository === null || repository.organizationId !== run.organizationId) {
    throw new Error("Repository deletion run does not match its repository.");
  }
  const deletion = repository.deletion;
  if (deletion.state !== "deleting" || deletion.runId !== run._id) {
    throw new Error("Repository deletion gate does not match run.");
  }
  return { run, repository, organizationId: run.organizationId };
}

export async function requireRepositoryProviderWorkflowAuthority(
  db: DatabaseReader,
  authority: RepositoryProviderWorkflowAuthority,
): Promise<ActiveRepositoryProvisioningAuthority | ActiveRepositoryDeletionAuthority> {
  switch (authority.kind) {
    case "provisioning":
      return await requireActiveRepositoryProvisioningAuthority(db, authority);
    case "deletion":
      return await requireActiveRepositoryDeletionAuthority(db, authority);
    default:
      authority satisfies never;
      throw new Error("Repository provider workflow authority is invalid.");
  }
}

type RepositoryWorkflowContinuationCtx = Pick<MutationCtx, "db">;

export async function requireActiveRepositoryProvisioningContinuation(
  ctx: RepositoryWorkflowContinuationCtx,
  args: {
    runId: Id<"workflow_repositoryProvisioning_runs">;
    userId: Id<"users">;
    repositoryId: Id<"repositories">;
  },
): Promise<ActiveRepositoryProvisioningAuthority> {
  const authority = await requireActiveRepositoryProvisioningAuthority(ctx.db, args);
  return authority;
}

export async function requireActiveRepositoryDeletionContinuation(
  ctx: RepositoryWorkflowContinuationCtx,
  args: { runId: Id<"workflow_repositoryDeletion_runs"> },
): Promise<ActiveRepositoryDeletionAuthority> {
  const authority = await requireActiveRepositoryDeletionAuthority(ctx.db, args);
  return authority;
}

export async function requireRepositoryProviderWorkflowContinuation(
  ctx: RepositoryWorkflowContinuationCtx,
  authority: RepositoryProviderWorkflowAuthority,
): Promise<ActiveRepositoryProvisioningAuthority | ActiveRepositoryDeletionAuthority> {
  const activeAuthority =
    authority.kind === "provisioning"
      ? await requireActiveRepositoryProvisioningRun(ctx.db, authority)
      : await requireActiveRepositoryDeletionAuthority(ctx.db, authority);
  return activeAuthority;
}

export const assertRepositoryProviderWorkflowContinuation = internalMutation({
  args: {
    authority: vRepositoryProviderWorkflowAuthority,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRepositoryProviderWorkflowContinuation(ctx, args.authority);
    return null;
  },
});
