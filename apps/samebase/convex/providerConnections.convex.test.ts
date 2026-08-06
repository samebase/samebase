import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { fingerprintProviderAuth } from "./providerAuthFingerprint";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function cloudflareSuccessResponse(result: unknown): Response {
  return new Response(JSON.stringify({ success: true, errors: [], messages: [], result }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

async function seedOrganizationMembers() {
  const t = makeConvexTest();
  const users = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      email: "owner@example.com",
      isApproved: true,
    });
    const memberId = await ctx.db.insert("users", {
      email: "member@example.com",
      isApproved: true,
    });
    const outsiderId = await ctx.db.insert("users", {
      email: "outsider@example.com",
      isApproved: true,
    });
    return { memberId, outsiderId, ownerId };
  });
  const { organizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId: users.ownerId,
      githubOwnerId: "owner-1",
      githubOwnerType: "organization",
      githubOwnerLogin: "Primary",
      githubInstallationId: "installation-1",
    },
  );
  const { organizationId: otherOrganizationId } = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId: users.outsiderId,
      githubOwnerId: "owner-2",
      githubOwnerType: "organization",
      githubOwnerLogin: "Other",
      githubInstallationId: "installation-2",
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: users.memberId,
      role: "member",
    });
  });
  return { ...users, organizationId, otherOrganizationId, t };
}

async function createConnectedVault(
  t: ConvexTest,
  args: { organizationId: Id<"organizations">; userId: Id<"users">; name: string },
): Promise<Id<"vaults">> {
  const ids = await t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      ghRepoOwner: "Primary",
      ghRepoName: args.name,
    },
  );
  await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
    ...ids,
    userId: args.userId,
    ghRepoId: `repository-${args.name}`,
    ghRepoOwner: "Primary",
    ghRepoName: args.name,
    defaultBranch: "main",
    visibility: "private",
  });
  return ids.vaultId;
}

