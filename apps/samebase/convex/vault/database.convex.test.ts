import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

type ConvexAuth =
  | {
      method: "api_key";
      credential: string;
    }
  | {
      method: "oauth";
      credential: string;
    };

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

function jsonResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function seedDatabaseEditorVault(
  t: ReturnType<typeof makeConvexTest>,
  convexAuth: ConvexAuth,
) {
  const { convexProjectId, organizationId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", { name: "Test organization" });
    await ctx.db.insert("organizationMemberships", { organizationId, userId });
    const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "convex",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: convexAuth,
      teamId: "1000",
      teamSlug: "ada-team",
      createdAt: 1,
      updatedAt: 2,
    });
    const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
      kind: "github",
      state: "connected",
      organizationId,
      connectedByUserId: userId,
      auth: { method: "api_key", credential: "github-token" },
      accountId: "github-ada",
      username: "ada",
      createdAt: 1,
      updatedAt: 2,
    });
    await ctx.db.patch(organizationId, {
      selectedConvexProviderConnectionId: convexProviderConnectionId,
      selectedGithubProviderConnectionId: githubProviderConnectionId,
    });
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      requestedByUserId: userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      githubProviderConnectionId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
      vaultId,
      organizationId,
      providerConnectionId: convexProviderConnectionId,
      teamId: "1000",
      projectId: "1001",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });

    return { convexProjectId, organizationId, userId };
  });

  return { convexProjectId, organizationId, user: asUser(t, userId) };
}

function databaseRouteArgs(
  organizationId: Id<"organizations">,
  convexProjectId: Id<"vaultConvexProjects">,
) {
  return {
    organizationId,
    owner: "ada",
    repoName: "demo",
    branch: "main",
    convexProjectId,
  };
}

function productionDeploymentResponse(): Response {
  return jsonResponse(`{
    "class":"s16",
    "createTime":1710000000000,
    "deploymentType":"prod",
    "deploymentUrl":"https://demo.convex.cloud",
    "id":2001,
    "isDefault":true,
    "kind":"cloud",
    "name":"demo-prod",
    "projectId":"1001",
    "reference":"prod",
    "region":"aws-us-east-1"
  }`);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createEmbeddedDashboardCredentials", () => {
  it("mints and revokes OAuth-backed deploy keys without request-scoped options", async () => {
    const t = makeConvexTest();
    const { convexProjectId, organizationId, user } = await seedDatabaseEditorVault(t, {
      method: "oauth",
      credential: "convex-oauth-token",
    });
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);

        if (input.url.endsWith("/projects/1001/deployment?defaultProd=true")) {
          return productionDeploymentResponse();
        }
        if (input.url.endsWith("/create_deploy_key")) {
          return jsonResponse(`{"deployKey":"prod:demo-prod|oauth-embedded-secret"}`);
        }
        if (input.url.endsWith("/delete_deploy_key")) {
          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const result = await user.action(
      api.vault.database.createEmbeddedDashboardCredentials,
      databaseRouteArgs(organizationId, convexProjectId),
    );

    expect(result).toEqual({
      kind: "ready",
      deploymentUrl: "https://demo.convex.cloud",
      deploymentName: "demo-prod",
      deployKeyName: "samebase-embedded-data-demo-prod-1710003600000",
      adminKey: "prod:demo-prod|oauth-embedded-secret",
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/create_deploy_key",
    );
    expect(requests[1]?.headers.get("Authorization")).toBe("Bearer convex-oauth-token");
    await expect(requests[1]?.json()).resolves.toEqual({
      name: "samebase-embedded-data-demo-prod-1710003600000",
    });

    if (result.kind !== "ready") {
      throw new Error("Expected ready embedded dashboard credentials.");
    }

    await user.action(api.vault.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(organizationId, convexProjectId),
      deployKeyName: result.deployKeyName,
    });

    expect(requests).toHaveLength(4);
    expect(requests[3]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/delete_deploy_key",
    );
    expect(requests[3]?.headers.get("Authorization")).toBe("Bearer convex-oauth-token");
    await expect(requests[3]?.json()).resolves.toEqual({
      id: "samebase-embedded-data-demo-prod-1710003600000",
    });
  });

  it("mints and revokes data editor deploy keys from API-key Convex connections", async () => {
    const t = makeConvexTest();
    const { convexProjectId, organizationId, user } = await seedDatabaseEditorVault(t, {
      method: "api_key",
      credential: "convex-api-key",
    });
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);

        if (input.url.endsWith("/projects/1001/deployment?defaultProd=true")) {
          return productionDeploymentResponse();
        }
        if (input.url.endsWith("/create_deploy_key")) {
          return jsonResponse(`{"deployKey":"prod:demo-prod|embedded-secret"}`);
        }
        if (input.url.endsWith("/delete_deploy_key")) {
          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const result = await user.action(
      api.vault.database.createEmbeddedDashboardCredentials,
      databaseRouteArgs(organizationId, convexProjectId),
    );

    expect(result).toEqual({
      kind: "ready",
      deploymentUrl: "https://demo.convex.cloud",
      deploymentName: "demo-prod",
      deployKeyName: "samebase-embedded-data-demo-prod-1710003600000",
      adminKey: "prod:demo-prod|embedded-secret",
    });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/create_deploy_key",
    );
    expect(requests[1]?.headers.get("Authorization")).toBe("Bearer convex-api-key");
    await expect(requests[1]?.json()).resolves.toEqual({
      allowedActions: ["deployment:data:view", "deployment:data:write"],
      expiresAt: 1_710_003_600_000,
      name: "samebase-embedded-data-demo-prod-1710003600000",
    });

    if (result.kind !== "ready") {
      throw new Error("Expected ready embedded dashboard credentials.");
    }

    await user.action(api.vault.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(organizationId, convexProjectId),
      deployKeyName: result.deployKeyName,
    });

    expect(requests).toHaveLength(4);
    expect(requests[3]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/delete_deploy_key",
    );
    expect(requests[3]?.headers.get("Authorization")).toBe("Bearer convex-api-key");
    await expect(requests[3]?.json()).resolves.toEqual({
      id: "samebase-embedded-data-demo-prod-1710003600000",
    });
  });
});

