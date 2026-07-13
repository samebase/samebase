import { getAuthSessionId } from "@convex-dev/auth/server";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { mutation, query } from "../functions";
import { isAdminUser } from "../userAccess";
import { isLiveConnectedVault } from "../vault/state";
import {
  ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP,
  buildAccountDeletionConfirmationPhrase,
  serializeAccountDeletionConfirmationStakes,
} from "../../shared/accountDeletionPhrase";
import { hasStagedFileChanges } from "../../shared/stagedFiles";
import {
  INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
  vAccountDeletionDataProgress,
  vAccountDeletionEventLevel,
  vAccountDeletionOutcomeSummary,
  vAccountDeletionStep,
} from "./model";
import { startAccountDeletionWorkflow } from "./workflow";

const { array, boolean, id, literal, number, object, optional, string, union } = v;

const vActiveAccountDeletionRunState = union(
  literal("queued"),
  literal("running"),
  literal("needs_attention"),
);

const vAccountDeletionRunState = union(
  literal("queued"),
  literal("running"),
  literal("needs_attention"),
  literal("succeeded"),
);

const vAccountDeletionStatus = object({
  runId: id("accountDeletionRuns"),
  completionCapability: string(),
  state: vActiveAccountDeletionRunState,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  dataDeletion: union(
    vAccountDeletionDataProgress,
    object({ state: literal("legacy_unavailable") }),
  ),
});

const vAccountDeletionAffectedBranch = object({
  branch: string(),
  uncommittedFileChangeCount: number(),
});

const vAccountDeletionAffectedVault = object({
  vaultId: id("vaults"),
  repositoryFullName: string(),
  uncommittedFileChangeCount: number(),
  branches: array(vAccountDeletionAffectedBranch),
});

const vAccountDeletionAffectedVaults = union(
  object({
    state: literal("complete"),
    vaults: array(vAccountDeletionAffectedVault),
  }),
  object({ state: literal("unavailable") }),
);

const accountDeletionStakesFields = {
  vaultCount: number(),
  uncommittedFileChangeCount: union(number(), literal("more_than_cap")),
  hasActiveSubscription: boolean(),
  affectedVaults: vAccountDeletionAffectedVaults,
} as const;

const vAccountDeletionStakes = object(accountDeletionStakesFields);

const vAccountDeletionRequestResult = union(
  object({ state: literal("accepted"), status: vAccountDeletionStatus }),
  object({ state: literal("stakes_changed") }),
);

const vAccountDeletionEvent = object({
  step: vAccountDeletionStep,
  level: vAccountDeletionEventLevel,
  message: string(),
  createdAt: number(),
});

const vAccountDeletionCompletion = object({
  state: literal("succeeded"),
  completedAt: number(),
});

const adminAccountDeletionFields = {
  runId: id("accountDeletionRuns"),
  state: vAccountDeletionRunState,
  currentStep: vAccountDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  retryCount: number(),
  outcomes: vAccountDeletionOutcomeSummary,
  email: optional(string()),
  latestSafeError: optional(string()),
  completedAt: optional(number()),
} as const;

const vAdminAccountDeletionListItem = object(adminAccountDeletionFields);

const vAdminAccountDeletionDetail = object({
  ...adminAccountDeletionFields,
  dataDeletion: union(
    vAccountDeletionDataProgress,
    object({ state: literal("legacy_unavailable") }),
    object({ state: literal("receipt_scrubbed") }),
  ),
});

function projectStatus(run: Doc<"accountDeletionRuns">) {
  if (run.state === "succeeded") {
    throw new Error("Account deletion completion state is inconsistent.");
  }

  return {
    runId: run._id,
    completionCapability: run.completionCapability,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
    dataDeletion: run.dataDeletion ?? { state: "legacy_unavailable" as const },
  };
}

