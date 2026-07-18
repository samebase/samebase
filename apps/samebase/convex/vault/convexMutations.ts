import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { AppProvisioningStep } from "../schema";
import {
  isVaultProviderUpstreamPresent,
  vVaultConvexConnectionTarget,
  vVaultConvexProjectCreationLifecycle,
  VAULT_PROVIDER_UPSTREAM_PRESENT,
} from "./model";
import { isLiveConnectedVault } from "./state";
import { requireActiveConvexTeam } from "./convexTeam";

const { boolean, id, literal, null: nullValue, object, string, union } = v;

const convexProjectCreationClaim = object({
  claimId: id("vaultConvexProjectCreationClaims"),
  teamId: string(),
  projectName: string(),
  lifecycle: vVaultConvexProjectCreationLifecycle,
});
const convexDeploymentAttachmentProvenance = union(
  object({ state: literal("selected_existing") }),
  object({
    state: literal("recovered_existing"),
    creationClaimId: id("vaultConvexProjectCreationClaims"),
  }),
  object({
    state: literal("provisioned"),
    creationClaimId: id("vaultConvexProjectCreationClaims"),
  }),
);

const convexInfrastructureRecordValidator = object({
  convexProjectId: string(),
  convexProjectName: string(),
  convexTeamId: string(),
  convexTeamSlug: string(),
  convexProjectSlug: string(),
  convexDeploymentName: string(),
  convexDeploymentType: literal("prod"),
  convexCloudUrl: string(),
  convexSiteUrl: string(),
});
const convexDeploymentAttachmentResult = union(
  object({ state: literal("attached"), deploymentId: id("vaultConvexDeployments") }),
  object({ state: literal("not_attached") }),
);
type ConvexDeploymentAttachmentResult = Infer<typeof convexDeploymentAttachmentResult>;

type VaultInfrastructureOwnership = Doc<"vaultInfrastructureOwnership">;
type ConvexDeploymentConnectionEventCtx = Pick<MutationCtx, "runMutation">;
type ConvexDeploymentConnectionReadCtx = Pick<QueryCtx, "db">;
type AllowedConvexProjectCreationClaim =
  | { state: "none" }
  | { state: "same_app" }
  | { state: "exact"; claimId: Id<"vaultConvexProjectCreationClaims"> };

function isComposedInfrastructureRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "create" || run.trigger === "retry";
}

function isStandaloneConvexDeploymentConnectionRun(run: Doc<"appProvisioningRuns">): boolean {
  return run.trigger === "connect_convex_deployment";
}

async function getVaultInfrastructureOwnership(
  ctx: ConvexDeploymentConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<VaultInfrastructureOwnership | null> {
  return await ctx.db
    .query("vaultInfrastructureOwnership")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .first();
}

async function readConvexDeploymentForApp(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    appId: Id<"vaultApps">;
  },
): Promise<Doc<"vaultConvexDeployments"> | null> {
  return await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_app", (q) => q.eq("appId", args.appId))
    .unique();
}

async function requireVaultApp(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    userId: Id<"users">;
  },
): Promise<Doc<"vaultApps">> {
  const app = await ctx.db.get(args.appId);
  if (!app || app.vaultId !== args.vaultId || app.userId !== args.userId) {
    throw new Error("Vault app not found.");
  }
  return app;
}

async function readConvexDeploymentByProviderIdentity(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    projectId: string;
  },
): Promise<Doc<"vaultConvexDeployments"> | null> {
  return await ctx.db
    .query("vaultConvexDeployments")
    .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
    .unique();
}

async function readConvexProjectCreationClaimByPlannedIdentity(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    teamId: string;
    projectName: string;
  },
): Promise<Doc<"vaultConvexProjectCreationClaims"> | null> {
  return await ctx.db
    .query("vaultConvexProjectCreationClaims")
    .withIndex("by_team_and_project_name", (q) =>
      q.eq("teamId", args.teamId).eq("projectName", args.projectName),
    )
    .unique();
}

async function readConvexProjectCreationClaimByVault(
  ctx: ConvexDeploymentConnectionReadCtx,
  vaultId: Id<"vaults">,
): Promise<Doc<"vaultConvexProjectCreationClaims"> | null> {
  return await ctx.db
    .query("vaultConvexProjectCreationClaims")
    .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
    .unique();
}

