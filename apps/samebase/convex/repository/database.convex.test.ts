import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

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

async function seedDatabaseEditorRepository(
  t: ReturnType<typeof makeConvexTest>,
  convexAuth: ConvexAuth,
) {
  const { convexProjectId, userId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "database-editor-installation",
      githubOwnerId: "database-editor-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
      convexTeam: { teamId: "1000", teamSlug: "ada-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: { connectedByUserId: userId, auth: convexAuth, updatedAt: 2 },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "1000",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "1000",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "demo",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 20,
    });
    const convexProjectId = await ctx.db.insert("repositoryConvexProjects", {
      repositoryId,
      organizationId,
      teamId: "1000",
      projectId: "1001",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });

    return { convexProjectId, userId };
  });

  return { convexProjectId, user: asUser(t, userId) };
}

function databaseRouteArgs(convexProjectId: Id<"repositoryConvexProjects">) {
  return {
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
    const { convexProjectId, user } = await seedDatabaseEditorRepository(t, {
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
      api.repository.database.createEmbeddedDashboardCredentials,
      databaseRouteArgs(convexProjectId),
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

    await user.action(api.repository.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(convexProjectId),
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
    const { convexProjectId, user } = await seedDatabaseEditorRepository(t, {
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
      api.repository.database.createEmbeddedDashboardCredentials,
      databaseRouteArgs(convexProjectId),
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

    await user.action(api.repository.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(convexProjectId),
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
    const { convexProjectId, user } = await seedDatabaseEditorRepository(t, {
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

    await user.action(api.repository.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(convexProjectId),
      deployKeyName: "production-deploy-key",
    });

    expect(fetch).toHaveBeenCalledOnce();
  });
});
