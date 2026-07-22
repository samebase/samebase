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

async function createManagedWorkerCreatingFixture() {
  const fixture = await createCloudflareConnectedVault();
  const runId = await fixture.t.run(async (ctx) => {
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId: fixture.userId,
      vaultId: fixture.vaultId,
      repositoryFullName: "ada/demo",
      trigger: "retry",
      state: "running",
      currentStep: "attach_worker",
      createdAt: 3,
      updatedAt: 3,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId: fixture.vaultId,
      runId,
      state: "active",
      updatedAt: 3,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId: fixture.vaultId,
      userId: fixture.userId,
      convexConfigPath: "convex.json",
      convex: { state: "planned", projectName: "managed-project" },
      cloudflare: {
        state: "planned",
        accountId,
        workerName: "managed-worker",
        build: {
          rootDirectory: "/",
          buildCommand: "pnpm run build",
          deployCommand: "pnpm run deploy",
          previewDeployCommand: "pnpm run deploy:preview",
          pathIncludes: ["*"],
          pathExcludes: [],
        },
      },
      createdAt: 3,
      updatedAt: 3,
    });
    return runId;
  });
  await fixture.t.mutation(internal.vault.cloudflareMutations.beginManagedWorkerCreate, {
    vaultId: fixture.vaultId,
    runId,
    userId: fixture.userId,
    accountId,
    workerName: "managed-worker",
  });
  return { ...fixture, runId };
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

function stubConnectWorkerProvider(
  failure: "initial_build" | "preview_trigger" | "production_trigger",
): ReturnType<typeof vi.fn> {
  let triggers: ReturnType<typeof buildTriggers> = [];
  let triggerCreateCount = 0;
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = input instanceof Request ? input.method : (init?.method ?? "GET");
    if (url.hostname === "api.github.com" && url.pathname === "/repos/ada/demo") {
      return jsonResponse({ id: 123, default_branch: "main", owner: { id: 456 } });
    }
    if (url.pathname === "/client/v4/accounts") {
      return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
    }
    if (url.pathname.endsWith("/workers/workers/portal")) {
      return cloudflareResponse(workerDetails("portal", "portal-tag"));
    }
    if (url.pathname.endsWith("/builds/workers/portal-tag/triggers")) {
      return cloudflareResponse(triggers);
    }
    if (url.pathname.endsWith("/builds/repos/connections")) {
      return cloudflareResponse({ repo_connection_uuid: "repo-connection" });
    }
    if (url.pathname.endsWith("/builds/tokens")) {
      return cloudflareResponse([
        {
          build_token_uuid: "build-token",
          build_token_name: "samebase build token",
          cloudflare_token_id: "opaque-oauth-token-id",
        },
      ]);
    }
    if (method === "POST" && url.pathname.endsWith("/builds/triggers")) {
      triggerCreateCount += 1;
      if (
        (failure === "production_trigger" && triggerCreateCount === 1) ||
        (failure === "preview_trigger" && triggerCreateCount === 2)
      ) {
        return cloudflareResponse(null, 500);
      }
      const trigger = buildTriggers("apps/portal")[triggerCreateCount - 1];
      triggers = [...triggers, trigger];
      return cloudflareResponse({ trigger_uuid: trigger.trigger_uuid });
    }
    if (method === "POST" && url.pathname.endsWith("/builds")) {
      return failure === "initial_build" ? cloudflareResponse(null, 500) : cloudflareResponse({});
    }
    throw new Error(`Unexpected provider request: ${method} ${url}`);
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

  it.each([
    {
      failure: "production_trigger" as const,
      expectedMessage: "Use Configure Workers Builds under Needs attention.",
    },
    {
      failure: "preview_trigger" as const,
      expectedMessage:
        "portal was added at apps/portal, but its Builds setup is incomplete. Use Configure Workers Builds on the Worker.",
    },
    {
      failure: "initial_build" as const,
      expectedMessage:
        "portal was added and GitHub Builds is connected, but Cloudflare reported an error after setup.",
    },
  ])(
    "keeps an existing Worker attached after a $failure failure and reports its observed recovery path",
    async ({ failure, expectedMessage }) => {
      const { asUser, t, userId, vaultId } = await createCloudflareConnectedVault();
      stubConnectWorkerProvider(failure);

      await expect(
        asUser.action(api.vault.cloudflare.connectWorker, {
          vaultId,
          accountId,
          workerName: "portal",
          workerTag: "portal-tag",
          rootDirectory: "apps/portal",
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          state: "added_with_notice",
          message: expect.stringContaining(expectedMessage),
        }),
      );
      await expect(
        t.run(
          async (ctx) =>
            await ctx.db
              .query("vaultCloudflareWorkers")
              .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
              .unique(),
        ),
      ).resolves.toEqual(
        expect.objectContaining({
          userId,
          workerName: "portal",
          workerTag: "portal-tag",
          origin: "selected_existing",
        }),
      );
    },
  );

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

  it("requires dashboard deletion when an interrupted managed create left a Worker", async () => {
    const { runId, t, userId, vaultId } = await createManagedWorkerCreatingFixture();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      if (url.pathname === "/client/v4/accounts") {
        return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
      }
      if (method === "GET" && url.pathname.endsWith("/workers/workers/managed-worker")) {
        return cloudflareResponse(workerDetails("managed-worker", "managed-worker-tag"));
      }
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        vaultId,
        runId,
        userId,
        accountId,
        workerName: "managed-worker",
      }),
    ).rejects.toThrow("Delete it in the Cloudflare dashboard, then retry.");
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => (input instanceof Request ? input.method : init?.method) === "POST",
      ),
    ).toBe(false);
    await expect(
      t.run(async (ctx) => await ctx.db.query("vaultCloudflareWorkers").collect()),
    ).resolves.toEqual([]);
  });

  it("retries an interrupted managed create after the Worker was deleted", async () => {
    const { runId, t, userId, vaultId } = await createManagedWorkerCreatingFixture();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      if (url.pathname === "/client/v4/accounts") {
        return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
      }
      if (method === "GET" && url.pathname.endsWith("/workers/workers/managed-worker")) {
        return jsonResponse(
          {
            success: false,
            errors: [{ code: 10007, message: "Worker not found" }],
            messages: [],
            result: null,
          },
          404,
        );
      }
      if (method === "POST" && url.pathname.endsWith("/workers/workers")) {
        return cloudflareResponse(workerDetails("managed-worker", "managed-worker-tag"));
      }
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const workerId = await t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
      vaultId,
      runId,
      userId,
      accountId,
      workerName: "managed-worker",
    });

    await expect(t.run(async (ctx) => await ctx.db.get(workerId))).resolves.toMatchObject({
      vaultId,
      userId,
      accountId,
      workerName: "managed-worker",
      workerTag: "managed-worker-tag",
      origin: "provisioned",
    });
    expect(
      fetchMock.mock.calls.filter(
        ([input, init]) => (input instanceof Request ? input.method : init?.method) === "POST",
      ),
    ).toHaveLength(1);
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