async function readConvexProjectCreationClaimByProjectId(
  ctx: ConvexDeploymentConnectionReadCtx,
  projectId: string,
): Promise<Doc<"vaultConvexProjectCreationClaims"> | null> {
  return await ctx.db
    .query("vaultConvexProjectCreationClaims")
    .withIndex("by_project", (q) => q.eq("lifecycle.projectId", projectId))
    .unique();
}

async function assertAllowedConvexProjectCreationClaim(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    appId: Id<"vaultApps">;
    teamId: string;
    projectName: string;
    projectId: string;
    allowedCreationClaim: AllowedConvexProjectCreationClaim;
  },
): Promise<void> {
  const [vaultClaim, plannedClaim, projectClaim] = await Promise.all([
    readConvexProjectCreationClaimByVault(ctx, args.vaultId),
    readConvexProjectCreationClaimByPlannedIdentity(ctx, args),
    readConvexProjectCreationClaimByProjectId(ctx, args.projectId),
  ]);
  const claim = vaultClaim ?? plannedClaim ?? projectClaim;
  if (!claim) {
    return;
  }
  if (
    (vaultClaim && plannedClaim && vaultClaim._id !== plannedClaim._id) ||
    (vaultClaim && projectClaim && vaultClaim._id !== projectClaim._id) ||
    (plannedClaim && projectClaim && plannedClaim._id !== projectClaim._id)
  ) {
    throw new Error("Convex project identities are owned by different creation claims.");
  }
  const sameApp = claim.vaultId === args.vaultId && claim.appId === args.appId;
  switch (args.allowedCreationClaim.state) {
    case "none":
      throw new Error("Convex project creation is already owned by another operation.");
    case "same_app":
      if (sameApp) {
        return;
      }
      throw new Error("Convex project creation is already owned by another app.");
    case "exact":
      if (sameApp && claim._id === args.allowedCreationClaim.claimId) {
        return;
      }
      throw new Error("Convex project creation claim does not match this app.");
    default:
      args.allowedCreationClaim satisfies never;
  }
}

async function requireCreatedConvexProjectClaim(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    creationClaimId: Id<"vaultConvexProjectCreationClaims">;
    convex: Infer<typeof convexInfrastructureRecordValidator>;
  },
): Promise<Doc<"vaultConvexProjectCreationClaims">> {
  const claim = await ctx.db.get(args.creationClaimId);
  if (
    !claim ||
    claim.vaultId !== args.vaultId ||
    claim.runId !== args.runId ||
    claim.userId !== args.userId ||
    claim.appId !== args.appId ||
    claim.teamId !== args.convex.convexTeamId ||
    claim.lifecycle.state !== "created" ||
    claim.lifecycle.projectId !== args.convex.convexProjectId
  ) {
    throw new Error("Convex project creation claim does not match the created project.");
  }
  return claim;
}

async function requireRecoverableConvexProjectClaim(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    vaultId: Id<"vaults">;
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    appId: Id<"vaultApps">;
    creationClaimId: Id<"vaultConvexProjectCreationClaims">;
    convex: Infer<typeof convexInfrastructureRecordValidator>;
  },
): Promise<Doc<"vaultConvexProjectCreationClaims">> {
  const claim = await ctx.db.get(args.creationClaimId);
  if (
    !claim ||
    claim.vaultId !== args.vaultId ||
    claim.runId !== args.runId ||
    claim.userId !== args.userId ||
    claim.appId !== args.appId ||
    claim.teamId !== args.convex.convexTeamId ||
    claim.projectName !== args.convex.convexProjectName ||
    claim.lifecycle.state !== "creating"
  ) {
    throw new Error("Convex project creation claim does not match the recovered project.");
  }
  return claim;
}

async function assertNoExistingConvexDeploymentTarget(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    appId: Id<"vaultApps">;
    projectId?: string;
  },
): Promise<void> {
  const existingAppDeployment = await readConvexDeploymentForApp(ctx, args);
  if (existingAppDeployment && isVaultProviderUpstreamPresent(existingAppDeployment)) {
    throw new Error("Vault app already has a Convex deployment.");
  }
  if (args.projectId) {
    const existingProject = await readConvexDeploymentByProviderIdentity(ctx, {
      projectId: args.projectId,
    });
    if (
      existingProject &&
      (isVaultProviderUpstreamPresent(existingProject) ||
        !existingAppDeployment ||
        existingProject._id !== existingAppDeployment._id)
    ) {
      throw new Error("Convex project is already attached to another app.");
    }
  }
}

