import { expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

function asIdentity(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

it("lets organization members read the same vault and rejects another organization", async () => {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      name: "Owner",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    const teammateId = await ctx.db.insert("users", {
      name: "Teammate",
      email: "nicuchiciuc@gmail.com",
      isApproved: true,
    });
    const outsiderId = await ctx.db.insert("users", {
      name: "Outsider",
      email: "nicu@samebase.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", { name: "Shared organization" });
    const outsiderOrganizationId = await ctx.db.insert("organizations", {
      name: "Other organization",
    });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: ownerId });
    await ctx.db.insert("organizationMemberships", { organizationId, userId: teammateId });
    await ctx.db.insert("organizationMemberships", {
      organizationId: outsiderOrganizationId,
      userId: outsiderId,
    });

    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId,
      connectedByUserId: ownerId,
      accountId: "github-account",
      auth: { method: "api_key", credential: "test-token" },
      createdAt: 1,
      updatedAt: 1,
    });
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      state: "succeeded",
      requestedByUserId: ownerId,
      vaultId,
      repositoryFullName: "owner/shared",
      trigger: "connect_existing_repository",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 3,
    });
    await ctx.db.replace(vaultId, {
      state: "connected",
      organizationId,
      deletion: { state: "not_deleting" },
      githubProviderConnectionId,
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "owner",
      name: "shared",
      defaultBranch: "main",
      visibility: "private",
      connectedAt: 4,
    });

    return { organizationId, outsiderId, ownerId, teammateId, vaultId };
  });
  const request = {
    organizationId: ids.organizationId,
    repositoryFullName: "owner/shared",
  };

  await expect(
    asIdentity(t, ids.ownerId).query(api.vault.records.getVaultByRepository, request),
  ).resolves.toMatchObject({ _id: ids.vaultId });
  await expect(
    asIdentity(t, ids.teammateId).query(api.vault.records.getVaultByRepository, request),
  ).resolves.toMatchObject({ _id: ids.vaultId });
  await expect(
    asIdentity(t, ids.outsiderId).query(api.vault.records.getVaultByRepository, request),
  ).rejects.toThrow("Organization membership is required.");
});
