import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { buildOrganizationDeletionConfirmationPhrase } from "../../shared/organizationDeletionPhrase";
import type { Doc } from "../_generated/dataModel";
import { mutation, query } from "../functions";
import { findOrganizationMembership } from "../organizationAccess";
import { readBillingAccountState } from "../organizationBilling";
import { scheduleOrganizationDeletion } from "./executor";
import { appendOrganizationDeletionEvent } from "./events";
import { vOrganizationDeletionStep } from "./model";

const { id, literal, number, object, optional, string, union } = v;

const vRunningOrganizationDeletionStatus = object({
  state: literal("running"),
  runId: id("workflow_organizationDeletion_runs"),
  currentStep: vOrganizationDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
});

const vNeedsAttentionOrganizationDeletionStatus = object({
  state: literal("needs_attention"),
  runId: id("workflow_organizationDeletion_runs"),
  currentStep: vOrganizationDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  latestSafeError: string(),
});

const vActiveOrganizationDeletionStatus = union(
  vRunningOrganizationDeletionStatus,
  vNeedsAttentionOrganizationDeletionStatus,
);

const vOrganizationDeletionSettings = object({
  organizationId: id("organizations"),
  githubOwnerLogin: string(),
  confirmationPhrase: string(),
  deletion: union(
    object({ state: literal("eligible") }),
    object({ state: literal("shared_organization") }),
    object({ state: literal("not_owner") }),
    vActiveOrganizationDeletionStatus,
  ),
});

const vOrganizationDeletionRequestResult = union(
  object({ state: literal("accepted"), status: vActiveOrganizationDeletionStatus }),
  object({ state: literal("confirmation_mismatch") }),
  object({ state: literal("shared_organization") }),
);

function projectActiveStatus(run: Doc<"workflow_organizationDeletion_runs">) {
  if (run.state === "running") {
    return {
      state: run.state,
      runId: run._id,
      currentStep: run.currentStep,
      requestedAt: run.requestedAt,
      latestProgressAt: run.updatedAt,
    } as const;
  }
  if (run.state === "needs_attention") {
    return {
      state: run.state,
      runId: run._id,
      currentStep: run.currentStep,
      requestedAt: run.requestedAt,
      latestProgressAt: run.updatedAt,
      latestSafeError: run.latestSafeError,
    } as const;
  }
  throw new Error("Organization deletion run is not active.");
}

async function loadActiveRunForOrganization(
  ctx: Parameters<typeof findOrganizationMembership>[0],
  organization: Doc<"organizations">,
) {
  if (!organization.deletion) {
    return null;
  }
  const run = await ctx.get(organization.deletion.runId);
  if (
    run === null ||
    run.organization.state !== "active" ||
    run.organization.organizationId !== organization._id ||
    (run.state !== "running" && run.state !== "needs_attention")
  ) {
    throw new Error("Organization deletion state is inconsistent.");
  }
  return run;
}

export const settings = query({
  access: "access_dashboard",
  args: { organizationId: id("organizations") },
  returns: union(v.null(), vOrganizationDeletionSettings),
  handler: async (ctx, args) => {
    const [organization, membership] = await Promise.all([
      ctx.db.get(args.organizationId),
      findOrganizationMembership(ctx.db, {
        organizationId: args.organizationId,
        userId: ctx.viewer.userId,
      }),
    ]);
    if (organization === null || membership === null) {
      return null;
    }
    const common = {
      organizationId: organization._id,
      githubOwnerLogin: organization.githubOwnerLogin,
      confirmationPhrase: buildOrganizationDeletionConfirmationPhrase(
        organization.githubOwnerLogin,
      ),
    };
    const activeRun = await loadActiveRunForOrganization(ctx.db, organization);
    if (activeRun !== null) {
      return { ...common, deletion: projectActiveStatus(activeRun) };
    }
    if (membership.role !== "owner") {
      return { ...common, deletion: { state: "not_owner" as const } };
    }
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_role", (query) =>
        query.eq("organizationId", organization._id),
      )
      .take(2);
    return {
      ...common,
      deletion:
        memberships.length === 1
          ? { state: "eligible" as const }
          : { state: "shared_organization" as const },
    };
  },
});

