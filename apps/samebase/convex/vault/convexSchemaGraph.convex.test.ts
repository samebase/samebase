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

type RecordedRequest = {
  authorization: string | null;
  body?: unknown;
  url: string;
};

function asUser(t: ReturnType<typeof makeConvexTest>, userId: Id<"users">) {
  return t.withIdentity({
    subject: `${userId}|test-session`,
    tokenIdentifier: `test:${userId}`,
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function readRequestBodyPath(body: unknown): string | null {
  if (
    body !== null &&
    typeof body === "object" &&
    "path" in body &&
    typeof body.path === "string"
  ) {
    return body.path;
  }
  return null;
}

function readRequestBodyName(body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    "name" in body &&
    typeof body.name === "string"
  ) {
    return body.name;
  }
  throw new Error("Expected request body name.");
}

function readFetchUrl(input: RequestInfo | URL): string {
  if (input instanceof Request) {
    return input.url;
  }
  return String(input);
}

function readFetchAuthorization(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): string | null {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  return headers.get("Authorization");
}

async function readFetchBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<unknown> {
  if (typeof init?.body === "string") {
    return JSON.parse(init.body);
  }
  if (input instanceof Request && input.method !== "GET") {
    return await input.json();
  }
  return undefined;
}

async function seedSchemaGraphVault(t: ReturnType<typeof makeConvexTest>, convexAuth: ConvexAuth) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "nicu@samebase.com",
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
      userId,
      vaultId,
      rootDirectory: "/",
      createdAt: 25,
    });
    const deploymentId = await ctx.db.insert("vaultConvexDeployments", {
      upstream: { state: "present" },
      vaultId,
      userId,
      appId,
      teamId: "convex-team",
      projectId: "convex-project-id",
      teamSlug: "ada-team",
      projectSlug: "demo",
      deploymentName: "demo-prod",
      deploymentType: "prod",
      cloudUrl: "https://demo.convex.cloud",
      siteUrl: "https://demo.convex.site",
      origin: "selected_existing",
      connectedAt: 25,
      lastObservedAt: 25,
    });

    return { deploymentId, userId, vaultId };
  });

  return { ids, user: asUser(t, ids.userId) };
}