function isActiveConvexDeploymentConnectionOwner(
  ownership: VaultInfrastructureOwnership | null,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): boolean {
  return ownership?.state === "active" && ownership.runId === args.runId;
}

async function appendConvexDeploymentConnectionEvent(
  ctx: ConvexDeploymentConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    step: AppProvisioningStep;
    level: "info" | "warn" | "error";
    message: string;
    state: "unchanged" | "queued" | "running" | "succeeded" | "failed" | "canceled";
  },
): Promise<void> {
  await ctx.runMutation(internal.appProvisioningRuns.appendRunEvent, args);
}

async function cancelSupersededConvexDeploymentConnectionRun(
  ctx: ConvexDeploymentConnectionEventCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
  },
): Promise<void> {
  await appendConvexDeploymentConnectionEvent(ctx, {
    runId: args.runId,
    step: "claim_infra",
    level: "warn",
    message: "Convex deployment connection was superseded by a newer run.",
    state: "canceled",
  });
}

async function requireConvexDeploymentConnectionRun(
  ctx: ConvexDeploymentConnectionReadCtx,
  args: {
    runId: Id<"appProvisioningRuns">;
    userId: Id<"users">;
    vaultId: Id<"vaults">;
  },
): Promise<Doc<"appProvisioningRuns">> {
  const run = await ctx.db.get(args.runId);
  if (!run) {
    throw new Error("Convex deployment connection run not found.");
  }
  if (
    run.userId !== args.userId ||
    run.vaultId !== args.vaultId ||
    (!isStandaloneConvexDeploymentConnectionRun(run) && !isComposedInfrastructureRun(run))
  ) {
    throw new Error("Convex deployment connection run does not match vault.");
  }
  return run;
}

export const requireConvexDeploymentConnectionVault = internalQuery({
  args: {
    vaultId: id("vaults"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: nullValue(),
  handler: async (ctx, args): Promise<null> => {
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    await assertNoExistingConvexDeploymentTarget(ctx, {
      appId: args.appId,
    });

    return null;
  },
});

export const claimConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    target: vVaultConvexConnectionTarget,
  },
  returns: object({ claimed: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, {
      ...args,
      appId: args.target.appId,
    });
    let creationClaim: Doc<"vaultConvexProjectCreationClaims"> | null = null;
    try {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", args.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Convex connection is required.");
      }
      requireActiveConvexTeam({
        activeTeamId: connection.teamId,
        targetTeamId: args.target.teamId,
      });
      await assertNoExistingConvexDeploymentTarget(ctx, {
        appId: args.target.appId,
      });
      const vaultCreationClaim = await readConvexProjectCreationClaimByVault(ctx, args.vaultId);
      if (args.target.mode === "connect_existing_project") {
        const projectCreationClaim = await readConvexProjectCreationClaimByProjectId(
          ctx,
          args.target.projectId,
        );
        if (vaultCreationClaim || projectCreationClaim) {
          throw new Error("Convex project creation is already owned by another operation.");
        }
      } else {
        const teamId = connection.teamId.trim();
        const plannedCreationClaim = await readConvexProjectCreationClaimByPlannedIdentity(ctx, {
          teamId,
          projectName: args.target.projectName,
        });
        if (
          vaultCreationClaim &&
          plannedCreationClaim &&
          vaultCreationClaim._id !== plannedCreationClaim._id
        ) {
          throw new Error("Vault has a different Convex project creation in progress.");
        }
        creationClaim = vaultCreationClaim ?? plannedCreationClaim;
        if (
          creationClaim &&
          (creationClaim.vaultId !== args.vaultId ||
            creationClaim.appId !== args.target.appId ||
            creationClaim.teamId !== teamId ||
            creationClaim.projectName !== args.target.projectName)
        ) {
          throw new Error("Convex project creation does not match this app and target.");
        }
      }
    } catch (error) {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: error instanceof Error ? error.message : "Convex deployment is already attached.",
        state: "canceled",
      });
      return { claimed: false };
    }

    const now = Date.now();
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (ownership && ownership.state === "active" && ownership.runId !== args.runId) {
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "claim_infra",
        level: "warn",
        message: "Convex deployment connection is already running.",
        state: "canceled",
      });
      return { claimed: false };
    }
    if (ownership && ownership.state !== "active" && ownership.runId === args.runId) {
      return { claimed: false };
    }

    if (ownership) {
      await ctx.db.patch(ownership._id, {
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: args.vaultId,
        runId: args.runId,
        state: "active",
        updatedAt: now,
      });
    }

    if (creationClaim) {
      await ctx.db.patch(creationClaim._id, {
        runId: args.runId,
        updatedAt: now,
      });
    }

    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "claim_infra",
      level: "info",
      message: `Started Convex deployment connection for ${app.rootDirectory}.`,
      state: "running",
    });

    return { claimed: true };
  },
});