function projectAdminListItem(run: Doc<"accountDeletionRuns">) {
  return {
    runId: run._id,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
    retryCount: run.retryCount,
    outcomes: run.outcomes,
    ...(run.identity.state === "active" ? { email: run.identity.email } : {}),
    ...(run.state === "needs_attention" ? { latestSafeError: run.latestSafeError } : {}),
    ...(run.state === "succeeded" ? { completedAt: run.completedAt } : {}),
  };
}

const STAKES_FILE_STAGING_READ_BATCH_SIZE = 200;

/**
Counts what deletion would destroy for the confirmation phrase. fileStaging
reads walk the by_vault index in take() batches cursored on _creationTime
(unique per table), and stop at the cap so one huge vault cannot make the
stakes read unbounded.
*/
async function countAccountDeletionStakes(
  db: DatabaseReader,
  userId: Id<"users">,
  hasActiveSubscription: boolean,
): Promise<Infer<typeof vAccountDeletionStakes>> {
  const vaults = await db
    .query("vaults")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .collect();

  const affectedVaults: Array<Infer<typeof vAccountDeletionAffectedVault>> = [];
  let affectedVaultsComplete = true;
  let uncommittedFileChangeCount = 0;

  for (const vault of vaults) {
    const reviewableVault = isLiveConnectedVault(vault) ? vault : null;
    const uncommittedFileChangesByBranch = new Map<string, number>();
    let vaultUncommittedFileChangeCount = 0;
    let cursorCreationTime: number | undefined;

    for (;;) {
      const batch = await db
        .query("fileStaging")
        .withIndex("by_vault", (q) =>
          cursorCreationTime === undefined
            ? q.eq("vaultId", vault._id)
            : q.eq("vaultId", vault._id).gt("_creationTime", cursorCreationTime),
        )
        .take(STAKES_FILE_STAGING_READ_BATCH_SIZE);

      for (const file of batch) {
        if (!hasStagedFileChanges(file)) {
          continue;
        }

        uncommittedFileChangeCount += 1;
        vaultUncommittedFileChangeCount += 1;

        if (reviewableVault === null) {
          affectedVaultsComplete = false;
        } else {
          uncommittedFileChangesByBranch.set(
            file.branch,
            (uncommittedFileChangesByBranch.get(file.branch) ?? 0) + 1,
          );
        }

        if (uncommittedFileChangeCount > ACCOUNT_DELETION_UNCOMMITTED_FILE_CHANGE_COUNT_CAP) {
          return {
            vaultCount: vaults.length,
            uncommittedFileChangeCount: "more_than_cap",
            hasActiveSubscription,
            affectedVaults: { state: "unavailable" },
          };
        }
      }

      if (batch.length < STAKES_FILE_STAGING_READ_BATCH_SIZE) {
        break;
      }
      cursorCreationTime = batch[batch.length - 1]._creationTime;
    }

    if (reviewableVault !== null && vaultUncommittedFileChangeCount > 0) {
      affectedVaults.push({
        vaultId: reviewableVault._id,
        repositoryFullName: `${reviewableVault.owner}/${reviewableVault.name}`,
        uncommittedFileChangeCount: vaultUncommittedFileChangeCount,
        branches: Array.from(uncommittedFileChangesByBranch, ([branch, count]) => ({
          branch,
          uncommittedFileChangeCount: count,
        })).sort((left, right) => left.branch.localeCompare(right.branch)),
      });
    }
  }

  return {
    vaultCount: vaults.length,
    uncommittedFileChangeCount,
    hasActiveSubscription,
    affectedVaults: affectedVaultsComplete
      ? {
          state: "complete",
          vaults: affectedVaults.sort(
            (left, right) =>
              left.repositoryFullName.localeCompare(right.repositoryFullName) ||
              left.vaultId.localeCompare(right.vaultId),
          ),
        }
      : { state: "unavailable" },
  };
}

export const stakes = query({
  access: "access_account_deletion",
  args: {},
  returns: vAccountDeletionStakes,
  handler: async (ctx) => {
    return await countAccountDeletionStakes(
      ctx.db,
      ctx.viewer.userId,
      ctx.viewer.user.billingStatus === "active" || ctx.viewer.user.billingStatus === "past_due",
    );
  },
});

