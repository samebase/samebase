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

function stubRecoverableConnectWorkerProvider() {
  let triggers: ReturnType<typeof buildTriggers> = [];
  let failedFirstTrigger = false;
  let triggerReadsAfterFailure = 0;
  let successfulTriggerCount = 0;
  let initialBuildCount = 0;
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
      if (failedFirstTrigger) {
        triggerReadsAfterFailure += 1;
        if (triggerReadsAfterFailure === 2) {
          return cloudflareResponse(null, 500);
        }
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
      if (!failedFirstTrigger) {
        failedFirstTrigger = true;
        return cloudflareResponse(null, 500);
      }
      const trigger = buildTriggers("apps/portal").at(successfulTriggerCount);
      if (!trigger) {
        throw new Error("Unexpected extra trigger creation.");
      }
      successfulTriggerCount += 1;
      triggers = [...triggers, trigger];
      return cloudflareResponse({ trigger_uuid: trigger.trigger_uuid });
    }
    if (method === "POST" && url.pathname.endsWith("/builds")) {
      initialBuildCount += 1;
      return cloudflareResponse({});
    }
    throw new Error(`Unexpected provider request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    readInitialBuildCount: () => initialBuildCount,
  };
}

function stubRecoverableDeployKeyRotationProvider() {
  let previewKeyCreateCount = 0;
  let productionKeyCreateCount = 0;
  const environmentVariables = new Map<string, unknown>();
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    const method = request.method;
    if (url.hostname === "api.github.com" && url.pathname === "/repos/ada/demo") {
      return jsonResponse({ id: 123, default_branch: "main", owner: { id: 456 } });
    }
    if (url.hostname === "api.convex.dev") {
      if (
        method === "GET" &&
        url.pathname === "/v1/projects/1001/deployment" &&
        url.searchParams.get("defaultProd") === "true"
      ) {
        return jsonResponse({
          class: "s16",
          createTime: 1,
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
      if (method === "POST" && url.pathname.endsWith("/delete_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (method === "POST" && url.pathname.endsWith("/delete_preview_deploy_key")) {
        return new Response(null, { status: 200 });
      }
      if (method === "POST" && url.pathname.endsWith("/create_deploy_key")) {
        productionKeyCreateCount += 1;
        return jsonResponse({
          deployKey: `prod:demo-prod|production-secret-${productionKeyCreateCount}`,
        });
      }
      if (method === "POST" && url.pathname.endsWith("/create_preview_deploy_key")) {
        previewKeyCreateCount += 1;
        if (previewKeyCreateCount === 1) {
          return jsonResponse({ code: "temporary", message: "Interrupted request." }, 500);
        }
        return jsonResponse({
          previewDeployKey: `preview:demo|preview-secret-${previewKeyCreateCount}`,
        });
      }
    }
    if (url.pathname === "/client/v4/accounts") {
      return cloudflareResponse([{ id: accountId, name: "Ada Cloudflare", type: "standard" }]);
    }
    if (url.pathname.endsWith("/workers/workers/portal")) {
      return cloudflareResponse(workerDetails("portal", "portal-tag"));
    }
    if (url.pathname.endsWith("/builds/workers/portal-tag/triggers")) {
      return cloudflareResponse(buildTriggers("apps/portal"));
    }
    const environmentVariablesMatch = url.pathname.match(
      /^\/client\/v4\/accounts\/[^/]+\/builds\/triggers\/([^/]+)\/environment_variables$/,
    );
    if (environmentVariablesMatch) {
      if (method === "PATCH") {
        const body: unknown = await request.clone().json();
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          throw new Error("Expected Cloudflare environment variables.");
        }
        const stored = Object.fromEntries(
          Object.entries(body).map(([key, value]) => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              throw new Error(`Expected Cloudflare environment variable ${key}.`);
            }
            return [
              key,
              {
                ...value,
                created_on: "2026-07-20T00:00:00Z",
              },
            ];
          }),
        );
        environmentVariables.set(url.pathname, stored);
        return cloudflareResponse(stored);
      }
      if (method === "GET") {
        return cloudflareResponse(environmentVariables.get(url.pathname) ?? {});
      }
    }
    if (method === "POST" && url.pathname.endsWith("/builds/triggers/production-trigger/builds")) {
      return cloudflareResponse({});
    }
    throw new Error(`Unexpected provider request: ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    fetchMock,
    readPreviewKeyCreateCount: () => previewKeyCreateCount,
    readProductionKeyCreateCount: () => productionKeyCreateCount,
  };
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
      expectedWriteState: "succeeded",
    },
  ])(
    "keeps an existing Worker attached after a $failure failure and reports its observed recovery path",
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
      target: {
        action: "configure_workers_builds_for_github",
        workerId,
        rootDirectory: "/",
      },
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

  it("does not adopt a same-name Worker without a creation checkpoint", async () => {
    const { t, vaultId } = await createCloudflareConnectedVault();
    const fetchMock = stubExistingWorkersProvider({ portal: "/" });
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId,
        owner: {
          kind: "manual_provider_write",
          actionId: "worker-collision",
          target: {
            action: "create_cloudflare_worker",
            state: "requested",
            accountId,
            workerName: "portal",
            rootDirectory: "/",
          },
          expiresAt: now,
        },
        state: "recovering",
        recoveryAttemptId: "worker-collision-attempt",
        recoveryDeadlineAt: now + 5 * 60 * 1_000,
        recoveryLeaseExpiresAt: now + 11 * 60 * 1_000,
        lastWriteAt: {},
        updatedAt: now,
      });
    });

    await expect(
      t.action(internal.vault.cloudflare.recoverManualCloudflareProviderWrite, {
        vaultId,
        actionId: "worker-collision",
        recoveryAttemptId: "worker-collision-attempt",
      }),
    ).rejects.toThrow(
      "Cloudflare Worker portal exists, but this provider write did not record its identity. Delete that Worker in Cloudflare, then use Retry.",
    );
    expect(
      fetchMock.mock.calls.some(([input]) => input instanceof Request && input.method === "POST"),
    ).toBe(false);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      state: "recovery_required",
      owner: { kind: "manual_provider_write", actionId: "worker-collision" },
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("vaultCloudflareWorkers").collect()),
    ).resolves.toEqual([]);
  });

  it("recovers an interrupted Worker connection with the same action and no second initial build", async () => {
    const { asUser, t, vaultId } = await createCloudflareConnectedVault();
    const provider = stubRecoverableConnectWorkerProvider();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await expect(
        asUser.action(api.vault.cloudflare.connectWorker, {
          vaultId,
          accountId,
          workerName: "portal",
          workerTag: "portal-tag",
          rootDirectory: "apps/portal",
        }),
      ).resolves.toMatchObject({
        state: "added_with_notice",
      });
      const active = await t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      );
      expect(active).toMatchObject({
        owner: {
          kind: "manual_provider_write",
          target: { action: "connect_cloudflare_worker" },
        },
        state: "active",
      });
      if (!active || active.owner.kind !== "manual_provider_write") {
        throw new Error("Expected an active manual provider write.");
      }
      const actionId = active.owner.actionId;

      vi.setSystemTime(active.owner.expiresAt);
      await t.mutation(internal.vault.infrastructureOperation.enterManualProviderWriteRecovery, {
        vaultId,
        actionId,
      });
      const recovery = await t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      );
      if (!recovery || recovery.state !== "recovering") {
        throw new Error("Expected an active manual provider recovery.");
      }
      vi.clearAllTimers();
      vi.setSystemTime(recovery.recoveryDeadlineAt - 1);
      await t.action(internal.vault.cloudflare.recoverManualCloudflareProviderWrite, {
        vaultId,
        actionId,
        recoveryAttemptId: recovery.recoveryAttemptId,
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
        owner: {
          kind: "manual_provider_write",
          actionId,
        },
        state: "succeeded",
        lastWriteAt: { cloudflare: expect.any(Number) },
      });
      expect(provider.readInitialBuildCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers an interrupted deploy-key rotation with the same action", async () => {
    const { asUser, t, userId, vaultId } = await createCloudflareConnectedVault();
    const { convexProjectId, workerId } = await t.run(async (ctx) => {
      await ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "api_key", credential: "convex-token" },
        teamId: "1000",
        teamSlug: "ada-team",
        createdAt: 1,
        updatedAt: 1,
      });
      const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        userId,
        teamId: "1000",
        projectId: "1001",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        userId,
        accountId,
        workerName: "portal",
        workerTag: "portal-tag",
        origin: "selected_existing",
      });
      return { convexProjectId, workerId };
    });
    const provider = stubRecoverableDeployKeyRotationProvider();
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    try {
      await expect(
        asUser.action(api.vault.cloudflare.rotateConvexDeployKeysForWorkersBuilds, {
          vaultId,
          workerId,
          convexProjectId,
        }),
      ).rejects.toThrow();
      const active = await t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      );
      expect(active).toMatchObject({
        owner: {
          kind: "manual_provider_write",
          target: { action: "rotate_convex_deploy_keys_for_workers_builds" },
        },
        state: "active",
      });
      if (!active || active.owner.kind !== "manual_provider_write") {
        throw new Error("Expected an active manual provider write.");
      }
      const actionId = active.owner.actionId;

      vi.setSystemTime(active.owner.expiresAt);
      await t.mutation(internal.vault.infrastructureOperation.enterManualProviderWriteRecovery, {
        vaultId,
        actionId,
      });
      const recovery = await t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      );
      if (!recovery || recovery.state !== "recovering") {
        throw new Error("Expected an active manual provider recovery.");
      }
      vi.clearAllTimers();
      vi.setSystemTime(recovery.recoveryDeadlineAt - 1);
      await t.action(internal.vault.cloudflare.recoverManualCloudflareProviderWrite, {
        vaultId,
        actionId,
        recoveryAttemptId: recovery.recoveryAttemptId,
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
        owner: {
          kind: "manual_provider_write",
          actionId,
        },
        state: "succeeded",
        lastWriteAt: {
          convex: expect.any(Number),
          cloudflare: expect.any(Number),
        },
      });
      expect(provider.readProductionKeyCreateCount()).toBe(2);
      expect(provider.readPreviewKeyCreateCount()).toBe(2);
    } finally {
      vi.useRealTimers();
    }
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
        owner: { kind: "managed_run", runId: managedRunId },
        state: "failed",
        lastWriteAt: {},
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
