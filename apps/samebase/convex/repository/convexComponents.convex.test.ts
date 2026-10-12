import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

type RecordedRequest = {
  authorization: string | null;
  body: unknown;
  url: string;
};

/**
Captured on 2026-10-12 from a local Convex backend (precompiled-2026-10-06-a3538c6) running the
Samebase app, which mounts `workflow` (with its nested `workpool`) and `mail`.
*/
const componentsListResponse = {
  status: "success",
  value: [
    {
      args: {},
      httpPrefix: null,
      id: "m0225s8f0jeedvq61vgxp7c6qx8g54zc",
      name: null,
      path: "",
      state: "active",
    },
    {
      args: {},
      httpPrefix: null,
      id: "m02ebtw0m7ky3x0rdj6zeytkds8g5t2b",
      name: "workflow",
      path: "workflow",
      state: "active",
    },
    {
      args: {},
      httpPrefix: null,
      id: "m02f5czs7a0jgvf5jx9thy07gn8g5r6r",
      name: "workpool",
      path: "workflow/workpool",
      state: "active",
    },
    {
      args: {},
      httpPrefix: null,
      id: "m022zrs6f3rfbcxr8fqnkqpswd8g4778",
      name: "mail",
      path: "mail",
      state: "active",
    },
  ],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function seedComponentsRepository(t: ReturnType<typeof makeConvexTest>) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "nicu@samebase.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "components-installation",
      githubOwnerId: "components-owner",
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
      convex: {
        connectedByUserId: userId,
        auth: { method: "api_key", credential: "convex-api-key" },
        updatedAt: 2,
      },
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

    return { convexProjectId, userId, repositoryId };
  });

  return {
    ids,
    user: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

function installComponentsFetchStub(requests: RecordedRequest[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      requests.push({
        url,
        authorization: new Headers(init?.headers).get("Authorization"),
        body:
          typeof init?.body === "string"
            ? JSON.parse(init.body)
            : input instanceof Request && input.method !== "GET"
              ? await input.json()
              : undefined,
      });

      if (url.endsWith("/projects/1001/deployment?defaultProd=true")) {
        return jsonResponse({
          class: "s16",
          createTime: 1710000000000,
          deploymentType: "prod",
          deploymentUrl: "https://demo.convex.cloud",
          id: 2001,
          isDefault: true,
          kind: "cloud",
          name: "demo-prod",
          projectId: "1001",
          reference: "prod",
          region: "aws-us-east-1",
        });
      }
      if (url.endsWith("/create_deploy_key")) {
        return jsonResponse({ deployKey: "prod:demo-prod|components-secret" });
      }
      if (url.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (url === "https://demo.convex.cloud/api/query") {
        return jsonResponse(componentsListResponse);
      }

      throw new Error(`Unexpected Convex request: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("repository Convex components", () => {
  it("reads the production component tree with a revoked inspection key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedComponentsRepository(t);
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    installComponentsFetchStub(requests);

    await expect(
      user.action(api.repository.convexComponents.observe, {
        repositoryId: ids.repositoryId,
        convexProjectId: ids.convexProjectId,
      }),
    ).resolves.toEqual({
      deploymentName: "demo-prod",
      components: [
        { id: "m022zrs6f3rfbcxr8fqnkqpswd8g4778", name: "mail", path: "mail", state: "active" },
        {
          id: "m02ebtw0m7ky3x0rdj6zeytkds8g5t2b",
          name: "workflow",
          path: "workflow",
          state: "active",
        },
        {
          id: "m02f5czs7a0jgvf5jx9thy07gn8g5r6r",
          name: "workpool",
          path: "workflow/workpool",
          state: "active",
        },
      ],
    });

    const queryRequest = requests.find((request) => request.url.endsWith("/api/query"));
    expect(queryRequest).toEqual({
      url: "https://demo.convex.cloud/api/query",
      authorization: "Convex prod:demo-prod|components-secret",
      body: { path: "_system/frontend/components:list", args: {}, format: "json" },
    });
    expect(requests.find((request) => request.url.endsWith("/delete_deploy_key"))?.body).toEqual({
      id: "samebase-components-demo-prod-ltk9ukg0",
    });
  });
});