export const readActiveConvexDeploymentConnection = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: object({ active: boolean() }),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    const [ownership, deployment] = await Promise.all([
      getVaultInfrastructureOwnership(ctx, args.vaultId),
      readConvexDeploymentForApp(ctx, { appId: args.appId }),
    ]);
    return {
      active:
        (!deployment || !isVaultProviderUpstreamPresent(deployment)) &&
        isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId }),
    };
  },
});

export const attachDeploymentForRun = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    convex: convexInfrastructureRecordValidator,
    provenance: convexDeploymentAttachmentProvenance,
  },
  returns: convexDeploymentAttachmentResult,
  handler: async (ctx, args): Promise<ConvexDeploymentAttachmentResult> => {
    const run = await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    const app = await requireVaultApp(ctx, args);
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_kind", (q) => q.eq("userId", args.userId).eq("kind", "convex"))
      .unique();
    if (connection?.kind !== "convex") {
      throw new Error("Convex connection is required.");
    }
    requireActiveConvexTeam({
      activeTeamId: connection.teamId,
      targetTeamId: args.convex.convexTeamId,
    });
    const existingAppDeployment = await readConvexDeploymentForApp(ctx, {
      appId: args.appId,
    });
    const infrastructureTarget = isComposedInfrastructureRun(run)
      ? await ctx.db
          .query("vaultInfrastructureTargets")
          .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
          .unique()
      : null;
    if (isComposedInfrastructureRun(run)) {
      if (
        !infrastructureTarget ||
        infrastructureTarget.appId !== args.appId ||
        infrastructureTarget.convex.teamId !== args.convex.convexTeamId ||
        infrastructureTarget.convex.projectName !== args.convex.convexProjectName
      ) {
        throw new Error("Convex deployment does not match the infrastructure target.");
      }
      if (infrastructureTarget.convex.state === "planned" && existingAppDeployment) {
        throw new Error(
          "Infrastructure target app already has a Convex deployment outside this provisioning target.",
        );
      }
      if (
        infrastructureTarget.convex.state === "attached" &&
        existingAppDeployment?._id !== infrastructureTarget.convex.deploymentId
      ) {
        throw new Error("Infrastructure target references a different Convex deployment.");
      }
    }
    try {
      await assertNoExistingConvexDeploymentTarget(ctx, {
        appId: args.appId,
        projectId: args.convex.convexProjectId,
      });
      await assertAllowedConvexProjectCreationClaim(ctx, {
        vaultId: args.vaultId,
        appId: args.appId,
        teamId: args.convex.convexTeamId,
        projectName: args.convex.convexProjectName,
        projectId: args.convex.convexProjectId,
        allowedCreationClaim:
          args.provenance.state !== "selected_existing"
            ? {
                state: "exact",
                claimId: args.provenance.creationClaimId,
              }
            : { state: "none" },
      });
    } catch (error) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
        if (
          ownership &&
          isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })
        ) {
          await ctx.db.patch(ownership._id, {
            state: "failed",
            updatedAt: Date.now(),
          });
        }
        await appendConvexDeploymentConnectionEvent(ctx, {
          runId: args.runId,
          step: "attach_convex",
          level: "warn",
          message:
            error instanceof Error ? error.message : "Convex deployment is already attached.",
          state: "canceled",
        });
        return { state: "not_attached" };
      }
      throw error;
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: args.runId,
        });
        return { state: "not_attached" };
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }

    const creationClaim =
      args.provenance.state === "selected_existing"
        ? null
        : args.provenance.state === "provisioned"
          ? await requireCreatedConvexProjectClaim(ctx, {
              ...args,
              creationClaimId: args.provenance.creationClaimId,
            })
          : await requireRecoverableConvexProjectClaim(ctx, {
              ...args,
              creationClaimId: args.provenance.creationClaimId,
            });
    const origin = args.provenance.state === "provisioned" ? "provisioned" : "selected_existing";
    const now = Date.now();
    let deploymentId: Id<"vaultConvexDeployments">;
    if (existingAppDeployment) {
      if (existingAppDeployment.teamId !== args.convex.convexTeamId) {
        for await (const dependency of ctx.db
          .query("vaultWorkerDeploymentDependencies")
          .withIndex("by_convex_deployment", (q) =>
            q.eq("convexDeploymentId", existingAppDeployment._id),
          )) {
          if (
            dependency.wiring.deployKeys.production.state !== "not_created" ||
            dependency.wiring.deployKeys.preview.state !== "not_created"
          ) {
            throw new Error(
              "Remove the existing Convex deploy keys before reconnecting this app to another team.",
            );
          }
        }
      }
      if (
        existingAppDeployment.projectId !== args.convex.convexProjectId ||
        existingAppDeployment.deploymentName !== args.convex.convexDeploymentName
      ) {
        const schemaSnapshots = await ctx.db
          .query("vaultConvexSchemaSnapshots")
          .withIndex("by_deployment_and_fetched_at", (q) =>
            q.eq("deploymentId", existingAppDeployment._id),
          )
          .collect();
        for (const schemaSnapshot of schemaSnapshots) {
          await ctx.db.delete(schemaSnapshot._id);
        }
      }
      await ctx.db.patch(existingAppDeployment._id, {
        teamId: args.convex.convexTeamId,
        projectId: args.convex.convexProjectId,
        teamSlug: args.convex.convexTeamSlug,
        projectSlug: args.convex.convexProjectSlug,
        deploymentName: args.convex.convexDeploymentName,
        deploymentType: args.convex.convexDeploymentType,
        cloudUrl: args.convex.convexCloudUrl,
        siteUrl: args.convex.convexSiteUrl,
        origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        connectedAt: now,
        lastObservedAt: now,
      });
      deploymentId = existingAppDeployment._id;
    } else {
      deploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId: args.vaultId,
        userId: args.userId,
        appId: args.appId,
        teamId: args.convex.convexTeamId,
        projectId: args.convex.convexProjectId,
        teamSlug: args.convex.convexTeamSlug,
        projectSlug: args.convex.convexProjectSlug,
        deploymentName: args.convex.convexDeploymentName,
        deploymentType: args.convex.convexDeploymentType,
        cloudUrl: args.convex.convexCloudUrl,
        siteUrl: args.convex.convexSiteUrl,
        origin,
        upstream: VAULT_PROVIDER_UPSTREAM_PRESENT,
        connectedAt: now,
        lastObservedAt: now,
      });
    }
    if (infrastructureTarget?.convex.state === "planned") {
      await ctx.db.patch(infrastructureTarget._id, {
        convex: {
          state: "attached",
          teamId: infrastructureTarget.convex.teamId,
          projectName: infrastructureTarget.convex.projectName,
          deploymentId,
        },
      });
    }
    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_convex",
      level: "info",
      message: `Convex deployment ready for ${app.rootDirectory}: ${args.convex.convexDeploymentName}.`,
      state: "running",
    });

    if (creationClaim) {
      await ctx.db.delete(creationClaim._id);
    }
    if (isStandaloneConvexDeploymentConnectionRun(run)) {
      await ctx.db.patch(ownership._id, {
        state: "succeeded",
        updatedAt: now,
      });
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Convex deployment is connected.",
        state: "succeeded",
      });
    }

    return { state: "attached", deploymentId };
  },
});

