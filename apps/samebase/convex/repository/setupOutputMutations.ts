import { ConvexError, v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { requireRepositoryForUser } from "../organizationAccess";
import { insertWorker } from "./cloudflareMutations";
import { vConvexCodeLocation } from "./contracts/convexAttachments";
import { insertProject } from "./convexMutations";
import { requireUserRepositoryInfrastructureIdle } from "./infrastructureOperation";
import { vRepositoryProviderResourceOrigin } from "./model";
import { vRepositoryActionsSetupOutput } from "./provisioningModel";
import { isSamebaseProvisioningPlan } from "./provisioningPlan";
import { isNewerSetupOutput, vSetupOutputSource } from "./setupOutputModel";

const { array, id, literal, number, object, string, union } = v;

/** The refusal when another apply moved the checkpoint between the read and the apply. */
export const SETUP_OUTPUT_CHANGED_MESSAGE =
  "The applied setup output changed while Samebase read the newest one, so nothing changed. Apply it again.";

/**
A setup output after the providers confirmed every claim (verifySetupStackWorkers and
verifySetupStackProjects). `replacedWorkerIds` are setup_stack rows whose Worker a drift repair
recreated under the same name and a new tag.
*/
const vVerifiedSetupOutput = union(
  object({
    state: literal("deployed"),
    outputVersion: literal(1),
    accountId: string(),
    workers: array(object({ workerName: string(), workerTag: string(), rootDirectory: string() })),
    replacedWorkerIds: array(id("repositoryCloudflareWorkers")),
    teamId: string(),
    projects: array(object({ projectId: string(), codeLocation: vConvexCodeLocation })),
  }),
  object({ state: literal("destroyed") }),
);
export type VerifiedSetupOutput = Infer<typeof vVerifiedSetupOutput>;

const vSetupOutputApplyContext = object({
  setupOutput: union(vRepositoryActionsSetupOutput, v.null()),
  attachedWorkers: array(
    object({
      workerId: id("repositoryCloudflareWorkers"),
      workerName: string(),
      workerTag: string(),
      origin: vRepositoryProviderResourceOrigin,
    }),
  ),
});

async function requireRepositoryActionsPlan(
  ctx: Pick<QueryCtx, "db">,
  repositoryId: Id<"repositories">,
): Promise<
  Extract<Doc<"workflow_repositoryProvisioning_plans">, { provisioning: "repository_actions" }>
> {
  const plan = await ctx.db
    .query("workflow_repositoryProvisioning_plans")
    .withIndex("by_repository", (q) => q.eq("repositoryId", repositoryId))
    .unique();
  if (!plan || isSamebaseProvisioningPlan(plan)) {
    throw new ConvexError(
      "Samebase reads a setup output only for repositories that their GitHub Actions set up, so nothing changed.",
    );
  }
  return plan;
}

/** What the apply compares the newest setup output with: the applied checkpoint and the Workers. */
export const readApplyContext = internalQuery({
  args: { userId: id("users"), repositoryId: id("repositories") },
  returns: vSetupOutputApplyContext,
  handler: async (ctx, args): Promise<Infer<typeof vSetupOutputApplyContext>> => {
    await requireRepositoryForUser(ctx.db, args);
    const plan = await requireRepositoryActionsPlan(ctx, args.repositoryId);
    const workers = await ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_repository", (q) => q.eq("repositoryId", args.repositoryId))
      .collect();
    return {
      setupOutput: plan.setupOutput ?? null,
      attachedWorkers: workers
        .map((worker) => ({
          workerId: worker._id,
          workerName: worker.workerName,
          workerTag: worker.workerTag,
          origin: worker.origin,
        }))
        .sort(
          (left, right) =>
            left.workerName.localeCompare(right.workerName) ||
            left.workerTag.localeCompare(right.workerTag),
        ),
    };
  },
});

/**
Applies a verified setup output in one transaction. The checkpoint is a compare-and-swap on the
applied artifact id, so two applies of different reads cannot both win. A deployed output attaches
every Worker and Convex project with origin setup_stack: a row of this repository with the same
identity keeps its coordinates and takes the origin, a replaced Worker row is deleted first, and the
insert helpers keep the exclusivity, destination, and connection quota rules of the attach dialogs.
A destroy receipt only moves the checkpoint; the rows stay until a member removes them.
*/
export const apply = internalMutation({
  args: {
    userId: id("users"),
    repositoryId: id("repositories"),
    expectedArtifactId: union(number(), v.null()),
    source: vSetupOutputSource,
    output: vVerifiedSetupOutput,
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const repository = await requireUserRepositoryInfrastructureIdle(ctx, args);
    const plan = await requireRepositoryActionsPlan(ctx, args.repositoryId);
    if ((plan.setupOutput?.artifactId ?? null) !== args.expectedArtifactId) {
      throw new ConvexError(SETUP_OUTPUT_CHANGED_MESSAGE);
    }
    if (!isNewerSetupOutput(args.source, plan.setupOutput ?? null)) {
      throw new ConvexError("This setup output is older than the applied one, so nothing changed.");
    }

    const now = Date.now();
    const { output } = args;
    switch (output.state) {
      case "destroyed":
        await ctx.db.patch(plan._id, {
          setupOutput: {
            state: "destroy_reported",
            runId: args.source.runId,
            runAttempt: args.source.runAttempt,
            artifactId: args.source.artifactId,
            artifactCreatedAt: args.source.artifactCreatedAt,
            reportedAt: now,
          },
          updatedAt: now,
        });
        return null;
      case "deployed":
        break;
      default:
        output satisfies never;
        throw new Error("Unknown setup output state.");
    }

    for (const workerId of output.replacedWorkerIds) {
      const replaced = await ctx.db.get(workerId);
      if (
        !replaced ||
        replaced.repositoryId !== args.repositoryId ||
        replaced.origin !== "setup_stack" ||
        !output.workers.some(
          (worker) =>
            worker.workerName === replaced.workerName && worker.workerTag !== replaced.workerTag,
        )
      ) {
        throw new ConvexError(
          "The Worker that the setup output replaces changed while Samebase read it, so nothing changed. Apply it again.",
        );
      }
      await ctx.db.delete(workerId);
    }

    const billingAuthority = {
      kind: "user" as const,
      organizationId: repository.organizationId,
      userId: args.userId,
    };
    for (const worker of output.workers) {
      await insertWorker(ctx, repository, {
        repositoryId: args.repositoryId,
        billingAuthority,
        accountId: output.accountId,
        workerName: worker.workerName,
        workerTag: worker.workerTag,
        rootDirectory: worker.rootDirectory,
        origin: "setup_stack",
      });
    }
    for (const project of output.projects) {
      await insertProject(ctx, repository, {
        repositoryId: args.repositoryId,
        billingAuthority,
        teamId: output.teamId,
        projectId: project.projectId,
        codeLocation: project.codeLocation,
        origin: "setup_stack",
      });
    }
    await ctx.db.patch(plan._id, {
      setupOutput: {
        state: "applied",
        runId: args.source.runId,
        runAttempt: args.source.runAttempt,
        artifactId: args.source.artifactId,
        artifactCreatedAt: args.source.artifactCreatedAt,
        outputVersion: output.outputVersion,
        appliedAt: now,
      },
      updatedAt: now,
    });
    return null;
  },
});
