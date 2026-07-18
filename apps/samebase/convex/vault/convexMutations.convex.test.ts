import { describe, expect, it } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";
import { isWorkerDeploymentDependencyCurrentlyWired } from "./deploymentDependencies";

async function createConvexConnectionVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: { method: "api_key", credential: "convex-token" },
      teamId: "convex-team",
      teamSlug: "ada-team",
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId: sourceRunId,
      ghRepoId: "123",
      owner: "ada",
      name: "manual-convex",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 12,
    });
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 25,
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
      vaultId,
      repositoryFullName: "ada/manual-convex",
      trigger: "connect_convex_deployment",
      state: "queued",
      currentStep: "run_created",
      createdAt: 30,
      updatedAt: 30,
    });

    return { appId, runId, userId, vaultId };
  });

  return { ids, t };
}

const convexRecord = {
  convexTeamId: "convex-team",
  convexProjectId: "convex-project",
  convexProjectName: "Manual Convex",
  convexTeamSlug: "ada-team",
  convexProjectSlug: "manual-convex",
  convexDeploymentName: "manual-convex-prod",
  convexDeploymentType: "prod",
  convexCloudUrl: "https://manual-convex-prod.convex.cloud",
  convexSiteUrl: "https://manual-convex-prod.convex.site",
} as const;

type ConvexConnectionIds = Awaited<ReturnType<typeof createConvexConnectionVault>>["ids"];
type TestBackend = ReturnType<typeof makeConvexTest>;

function selectedConvexTarget(ids: Pick<ConvexConnectionIds, "appId">) {
  return {
    mode: "connect_existing_project",
    appId: ids.appId,
    teamId: convexRecord.convexTeamId,
    projectId: convexRecord.convexProjectId,
  } as const;
}

async function createRecordedConvexProjectClaim(
  t: TestBackend,
  ids: ConvexConnectionIds,
): Promise<Id<"vaultConvexProjectCreationClaims">> {
  const claim = await t.mutation(internal.vault.convexMutations.beginConvexProjectCreation, {
    ...ids,
    teamId: convexRecord.convexTeamId,
    projectName: convexRecord.convexProjectName,
  });
  if (claim.lifecycle.state !== "creating") {
    throw new Error("Expected a new Convex project creation claim.");
  }
  await t.mutation(internal.vault.convexMutations.recordCreatedConvexProject, {
    ...ids,
    creationClaimId: claim.claimId,
    teamId: convexRecord.convexTeamId,
    projectName: convexRecord.convexProjectName,
    projectId: convexRecord.convexProjectId,
  });
  return claim.claimId;
}