export const request = mutation({
  access: "access_dashboard",
  args: {
    organizationId: id("organizations"),
    confirmationPhrase: string(),
  },
  returns: vOrganizationDeletionRequestResult,
  handler: async (ctx, args) => {
    const [organization, membership] = await Promise.all([
      ctx.db.get(args.organizationId),
      findOrganizationMembership(ctx.db, {
        organizationId: args.organizationId,
        userId: ctx.viewer.userId,
      }),
    ]);
    if (organization === null || membership === null || membership.role !== "owner") {
      throw new Error("Organization owner access is required.");
    }

    const activeRun = await loadActiveRunForOrganization(ctx.db, organization);
    if (activeRun !== null) {
      return { state: "accepted" as const, status: projectActiveStatus(activeRun) };
    }

    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_role", (query) =>
        query.eq("organizationId", organization._id),
      )
      .take(2);
    if (memberships.length !== 1 || memberships[0]?._id !== membership._id) {
      return { state: "shared_organization" as const };
    }
    const confirmationPhrase = buildOrganizationDeletionConfirmationPhrase(
      organization.githubOwnerLogin,
    );
    if (args.confirmationPhrase !== confirmationPhrase) {
      return { state: "confirmation_mismatch" as const };
    }

    const billing = await ctx.db
      .query("organizationBillingAccounts")
      .withIndex("by_organization", (query) => query.eq("organizationId", organization._id))
      .unique();
    if (billing === null) {
      throw new Error("Organization billing state is missing.");
    }
    const externalCustomerId = readBillingAccountState(billing).polarExternalCustomerId?.trim();
    const now = Date.now();
    const executionAttempt = 1;
    const runId = await ctx.db.insert("workflow_organizationDeletion_runs", {
      state: "running",
      organization: {
        state: "active",
        organizationId: organization._id,
        githubOwnerLogin: organization.githubOwnerLogin,
      },
      requestedByUserId: ctx.viewer.userId,
      currentStep: "request_accepted",
      requestedAt: now,
      updatedAt: now,
      retryCount: 0,
      executionAttempt,
      automaticRestartCount: 0,
      providerCleanup: externalCustomerId
        ? { state: "pending_customer_lookup", externalCustomerId }
        : { state: "not_required" },
    });
    await ctx.db.patch(organization._id, {
      deletion: { state: "deleting", runId, requestedAt: now },
    });
    await appendOrganizationDeletionEvent(ctx, {
      runId,
      step: "request_accepted",
      level: "info",
      message: "Organization deletion was requested.",
      createdAt: now,
    });
    await scheduleOrganizationDeletion(ctx, { runId, executionAttempt });

    const run = await ctx.db.get(runId);
    if (run === null) {
      throw new Error("Organization deletion run was not created.");
    }
    return { state: "accepted" as const, status: projectActiveStatus(run) };
  },
});

const vAdminOrganizationDeletionListItem = object({
  runId: id("workflow_organizationDeletion_runs"),
  state: union(literal("running"), literal("needs_attention"), literal("succeeded")),
  currentStep: vOrganizationDeletionStep,
  requestedAt: number(),
  latestProgressAt: number(),
  retryCount: number(),
  githubOwnerLogin: optional(string()),
  latestSafeError: optional(string()),
  completedAt: optional(number()),
});

function projectAdminListItem(run: Doc<"workflow_organizationDeletion_runs">) {
  return {
    runId: run._id,
    state: run.state,
    currentStep: run.currentStep,
    requestedAt: run.requestedAt,
    latestProgressAt: run.updatedAt,
    retryCount: run.retryCount,
    ...(run.organization.state === "active"
      ? { githubOwnerLogin: run.organization.githubOwnerLogin }
      : {}),
    ...(run.state === "needs_attention" ? { latestSafeError: run.latestSafeError } : {}),
    ...(run.state === "succeeded" ? { completedAt: run.completedAt } : {}),
  };
}

export const listForAdmin = query({
  access: "access_admin",
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(vAdminOrganizationDeletionListItem),
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("workflow_organizationDeletion_runs")
      .withIndex("by_updated_at")
      .order("desc")
      .paginate(args.paginationOpts);
    return { ...runs, page: runs.page.map(projectAdminListItem) };
  },
});

export const retryForAdmin = mutation({
  access: "access_admin",
  args: { runId: id("workflow_organizationDeletion_runs") },
  returns: vActiveOrganizationDeletionStatus,
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (run === null || run.state !== "needs_attention") {
      throw new Error("Organization deletion run is not retryable.");
    }
    const organization = await ctx.db.get(run.organization.organizationId);
    if (
      organization === null ||
      organization.deletion?.state !== "delete_failed" ||
      organization.deletion.runId !== run._id
    ) {
      throw new Error("Organization deletion marker is inconsistent.");
    }
    const memberships = await ctx.db
      .query("organizationMemberships")
      .withIndex("by_organization_and_role", (query) =>
        query.eq("organizationId", organization._id),
      )
      .take(2);
    if (
      memberships.length !== 1 ||
      memberships[0]?.userId !== run.requestedByUserId ||
      memberships[0].role !== "owner"
    ) {
      throw new Error("Organization membership changed before deletion retry.");
    }

    const now = Date.now();
    const executionAttempt = run.executionAttempt + 1;
    await ctx.db.replace(run._id, {
      state: "running",
      organization: run.organization,
      requestedByUserId: run.requestedByUserId,
      currentStep: run.currentStep,
      requestedAt: run.requestedAt,
      updatedAt: now,
      retryCount: run.retryCount + 1,
      executionAttempt,
      automaticRestartCount: 0,
      providerWriteScanCursor: run.providerWriteScanCursor,
      providerCleanup: run.providerCleanup,
    });
    await ctx.db.patch(organization._id, {
      deletion: { state: "deleting", runId: run._id, requestedAt: run.requestedAt },
    });
    await appendOrganizationDeletionEvent(ctx, {
      runId: run._id,
      step: run.currentStep,
      level: "info",
      message: "Staff retried organization deletion.",
      createdAt: now,
    });
    await scheduleOrganizationDeletion(ctx, { runId: run._id, executionAttempt });

    const retried = await ctx.db.get(run._id);
    if (retried === null) {
      throw new Error("Organization deletion run was not restarted.");
    }
    return projectActiveStatus(retried);
  },
});