export const readConvexProjectCreationClaimForRun = internalQuery({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
  },
  returns: union(convexProjectCreationClaim, nullValue()),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const claim = await ctx.db
      .query("vaultConvexProjectCreationClaims")
      .withIndex("by_run", (q) => q.eq("runId", args.runId))
      .unique();
    if (!claim) {
      return null;
    }
    if (
      claim.vaultId !== args.vaultId ||
      claim.userId !== args.userId ||
      claim.appId !== args.appId
    ) {
      throw new Error("Convex project creation claim does not match the run.");
    }
    return {
      claimId: claim._id,
      teamId: claim.teamId,
      projectName: claim.projectName,
      lifecycle: claim.lifecycle,
    };
  },
});

export const beginConvexProjectCreation = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    teamId: string(),
    projectName: string(),
  },
  returns: convexProjectCreationClaim,
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }
    await requireVaultApp(ctx, args);
    const connection = await ctx.db
      .query("providerConnections")
      .withIndex("by_user_kind", (q) => q.eq("userId", args.userId).eq("kind", "convex"))
      .unique();
    if (connection?.kind !== "convex") {
      throw new Error("Convex connection is required.");
    }
    requireActiveConvexTeam({
      activeTeamId: connection.teamId,
      targetTeamId: args.teamId,
    });
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      throw new Error("Convex provisioning run no longer owns provider creation.");
    }
    const [vaultCreationClaim, plannedCreationClaim] = await Promise.all([
      readConvexProjectCreationClaimByVault(ctx, args.vaultId),
      readConvexProjectCreationClaimByPlannedIdentity(ctx, args),
    ]);
    if (
      vaultCreationClaim &&
      plannedCreationClaim &&
      vaultCreationClaim._id !== plannedCreationClaim._id
    ) {
      throw new Error("Vault has a different Convex project creation in progress.");
    }
    const existingClaim = vaultCreationClaim ?? plannedCreationClaim;
    if (existingClaim) {
      if (
        existingClaim.vaultId !== args.vaultId ||
        existingClaim.userId !== args.userId ||
        existingClaim.appId !== args.appId ||
        existingClaim.teamId !== args.teamId ||
        existingClaim.projectName !== args.projectName
      ) {
        throw new Error("Convex project creation does not match this app and target.");
      }
      await ctx.db.patch(existingClaim._id, {
        runId: args.runId,
        updatedAt: Date.now(),
      });
      return {
        claimId: existingClaim._id,
        teamId: existingClaim.teamId,
        projectName: existingClaim.projectName,
        lifecycle: existingClaim.lifecycle,
      };
    }
    await assertNoExistingConvexDeploymentTarget(ctx, { appId: args.appId });
    const now = Date.now();
    const lifecycle = { state: "creating" } as const;
    const claimId = await ctx.db.insert("vaultConvexProjectCreationClaims", {
      vaultId: args.vaultId,
      userId: args.userId,
      appId: args.appId,
      runId: args.runId,
      teamId: args.teamId,
      projectName: args.projectName,
      lifecycle,
      createdAt: now,
      updatedAt: now,
    });
    return {
      claimId,
      teamId: args.teamId,
      projectName: args.projectName,
      lifecycle,
    };
  },
});