export const request = mutation({
  access: "access_account_deletion",
  args: {
    completionCapability: string(),
    confirmationPhrase: string(),
    confirmationStakesSnapshot: string(),
  },
  returns: vAccountDeletionRequestResult,
  handler: async (ctx, args) => {
    if (isAdminUser(ctx.viewer.user.email)) {
      throw new Error("Staff accounts cannot request account deletion.");
    }

    const existingMarker = ctx.viewer.user.accountDeletion;
    if (existingMarker !== undefined) {
      const existingRun = await ctx.db.get(existingMarker.runId);
      if (
        existingRun === null ||
        existingRun.identity.state !== "active" ||
        existingRun.identity.userId !== ctx.viewer.userId
      ) {
        throw new Error("Account deletion state is inconsistent.");
      }

      // The run is already committed; re-requests stay idempotent and do not
      // recheck the phrase against counts the running deletion is changing.
      return { state: "accepted" as const, status: projectStatus(existingRun) };
    }

    const initiatingSessionId = await getAuthSessionId(ctx);
    if (initiatingSessionId === null) {
      throw new Error("Authentication session is required to delete an account.");
    }

    if (!/^[0-9a-f]{64}$/.test(args.completionCapability)) {
      throw new Error("Account deletion completion capability is invalid.");
    }

    const existingCapability = await ctx.db
      .query("accountDeletionRuns")
      .withIndex("by_completion_capability", (query) =>
        query.eq("completionCapability", args.completionCapability),
      )
      .first();

    if (existingCapability !== null) {
      throw new Error("Account deletion completion capability is already in use.");
    }

    const currentStakes = await countAccountDeletionStakes(
      ctx.db,
      ctx.viewer.userId,
      ctx.viewer.user.billingStatus === "active" || ctx.viewer.user.billingStatus === "past_due",
    );
    if (
      args.confirmationPhrase !== buildAccountDeletionConfirmationPhrase(currentStakes) ||
      args.confirmationStakesSnapshot !== serializeAccountDeletionConfirmationStakes(currentStakes)
    ) {
      // Expected UI state: any displayed stake moved after the dialog rendered,
      // or the phrase was mistyped. Nothing is created; the subscribed stakes
      // query supplies the current confirmation details.
      return { state: "stakes_changed" as const };
    }

    const now = Date.now();
    const activeRunFields = {
      identity: {
        state: "active",
        userId: ctx.viewer.userId,
        email: ctx.viewer.user.email,
      },
      completionCapability: args.completionCapability,
      currentStep: "request_accepted",
      requestedAt: now,
      updatedAt: now,
      initiatingSessionId,
      retryCount: 0,
      outcomes: {
        billing: { state: "not_started" },
        providerRevocation: { state: "not_started" },
        completionEmail: { state: "not_started" },
      },
      dataDeletion: INITIAL_ACCOUNT_DELETION_DATA_PROGRESS,
    } as const;

    const runId = await ctx.db.insert("accountDeletionRuns", {
      ...activeRunFields,
      state: "queued",
      workflow: { state: "not_started" },
    });

    await ctx.db.insert("accountDeletionEvents", {
      runId,
      step: "request_accepted",
      level: "info",
      message: "Account deletion was requested.",
      createdAt: now,
    });

    await ctx.db.patch(ctx.viewer.userId, {
      accountDeletion: {
        state: "deleting",
        runId,
        requestedAt: now,
      },
    });

    const workflowId = await startAccountDeletionWorkflow(ctx, runId);

    await ctx.db.replace(runId, {
      ...activeRunFields,
      state: "running",
      workflow: { state: "started", workflowId, attempt: 1 },
    });

    const run = await ctx.db.get(runId);

    if (run === null || run.identity.state !== "active") {
      throw new Error("Account deletion run was not created.");
    }

    return { state: "accepted" as const, status: projectStatus(run) };
  },
});

