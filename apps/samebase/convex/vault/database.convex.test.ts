import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

const databaseRouteBaseArgs = {
  owner: "ada",
  repoName: "demo",
  branch: "main",
};

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
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await ctx.db.insert("providerConnections", {
      kind: "convex",
      userId,
      auth: convexAuth,
      teamId: "1000",
      teamSlug: "ada-team",
      createdAt: 1,
      updatedAt: 2,
    });
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("appProvisioningRuns", {
      userId,
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
      userId,
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
    const appId = await ctx.db.insert("vaultApps", {
      vaultId,
      userId,
      rootDirectory: "/",
      createdAt: 25,
    });
    const deploymentId = await ctx.db.insert("vaultConvexDeployments", {
      vaultId,
      userId,
      appId,
      projectId: "convex-project-id",
      teamSlug: "ada-team",
      projectSlug: "demo",
      deploymentName: "demo-prod",
      deploymentType: "prod",
      cloudUrl: "https://demo.convex.cloud",
      siteUrl: "https://demo.convex.site",
      previewDeployment: { state: "not_ensured" },
      origin: "selected_existing",
      connectedAt: 25,
      lastObservedAt: 25,
    });

    return { deploymentId, userId };
  });

  return {
    deploymentId: ids.deploymentId,
    user: asUser(t, ids.userId),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createEmbeddedDashboardCredentials", () => {
  it("mints and revokes OAuth-backed deploy keys without request-scoped options", async () => {
    const t = makeConvexTest();
    const { deploymentId, user } = await seedDatabaseEditorVault(t, {
      method: "oauth",
      credential: "convex-oauth-token",
    });
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);

        if (input.url.endsWith("/create_deploy_key")) {
          return jsonResponse(`{"deployKey":"prod:demo-prod|oauth-embedded-secret"}`);
        }
        if (input.url.endsWith("/delete_deploy_key")) {
          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const result = await user.action(api.vault.database.createEmbeddedDashboardCredentials, {
      ...databaseRouteBaseArgs,
      deploymentId,
    });

    expect(result).toEqual({
      kind: "ready",
      deploymentUrl: "https://demo.convex.cloud",
      deploymentName: "demo-prod",
      deployKeyName: "samebase-embedded-data-demo-prod-1710003600000",
      adminKey: "prod:demo-prod|oauth-embedded-secret",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/create_deploy_key",
    );
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer convex-oauth-token");
    await expect(requests[0]?.json()).resolves.toEqual({
      name: "samebase-embedded-data-demo-prod-1710003600000",
    });

    if (result.kind !== "ready") {
      throw new Error("Expected ready embedded dashboard credentials.");
    }

    await user.action(api.vault.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteBaseArgs,
      deploymentId,
      deployKeyName: result.deployKeyName,
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/delete_deploy_key",
    );
    expect(requests[1]?.headers.get("Authorization")).toBe("Bearer convex-oauth-token");
    await expect(requests[1]?.json()).resolves.toEqual({
      id: "samebase-embedded-data-demo-prod-1710003600000",
    });
  });

  it("mints and revokes data editor deploy keys from API-key Convex connections", async () => {
    const t = makeConvexTest();
    const { deploymentId, user } = await seedDatabaseEditorVault(t, {
      method: "api_key",
      credential: "convex-api-key",
    });
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);

        if (input.url.endsWith("/create_deploy_key")) {
          return jsonResponse(`{"deployKey":"prod:demo-prod|embedded-secret"}`);
        }
        if (input.url.endsWith("/delete_deploy_key")) {
          return new Response(null, { status: 200 });
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const result = await user.action(api.vault.database.createEmbeddedDashboardCredentials, {
      ...databaseRouteBaseArgs,
      deploymentId,
    });

    expect(result).toEqual({
      kind: "ready",
      deploymentUrl: "https://demo.convex.cloud",
      deploymentName: "demo-prod",
      deployKeyName: "samebase-embedded-data-demo-prod-1710003600000",
      adminKey: "prod:demo-prod|embedded-secret",
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/create_deploy_key",
    );
    expect(requests[0]?.headers.get("Authorization")).toBe("Bearer convex-api-key");
    await expect(requests[0]?.json()).resolves.toEqual({
      allowedActions: ["deployment:data:view", "deployment:data:write"],
      expiresAt: 1_710_003_600_000,
      name: "samebase-embedded-data-demo-prod-1710003600000",
    });

    if (result.kind !== "ready") {
      throw new Error("Expected ready embedded dashboard credentials.");
    }

    await user.action(api.vault.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteBaseArgs,
      deploymentId,
      deployKeyName: result.deployKeyName,
    });

    expect(requests).toHaveLength(2);
    expect(requests[1]?.url).toBe(
      "https://api.convex.dev/v1/deployments/demo-prod/delete_deploy_key",
    );
    expect(requests[1]?.headers.get("Authorization")).toBe("Bearer convex-api-key");
    await expect(requests[1]?.json()).resolves.toEqual({
      id: "samebase-embedded-data-demo-prod-1710003600000",
    });
  });
});

describe("revokeEmbeddedDashboardCredentials", () => {
  it("does not delete arbitrary deployment keys", async () => {
    const t = makeConvexTest();
    const { deploymentId, user } = await seedDatabaseEditorVault(t, {
      method: "api_key",
      credential: "convex-api-key",
    });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await user.action(api.vault.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteBaseArgs,
      deploymentId,
      deployKeyName: "production-deploy-key",
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