export const recordCreatedConvexProject = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    creationClaimId: id("vaultConvexProjectCreationClaims"),
    teamId: string(),
    projectName: string(),
    projectId: string(),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const claim = await ctx.db.get(args.creationClaimId);
    if (
      !claim ||
      claim.vaultId !== args.vaultId ||
      claim.runId !== args.runId ||
      claim.userId !== args.userId ||
      claim.appId !== args.appId ||
      claim.teamId !== args.teamId ||
      claim.projectName !== args.projectName
    ) {
      throw new Error("Convex project creation claim does not match the run.");
    }
    if (claim.lifecycle.state === "created") {
      if (claim.lifecycle.projectId !== args.projectId) {
        throw new Error("Convex returned a different project for the creation claim.");
      }
      return null;
    }
    await assertAllowedConvexProjectCreationClaim(ctx, {
      vaultId: args.vaultId,
      appId: args.appId,
      teamId: args.teamId,
      projectName: args.projectName,
      projectId: args.projectId,
      allowedCreationClaim: { state: "exact", claimId: claim._id },
    });
    await assertNoExistingConvexDeploymentTarget(ctx, {
      appId: args.appId,
      projectId: args.projectId,
    });
    await ctx.db.patch(claim._id, {
      lifecycle: {
        state: "created",
        projectId: args.projectId,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const resetMissingConvexProjectCreation = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    appId: id("vaultApps"),
    creationClaimId: id("vaultConvexProjectCreationClaims"),
    teamId: string(),
    projectId: string(),
  },
  returns: convexProjectCreationClaim,
  handler: async (ctx, args) => {
    await requireConvexDeploymentConnectionRun(ctx, args);
    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      throw new Error("Convex provisioning run no longer owns provider recovery.");
    }
    const claim = await ctx.db.get(args.creationClaimId);
    if (
      !claim ||
      claim.vaultId !== args.vaultId ||
      claim.runId !== args.runId ||
      claim.userId !== args.userId ||
      claim.appId !== args.appId ||
      claim.teamId !== args.teamId ||
      claim.lifecycle.state !== "created" ||
      claim.lifecycle.projectId !== args.projectId
    ) {
      throw new Error("Convex project creation claim does not match the missing project.");
    }
    const lifecycle = { state: "creating" } as const;
    await ctx.db.patch(claim._id, { lifecycle, updatedAt: Date.now() });
    return {
      claimId: claim._id,
      teamId: claim.teamId,
      projectName: claim.projectName,
      lifecycle,
    };
  },
});