function installSchemaGraphFetchStub(requests: RecordedRequest[]) {
  const declaredSchema = {
    tables: [
      {
        tableName: "documents",
        documentType: {
          type: "object",
          value: {
            owner: {
              type: "union",
              value: [
                { type: "id", tableName: "users" },
                { type: "id", tableName: "orgs" },
                { type: "literal", value: "none" },
              ],
            },
          },
        },
        indexes: [],
      },
      {
        tableName: "orgs",
        documentType: { type: "object", value: {} },
        indexes: [],
      },
      {
        tableName: "users",
        documentType: { type: "object", value: {} },
        indexes: [],
      },
    ],
  };

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = readFetchUrl(input);
      const body = await readFetchBody(input, init);
      requests.push({
        url,
        authorization: readFetchAuthorization(input, init),
        ...(body === undefined ? {} : { body }),
      });

      if (url.endsWith("/create_deploy_key")) {
        return jsonResponse({ deployKey: "prod:demo-prod|schema-secret" });
      }
      if (url.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (url === "https://demo.convex.cloud/api/shapes2") {
        return jsonResponse({});
      }
      if (url === "https://demo.convex.cloud/api/query") {
        const path = readRequestBodyPath(body);
        if (path === "_system/frontend/getSchemas") {
          return jsonResponse({ value: { active: JSON.stringify(declaredSchema) } });
        }
        if (path === "_system/cli/tableSize:default") {
          return jsonResponse({ value: 0 });
        }
      }

      throw new Error(`Unexpected Convex request: ${url}`);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("vault Convex schema graph", () => {
  it("mints OAuth-backed inspection keys without scoped options and revokes by name", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedSchemaGraphVault(t, {
      method: "oauth",
      credential: "convex-oauth-token",
    });
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    installSchemaGraphFetchStub(requests);

    await user.action(api.vault.convexSchemaGraph.refresh, {
      vaultId: ids.vaultId,
      deploymentId: ids.deploymentId,
    });

    const createRequest = requests.find((request) => request.url.endsWith("/create_deploy_key"));
    const deleteRequest = requests.find((request) => request.url.endsWith("/delete_deploy_key"));
    const deployKeyName = readRequestBodyName(createRequest?.body);
    expect(createRequest?.authorization).toBe("Bearer convex-oauth-token");
    expect(createRequest?.body).toEqual({ name: deployKeyName });
    expect(deleteRequest?.authorization).toBe("Bearer convex-oauth-token");
    expect(deleteRequest?.body).toEqual({ id: deployKeyName });

    const state = await user.query(api.vault.convexSchemaGraph.get, {
      vaultId: ids.vaultId,
      deploymentId: ids.deploymentId,
    });
    if (!state?.snapshot) {
      throw new Error("Expected schema graph snapshot.");
    }
    expect(state.snapshot.graph.relationships).toEqual([
      {
        id: "documents:owner:orgs",
        fromTable: "documents",
        fromField: "owner",
        toTable: "orgs",
        source: "declared",
      },
      {
        id: "documents:owner:users",
        fromTable: "documents",
        fromField: "owner",
        toTable: "users",
        source: "declared",
      },
    ]);
    expect(
      state.snapshot.graph.tables.find((table) => table.name === "documents")?.fields,
    ).toContainEqual(
      expect.objectContaining({
        path: "owner",
        targetTables: ["orgs", "users"],
      }),
    );
  });

  it("scopes API-key backed inspection keys and still revokes by name", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedSchemaGraphVault(t, {
      method: "api_key",
      credential: "convex-api-key",
    });
    vi.spyOn(Date, "now").mockReturnValue(1_710_000_000_000);
    const requests: RecordedRequest[] = [];
    installSchemaGraphFetchStub(requests);

    await user.action(api.vault.convexSchemaGraph.refresh, {
      vaultId: ids.vaultId,
      deploymentId: ids.deploymentId,
    });

    const createRequest = requests.find((request) => request.url.endsWith("/create_deploy_key"));
    const deleteRequest = requests.find((request) => request.url.endsWith("/delete_deploy_key"));
    const deployKeyName = readRequestBodyName(createRequest?.body);
    expect(createRequest?.authorization).toBe("Bearer convex-api-key");
    expect(createRequest?.body).toEqual({
      allowedActions: ["deployment:data:view"],
      expiresAt: 1_710_001_860_000,
      name: deployKeyName,
    });
    expect(deleteRequest?.body).toEqual({ id: deployKeyName });
  });

  it("returns deployment options when the route deployment no longer exists", async () => {
    const t = makeConvexTest();
    const { ids, user } = await seedSchemaGraphVault(t, {
      method: "oauth",
      credential: "convex-oauth-token",
    });

    const state = await user.query(api.vault.convexSchemaGraph.get, {
      vaultId: ids.vaultId,
      deploymentId: "missing-deployment",
    });

    expect(state).toMatchObject({
      selectedDeploymentId: null,
      snapshot: null,
      layout: [],
      deployments: [
        {
          _id: ids.deploymentId,
          rootDirectory: "/",
          deploymentName: "demo-prod",
        },
      ],
    });
  });

  it("deduplicates unchanged snapshots and keeps recent changed snapshots bounded", async () => {
    const t = makeConvexTest();
    const { ids } = await seedSchemaGraphVault(t, {
      method: "oauth",
      credential: "convex-oauth-token",
    });
    const graph = {
      tables: [],
      relationships: [],
      warnings: [],
    };
    const firstSnapshotId = await t.mutation(internal.vault.convexSchemaGraph.recordSnapshot, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      deploymentId: ids.deploymentId,
      deploymentName: "demo-prod",
      schemaHash: "same",
      graph,
      fetchedAt: 1,
    });
    const secondSnapshotId = await t.mutation(internal.vault.convexSchemaGraph.recordSnapshot, {
      userId: ids.userId,
      vaultId: ids.vaultId,
      deploymentId: ids.deploymentId,
      deploymentName: "demo-prod",
      schemaHash: "same",
      graph,
      fetchedAt: 2,
    });

    expect(secondSnapshotId).toBe(firstSnapshotId);

    for (let index = 0; index < 7; index += 1) {
      await t.mutation(internal.vault.convexSchemaGraph.recordSnapshot, {
        userId: ids.userId,
        vaultId: ids.vaultId,
        deploymentId: ids.deploymentId,
        deploymentName: "demo-prod",
        schemaHash: `changed-${index}`,
        graph,
        fetchedAt: 10 + index,
      });
    }

    const snapshots = await t.run(async (ctx) =>
      ctx.db
        .query("vaultConvexSchemaSnapshots")
        .withIndex("by_deployment_and_fetched_at", (q) => q.eq("deploymentId", ids.deploymentId))
        .order("desc")
        .take(10),
    );
    expect(snapshots).toHaveLength(5);
    expect(snapshots.map((snapshot) => snapshot.schemaHash)).toEqual([
      "changed-6",
      "changed-5",
      "changed-4",
      "changed-3",
      "changed-2",
    ]);
  });
});