describe("vault Convex deployment connection mutations", () => {
  it("blocks a second project create until the vault's first creation claim is consumed", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: {
          mode: "create_project",
          appId: ids.appId,
          teamId: "convex-team",
          projectName: "first-project",
        },
      }),
    ).resolves.toEqual({ claimed: true });
    const firstClaim = await t.mutation(internal.vault.convexMutations.beginConvexProjectCreation, {
      ...ids,
      teamId: "convex-team",
      projectName: "first-project",
    });
    const second = await t.run(async (ctx) => {
      const appId = await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 31,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "connect_convex_deployment",
        state: "queued",
        currentStep: "run_created",
        createdAt: 32,
        updatedAt: 32,
      });
      return { appId, runId };
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: second.runId,
        userId: ids.userId,
        target: {
          mode: "create_project",
          appId: second.appId,
          teamId: "convex-team",
          projectName: "second-project",
        },
      }),
    ).resolves.toEqual({ claimed: false });
    await expect(t.run(async (ctx) => await ctx.db.get(firstClaim.claimId))).resolves.toMatchObject(
      {
        appId: ids.appId,
        runId: ids.runId,
        projectName: "first-project",
        lifecycle: { state: "creating" },
      },
    );
  });

  it("rejects a create target after the connected Convex team changes", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Expected Convex connection.");
      }
      await ctx.db.patch(connection._id, { teamId: "other-team" });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: {
          mode: "create_project",
          appId: ids.appId,
          teamId: "convex-team",
          projectName: "manual-convex",
        },
      }),
    ).resolves.toEqual({ claimed: false });
    await expect(
      t.run(async (ctx) => {
        const events = await ctx.db
          .query("appProvisioningEvents")
          .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
          .collect();
        const claims = await ctx.db
          .query("vaultConvexProjectCreationClaims")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .collect();
        return { claims, events };
      }),
    ).resolves.toMatchObject({
      claims: [],
      events: [
        {
          level: "warn",
          message: "Reconnect the Convex team that owns this resource.",
        },
      ],
    });
  });

  it("claims, attaches, and finishes a durable Convex deployment connection run", async () => {
    const { ids, t } = await createConvexConnectionVault();

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: selectedConvexTarget(ids),
      }),
    ).resolves.toEqual({ claimed: true });
    const attachment = await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      convex: convexRecord,
      provenance: { state: "selected_existing" },
    });
    expect(attachment.state).toBe("attached");
    if (attachment.state !== "attached") {
      throw new Error("Expected Convex deployment to attach.");
    }
    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .unique();
        return { ownership, run: await ctx.db.get(ids.runId) };
      }),
    ).resolves.toMatchObject({
      ownership: { runId: ids.runId, state: "succeeded" },
      run: { currentStep: "finish", state: "succeeded" },
    });
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        deploymentId: attachment.deploymentId,
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [run, deployment] = await Promise.all([
        ctx.db.get(ids.runId),
        ctx.db
          .query("vaultConvexDeployments")
          .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
          .first(),
      ]);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      return { deployment, events, ownership, run };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "succeeded",
    });
    expect(result.run).toMatchObject({
      state: "succeeded",
      currentStep: "finish",
    });
    expect(result.deployment).toMatchObject({
      appId: ids.appId,
      projectId: "convex-project",
      teamSlug: "ada-team",
      projectSlug: "manual-convex",
      deploymentName: "manual-convex-prod",
      origin: "selected_existing",
    });
    expect(result.events.map((event) => event.step)).toEqual([
      "claim_infra",
      "attach_convex",
      "finish",
    ]);
  });

  it("does not record a provider result after the active Convex team changes", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: selectedConvexTarget(ids),
    });
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Expected Convex connection.");
      }
      await ctx.db.patch(connection._id, { teamId: "other-team" });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        provenance: { state: "selected_existing" },
      }),
    ).rejects.toThrow("Reconnect the Convex team that owns this resource.");
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultConvexDeployments")
            .withIndex("by_app", (q) => q.eq("appId", ids.appId))
            .unique(),
      ),
    ).resolves.toBeNull();
  });

  it("retargets a missing-upstream deployment without rewriting dependent Worker rows", async () => {
    const { ids, t } = await createConvexConnectionVault();
    const dependencyIds = await t.run(async (ctx) => {
      const deploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        teamId: "convex-team",
        projectId: "old-project",
        teamSlug: "old-team",
        projectSlug: "old-project",
        deploymentName: "old-prod",
        deploymentType: "prod",
        cloudUrl: "https://old-prod.convex.cloud",
        siteUrl: "https://old-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      await ctx.db.insert("vaultConvexSchemaSnapshots", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        deploymentId,
        deploymentName: "old-prod",
        schemaHash: "old-schema",
        graph: { tables: [], relationships: [], warnings: [] },
        fetchedAt: 20,
      });
      await ctx.db.insert("vaultConvexSchemaGraphLayouts", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        deploymentId,
        nodeId: "table:messages",
        x: 10,
        y: 20,
        updatedAt: 20,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-convex-worker",
        workerTag: "manual-convex-worker-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: deploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "old-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "old-preview-key",
              projectId: "old-project",
            },
          },
        },
        createdAt: 20,
        updatedAt: 20,
      });
      const siblingWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-convex-sibling",
        workerTag: "manual-convex-sibling-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const siblingDependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId: siblingWorkerId,
        convexDeploymentId: deploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "old-sibling-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "old-sibling-preview-key",
              projectId: "old-project",
            },
          },
        },
        createdAt: 20,
        updatedAt: 20,
      });
      return [dependencyId, siblingDependencyId];
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: selectedConvexTarget(ids),
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.query(internal.vault.convexMutations.readActiveConvexDeploymentConnection, {
        ...ids,
      }),
    ).resolves.toEqual({ active: true });
    const attachment = await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      convex: convexRecord,
      provenance: { state: "selected_existing" },
    });
    expect(attachment.state).toBe("attached");
    if (attachment.state !== "attached") {
      throw new Error("Expected Convex deployment to attach.");
    }
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        deploymentId: attachment.deploymentId,
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();

    const persisted = await t.run(async (ctx) => {
      const deployments = await ctx.db
        .query("vaultConvexDeployments")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .collect();
      const dependencies = await Promise.all(
        dependencyIds.map(async (dependencyId) => await ctx.db.get(dependencyId)),
      );
      const deployment = deployments[0];
      return {
        currentlyWired: dependencies.map((dependency) =>
          dependency ? isWorkerDeploymentDependencyCurrentlyWired(dependency, deployment) : null,
        ),
        dependencies,
        deployments,
      };
    });

    expect(persisted.deployments).toHaveLength(1);
    expect(persisted.deployments[0]).toMatchObject({
      projectId: "convex-project",
      deploymentName: "manual-convex-prod",
      upstream: { state: "present" },
    });
    expect(persisted.dependencies).toMatchObject([
      {
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "old-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "old-preview-key",
              projectId: "old-project",
            },
          },
        },
      },
      {
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "old-sibling-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "old-sibling-preview-key",
              projectId: "old-project",
            },
          },
        },
      },
    ]);
    expect(persisted.currentlyWired).toEqual([false, false]);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.userId, { email: "nicu@samebase.com" });
    });
    const asUser = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });
    await expect(
      asUser.query(api.vault.convexSchemaGraph.get, {
        vaultId: ids.vaultId,
        deploymentId: attachment.deploymentId,
      }),
    ).resolves.toMatchObject({
      selectedDeploymentId: attachment.deploymentId,
      snapshot: null,
      layout: [{ nodeId: "table:messages", x: 10, y: 20 }],
    });
  });

  it("does not move a stable deployment row to another team while deploy keys remain", async () => {
    const { ids, t } = await createConvexConnectionVault();
    const resources = await t.run(async (ctx) => {
      const deploymentId = await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        teamId: "convex-team",
        projectId: "old-project",
        teamSlug: "old-team",
        projectSlug: "old-project",
        deploymentName: "old-prod",
        deploymentType: "prod",
        cloudUrl: "https://old-prod.convex.cloud",
        siteUrl: "https://old-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        workersDev: { state: "unknown" },
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        accountId: "cloudflare-account",
        workerName: "manual-convex-worker",
        workerTag: "manual-convex-worker-tag",
        origin: "selected_existing",
        upstream: { state: "present" },
        builds: { state: "not_connected" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      const dependencyId = await ctx.db.insert("vaultWorkerDeploymentDependencies", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        workerId,
        convexDeploymentId: deploymentId,
        wiring: {
          state: "wired",
          deployKeys: {
            production: {
              state: "created",
              teamId: "convex-team",
              name: "old-production-key",
              deploymentName: "old-prod",
            },
            preview: {
              state: "created",
              teamId: "convex-team",
              name: "old-preview-key",
              projectId: "old-project",
            },
          },
        },
        createdAt: 20,
        updatedAt: 20,
      });
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", ids.userId).eq("kind", "convex"))
        .unique();
      if (connection?.kind !== "convex") {
        throw new Error("Expected Convex connection.");
      }
      await ctx.db.patch(connection._id, { teamId: "other-team" });
      return { dependencyId, deploymentId };
    });
    const target = {
      mode: "connect_existing_project" as const,
      appId: ids.appId,
      teamId: "other-team",
      projectId: "other-project",
    };
    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target,
      }),
    ).resolves.toEqual({ claimed: true });

    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: {
          ...convexRecord,
          convexTeamId: "other-team",
          convexTeamSlug: "other-team",
          convexProjectId: "other-project",
          convexProjectName: "Other Project",
          convexProjectSlug: "other-project",
          convexDeploymentName: "other-prod",
          convexCloudUrl: "https://other-prod.convex.cloud",
          convexSiteUrl: "https://other-prod.convex.site",
        },
        provenance: { state: "selected_existing" },
      }),
    ).rejects.toThrow("Remove the existing Convex deploy keys");
    await expect(
      t.run(async (ctx) => await ctx.db.get(resources.deploymentId)),
    ).resolves.toMatchObject({
      teamId: "convex-team",
      projectId: "old-project",
      upstream: { state: "missing_upstream" },
    });
    await expect(
      t.run(async (ctx) => await ctx.db.get(resources.dependencyId)),
    ).resolves.toMatchObject({
      convexDeploymentId: resources.deploymentId,
      wiring: {
        deployKeys: {
          production: { teamId: "convex-team", name: "old-production-key" },
          preview: { teamId: "convex-team", name: "old-preview-key" },
        },
      },
    });
  });

  it("rejects reconnecting a missing-upstream Convex row to a project held by a present row", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      const adminAppId = await ctx.db.insert("vaultApps", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        rootDirectory: "apps/admin",
        createdAt: 26,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: ids.appId,
        teamId: "convex-team",
        projectId: "old-project",
        teamSlug: "old-team",
        projectSlug: "old-project",
        deploymentName: "old-prod",
        deploymentType: "prod",
        cloudUrl: "https://old-prod.convex.cloud",
        siteUrl: "https://old-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "missing_upstream" },
        connectedAt: 20,
        lastObservedAt: 20,
      });
      await ctx.db.insert("vaultConvexDeployments", {
        vaultId: ids.vaultId,
        userId: ids.userId,
        appId: adminAppId,
        teamId: "convex-team",
        projectId: "convex-project",
        teamSlug: "ada-team",
        projectSlug: "manual-convex",
        deploymentName: "manual-convex-prod",
        deploymentType: "prod",
        cloudUrl: "https://manual-convex-prod.convex.cloud",
        siteUrl: "https://manual-convex-prod.convex.site",
        origin: "selected_existing",
        upstream: { state: "present" },
        connectedAt: 25,
        lastObservedAt: 25,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: selectedConvexTarget(ids),
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        provenance: { state: "selected_existing" },
      }),
    ).resolves.toEqual({ state: "not_attached" });

    const events = await t.run(async (ctx) => {
      return await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
    });
    expect(events.at(-1)).toMatchObject({
      level: "warn",
      message: "Convex project is already attached to another app.",
    });
  });

  it("rejects attaching one Convex project to apps in two vaults", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: selectedConvexTarget(ids),
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        provenance: { state: "selected_existing" },
      }),
    ).resolves.toMatchObject({ state: "attached" });

    const second = await t.run(async (ctx) => {
      const vaultId = await ctx.db.insert("vaults", {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const sourceRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId,
        repositoryFullName: "ada/second-convex-vault",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 40,
        updatedAt: 40,
        completedAt: 40,
      });
      await ctx.db.replace(vaultId, {
        userId: ids.userId,
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: sourceRunId,
        ghRepoId: "456",
        owner: "ada",
        name: "second-convex-vault",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 40,
      });
      const appId = await ctx.db.insert("vaultApps", {
        vaultId,
        userId: ids.userId,
        rootDirectory: "/",
        createdAt: 40,
      });
      const runId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId,
        repositoryFullName: "ada/second-convex-vault",
        trigger: "connect_convex_deployment",
        state: "queued",
        currentStep: "run_created",
        createdAt: 40,
        updatedAt: 40,
      });
      return { appId, runId, vaultId };
    });

    const secondArgs = { ...second, userId: ids.userId };
    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: secondArgs.vaultId,
        runId: secondArgs.runId,
        userId: secondArgs.userId,
        target: selectedConvexTarget(secondArgs),
      }),
    ).resolves.toEqual({ claimed: true });
    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...secondArgs,
        convex: convexRecord,
        provenance: { state: "selected_existing" },
      }),
    ).resolves.toEqual({ state: "not_attached" });

    await expect(
      t.run(async (ctx) => {
        const ownership = await ctx.db
          .query("vaultInfrastructureOwnership")
          .withIndex("by_vault", (q) => q.eq("vaultId", secondArgs.vaultId))
          .unique();
        return { ownership, run: await ctx.db.get(secondArgs.runId) };
      }),
    ).resolves.toMatchObject({
      ownership: { runId: secondArgs.runId, state: "failed" },
      run: { currentStep: "attach_convex", state: "canceled" },
    });
  });

  it("keeps composed create runs active when finishing the Convex deployment block", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.runId, {
        trigger: "create",
        state: "running",
        currentStep: "attach_convex",
        updatedAt: 40,
      });
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "active",
        updatedAt: 40,
      });
      await ctx.db.insert("vaultInfrastructureTargets", {
        vaultId: ids.vaultId,
        appId: ids.appId,
        convex: {
          state: "planned",
          teamId: convexRecord.convexTeamId,
          projectName: convexRecord.convexProjectName,
        },
        cloudflare: {
          state: "planned",
          accountId: "cloudflare-account",
          workerName: "manual-convex",
        },
        createdAt: 40,
      });
    });

    const attachment = await t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
      ...ids,
      convex: convexRecord,
      provenance: {
        state: "provisioned",
        creationClaimId: await createRecordedConvexProjectClaim(t, ids),
      },
    });
    expect(attachment.state).toBe("attached");
    if (attachment.state !== "attached") {
      throw new Error("Expected Convex deployment to attach.");
    }
    await expect(
      t.mutation(internal.vault.convexMutations.finishConvexDeploymentConnection, {
        deploymentId: attachment.deploymentId,
        runId: ids.runId,
        userId: ids.userId,
        vaultId: ids.vaultId,
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(ids.runId);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      const events = await ctx.db
        .query("appProvisioningEvents")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", ids.runId))
        .collect();
      const target = await ctx.db
        .query("vaultInfrastructureTargets")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .unique();
      return { events, ownership, run, target };
    });

    expect(result.ownership).toMatchObject({
      runId: ids.runId,
      state: "active",
    });
    expect(result.run).toMatchObject({
      state: "running",
      currentStep: "attach_convex",
    });
    expect(result.target?.convex).toEqual({
      state: "attached",
      teamId: convexRecord.convexTeamId,
      projectName: convexRecord.convexProjectName,
      deploymentId: attachment.deploymentId,
    });
    expect(result.events.map((event) => event.step)).toEqual(["attach_convex", "attach_convex"]);
  });

  it("does not resurrect a terminal Convex connection run", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.run(async (ctx) => {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "failed",
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: ids.runId,
        userId: ids.userId,
        target: selectedConvexTarget(ids),
      }),
    ).resolves.toEqual({ claimed: false });

    const ownership = await t.run(async (ctx) => {
      return await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
    });
    expect(ownership).toMatchObject({ state: "failed", runId: ids.runId });
  });

  it("lets a new Convex connection run claim after the previous owner failed", async () => {
    const { ids, t } = await createConvexConnectionVault();
    const nextRunId = await t.run(async (ctx) => {
      await ctx.db.insert("vaultInfrastructureOwnership", {
        vaultId: ids.vaultId,
        runId: ids.runId,
        state: "failed",
        updatedAt: 40,
      });
      return await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "connect_convex_deployment",
        state: "queued",
        currentStep: "run_created",
        createdAt: 50,
        updatedAt: 50,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
        vaultId: ids.vaultId,
        runId: nextRunId,
        userId: ids.userId,
        target: selectedConvexTarget(ids),
      }),
    ).resolves.toEqual({ claimed: true });

    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultInfrastructureOwnership")
            .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({ state: "active", runId: nextRunId });
  });

  it("does not attach when ownership was superseded", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: {
        mode: "create_project",
        appId: ids.appId,
        teamId: convexRecord.convexTeamId,
        projectName: convexRecord.convexProjectName,
      },
    });
    const creationClaimId = await createRecordedConvexProjectClaim(t, ids);
    await t.run(async (ctx) => {
      const otherRunId = await ctx.db.insert("appProvisioningRuns", {
        userId: ids.userId,
        vaultId: ids.vaultId,
        repositoryFullName: "ada/manual-convex",
        trigger: "connect_convex_deployment",
        state: "running",
        currentStep: "attach_convex",
        createdAt: 40,
        updatedAt: 40,
      });
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      if (!ownership) {
        throw new Error("Expected active ownership.");
      }
      await ctx.db.patch(ownership._id, {
        runId: otherRunId,
        updatedAt: 40,
      });
    });

    await expect(
      t.mutation(internal.vault.convexMutations.attachDeploymentForRun, {
        ...ids,
        convex: convexRecord,
        provenance: { state: "provisioned", creationClaimId },
      }),
    ).resolves.toEqual({ state: "not_attached" });

    const result = await t.run(async (ctx) => await ctx.db.get(ids.runId));

    expect(result).toMatchObject({
      state: "canceled",
      currentStep: "claim_infra",
    });
  });

  it("marks an active Convex connection owner failed when the workflow fails", async () => {
    const { ids, t } = await createConvexConnectionVault();
    await t.mutation(internal.vault.convexMutations.claimConvexDeploymentConnection, {
      vaultId: ids.vaultId,
      runId: ids.runId,
      userId: ids.userId,
      target: {
        mode: "create_project",
        appId: ids.appId,
        teamId: convexRecord.convexTeamId,
        projectName: convexRecord.convexProjectName,
      },
    });
    const creationClaimId = await createRecordedConvexProjectClaim(t, ids);

    await expect(
      t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
        runId: ids.runId,
        workflowId: "workflow-1",
        message: "Convex deployment lookup failed.",
      }),
    ).resolves.toBeNull();

    const result = await t.run(async (ctx) => {
      const [run, creationClaim] = await Promise.all([
        ctx.db.get(ids.runId),
        ctx.db.get(creationClaimId),
      ]);
      const ownership = await ctx.db
        .query("vaultInfrastructureOwnership")
        .withIndex("by_vault", (q) => q.eq("vaultId", ids.vaultId))
        .first();
      return { creationClaim, ownership, run };
    });

    expect(result.ownership).toMatchObject({ state: "failed" });
    expect(result.run).toMatchObject({ state: "failed" });
    expect(result.creationClaim).toMatchObject({
      lifecycle: {
        state: "created",
        projectId: convexRecord.convexProjectId,
      },
    });
  });
});
