import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "../_generated/api";
import { isRecord } from "../jsonUtils";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../test.setup";
import {
  observedConvexComponentsList,
  observedConvexFileCounts,
  observedConvexModulesForAllComponents,
  observedConvexSchemas,
  observedConvexTableMappings,
  observedConvexTableSizes,
} from "./fixtures/observedConvexComponents";

type RecordedRequest = {
  authorization: string | null;
  body: unknown;
  url: string;
};

function answerSystemQuery(query: unknown): unknown {
  if (!isRecord(query) || !isRecord(query["args"])) {
    throw new Error("Expected a system query.");
  }
  const componentId = String(query["args"]["componentId"]);
  switch (query["path"]) {
    case "_system/frontend/components:list":
      return observedConvexComponentsList;
    case "_system/frontend/modules:listForAllComponents":
      return observedConvexModulesForAllComponents;
    case "_system/frontend/getTableMapping:default":
      return observedConvexTableMappings[componentId];
    case "_system/frontend/fileStorageV2:numFiles":
      return observedConvexFileCounts[componentId];
    case "_system/frontend/getSchemas:default":
      return { active: JSON.stringify(observedConvexSchemas[componentId]) };
    case "_system/frontend/tableSize:default":
      return observedConvexTableSizes[componentId]?.[String(query["args"]["tableName"])];
  }
  throw new Error(`Unexpected system query: ${String(query["path"])}`);
}

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
        auth: { method: "api_key", credential: testCredential("convex-api-key") },
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
    await ctx.db.insert("repositoryConvexProjects", {
      repositoryId,
      organizationId,
      teamId: "1000",
      projectId: "1001",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });

    return { userId, repositoryId };
  });
  await sealTestCredentials(t);

  return {
    ids,
    user: t.withIdentity({
      subject: ids.userId,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

function installComponentsFetchStub(requests: RecordedRequest[]) {
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
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization"), body });

      if (url.endsWith("/projects/1002/deployment?defaultProd=true")) {
        return new Response(JSON.stringify({ code: "Forbidden", message: "Forbidden" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        });
      }
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
      if (
        url === "https://demo.convex.cloud/api/query_batch" &&
        isRecord(body) &&
        Array.isArray(body["queries"])
      ) {
        return jsonResponse({
          results: body["queries"].map((query: unknown) => ({
            status: "success",
            value: answerSystemQuery(query),
          })),
        });
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
  it("reads the production components and their metadata with a revoked inspection key", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedComponentsRepository(t);
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    installComponentsFetchStub(requests);

    const observation = await user.action(api.repository.convexComponents.observe, {
      repositoryId: ids.repositoryId,
      deploymentName: "demo-prod",
    });

    expect(observation.deploymentName).toBe("demo-prod");
    expect(
      observation.components.map((component) => ({
        path: component.path,
        state: component.state,
        httpPrefix: component.httpPrefix,
        fileCount: component.fileCount,
        tables: component.tables,
        functionCount: component.functions.length,
        crons: component.crons,
      })),
    ).toEqual([
      {
        path: "workflow",
        state: "active",
        httpPrefix: null,
        fileCount: 0,
        tables: [
          {
            name: "config",
            documentCount: 1,
            schema: {
              fields: [
                {
                  path: "logLevel",
                  kind: '"DEBUG" | "TRACE" | "INFO" | "REPORT" | "WARN" | "ERROR"',
                  optional: true,
                },
                { path: "maxParallelism", kind: "number", optional: true },
              ],
              indexes: [],
            },
          },
          { name: "events", documentCount: 0, schema: null },
          { name: "onCompleteFailures", documentCount: 0, schema: null },
          { name: "steps", documentCount: 4, schema: null },
          { name: "workflows", documentCount: 1, schema: null },
        ],
        functionCount: 11,
        crons: [],
      },
      {
        path: "workflow/workpool",
        state: "active",
        httpPrefix: null,
        fileCount: 0,
        tables: [
          { name: "globals", documentCount: 1, schema: null },
          { name: "internalState", documentCount: 1, schema: null },
          { name: "payload", documentCount: 0, schema: null },
          { name: "pendingCancelation", documentCount: 0, schema: null },
          { name: "pendingCompletion", documentCount: 0, schema: null },
          {
            name: "pendingStart",
            documentCount: 0,
            schema: {
              fields: [
                { path: "segment", kind: "bigint", optional: false },
                { path: "workId", kind: "Id<work>", optional: false },
              ],
              indexes: [
                { name: "segment", fields: ["segment", "_creationTime"] },
                { name: "workId", fields: ["workId", "_creationTime"] },
              ],
            },
          },
          { name: "runStatus", documentCount: 1, schema: null },
          { name: "work", documentCount: 0, schema: null },
        ],
        functionCount: 2,
        crons: [
          {
            name: "healthcheck",
            functionPath: "crons.js:healthcheck",
            schedule: '{"seconds":"1800","type":"interval"}',
          },
        ],
      },
    ]);
    expect(observation.components[1]?.functions).toEqual([
      { module: "complete.js", name: "complete", type: "Mutation", visibility: "internal" },
      { module: "crons.js", name: "healthcheck", type: "Mutation", visibility: "internal" },
    ]);

    const batchRequests = requests.filter((request) => request.url.endsWith("/api/query_batch"));
    expect(batchRequests).toHaveLength(5);
    expect(new Set(batchRequests.map((request) => request.authorization))).toEqual(
      new Set(["Convex prod:demo-prod|components-secret"]),
    );
    expect(requests.find((request) => request.url.endsWith("/delete_deploy_key"))?.body).toEqual({
      id: "samebase-components-demo-prod-ltk9ukg0",
    });
  });

  it("reads a matched deployment when another attached project fails to load", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedComponentsRepository(t);
    await t.run(async (ctx) => {
      const repository = await ctx.db.get(ids.repositoryId);
      if (!repository) {
        throw new Error("Expected the seeded repository.");
      }
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: ids.repositoryId,
        organizationId: repository.organizationId,
        teamId: "1000",
        projectId: "1002",
        convexConfigPath: "apps/other/convex.json",
        origin: "selected_existing",
      });
    });
    installComponentsFetchStub([]);

    const observation = await user.action(api.repository.convexComponents.observe, {
      repositoryId: ids.repositoryId,
      deploymentName: "demo-prod",
    });
    expect(observation.components.map((component) => component.path)).toEqual([
      "workflow",
      "workflow/workpool",
    ]);
  });

  it("rejects a deployment that is not the production deployment of an attached project", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedComponentsRepository(t);
    const requests: RecordedRequest[] = [];
    installComponentsFetchStub(requests);

    await expect(
      user.action(api.repository.convexComponents.observe, {
        repositoryId: ids.repositoryId,
        deploymentName: "other-team-prod",
      }),
    ).rejects.toThrow("This repository has no Convex production deployment with this name.");
    expect(requests.some((request) => request.url.endsWith("/create_deploy_key"))).toBe(false);
  });
});
