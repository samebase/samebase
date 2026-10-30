import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { isRecord } from "../jsonUtils";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../test.setup";
import {
  observedAlchemyStackReply,
  observedBaseAlchemyProductionDeployment,
} from "./fixtures/observedAlchemyState";
import { observedSamebaseStacksReply } from "./fixtures/observedSamebaseAlchemyState";
import { type ConvexProviderCredential } from "../organization/providerCredentialModel";

type ConvexAuth = ConvexProviderCredential["auth"];

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: userId,
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
  await sealTestCredentials(t);

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
  it("refuses OAuth-backed Convex connections without minting a browser key", async () => {
    const t = makeConvexTest();
    const { convexProjectId, user } = await seedDatabaseEditorRepository(t, {
      method: "oauth",
      credential: testCredential("convex-oauth-token"),
    });
    const requests: Request[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        requests.push(input);

        if (input.url.endsWith("/projects/1001/deployment?defaultProd=true")) {
          return productionDeploymentResponse();
        }

        throw new Error(`Unexpected Convex request: ${input.url}`);
      }),
    );

    const result = await user.action(
      api.repository.database.createEmbeddedDashboardCredentials,
      databaseRouteArgs(convexProjectId),
    );

    expect(result).toEqual({ kind: "oauth_connection" });
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.convex.dev/v1/projects/1001/deployment?defaultProd=true",
    ]);

    await user.action(api.repository.database.revokeEmbeddedDashboardCredentials, {
      ...databaseRouteArgs(convexProjectId),
      deployKeyName: "samebase-embedded-data-demo-prod-1710003600000",
    });

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.convex.dev/v1/projects/1001/deployment?defaultProd=true",
      "https://api.convex.dev/v1/projects/1001/deployment?defaultProd=true",
    ]);
  });

  it("mints and revokes data editor deploy keys from API-key Convex connections", async () => {
    const t = makeConvexTest();
    const { convexProjectId, user } = await seedDatabaseEditorRepository(t, {
      method: "api_key",
      credential: testCredential("convex-api-key"),
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
      credential: testCredential("convex-api-key"),
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

/**
samebase/base-alchemy as the preview deployment of Samebase holds it: a connected repository whose
Convex project has no attachment row, deployed by the stack in the team store.
*/
async function seedStackRepository(t: ReturnType<typeof makeConvexTest>) {
  const userId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "nicu@samebase.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "alchemy-installation",
      githubOwnerId: "alchemy-owner",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubOwnerType: "organization",
      convexTeam: { teamId: "38516", teamSlug: "nicu" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        connectedByUserId: userId,
        auth: { method: "api_key", credential: testCredential("convex-api-key") },
        updatedAt: 2,
      },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "38516",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "samebase/base-alchemy",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 10,
      updatedAt: 20,
      completedAt: 20,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "38516",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "123",
      githubRepositoryName: "base-alchemy",
      visibility: "public",
      defaultBranch: "main",
      connectedAt: 20,
    });
    return userId;
  });
  await sealTestCredentials(t);

  return asUser(t, userId);
}

/**
The captured stack with the `rootDir` "." on the `prod` Deployment row that @samebase/alchemy-convex
0.8.0 writes for a stack file at the repository root.
*/
const storeReply = {
  status: observedAlchemyStackReply.status,
  value: {
    stages: observedAlchemyStackReply.value.stages.map((stage) => ({
      ...stage,
      resources: stage.resources.map((resource) => ({
        fqn: resource.fqn,
        value: resource.value.replace('"type":"prod"', '"type":"prod","rootDir":"."'),
      })),
    })),
  },
};

function installStackFetchStub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const body: unknown =
        typeof init?.body === "string"
          ? JSON.parse(init.body)
          : input instanceof Request && input.method !== "GET"
            ? await input.json()
            : undefined;
      const json = (value: unknown) => jsonResponse(JSON.stringify(value));

      if (url === "https://api.convex.dev/v1/teams/38516/projects?limit=100") {
        return json({
          items: [
            {
              createTime: 1710000000000,
              id: 3259168,
              name: "samebase",
              slug: "samebase",
              teamId: 38516,
              teamSlug: "nicu",
            },
          ],
          pagination: { hasMore: false },
        });
      }
      if (url.endsWith("/projects/3259168/deployment?defaultProd=true")) {
        return json({
          class: "s16",
          createTime: 1710000000000,
          deploymentType: "prod",
          deploymentUrl: "https://artful-alligator-66.convex.cloud",
          id: 2001,
          isDefault: true,
          kind: "cloud",
          name: "artful-alligator-66",
          projectId: "3259168",
          reference: "production",
          region: "aws-us-east-1",
        });
      }
      if (url.endsWith("/projects/3245938/deployment?defaultProd=true")) {
        return json(observedBaseAlchemyProductionDeployment);
      }
      if (url.endsWith("/create_deploy_key")) {
        return json({ deployKey: "prod:test|deploy-key-secret" });
      }
      if (url.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (
        url === "https://artful-alligator-66.convex.cloud/api/function" &&
        isRecord(body) &&
        body["path"] === "state:stacks"
      ) {
        return json(observedSamebaseStacksReply);
      }
      if (
        url === "https://artful-alligator-66.convex.cloud/api/function" &&
        isRecord(body) &&
        body["path"] === "state:readStack"
      ) {
        return json(storeReply);
      }
      throw new Error(`Unexpected request: ${url}`);
    }),
  );
}

describe("embedded dashboard credentials for a deployment of the repository stack", () => {
  it("opens the production deployment that the stack deploys without an attachment row", async () => {
    const t = makeConvexTest();
    const user = await seedStackRepository(t);
    installStackFetchStub();

    const result = await user.action(api.repository.database.createEmbeddedDashboardCredentials, {
      owner: "samebase",
      repoName: "base-alchemy",
      branch: "main",
      convexProjectId: "3245938",
    });

    expect(result).toMatchObject({
      kind: "ready",
      deploymentName: "ideal-dolphin-15",
      deploymentUrl: "https://ideal-dolphin-15.convex.cloud",
    });
  });

  it("refuses a Convex project that the stack does not deploy", async () => {
    const t = makeConvexTest();
    const user = await seedStackRepository(t);
    installStackFetchStub();

    await expect(
      user.action(api.repository.database.createEmbeddedDashboardCredentials, {
        owner: "samebase",
        repoName: "base-alchemy",
        branch: "main",
        convexProjectId: "3300002",
      }),
    ).resolves.toEqual({ kind: "missing_deployment" });
  });
});