export const retry = mutation({
  access: "access_admin",
  args: { runId: id("accountDeletionRuns") },
  returns: vAccountDeletionStatus,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.identity.state !== "active" || run.state !== "needs_attention") {
      throw new Error("Account deletion run is not retryable.");
    }

    const user = await ctx.db.get(run.identity.userId);

    if (user === null || user.accountDeletion?.runId !== run._id) {
      throw new Error("Account deletion marker is inconsistent.");
    }

    const workflowId = await startAccountDeletionWorkflow(ctx, run._id);
    const now = Date.now();

    await ctx.db.replace(run._id, {
      identity: run.identity,
      completionCapability: run.completionCapability,
      state: "running",
      workflow: {
        state: "started",
        workflowId,
        attempt: run.workflow.attempt + 1,
      },
      currentStep: run.currentStep,
      requestedAt: run.requestedAt,
      updatedAt: now,
      initiatingSessionId: run.initiatingSessionId,
      retryCount: run.retryCount + 1,
      outcomes: run.outcomes,
      dataDeletion: run.dataDeletion,
    });

    await ctx.db.patch(user._id, {
      accountDeletion: {
        state: "deleting",
        runId: run._id,
        requestedAt: run.requestedAt,
      },
    });

    await ctx.db.insert("accountDeletionEvents", {
      runId: run._id,
      step: run.currentStep,
      level: "info",
      message: "Staff retried account deletion.",
      createdAt: now,
    });

    const retried = await ctx.db.get(run._id);

    if (retried === null) {
      throw new Error("Account deletion run was not restarted.");
    }

    return projectStatus(retried);
  },
});

export const status = query({
  access: "access_account_deletion",
  args: {},
  returns: union(v.null(), vAccountDeletionStatus),
  handler: async (ctx) => {
    const marker = ctx.viewer.user.accountDeletion;
    if (marker === undefined) {
      return null;
    }

    const run = await ctx.db.get(marker.runId);

    if (
      run === null ||
      run.identity.state !== "active" ||
      run.identity.userId !== ctx.viewer.userId
    ) {
      throw new Error("Account deletion state is inconsistent.");
    }

    return projectStatus(run);
  },
});

export const completion = query({
  access: "access_public",
  args: { completionCapability: string() },
  returns: union(v.null(), vAccountDeletionCompletion),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.completionCapability)) {
      return null;
    }

    const run = await ctx.db
      .query("accountDeletionRuns")
      .withIndex("by_completion_capability", (query) =>
        query.eq("completionCapability", args.completionCapability),
      )
      .first();

    if (run === null || run.identity.state !== "scrubbed" || run.state !== "succeeded") {
      return null;
    }

    return { state: run.state, completedAt: run.completedAt };
  },
});

export const listForAdmin = query({
  access: "access_admin",
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(vAdminAccountDeletionListItem),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("accountDeletionRuns")
      .withIndex("by_updated_at")
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...runs,
      page: runs.page.map(projectAdminListItem),
    };
  },
});

export const detailForAdmin = query({
  access: "access_admin",
  args: {
    runId: id("accountDeletionRuns"),
  },
  returns: union(
    v.null(),
    object({
      run: vAdminAccountDeletionDetail,
      events: array(vAccountDeletionEvent),
    }),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run === null) {
      return null;
    }

    const events = await ctx.db
      .query("accountDeletionEvents")
      .withIndex("by_run_and_created_at", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take(100);

    const dataDeletion =
      run.state === "succeeded"
        ? ({ state: "receipt_scrubbed" } as const)
        : (run.dataDeletion ?? ({ state: "legacy_unavailable" } as const));

    return {
      run: {
        ...projectAdminListItem(run),
        dataDeletion,
      },
      events: events.reverse().map(({ step, level, message, createdAt }) => ({
        step,
        level,
        message,
        createdAt,
      })),
    };
  },
});
