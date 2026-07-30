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
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 3,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId: fixture.vaultId,
      userId: fixture.userId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "managed-project",
        teamId: "convex-team",
      },
      cloudflare: {
        state: "planned",
        accountId,
        workerName: "managed-worker",
        rootDirectory: "/",
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
  failure: "initial_build" | "preview_trigger" | "production_trigger" | "verification",
): ReturnType<typeof vi.fn> {
  let triggers: ReturnType<typeof buildTriggers> = [];
  let triggerCreateCount = 0;
  let failNextVerification = false;
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
      if (failNextVerification) {
        failNextVerification = false;
        return cloudflareResponse(null, 500);
      }
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
      if (failure === "initial_build") {
        return cloudflareResponse(null, 500);
      }
      failNextVerification = failure === "verification";
      return cloudflareResponse({});
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
      expectedWriteState: "failed",
    },
    {
      failure: "preview_trigger" as const,
      expectedMessage:
        "portal was added at apps/portal, but its Builds setup is incomplete. Use Configure Workers Builds on the Worker.",
      expectedWriteState: "failed",
    },
    {
      failure: "initial_build" as const,
      expectedMessage:
        "portal was added and GitHub Builds is connected, but Cloudflare reported an error after setup.",
      expectedWriteState: "failed",
    },
  ])(
    "keeps an existing Worker attached after a $failure failure and reports the observed result",
    async ({ failure, expectedMessage, expectedWriteState }) => {
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
        t.run(async (ctx) => {
          const worker = await ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique();
          const write = await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique();
          return { worker, write };
        }),
      ).resolves.toEqual(
        expect.objectContaining({
          worker: expect.objectContaining({
            userId,
            workerName: "portal",
            workerTag: "portal-tag",
            origin: "selected_existing",
          }),
          write: expect.objectContaining({
            state: expectedWriteState,
            lastWriteAt: { cloudflare: expect.any(Number) },
          }),
        }),
      );
    },
  );

  it("records success when a second check confirms the configured Worker", async () => {
    const { asUser, t, vaultId } = await createCloudflareConnectedVault();
    stubConnectWorkerProvider("verification");

    await expect(
      asUser.action(api.vault.cloudflare.connectWorker, {
        vaultId,
        accountId,
        workerName: "portal",
        workerTag: "portal-tag",
        rootDirectory: "apps/portal",
      }),
    ).resolves.toEqual({
      state: "ready",
      workerId: expect.any(String),
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      state: "succeeded",
      lastWriteAt: { cloudflare: expect.any(Number) },
    });
  });

  it("reports that a Worker can exist when its local checkpoint expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = input instanceof Request ? input.method : (init?.method ?? "GET");
      if (url.hostname === "api.github.com" && url.pathname === "/repos/ada/demo") {
        return jsonResponse({ id: 123, default_branch: "main", owner: { id: 456 } });
      }
      if (url.pathname === "/client/v4/accounts") {
        return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
      }
      if (method === "GET" && url.pathname.endsWith("/workers/workers/new-worker")) {
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
        vi.setSystemTime(1_000 + 10 * 60 * 1_000);
        return cloudflareResponse(workerDetails("new-worker", "new-worker-tag"));
      }
      throw new Error(`Unexpected provider request: ${method} ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const failureRecordWarning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { asUser, t, vaultId } = await createCloudflareConnectedVault();
    try {
      await expect(
        asUser.action(api.vault.cloudflare.createWorker, {
          vaultId,
          accountId,
          workerName: "new-worker",
          rootDirectory: "/",
        }),
      ).rejects.toThrow(
        "The Cloudflare Worker new-worker can exist, but Samebase could not record it.",
      );
    } finally {
      vi.useRealTimers();
    }

    expect(
      fetchMock.mock.calls.filter(([input, init]) => {
        const requestMethod = input instanceof Request ? input.method : init?.method;
        return requestMethod === "POST";
      }),
    ).toHaveLength(1);
    expect(failureRecordWarning).toHaveBeenCalledWith(
      "vault:manual_provider_write:failure_record_failed",
      expect.objectContaining({
        actionId: expect.any(String),
        message: "Manual provider action state changed before result was recorded.",
        vaultId,
      }),
    );
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultCloudflareWorkers")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .collect(),
      ),
    ).resolves.toEqual([]);
  });

  it("uses one backend conflict rule for browser and MCP configuration writes", async () => {
    const { asUser, t, userId, vaultId } = await createCloudflareConnectedVault();
    const workerId = await t.run(
      async (ctx) =>
        await ctx.db.insert("vaultCloudflareWorkers", {
          vaultId,
          userId,
          accountId,
          workerName: "portal",
          workerTag: "portal-tag",
          origin: "selected_existing",
        }),
    );
    const fetchMock = stubExistingWorkersProvider({ portal: "/" });
    await t.mutation(internal.vault.infrastructureOperation.claimManualProviderWrite, {
      vaultId,
      userId,
      actionId: "active-configuration",
      action: "configure_workers_builds_for_github",
    });

    await expect(
      asUser.action(api.vault.cloudflare.configureWorkersBuildsForGitHub, {
        vaultId,
        workerId,
        rootDirectory: "/",
      }),
    ).rejects.toThrow("Another vault infrastructure operation is active.");
    await expect(
      t.action(internal.toolRuntime.runtime.cloudflareConfigureWorkersBuildsForGitHubTool, {
        userId,
        grantedScopes: ["access_provider_connections"],
        vaultId,
        workerId,
        rootDirectory: "/",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Another vault infrastructure operation is active.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
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

  it("names the saved account when the current credential cannot access it", async () => {
    const { runId, t, userId, vaultId } = await createManagedWorkerCreatingFixture();
    const expectedMessage = `The current Cloudflare credential cannot access Cloudflare account ${accountId}. Reconnect Cloudflare with access to this account, then retry.`;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.pathname === "/client/v4/accounts") {
        return cloudflareResponse([
          {
            id: "00000000000000000000000000000002",
            name: "Other Cloudflare account",
            type: "standard",
          },
        ]);
      }
      throw new Error(`Unexpected provider request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    let failure: unknown;
    try {
      await t.action(internal.vault.cloudflare.ensureCloudflareWorkerConnection, {
        vaultId,
        runId,
        userId,
        accountId,
        workerName: "managed-worker",
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    if (!(failure instanceof Error)) {
      throw new Error("Expected the managed Cloudflare action to fail.");
    }
    expect(failure.message).toContain(expectedMessage);

    await t.mutation(internal.infraProvisioning.markWorkflowProvisioningFailed, {
      runId,
      workflowId: "workflow-cloudflare-account",
      message: failure.message,
    });

    const result = await t.run(async (ctx) => {
      const run = await ctx.db.get(runId);
      const event = await ctx.db
        .query("workflow_vaultProvisioning_events")
        .withIndex("by_run_and_created_at", (q) => q.eq("runId", runId))
        .first();
      return { event, run };
    });
    expect(result.run).toMatchObject({
      state: "failed",
      lastError: expectedMessage,
    });
    expect(result.event).toMatchObject({
      step: "attach_worker",
      level: "error",
      message: expectedMessage,
    });
  });

  it("retries an interrupted managed create after the Worker was deleted", async () => {
    const { runId, t, userId, vaultId } = await createManagedWorkerCreatingFixture();
    await t.run(async (ctx) => {
      const connection = await ctx.db
        .query("providerConnections")
        .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "cloudflare"))
        .unique();
      if (!connection || connection.kind !== "cloudflare") {
        throw new Error("Expected Cloudflare connection.");
      }
      await ctx.db.patch(connection._id, {
        defaultAccount: {
          state: "selected",
          accountId: "00000000000000000000000000000002",
          accountName: "Other Cloudflare account",
        },
      });
    });
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
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("providerConnections")
            .withIndex("by_user_kind", (q) => q.eq("userId", userId).eq("kind", "cloudflare"))
            .unique(),
      ),
    ).resolves.toMatchObject({
      defaultAccount: {
        state: "selected",
        accountId: "00000000000000000000000000000002",
        accountName: "Other Cloudflare account",
      },
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
        owner: { kind: "managed_run", runId: managedRunId },
        state: "failed",
        lastWriteAt: {},
        updatedAt: 4,
      });
      await ctx.db.insert("workflow_vaultProvisioning_plans", {
        vaultId,
        userId,
        convexConfigPath: "convex.json",
        convex: { state: "planned", projectName: "demo", teamId: "convex-team" },
        cloudflare: {
          state: "created",
          accountId,
          workerName: "managed",
          workerTag: "managed-tag",
          rootDirectory: "/",
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