export const finishConvexDeploymentConnection = internalMutation({
  args: {
    vaultId: id("vaults"),
    runId: id("appProvisioningRuns"),
    userId: id("users"),
    deploymentId: id("vaultConvexDeployments"),
  },
  returns: nullValue(),
  handler: async (ctx, args) => {
    const run = await requireConvexDeploymentConnectionRun(ctx, args);
    const vault = await ctx.db.get(args.vaultId);
    if (!isLiveConnectedVault(vault) || vault.userId !== args.userId) {
      throw new Error("Vault not found.");
    }

    const ownership = await getVaultInfrastructureOwnership(ctx, args.vaultId);
    if (
      isStandaloneConvexDeploymentConnectionRun(run) &&
      ownership?.runId === args.runId &&
      ownership.state === "succeeded"
    ) {
      const deployment = await ctx.db.get(args.deploymentId);
      if (
        !deployment ||
        deployment.vaultId !== args.vaultId ||
        deployment.userId !== args.userId ||
        !isVaultProviderUpstreamPresent(deployment)
      ) {
        throw new Error("Convex deployment connection did not attach a deployment.");
      }
      return null;
    }
    if (!ownership || !isActiveConvexDeploymentConnectionOwner(ownership, { runId: args.runId })) {
      if (isStandaloneConvexDeploymentConnectionRun(run)) {
        await cancelSupersededConvexDeploymentConnectionRun(ctx, {
          runId: args.runId,
        });
        return null;
      }
      throw new Error("Composed infrastructure run no longer owns provisioning.");
    }
    if (isComposedInfrastructureRun(run)) {
      const target = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", args.vaultId))
        .unique();
      if (
        !target ||
        target.convex.state !== "attached" ||
        target.convex.deploymentId !== args.deploymentId
      ) {
        throw new Error("Infrastructure target references a different Convex deployment.");
      }
    }
    const deployment = await ctx.db.get(args.deploymentId);
    if (
      !deployment ||
      deployment.vaultId !== args.vaultId ||
      deployment.userId !== args.userId ||
      !isVaultProviderUpstreamPresent(deployment)
    ) {
      throw new Error("Convex deployment connection did not attach a deployment.");
    }

    if (isStandaloneConvexDeploymentConnectionRun(run)) {
      await ctx.db.patch(ownership._id, {
        state: "succeeded",
        updatedAt: Date.now(),
      });
      await appendConvexDeploymentConnectionEvent(ctx, {
        runId: args.runId,
        step: "finish",
        level: "info",
        message: "Convex deployment is connected.",
        state: "succeeded",
      });
      return null;
    }

    await appendConvexDeploymentConnectionEvent(ctx, {
      runId: args.runId,
      step: "attach_convex",
      level: "info",
      message: "Convex deployment is connected.",
      state: "running",
    });

    return null;
  },
});