describe("revokeEmbeddedDashboardCredentials", () => {
  it("does not delete arbitrary deployment keys", async () => {
    const t = makeConvexTest();
    const { convexProjectId, organizationId, user } = await seedDatabaseEditorVault(t, {
      method: "api_key",
      credential: "convex-api-key",
    });
    const fetch = vi.fn(async (input: Request) => {
      if (input.url.endsWith("/projects/1001/deployment?defaultProd=true")) {
        return productionDeploymentResponse();
      }
      throw new Error(`Unexpected Convex request: ${input.url}`);
    });
    vi.stubGlobal("fetch", fetch);

    await user.action(api.vault.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(organizationId, convexProjectId),
      deployKeyName: "production-deploy-key",
    });

    expect(fetch).toHaveBeenCalledOnce();
  });
});

describe("embedded dashboard project ownership", () => {
  it("allows same-organization vaults and rejects attachment organization conflicts", async () => {
    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { email: "user@example.com" });
      const otherUserId = await ctx.db.insert("users", { email: "other@example.com" });
      const organizationId = await ctx.db.insert("organizations", {
        name: "Shared organization",
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        name: "Other organization",
      });
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      await ctx.db.insert("organizationMemberships", { organizationId, userId: otherUserId });
      const githubProviderConnectionId = await ctx.db.insert("providerConnections", {
        kind: "github",
        state: "connected",
        organizationId,
        connectedByUserId: userId,
        auth: { method: "api_key", credential: "github-token" },
        accountId: "github-ada",
        username: "ada",
        createdAt: 1,
        updatedAt: 2,
      });
      const convexProviderConnectionId = await ctx.db.insert("providerConnections", {
        kind: "convex",
        state: "connected",
        organizationId,
        connectedByUserId: userId,
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "team",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 2,
      });
      const insertConnectedVault = async (ownerId: Id<"users">, name: string) => {
        const vaultId = await ctx.db.insert("vaults", {
          organizationId,
          deletion: { state: "not_deleting" },
          state: "not_connected",
        });
        const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
          requestedByUserId: ownerId,
          vaultId,
          repositoryFullName: `ada/${name}`,
          trigger: "connect_existing_repository",
          state: "succeeded",
          currentStep: "finish",
          createdAt: 1,
          updatedAt: 2,
          completedAt: 2,
        });
        await ctx.db.replace(vaultId, {
          organizationId,
          githubProviderConnectionId,
          deletion: { state: "not_deleting" },
          state: "connected",
          githubMode: "connect_existing_repository",
          runId,
          ghRepoId: name,
          owner: "ada",
          name,
          visibility: "private",
          defaultBranch: "main",
          connectedAt: 2,
        });
        return vaultId;
      };

      const otherVaultId = await insertConnectedVault(otherUserId, "other");
      const matchingVaultId = await insertConnectedVault(userId, "matching");
      const projectForOtherVaultId = await ctx.db.insert("vaultConvexProjects", {
        vaultId: otherVaultId,
        organizationId,
        providerConnectionId: convexProviderConnectionId,
        teamId: "team",
        projectId: "other-parent",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      const mismatchedProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId: matchingVaultId,
        organizationId: otherOrganizationId,
        providerConnectionId: convexProviderConnectionId,
        teamId: "team",
        projectId: "wrong-organization",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      return {
        convexProviderConnectionId,
        matchingVaultId,
        mismatchedProjectId,
        otherVaultId,
        projectForOtherVaultId,
        userId,
      };
    });

    await expect(
      t.query(internal.vault.database.readEmbeddedDashboardProject, {
        userId: ids.userId,
        vaultId: ids.otherVaultId,
        convexProjectId: ids.projectForOtherVaultId,
      }),
    ).resolves.toEqual({
      projectId: "other-parent",
      providerConnectionId: ids.convexProviderConnectionId,
      teamId: "team",
    });
    await expect(
      t.query(internal.vault.database.readEmbeddedDashboardProject, {
        userId: ids.userId,
        vaultId: ids.matchingVaultId,
        convexProjectId: ids.mismatchedProjectId,
      }),
    ).resolves.toBeNull();
  });
});