describe("organization provider connections", () => {
  it("rejects a second connection of each provider kind", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const convexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "credential-b" },
          teamId: "team-a",
        },
      }),
    ).rejects.toThrow("Provider connection already exists.");

    const cloudflareConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "credential-b" },
          defaultAccount: { state: "not_selected" },
        },
      }),
    ).rejects.toThrow("Provider connection already exists.");

    const [convexConnection, cloudflareConnection] = await Promise.all([
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ]);
    expect({ cloudflareConnection, convexConnection }).toMatchObject({
      cloudflareConnection: { _id: cloudflareConnectionId },
      convexConnection: { _id: convexConnectionId },
    });
  });

  it("reauthorizes the same targets without changing row IDs", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const convexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "convex-a" },
        teamId: "team-a",
      },
    });
    const cloudflareConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "cloudflare-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId: convexConnectionId,
        expectedAuthFingerprint: await fingerprintProviderAuth({
          method: "api_key",
          credential: "convex-a",
        }),
        expectedTarget: { kind: "convex", teamId: "team-a" },
        connection: {
          kind: "convex",
          auth: { method: "oauth", credential: "convex-b" },
          teamId: "team-a",
        },
      }),
    ).resolves.toBe(convexConnectionId);
    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId: cloudflareConnectionId,
        expectedAuthFingerprint: await fingerprintProviderAuth({
          method: "api_key",
          credential: "cloudflare-a",
        }),
        expectedTarget: {
          kind: "cloudflare",
          account: { state: "selected", accountId: "account-a" },
        },
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-b" },
          defaultAccount: {
            state: "selected",
            accountId: "account-a",
            accountName: "Account A renamed",
          },
        },
      }),
    ).resolves.toBe(cloudflareConnectionId);

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({
      _id: convexConnectionId,
      auth: { method: "oauth", credential: "convex-b" },
      teamId: "team-a",
    });
    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ).resolves.toMatchObject({
      _id: cloudflareConnectionId,
      auth: { credential: "cloudflare-b" },
      defaultAccount: { state: "selected", accountId: "account-a" },
    });
  });

  it("rejects a Convex team change", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        expectedAuthFingerprint: await fingerprintProviderAuth({
          method: "api_key",
          credential: "credential-a",
        }),
        expectedTarget: { kind: "convex", teamId: "team-a" },
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "credential-b" },
          teamId: "team-b",
        },
      }),
    ).rejects.toThrow("Convex connection team cannot change.");
  });

  it("rejects a Cloudflare account change", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: { method: "api_key", credential: "credential-a" },
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      }),
    ).resolves.toBeNull();

    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        expectedAuthFingerprint: await fingerprintProviderAuth({
          method: "api_key",
          credential: "credential-a",
        }),
        expectedTarget: {
          kind: "cloudflare",
          account: { state: "selected", accountId: "account-a" },
        },
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "credential-b" },
          defaultAccount: {
            state: "selected",
            accountId: "account-b",
            accountName: "Account B",
          },
        },
      }),
    ).rejects.toThrow("Cloudflare connection account cannot change.");
    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: { method: "api_key", credential: "credential-a" },
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-b",
          accountName: "Account B",
        },
      }),
    ).rejects.toThrow("Cloudflare connection account cannot change.");
  });

  it("preserves a selected Cloudflare account when reauthorization cannot select one", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });

    await t.mutation(internal.providerConnections.reauthorizeConnected, {
      organizationId,
      connectedByUserId: ownerId,
      providerConnectionId,
      expectedAuthFingerprint: await fingerprintProviderAuth({
        method: "api_key",
        credential: "credential-a",
      }),
      expectedTarget: {
        kind: "cloudflare",
        account: { state: "selected", accountId: "account-a" },
      },
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-b" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ).resolves.toMatchObject({
      _id: providerConnectionId,
      auth: { credential: "credential-b" },
      defaultAccount: {
        state: "selected",
        accountId: "account-a",
        accountName: "Account A",
      },
    });
  });

  it("allows disconnect but rejects reconnecting retained resources to another target", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const vaultId = await createConnectedVault(t, {
      organizationId,
      userId: ownerId,
      name: "retained-app",
    });
    const convexConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "convex-a" },
        teamId: "team-a",
      },
    });
    const cloudflareConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "cloudflare-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });
    await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId,
      userId: ownerId,
      projects: [
        {
          teamId: "team-a",
          projectId: "project-a",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });
    await t.mutation(internal.vault.cloudflareMutations.attachWorkers, {
      vaultId,
      userId: ownerId,
      workers: [
        {
          accountId: "account-a",
          workerName: "worker-a",
          workerTag: "worker-tag-a",
          origin: "selected_existing",
        },
      ],
    });

    await t.mutation(internal.providerConnections.disconnect, {
      organizationId,
      disconnectedByUserId: ownerId,
      providerConnectionId: convexConnectionId,
      kind: "convex",
      expectedAuth: { method: "api_key", credential: "convex-a" },
    });
    await t.mutation(internal.providerConnections.disconnect, {
      organizationId,
      disconnectedByUserId: ownerId,
      providerConnectionId: cloudflareConnectionId,
      kind: "cloudflare",
      expectedAuth: { method: "api_key", credential: "cloudflare-a" },
    });

    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "convex-b" },
          teamId: "team-b",
        },
      }),
    ).rejects.toThrow("Convex connection team must match all retained organization resources.");
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-b" },
          defaultAccount: {
            state: "selected",
            accountId: "account-b",
            accountName: "Account B",
          },
        },
      }),
    ).rejects.toThrow(
      "Cloudflare connection account must match all retained organization resources.",
    );

    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "convex-a-replacement" },
          teamId: "team-a",
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-a-replacement" },
          defaultAccount: {
            state: "selected",
            accountId: "account-a",
            accountName: "Account A",
          },
        },
      }),
    ).resolves.toBeDefined();
  });

  it("checks retained plans, retryable deletion targets, and relevant active writes", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const vaultId = await createConnectedVault(t, {
      organizationId,
      userId: ownerId,
      name: "target-safety-app",
    });
    const planId = await t.run(async (ctx) => {
      return await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        convexConfigPath: "convex.json",
        convex: {
          state: "planned",
          projectName: "target-safety-app",
          teamId: "team-a",
        },
        cloudflare: {
          state: "planned",
          accountId: "account-a",
          workerName: "target-safety-app",
          rootDirectory: "/",
        },
        createdAt: 1,
        updatedAt: 1,
      });
    });

    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "convex-b" },
          teamId: "team-b",
        },
      }),
    ).rejects.toThrow("Convex connection team must match all retained organization resources.");

    const deletionRunId = await t.run(async (ctx) => {
      await ctx.db.delete(planId);
      return await ctx.db.insert("workflow_vaultDeletion_runs", {
        state: "queued",
        organizationId,
        userId: ownerId,
        vaultId,
        repositoryFullName: "Primary/target-safety-app",
        createdAt: 2,
        updatedAt: 2,
        attempt: { kind: "initial" },
        workflow: { state: "not_started" },
        currentStep: "initialize_deletion",
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              ghRepoId: "repository-target-safety-app",
              owner: "Primary",
              name: "target-safety-app",
              repositoryFullName: "Primary/target-safety-app",
            },
            convex: {
              action: "delete_projects",
              projects: [{ teamId: "team-a", projectId: "project-a" }],
            },
            cloudflare: {
              action: "delete_workers",
              workers: [
                {
                  accountId: "account-a",
                  workerName: "worker-a",
                  workerTag: "worker-tag-a",
                },
              ],
            },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
    });

    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-b" },
          defaultAccount: {
            state: "selected",
            accountId: "account-b",
            accountName: "Account B",
          },
        },
      }),
    ).rejects.toThrow(
      "Cloudflare connection account must match all retained organization resources.",
    );

    await t.run(async (ctx) => {
      await ctx.db.delete(deletionRunId);
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          actionId: "active-convex-write",
          action: "create_convex_project",
          expiresAt: Date.now() + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: Date.now(),
      });
    });

    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "cloudflare-a" },
          defaultAccount: {
            state: "selected",
            accountId: "account-a",
            accountName: "Account A",
          },
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: ownerId,
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "convex-a" },
          teamId: "team-a",
        },
      }),
    ).rejects.toThrow(
      "Cannot establish a convex connection while an organization provider write is active.",
    );
  });

  it("rejects stale Cloudflare updates after reauthorization", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });
    await t.mutation(internal.providerConnections.reauthorizeConnected, {
      organizationId,
      connectedByUserId: ownerId,
      providerConnectionId,
      expectedAuthFingerprint: await fingerprintProviderAuth({
        method: "api_key",
        credential: "credential-a",
      }),
      expectedTarget: { kind: "cloudflare", account: { state: "not_selected" } },
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-b" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: { method: "api_key", credential: "credential-a" },
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      }),
    ).rejects.toThrow("Cloudflare connection changed before the update completed.");
  });

  it("does not revoke or delete a replacement during a stale disconnect", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const previousAuth = {
      method: "oauth" as const,
      credential: "previous-access-token",
      refreshCredential: "previous-refresh-token",
      credentialExpiresAt: 100,
    };
    const replacementAuth = {
      method: "oauth" as const,
      credential: "replacement-access-token",
      refreshCredential: "replacement-refresh-token",
      credentialExpiresAt: 200,
    };
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: previousAuth,
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });
    await t.mutation(internal.providerConnections.reauthorizeConnected, {
      organizationId,
      connectedByUserId: ownerId,
      providerConnectionId,
      expectedAuthFingerprint: await fingerprintProviderAuth(previousAuth),
      expectedTarget: {
        kind: "cloudflare",
        account: { state: "selected", accountId: "account-a" },
      },
      connection: {
        kind: "cloudflare",
        auth: replacementAuth,
        defaultAccount: {
          state: "selected",
          accountId: "account-a",
          accountName: "Account A",
        },
      },
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.cloudflareOAuth.revokeCloudflareOAuthForOrganizationConnection, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: previousAuth,
      }),
    ).rejects.toThrow("Cloudflare connection changed before disconnect revocation.");
    await expect(
      t.mutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: ownerId,
        providerConnectionId,
        kind: "cloudflare",
        expectedAuth: previousAuth,
      }),
    ).rejects.toThrow("Provider connection changed before disconnect completed.");
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ).resolves.toMatchObject({ _id: providerConnectionId, auth: replacementAuth });
  });

  it("compares the complete Cloudflare authorization for stale updates", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const currentAuth = {
      method: "oauth" as const,
      credential: "shared-access-token",
      refreshCredential: "current-refresh-token",
      credentialExpiresAt: 200,
    };
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: currentAuth,
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: {
          ...currentAuth,
          refreshCredential: "stale-refresh-token",
        },
        auth: currentAuth,
        defaultAccount: { state: "not_selected" },
      }),
    ).rejects.toThrow("Cloudflare connection changed before the update completed.");
  });

  it("rejects an older OAuth callback after a newer callback replaces the row", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const previousAuth = { method: "oauth" as const, credential: "previous-token" };
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: previousAuth,
        teamId: "team-a",
      },
    });
    const firstStateId = await t.mutation(internal.oauthState.createOauthState, {
      provider: "convex",
      userId: ownerId,
      organizationId,
      providerConnectionId,
      state: "first-state",
      createdAt: 1,
      expiresAt: 100,
    });
    const secondStateId = await t.mutation(internal.oauthState.createOauthState, {
      provider: "convex",
      userId: ownerId,
      organizationId,
      providerConnectionId,
      state: "second-state",
      createdAt: 2,
      expiresAt: 100,
    });

    await t.mutation(internal.convexOAuth.storeConvexOauthTokens, {
      organizationId,
      connectedByUserId: ownerId,
      providerConnectionId,
      expectedAuthFingerprint: await fingerprintProviderAuth(previousAuth),
      expectedTarget: { kind: "convex", teamId: "team-a" },
      accessToken: "newer-token",
      teamId: "team-a",
      oauthStateId: secondStateId,
    });
    await expect(
      t.mutation(internal.convexOAuth.storeConvexOauthTokens, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        expectedAuthFingerprint: await fingerprintProviderAuth(previousAuth),
        expectedTarget: { kind: "convex", teamId: "team-a" },
        accessToken: "older-token",
        teamId: "team-a",
        oauthStateId: firstStateId,
      }),
    ).rejects.toThrow("Provider connection changed before reauthorization completed.");
  });

  it("rejects an OAuth callback after its Cloudflare account target changes", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const auth = { method: "api_key" as const, credential: "cloudflare-token" };
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth,
        defaultAccount: { state: "not_selected" },
      },
    });
    const oauthStateId = await t.mutation(internal.oauthState.createOauthState, {
      provider: "cloudflare",
      userId: ownerId,
      organizationId,
      providerConnectionId,
      state: "cloudflare-account-race",
      createdAt: 1,
      expiresAt: 100,
    });
    const oauthState = await t.query(internal.oauthState.getOauthStateByState, {
      provider: "cloudflare",
      state: "cloudflare-account-race",
    });
    if (
      oauthState?.expectedAuthFingerprint === undefined ||
      oauthState.expectedTarget === undefined
    ) {
      throw new Error("Expected OAuth state compare values.");
    }
    await t.mutation(internal.providerConnections.updateCloudflareConnected, {
      organizationId,
      userId: ownerId,
      providerConnectionId,
      expectedAuth: auth,
      auth,
      defaultAccount: {
        state: "selected",
        accountId: "account-a",
        accountName: "Account A",
      },
    });

    await expect(
      t.mutation(internal.cloudflareOAuth.storeCloudflareOauthConnection, {
        organizationId,
        connectedByUserId: ownerId,
        providerConnectionId,
        expectedAuthFingerprint: oauthState.expectedAuthFingerprint,
        expectedTarget: oauthState.expectedTarget,
        accessToken: "callback-access-token",
        refreshToken: "callback-refresh-token",
        expiresAt: 200,
        defaultAccount: { state: "not_selected" },
        oauthStateId,
      }),
    ).rejects.toThrow("Provider connection target changed before reauthorization completed.");
    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "cloudflare",
      }),
    ).resolves.toMatchObject({
      auth,
      defaultAccount: { state: "selected", accountId: "account-a" },
    });
  });

  it("does not start direct or MCP OAuth refresh while another refresh lease is active", async () => {
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "client-id");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "client-secret");
    const fetchMock = vi.fn(async () => {
      throw new Error("The active lease must prevent an upstream refresh.");
    });
    vi.stubGlobal("fetch", fetchMock);

    const direct = await seedOrganizationMembers();
    const directAuth = {
      method: "oauth" as const,
      credential: "direct-access-token",
      refreshCredential: "direct-refresh-token",
      credentialExpiresAt: 0,
    };
    const directConnectionId = await direct.t.mutation(
      internal.providerConnections.createConnected,
      {
        organizationId: direct.organizationId,
        connectedByUserId: direct.ownerId,
        connection: {
          kind: "cloudflare",
          auth: directAuth,
          defaultAccount: { state: "not_selected" },
          tokenRefreshStartedAt: Date.now(),
        },
      },
    );
    await expect(
      direct.t.action(internal.cloudflareOAuth.resolveConnectionForOrganization, {
        organizationId: direct.organizationId,
        providerConnectionId: directConnectionId,
        userId: direct.ownerId,
        forceRefresh: true,
      }),
    ).rejects.toThrow("Cloudflare token refresh is in progress. Retry shortly.");
    const usableDirectAuth = {
      ...directAuth,
      credentialExpiresAt: Date.now() + 60_000,
    };
    await direct.t.run(async (ctx) => {
      await ctx.db.patch(directConnectionId, { auth: usableDirectAuth });
    });
    await expect(
      direct.t.action(internal.cloudflareOAuth.resolveConnectionForOrganization, {
        organizationId: direct.organizationId,
        providerConnectionId: directConnectionId,
        userId: direct.ownerId,
        forceRefresh: true,
      }),
    ).resolves.toMatchObject({ auth: usableDirectAuth });

    const mcp = await seedOrganizationMembers();
    const mcpAuth = {
      method: "mcp_oauth" as const,
      credential: "mcp-access-token",
      refreshCredential: "mcp-refresh-token",
      credentialExpiresAt: 0,
      clientId: "mcp-client-id",
    };
    const mcpConnectionId = await mcp.t.mutation(internal.providerConnections.createConnected, {
      organizationId: mcp.organizationId,
      connectedByUserId: mcp.ownerId,
      connection: {
        kind: "cloudflare",
        auth: mcpAuth,
        defaultAccount: { state: "not_selected" },
        tokenRefreshStartedAt: Date.now(),
      },
    });
    await expect(
      mcp.t.action(internal.cloudflareMcpOAuth.resolveConnectionForOrganization, {
        organizationId: mcp.organizationId,
        providerConnectionId: mcpConnectionId,
        userId: mcp.ownerId,
        forceRefresh: true,
      }),
    ).rejects.toThrow("Cloudflare token refresh is in progress. Retry shortly.");
    const usableMcpAuth = {
      ...mcpAuth,
      credentialExpiresAt: Date.now() + 60_000,
    };
    await mcp.t.run(async (ctx) => {
      await ctx.db.patch(mcpConnectionId, { auth: usableMcpAuth });
    });
    await expect(
      mcp.t.action(internal.cloudflareMcpOAuth.resolveConnectionForOrganization, {
        organizationId: mcp.organizationId,
        providerConnectionId: mcpConnectionId,
        userId: mcp.ownerId,
        forceRefresh: true,
      }),
    ).resolves.toMatchObject({ auth: usableMcpAuth });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses full authorization and the claimed timestamp as refresh lease identity", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    const auth = {
      method: "oauth" as const,
      credential: "shared-access-token",
      refreshCredential: "current-refresh-token",
      credentialExpiresAt: 0,
    };
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth,
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.claimCloudflareTokenRefresh, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: { ...auth, refreshCredential: "stale-refresh-token" },
        force: true,
      }),
    ).rejects.toThrow("Cloudflare connection changed before token refresh claim.");

    const claim = await t.mutation(internal.providerConnections.claimCloudflareTokenRefresh, {
      organizationId,
      userId: ownerId,
      providerConnectionId,
      expectedAuth: auth,
      force: true,
    });
    if (!claim.claimed) {
      throw new Error("Expected the test refresh lease to be claimed.");
    }
    const takeoverStartedAt = claim.tokenRefreshStartedAt + 60_000;
    await t.run(async (ctx) => {
      await ctx.db.patch(providerConnectionId, {
        tokenRefreshStartedAt: takeoverStartedAt,
      });
    });

    await expect(
      t.mutation(internal.providerConnections.updateCloudflareConnected, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: auth,
        expectedTokenRefreshStartedAt: claim.tokenRefreshStartedAt,
        auth,
        defaultAccount: { state: "not_selected" },
      }),
    ).rejects.toThrow("Cloudflare token refresh lease changed before the update completed.");
    await expect(
      t.mutation(internal.providerConnections.releaseCloudflareTokenRefresh, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        expectedAuth: auth,
        expectedTokenRefreshStartedAt: claim.tokenRefreshStartedAt,
      }),
    ).rejects.toThrow("Cloudflare token refresh lease changed before release.");
    await expect(
      t.run(async (ctx) => {
        const connection = await ctx.db.get(providerConnectionId);
        return connection?.kind === "cloudflare" ? connection.tokenRefreshStartedAt : undefined;
      }),
    ).resolves.toBe(takeoverStartedAt);
  });

  it("limits Cloudflare account discovery and access output by role and selected account", async () => {
    const { memberId, organizationId, ownerId, t } = await seedOrganizationMembers();
    const accountA = "00000000000000000000000000000001";
    const accountB = "00000000000000000000000000000002";
    const auth = { method: "api_key" as const, credential: "cloudflare-token" };
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth,
        defaultAccount: { state: "not_selected" },
      },
    });
    const asOwner = t.withIdentity({
      subject: `${ownerId}|test-session`,
      tokenIdentifier: `test:${ownerId}`,
    });
    const asMember = t.withIdentity({
      subject: `${memberId}|test-session`,
      tokenIdentifier: `test:${memberId}`,
    });
    const requestedPaths: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      requestedPaths.push(path);
      switch (path) {
        case "/client/v4/user/tokens/verify":
          return cloudflareSuccessResponse({ id: "token-id", status: "active" });
        case "/client/v4/accounts":
          return cloudflareSuccessResponse([
            { id: accountA, name: "Account A", type: "standard" },
            { id: accountB, name: "Account B", type: "standard" },
          ]);
        case `/client/v4/accounts/${accountA}/workers/account-settings`:
        case `/client/v4/accounts/${accountA}/builds/account/limits`:
          return cloudflareSuccessResponse({});
        default:
          throw new Error(`Unexpected Cloudflare request: ${path}`);
      }
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      asMember.action(api.vault.cloudflare.listAccounts, { organizationId }),
    ).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    const pendingMemberAccess = await asMember.action(
      api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
      { organizationId },
    );
    expect(pendingMemberAccess.accounts).toEqual([]);
    expect(pendingMemberAccess.checks).toContainEqual({
      key: "accounts",
      label: "Accounts",
      status: "unknown",
      message: "Cloudflare account selection is pending for an organization owner.",
    });
    expect(requestedPaths).not.toContain("/client/v4/accounts");

    await expect(
      asOwner.action(api.vault.cloudflare.listAccounts, { organizationId }),
    ).resolves.toEqual([
      { accountId: accountA, accountName: "Account A" },
      { accountId: accountB, accountName: "Account B" },
    ]);
    const pendingOwnerAccess = await asOwner.action(
      api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
      { organizationId },
    );
    expect(pendingOwnerAccess.accounts).toEqual([
      { accountId: accountA, accountName: "Account A", selected: false },
      { accountId: accountB, accountName: "Account B", selected: false },
    ]);

    await t.mutation(internal.providerConnections.updateCloudflareConnected, {
      organizationId,
      userId: ownerId,
      providerConnectionId,
      expectedAuth: auth,
      auth,
      defaultAccount: {
        state: "selected",
        accountId: accountA,
        accountName: "Account A",
      },
    });
    fetchMock.mockClear();
    requestedPaths.length = 0;

    await expect(
      asMember.action(api.vault.cloudflare.listAccounts, { organizationId }),
    ).resolves.toEqual([{ accountId: accountA, accountName: "Account A" }]);
    await expect(
      asOwner.action(api.vault.cloudflare.listAccounts, { organizationId }),
    ).resolves.toEqual([{ accountId: accountA, accountName: "Account A" }]);
    expect(fetchMock).not.toHaveBeenCalled();

    const selectedMemberAccess = await asMember.action(
      api.cloudflareProviderAccess.checkCloudflareConnectionAccess,
      { organizationId },
    );
    expect(selectedMemberAccess.accounts).toEqual([
      { accountId: accountA, accountName: "Account A", selected: true },
    ]);
    expect(JSON.stringify(selectedMemberAccess)).not.toContain(accountB);
    expect(requestedPaths).toContain("/client/v4/accounts");
    expect(requestedPaths).toContain(`/client/v4/accounts/${accountA}/workers/account-settings`);
    expect(requestedPaths).toContain(`/client/v4/accounts/${accountA}/builds/account/limits`);
    expect(requestedPaths.some((path) => path.includes(`${accountB}/`))).toBe(false);
  });

  it("lets members use connections but not manage them", async () => {
    const { memberId, organizationId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: memberId,
        kind: "convex",
      }),
    ).resolves.toMatchObject({ _id: providerConnectionId });
    await expect(
      t.mutation(internal.providerConnections.createConnected, {
        organizationId,
        connectedByUserId: memberId,
        connection: {
          kind: "cloudflare",
          auth: { method: "api_key", credential: "credential-b" },
          defaultAccount: { state: "not_selected" },
        },
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      t.mutation(internal.providerConnections.reauthorizeConnected, {
        organizationId,
        connectedByUserId: memberId,
        providerConnectionId,
        expectedAuthFingerprint: await fingerprintProviderAuth({
          method: "api_key",
          credential: "credential-a",
        }),
        expectedTarget: { kind: "convex", teamId: "team-a" },
        connection: {
          kind: "convex",
          auth: { method: "api_key", credential: "credential-b" },
          teamId: "team-a",
        },
      }),
    ).rejects.toThrow("Organization owner access is required.");
    await expect(
      t.mutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: memberId,
        providerConnectionId,
        kind: "convex",
        expectedAuth: { method: "api_key", credential: "credential-a" },
      }),
    ).rejects.toThrow("Organization owner access is required.");
  });

  it("fails closed when legacy rows contain duplicate provider kinds", async () => {
    const { organizationId, ownerId, t } = await seedOrganizationMembers();
    await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        organizationId,
        connectedByUserId: ownerId,
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        organizationId,
        connectedByUserId: ownerId,
        auth: { method: "api_key", credential: "credential-b" },
        teamId: "team-a",
        createdAt: 2,
        updatedAt: 2,
      });
    });

    await expect(
      t.query(internal.providerConnections.loadForOrganization, {
        organizationId,
        userId: ownerId,
        kind: "convex",
      }),
    ).rejects.toThrow("Organization has multiple convex provider connections.");
  });

  it("checks membership and deletes only the organization row", async () => {
    const { organizationId, otherOrganizationId, outsiderId, ownerId, t } =
      await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "cloudflare",
        auth: { method: "api_key", credential: "credential-a" },
        defaultAccount: { state: "not_selected" },
      },
    });

    await expect(
      t.mutation(internal.providerConnections.disconnect, {
        organizationId,
        disconnectedByUserId: outsiderId,
        providerConnectionId,
        kind: "cloudflare",
        expectedAuth: { method: "api_key", credential: "credential-a" },
      }),
    ).rejects.toThrow("Organization membership is required.");
    await expect(
      t.query(internal.providerConnections.loadByIdForOrganization, {
        organizationId: otherOrganizationId,
        userId: outsiderId,
        providerConnectionId,
        kind: "cloudflare",
      }),
    ).resolves.toBeNull();
    await expect(
      t.query(internal.providerConnections.loadByIdForOrganization, {
        organizationId,
        userId: ownerId,
        providerConnectionId,
        kind: "convex",
      }),
    ).resolves.toBeNull();

    await t.mutation(internal.providerConnections.disconnect, {
      organizationId,
      disconnectedByUserId: ownerId,
      providerConnectionId,
      kind: "cloudflare",
      expectedAuth: { method: "api_key", credential: "credential-a" },
    });

    const connection = await t.run(async (ctx) => await ctx.db.get(providerConnectionId));
    const organizationConnection = await t.query(internal.providerConnections.loadForOrganization, {
      organizationId,
      userId: ownerId,
      kind: "cloudflare",
    });
    expect({ connection, organizationConnection }).toEqual({
      connection: null,
      organizationConnection: null,
    });
  });

  it("targets OAuth state to an organization and validates an existing connection", async () => {
    const { organizationId, outsiderId, ownerId, t } = await seedOrganizationMembers();
    const providerConnectionId = await t.mutation(internal.providerConnections.createConnected, {
      organizationId,
      connectedByUserId: ownerId,
      connection: {
        kind: "convex",
        auth: { method: "api_key", credential: "credential-a" },
        teamId: "team-a",
      },
    });
    const oauthStateId = await t.mutation(internal.oauthState.createOauthState, {
      provider: "convex",
      userId: ownerId,
      organizationId,
      providerConnectionId,
      state: "state-a",
      createdAt: 1,
      expiresAt: 2,
    });

    const oauthState = await t.query(internal.oauthState.getOauthStateByState, {
      provider: "convex",
      state: "state-a",
    });
    expect(oauthState).toMatchObject({
      _id: oauthStateId,
      organizationId,
      providerConnectionId,
      expectedAuthFingerprint: await fingerprintProviderAuth({
        method: "api_key",
        credential: "credential-a",
      }),
      expectedTarget: { kind: "convex", teamId: "team-a" },
    });
    expect(JSON.stringify(oauthState)).not.toContain("credential-a");
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "cloudflare",
        userId: ownerId,
        organizationId,
        providerConnectionId,
        state: "state-b",
        createdAt: 1,
        expiresAt: 2,
      }),
    ).rejects.toThrow("Provider connection not found.");
    await expect(
      t.mutation(internal.oauthState.createOauthState, {
        provider: "convex",
        userId: outsiderId,
        organizationId,
        state: "state-c",
        createdAt: 1,
        expiresAt: 2,
      }),
    ).rejects.toThrow("Organization membership is required.");
  });
});
