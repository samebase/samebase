import { describe, expect, it } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { api, internal } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

async function seedUser(t: ReturnType<typeof makeConvexTest>, email: string) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
  });
}

async function seedOrganization(
  t: ReturnType<typeof makeConvexTest>,
  args: {
    owner: string;
    role?: "member" | "owner";
    userId?: Id<"users">;
  },
) {
  return await t.run(async (ctx) => {
    const organizationId = await ctx.db.insert("organizations", {
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
      convexTeam: { teamId: "convex-team" },
      githubInstallationId: `installation-${args.owner}`,
      githubOwnerId: `owner-${args.owner}`,
      githubOwnerLogin: args.owner,
      githubOwnerLoginNormalized: args.owner.toLowerCase(),
      githubOwnerType: "organization",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    if (args.userId) {
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        role: args.role ?? "member",
        userId: args.userId,
      });
    }
    return organizationId;
  });
}

async function seedRepository(
  t: ReturnType<typeof makeConvexTest>,
  organizationId: Id<"organizations">,
) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("repositories", {
      cloudflareAccountId: "cloudflare-account",
      convexTeamId: "convex-team",
      deletion: { state: "not_deleting" },
      organizationId,
      createdAt: 1,
      state: "not_connected",
    });
  });
}

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: userId,
    tokenIdentifier: `test:${userId}`,
  });
}

