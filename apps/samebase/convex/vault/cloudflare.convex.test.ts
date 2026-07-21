import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";

const accountId = "00000000000000000000000000000001";

function jsonResponse(result: unknown, status = 200): Response {
  return new Response(JSON.stringify(result), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function cloudflareResponse(result: unknown, status = 200): Response {
  return jsonResponse(
    {
      success: status >= 200 && status < 300,
      errors: status >= 400 ? [{ code: 1000, message: "Cloudflare test error" }] : [],
      messages: [],
      result,
    },
    status,
  );
}

function workerDetails(workerName: string, workerTag: string) {
  return {
    created_on: "2026-07-20T00:00:00Z",
    id: workerTag,
    logpush: false,
    name: workerName,
    observability: { enabled: false, head_sampling_rate: 1 },
    references: {
      dispatch_namespace_outbounds: [],
      domains: [],
      durable_objects: [],
      queues: [],
      workers: [],
    },
    subdomain: { enabled: false },
    tags: [],
    tail_consumers: [],
    updated_on: "2026-07-20T00:00:00Z",
  };
}

function buildTriggers(rootDirectory: string) {
  const repoConnection = {
    repo_connection_uuid: "repo-connection",
    repo_id: "123",
    repo_name: "ada/demo",
    provider_type: "github",
  };
  return [
    {
      trigger_uuid: "production-trigger",
      branch_includes: ["main"],
      branch_excludes: [],
      root_directory: rootDirectory,
      repo_connection: repoConnection,
    },
    {
      trigger_uuid: "preview-trigger",
      branch_includes: ["*"],
      branch_excludes: ["main"],
      root_directory: rootDirectory,
      repo_connection: repoConnection,
    },
  ];
}

async function createCloudflareConnectedVault() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await Promise.all([
      ctx.db.insert("providerConnections", {
        kind: "cloudflare",
        userId,
        auth: {
          method: "oauth",
          credential: "cloudflare-token",
          refreshCredential: "cloudflare-refresh-token",
          credentialExpiresAt: 4_000_000_000_000,
        },
        defaultAccount: { state: "not_selected" },
        createdAt: 1,
        updatedAt: 1,
      }),
      ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: { method: "api_key", credential: "github-token" },
        username: "ada",
        createdAt: 1,
        updatedAt: 1,
      }),
    ]);
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 2,
      updatedAt: 2,
      completedAt: 2,
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
      defaultBranch: "stale-main",
      connectedAt: 2,
    });
    return { userId, vaultId };
  });
  return {
    ...ids,
    asUser: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
    t,
  };
}

function stubExistingWorkersProvider(
  roots: Record<string, string>,
  ambiguousWorkerName?: string,
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.hostname === "api.github.com" && url.pathname === "/repos/ada/demo") {
      return jsonResponse({ id: 123, default_branch: "main", owner: { id: 456 } });
    }
    if (url.pathname === "/client/v4/accounts") {
      return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
    }
    const workerMatch = url.pathname.match(
      /^\/client\/v4\/accounts\/[^/]+\/workers\/workers\/([^/]+)$/,
    );
    if (workerMatch?.[1]) {
      const workerName = workerMatch[1];
      return cloudflareResponse(workerDetails(workerName, `${workerName}-tag`));
    }
    const triggerMatch = url.pathname.match(
      /^\/client\/v4\/accounts\/[^/]+\/builds\/workers\/([^/]+)-tag\/triggers$/,
    );
    if (triggerMatch?.[1]) {
      const workerName = triggerMatch[1];
      const triggers = buildTriggers(roots[workerName] ?? "/");
      if (workerName === ambiguousWorkerName) {
        const [production, preview] = triggers;
        return cloudflareResponse([production, { ...preview, root_directory: "apps/admin" }]);
      }
      return cloudflareResponse(triggers);
    }
    if (url.pathname.endsWith("/environment_variables")) {
      return cloudflareResponse({});
    }
    throw new Error(`Unexpected provider request: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("vault Cloudflare Worker attachments", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("re-verifies and atomically attaches several existing Workers", async () => {
    const { asUser, t, userId, vaultId } = await createCloudflareConnectedVault();
    stubExistingWorkersProvider({ api: "apps/api", web: "apps/web" });

    const workerIds = await asUser.action(api.vault.cloudflare.attachWorkers, {
      vaultId,
      accountId,
      workers: [
        { workerName: "web", workerTag: "web-tag" },
        { workerName: "api", workerTag: "api-tag" },
      ],
    });

    expect(workerIds).toHaveLength(2);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .collect(),
      ),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId, workerName: "web", workerTag: "web-tag" }),
        expect.objectContaining({ userId, workerName: "api", workerTag: "api-tag" }),
      ]),
    );
  });

  it("rejects the whole selection when one live Worker placement becomes ambiguous", async () => {
    const { asUser, t, vaultId } = await createCloudflareConnectedVault();
    stubExistingWorkersProvider({ api: "apps/api", web: "apps/web" }, "web");

    await expect(
      asUser.action(api.vault.cloudflare.attachWorkers, {
        vaultId,
        accountId,
        workers: [
          { workerName: "api", workerTag: "api-tag" },
          { workerName: "web", workerTag: "web-tag" },
        ],
      }),
    ).rejects.toThrow("no longer has one verified root");
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .collect(),
      ),
    ).resolves.toHaveLength(0);
  });

  it("detaches explicitly without using provider absence as authority", async () => {
    const { asUser, t, userId, vaultId } = await createCloudflareConnectedVault();
    const workerId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          userId,
          accountId,
          workerName: "still-live",
          workerTag: "worker-tag",
          origin: "selected_existing",
          createdAt: 3,
        }),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      asUser.action(api.vault.cloudflare.detachWorker, { vaultId, workerId }),
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toBeNull();
  });

  it("blocks delayed managed configuration after its run loses the write lock", async () => {
    const { t, userId, vaultId } = await createCloudflareConnectedVault();
    const { managedRunId, workerId } = await t.run(async (ctx) => {
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        accountId,
        workerName: "managed",
        workerTag: "managed-tag",
        origin: "provisioned",
        createdAt: 3,
      });
      const managedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        userId,
        vaultId,
        repositoryFullName: "ada/demo",
        trigger: "retry",
        state: "running",
        currentStep: "configure_workers_builds_for_github",
        createdAt: 4,
        updatedAt: 4,
      });
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        runId: managedRunId,
        state: "failed",
        updatedAt: 4,
      });
      await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        convex: { state: "planned", projectName: "demo" },
        cloudflare: {
          state: "created",
          accountId,
          workerName: "managed",
          workerTag: "managed-tag",
          build: {
            rootDirectory: "/",
            buildCommand: "pnpm run build",
            deployCommand: "pnpm run deploy",
            previewDeployCommand: "pnpm run deploy:preview",
            pathIncludes: ["*"],
            pathExcludes: [],
          },
        },
        createdAt: 4,
        updatedAt: 4,
      });
      return { managedRunId, workerId };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.cloudflare.configureWorkersBuildsForGitHubForWorkflow, {
        vaultId,
        runId: managedRunId,
        userId,
        workerId,
      }),
    ).rejects.toThrow("no longer holds the write lock");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