describe("organization-scoped repository folders", () => {
  it("returns an empty state for a viewer without organizations", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");

    await expect(
      asUser(t, userId).query(api.repository.folders.getRepositoryFolderState),
    ).resolves.toEqual({
      assignments: [],
      folders: [],
    });
  });

  it("normalizes names and scopes name uniqueness and ordering to one organization", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstOrganizationId = await seedOrganization(t, { owner: "first", userId });
    const secondOrganizationId = await seedOrganization(t, { owner: "second", userId });
    const viewer = asUser(t, userId);

    const firstFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "  ＦＯＯ  ",
      organizationId: firstOrganizationId,
    });
    await expect(
      viewer.mutation(api.repository.folders.createRepositoryFolder, {
        name: "foo",
        organizationId: firstOrganizationId,
      }),
    ).rejects.toThrow("Folder name is already in use.");
    const secondFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "foo",
      organizationId: secondOrganizationId,
    });

    const state = await viewer.query(api.repository.folders.getRepositoryFolderState);
    expect(state.assignments).toEqual([]);
    expect(state.folders).toEqual(
      [
        {
          _id: firstFolderId,
          collapsed: false,
          name: "FOO",
          organizationId: firstOrganizationId,
          position: 0,
        },
        {
          _id: secondFolderId,
          collapsed: false,
          name: "foo",
          organizationId: secondOrganizationId,
          position: 0,
        },
      ].sort((left, right) => left.organizationId.localeCompare(right.organizationId)),
    );
  });

  it("requires organization membership to create and change folders", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const otherUserId = await seedUser(t, "grace@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const viewer = asUser(t, userId);
    const otherViewer = asUser(t, otherUserId);
    const folderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Projects",
      organizationId,
    });

    await expect(
      otherViewer.mutation(api.repository.folders.createRepositoryFolder, {
        name: "Other",
        organizationId,
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      otherViewer.mutation(api.repository.folders.renameRepositoryFolder, {
        folderId,
        name: "Changed",
      }),
    ).rejects.toThrow("Folder not found");
  });

  it("keeps folder state personal for two current organization members", async () => {
    const t = makeConvexTest();
    const firstUserId = await seedUser(t, "ada@example.com");
    const secondUserId = await seedUser(t, "grace@example.com");
    const organizationId = await seedOrganization(t, {
      owner: "samebase",
      userId: firstUserId,
    });
    const repositoryId = await seedRepository(t, organizationId);
    await t.run(async (ctx) => {
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        role: "member",
        userId: secondUserId,
      });
    });
    const firstViewer = asUser(t, firstUserId);
    const secondViewer = asUser(t, secondUserId);

    const firstFolderId = await firstViewer.mutation(
      api.repository.folders.createRepositoryFolder,
      {
        name: "Projects",
        organizationId,
      },
    );
    const secondFolderId = await secondViewer.mutation(
      api.repository.folders.createRepositoryFolder,
      {
        name: "Projects",
        organizationId,
      },
    );
    await firstViewer.mutation(api.repository.folders.setRepositoryFolderCollapsed, {
      collapsed: true,
      folderId: firstFolderId,
    });
    await firstViewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId: firstFolderId,
      repositoryId,
    });
    await secondViewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId: secondFolderId,
      repositoryId,
    });

    await expect(
      firstViewer.query(api.repository.folders.getRepositoryFolderState),
    ).resolves.toEqual({
      assignments: [{ folderId: firstFolderId, repositoryId }],
      folders: [
        {
          _id: firstFolderId,
          collapsed: true,
          name: "Projects",
          organizationId,
          position: 0,
        },
      ],
    });
    await expect(
      secondViewer.query(api.repository.folders.getRepositoryFolderState),
    ).resolves.toEqual({
      assignments: [{ folderId: secondFolderId, repositoryId }],
      folders: [
        {
          _id: secondFolderId,
          collapsed: false,
          name: "Projects",
          organizationId,
          position: 0,
        },
      ],
    });
  });

  it("groups only repositories from the folder organization", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstOrganizationId = await seedOrganization(t, { owner: "first", userId });
    const secondOrganizationId = await seedOrganization(t, { owner: "second", userId });
    const firstRepositoryId = await seedRepository(t, firstOrganizationId);
    const secondRepositoryId = await seedRepository(t, secondOrganizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Projects",
      organizationId: firstOrganizationId,
    });

    await viewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId,
      repositoryId: firstRepositoryId,
    });
    await expect(
      viewer.mutation(api.repository.folders.moveRepositoryToFolder, {
        folderId,
        repositoryId: secondRepositoryId,
      }),
    ).rejects.toThrow("Folder and repository must belong to the same organization.");
    await expect(
      viewer.query(api.repository.folders.getRepositoryFolderState),
    ).resolves.toMatchObject({
      assignments: [{ folderId, repositoryId: firstRepositoryId }],
    });
  });

  it("keeps collapse and order independent for each organization", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const firstOrganizationId = await seedOrganization(t, { owner: "first", userId });
    const secondOrganizationId = await seedOrganization(t, { owner: "second", userId });
    const viewer = asUser(t, userId);
    const firstFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "First",
      organizationId: firstOrganizationId,
    });
    const secondFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Second",
      organizationId: firstOrganizationId,
    });
    const otherFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Other",
      organizationId: secondOrganizationId,
    });

    await viewer.mutation(api.repository.folders.setRepositoryFolderCollapsed, {
      collapsed: true,
      folderId: secondFolderId,
    });
    await viewer.mutation(api.repository.folders.moveRepositoryFolder, {
      direction: "up",
      folderId: secondFolderId,
    });

    const state = await viewer.query(api.repository.folders.getRepositoryFolderState);
    expect(state.folders).toEqual(
      [
        {
          _id: secondFolderId,
          collapsed: true,
          name: "Second",
          organizationId: firstOrganizationId,
          position: 0,
        },
        {
          _id: firstFolderId,
          collapsed: false,
          name: "First",
          organizationId: firstOrganizationId,
          position: 1,
        },
        {
          _id: otherFolderId,
          collapsed: false,
          name: "Other",
          organizationId: secondOrganizationId,
          position: 0,
        },
      ].sort(
        (left, right) =>
          left.organizationId.localeCompare(right.organizationId) || left.position - right.position,
      ),
    );
  });

  it("does not wrap folder order at either boundary", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const viewer = asUser(t, userId);
    const firstFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "First",
      organizationId,
    });
    const middleFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Middle",
      organizationId,
    });
    const lastFolderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Last",
      organizationId,
    });

    await viewer.mutation(api.repository.folders.moveRepositoryFolder, {
      direction: "up",
      folderId: firstFolderId,
    });
    await viewer.mutation(api.repository.folders.moveRepositoryFolder, {
      direction: "down",
      folderId: lastFolderId,
    });

    await expect(
      viewer.query(api.repository.folders.getRepositoryFolderState),
    ).resolves.toMatchObject({
      folders: [
        { _id: firstFolderId, position: 0 },
        { _id: middleFolderId, position: 1 },
        { _id: lastFolderId, position: 2 },
      ],
    });
  });

  it("hides stored folders and assignments after organization access is lost", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const repositoryId = await seedRepository(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId,
      repositoryId,
    });

    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (!membership) {
        throw new Error("Membership not found");
      }
      await ctx.db.delete(membership._id);
    });

    await expect(viewer.query(api.repository.folders.getRepositoryFolderState)).resolves.toEqual({
      assignments: [],
      folders: [],
    });
    await expect(
      viewer.mutation(api.repository.folders.setRepositoryFolderCollapsed, {
        collapsed: true,
        folderId,
      }),
    ).rejects.toThrow("Folder not found");
    await t.run(async (ctx) => {
      expect(await ctx.db.get(folderId)).not.toBeNull();
      expect(
        await ctx.db
          .query("ui_repositoryTree_folderAssignments")
          .withIndex("by_userId_and_organizationId_and_repositoryId", (query) =>
            query
              .eq("userId", userId)
              .eq("organizationId", organizationId)
              .eq("repositoryId", repositoryId),
          )
          .unique(),
      ).not.toBeNull();
    });
  });

  it("leaves deleted-folder assignments stale and presents their repositories as ungrouped", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const repositoryId = await seedRepository(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId,
      repositoryId,
    });

    await viewer.mutation(api.repository.folders.deleteRepositoryFolder, { folderId });

    await expect(viewer.query(api.repository.folders.getRepositoryFolderState)).resolves.toEqual({
      assignments: [],
      folders: [],
    });
    await t.run(async (ctx) => {
      expect(
        await ctx.db
          .query("ui_repositoryTree_folderAssignments")
          .withIndex("by_userId_and_organizationId_and_repositoryId", (query) =>
            query
              .eq("userId", userId)
              .eq("organizationId", organizationId)
              .eq("repositoryId", repositoryId),
          )
          .unique(),
      ).not.toBeNull();
    });
  });

  it("fails closed on duplicate visible assignments", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const repositoryId = await seedRepository(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId,
      repositoryId,
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("ui_repositoryTree_folderAssignments", {
        folderId,
        organizationId,
        userId,
        repositoryId,
      });
    });

    await expect(viewer.query(api.repository.folders.getRepositoryFolderState)).rejects.toThrow(
      "Duplicate repository folder assignments.",
    );
  });

  it("continues live repository deletion without membership and rejects a terminal run", async () => {
    const t = makeConvexTest();
    const userId = await seedUser(t, "ada@example.com");
    const organizationId = await seedOrganization(t, { owner: "samebase", userId });
    const repositoryId = await seedRepository(t, organizationId);
    const viewer = asUser(t, userId);
    const folderId = await viewer.mutation(api.repository.folders.createRepositoryFolder, {
      name: "Projects",
      organizationId,
    });
    await viewer.mutation(api.repository.folders.moveRepositoryToFolder, {
      folderId,
      repositoryId,
    });

    const deletionRunId = await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
        state: "running",
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "samebase/repository",
        createdAt: 1,
        updatedAt: 1,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "folder-cleanup-test" },
        currentStep: "cleanup_source_caches",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              githubRepositoryDatabaseId: "repository-id",
              githubOwnerLogin: "samebase",
              githubRepositoryName: "repository",
              githubRepositoryFullName: "samebase/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      await ctx.db.patch(repositoryId, {
        deletion: { state: "deleting", runId, requestedAt: 1 },
      });
      const membership = await ctx.db
        .query("organizationMemberships")
        .withIndex("by_organization_and_user", (query) =>
          query.eq("organizationId", organizationId).eq("userId", userId),
        )
        .unique();
      if (!membership) {
        throw new Error("Test membership not found.");
      }
      await ctx.db.delete(membership._id);
      return runId;
    });

    await expect(
      t.mutation(internal.repository.deletion.cleanup.cleanupRepositoryLocalDataStepBatch, {
        runId: deletionRunId,
        step: "cleanup_source_caches",
        repositoryId,
      }),
    ).resolves.toEqual({
      rowsChanged: 1,
      state: "needs_more",
      table: "ui_repositoryTree_folderAssignments",
    });
    await t.run(async (ctx) => {
      expect(await ctx.db.get(repositoryId)).not.toBeNull();
      expect(await ctx.db.get(folderId)).not.toBeNull();
      expect(
        await ctx.db
          .query("ui_repositoryTree_folderAssignments")
          .withIndex("by_repositoryId", (query) => query.eq("repositoryId", repositoryId))
          .first(),
      ).toBeNull();

      await ctx.db.replace(deletionRunId, {
        state: "failed",
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "samebase/repository",
        createdAt: 1,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "folder-cleanup-test" },
        currentStep: "cleanup_source_caches",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              githubRepositoryDatabaseId: "repository-id",
              githubOwnerLogin: "samebase",
              githubRepositoryName: "repository",
              githubRepositoryFullName: "samebase/repository",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
        lastError: "test terminal state",
        completedAt: 2,
      });
    });

    await expect(
      t.mutation(internal.repository.deletion.cleanup.cleanupRepositoryLocalDataStepBatch, {
        runId: deletionRunId,
        step: "cleanup_source_caches",
        repositoryId,
      }),
    ).rejects.toThrow("Repository deletion run does not authorize repository access.");
  });
});
