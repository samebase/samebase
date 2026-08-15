import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  getRepository: vi.fn(),
  requestCloudflareApiOrThrow: vi.fn(),
}));

vi.mock("../cloudflareApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareApi/client")>();
  return {
    ...actual,
    requestCloudflareApiOrThrow: providerMocks.requestCloudflareApiOrThrow,
  };
});

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: providerMocks.createRepositoryOctokit,
  };
});

import { api, internal } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

function workerResponse(args: { workerName: string; workerTag?: string }) {
  return {
    id: args.workerTag ?? "worker-tag",
    name: args.workerName,
    references: { domains: [] },
    subdomain: { enabled: false, previews_enabled: false },
  };
}

function buildTrigger(args: { repoId?: string; rootDirectory?: string; workerTag?: string }) {
  return {
    trigger_uuid: "production-trigger",
    external_script_id: args.workerTag ?? "worker-tag",
    branch_includes: ["main"],
    branch_excludes: [],
    repo_connection: {
      repo_id: args.repoId ?? "github-repository",
      provider_type: "github",
    },
    root_directory: args.rootDirectory,
  };
}

type CloudflareTestRequest = {
  method: string;
  path: string;
  token: string;
  params?: { path?: Record<string, string> };
};

const expiredTokenBackfillCases = [
  {
    authMethod: "oauth",
    tokenEndpoint: "https://dash.cloudflare.com/oauth2/token",
  },
  {
    authMethod: "mcp_oauth",
    tokenEndpoint: "https://mcp.cloudflare.com/token",
  },
] as const;
const mcpClientId = "cloudflare-mcp-client";

function useCloudflareReadFixture(args: {
  workerName: string;
  workerTag?: string;
  triggers?: ReturnType<typeof buildTrigger>[];
  expectedToken?: string;
}) {
  const workerTag = args.workerTag ?? "worker-tag";
  providerMocks.requestCloudflareApiOrThrow.mockImplementation(
    async (request: CloudflareTestRequest) => {
      if (args.expectedToken && request.token !== args.expectedToken) {
        throw new Error("Cloudflare request did not use the expected refreshed token.");
      }
      if (request.path === "/accounts") {
        return [{ id: "cloudflare-account", name: "Cloudflare account" }];
      }
      if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
        return workerResponse({ workerName: args.workerName, workerTag });
      }
      if (request.path === "/accounts/{account_id}/builds/workers/{external_script_id}/triggers") {
        return args.triggers ?? [];
      }
      throw new Error(`Unexpected Cloudflare request: ${request.method} ${request.path}`);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  providerMocks.getRepository.mockResolvedValue({
    data: {
      id: "github-repository",
      default_branch: "main",
      owner: { id: "github-owner" },
    },
  });
  providerMocks.createRepositoryOctokit.mockResolvedValue({
    rest: { repos: { get: providerMocks.getRepository } },
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function createFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: "worker-owner@example.invalid",
      isApproved: true,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "worker-member@example.invalid",
      isApproved: true,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "github-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "samebase",
      githubOwnerLoginNormalized: "samebase",
      githubInstallationId: "github-installation",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "member",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    const now = Date.now();
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      cloudflare: {
        auth: { method: "api_key", credential: "cloudflare-token" },
        connectedByUserId: ownerId,
        updatedAt: now,
      },
    });
    const vaultId = await ctx.db.insert("vaults", {
      state: "not_connected",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId: ownerId,
      vaultId,
      repositoryFullName: "samebase/app",
      trigger: "create",
      state: "succeeded",
      currentStep: "finish",
      createdAt: now,
      updatedAt: now,
      completedAt: now,
    });
    await ctx.db.replace(vaultId, {
      state: "connected",
      githubMode: "create_repository",
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      runId,
      ghRepoId: "github-repository",
      defaultBranch: "main",
      connectedAt: now,
      name: "app",
      visibility: "private",
    });
    const planId = await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
      convexConfigPath: "apps/app/convex.json",
      convex: {
        state: "created",
        projectName: "app",
        projectId: "convex-project",
      },
      cloudflare: {
        state: "created",
        workerName: "old-worker",
        workerTag: "worker-tag",
        rootDirectory: "apps/old",
        buildTokenUuid: "build-token",
      },
      createdAt: now,
      updatedAt: now,
    });
    const workerId = await ctx.db.insert("vaultCloudflareWorkers", {
      vaultId,
      organizationId,
      accountId: "cloudflare-account",
      workerName: "old-worker",
      workerTag: "worker-tag",
      rootDirectory: "apps/old",
      origin: "provisioned",
    });
    return { memberId, organizationId, ownerId, planId, vaultId, workerId };
  });
  return {
    ids,
    member: t.withIdentity({
      subject: `${ids.memberId}|test-session`,
      tokenIdentifier: `test:${ids.memberId}`,
    }),
    owner: t.withIdentity({
      subject: `${ids.ownerId}|test-session`,
      tokenIdentifier: `test:${ids.ownerId}`,
    }),
    t,
  };
}

async function readStoredCoordinates(fixture: Awaited<ReturnType<typeof createFixture>>) {
  return await fixture.t.run(async (ctx) => ({
    worker: await ctx.db.get(fixture.ids.workerId),
    plan: await ctx.db.get(fixture.ids.planId),
  }));
}

async function prepareBillingLimitedExpiredTokenBackfill(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  authMethod: "oauth" | "mcp_oauth",
) {
  await fixture.t.run(async (ctx) => {
    const extraMemberId = await ctx.db.insert("users", {
      state: "active",
      email: "billing-limited-oauth-member@example.invalid",
      isApproved: true,
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId: fixture.ids.organizationId,
      userId: extraMemberId,
      role: "member",
    });
    await ctx.db.patch(fixture.ids.workerId, {
      rootDirectory: undefined,
      origin: "selected_existing",
    });
    const credentials = await ctx.db
      .query("organizationProviderCredentials")
      .withIndex("by_organization", (query) =>
        query.eq("organizationId", fixture.ids.organizationId),
      )
      .unique();
    if (!credentials) {
      throw new Error("Test Cloudflare credential is required.");
    }
    await ctx.db.patch(credentials._id, {
      cloudflare: {
        auth:
          authMethod === "oauth"
            ? {
                method: "oauth",
                credential: "expired-access-token",
                refreshCredential: "refresh-token",
                credentialExpiresAt: 0,
              }
            : {
                method: "mcp_oauth",
                credential: "expired-access-token",
                refreshCredential: "refresh-token",
                credentialExpiresAt: 0,
                clientId: mcpClientId,
              },
        connectedByUserId: fixture.ids.ownerId,
        updatedAt: 1,
      },
    });
  });
}

describe("Cloudflare Worker stored coordinates", () => {
  it("lets a member update only the name and keeps the managed checkpoint aligned", async () => {
    const { ids, t } = await createFixture();

    await expect(
      t.mutation(internal.vault.cloudflareMutations.updateWorkerName, {
        vaultId: ids.vaultId,
        userId: ids.memberId,
        workerId: ids.workerId,
        accountId: "cloudflare-account",
        workerTag: "worker-tag",
        expectedStoredWorkerName: "old-worker",
        workerName: "new-worker",
      }),
    ).resolves.toBeNull();
    const rows = await t.run(async (ctx) => ({
      worker: await ctx.db.get(ids.workerId),
      plan: await ctx.db.get(ids.planId),
    }));
    expect(rows.worker).toMatchObject({
      workerName: "new-worker",
      rootDirectory: "apps/old",
    });
    expect(rows.plan?.cloudflare).toMatchObject({
      workerName: "new-worker",
      rootDirectory: "apps/old",
    });

    await expect(
      t.mutation(internal.vault.cloudflareMutations.updateWorkerName, {
        vaultId: ids.vaultId,
        userId: ids.memberId,
        workerId: ids.workerId,
        accountId: "cloudflare-account",
        workerTag: "worker-tag",
        expectedStoredWorkerName: "old-worker",
        workerName: "another-worker",
      }),
    ).rejects.toThrow("attachment changed before the name update");
  });

  it("normalizes an approved root and blocks the update while infrastructure is active", async () => {
    const { ids, t } = await createFixture();

    await expect(
      t.mutation(internal.vault.cloudflareMutations.updateWorkerRootDirectory, {
        vaultId: ids.vaultId,
        userId: ids.memberId,
        workerId: ids.workerId,
        accountId: "cloudflare-account",
        workerTag: "worker-tag",
        expectedStoredRootDirectory: "apps/old",
        rootDirectory: " apps/new ",
      }),
    ).resolves.toBeNull();
    const updated = await t.run(async (ctx) => ({
      worker: await ctx.db.get(ids.workerId),
      plan: await ctx.db.get(ids.planId),
    }));
    expect(updated.worker).toMatchObject({
      workerName: "old-worker",
      rootDirectory: "apps/new",
    });
    expect(updated.plan?.cloudflare).toMatchObject({
      workerName: "old-worker",
      rootDirectory: "apps/new",
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
        vaultId: ids.vaultId,
        owner: {
          kind: "manual_provider_write",
          userId: ids.memberId,
          actionId: "active-action",
          action: "configure_workers_builds_for_github",
          expiresAt: Date.now() + 60_000,
        },
        state: "active",
        lastWriteAt: {},
        updatedAt: Date.now(),
      });
    });
    await expect(
      t.mutation(internal.vault.cloudflareMutations.updateWorkerRootDirectory, {
        vaultId: ids.vaultId,
        userId: ids.memberId,
        workerId: ids.workerId,
        accountId: "cloudflare-account",
        workerTag: "worker-tag",
        expectedStoredRootDirectory: "apps/new",
        rootDirectory: "apps/blocked",
      }),
    ).rejects.toThrow("Another vault infrastructure operation is active");
  });

  it("updates a Worker name through the public action after a stable-tag reread", async () => {
    const fixture = await createFixture();
    useCloudflareReadFixture({ workerName: "provider-current-worker" });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerName, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "provider-current-worker",
      }),
    ).resolves.toBeNull();

    expect(providerMocks.requestCloudflareApiOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/accounts/{account_id}/workers/workers/{worker_id}",
        params: expect.objectContaining({
          path: expect.objectContaining({ worker_id: "worker-tag" }),
        }),
      }),
    );
    await expect(readStoredCoordinates(fixture)).resolves.toMatchObject({
      worker: { workerName: "provider-current-worker", rootDirectory: "apps/old" },
      plan: {
        cloudflare: { workerName: "provider-current-worker", rootDirectory: "apps/old" },
      },
    });
  });

  it("rejects a stale provider name approval without changing stored coordinates", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({ workerName: "provider-current-worker" });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerName, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "stale-provider-name",
      }),
    ).rejects.toThrow("name changed before the update was approved");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("rejects the wrong saved Cloudflare account before the name provider read", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.organizationId, {
        cloudflareAccount: { accountId: "other-account", accountName: "Other account" },
      });
    });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerName, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "provider-current-worker",
      }),
    ).rejects.toThrow("connection is required for this account");
    expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("keeps stored coordinates unchanged when the provider name read fails", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    providerMocks.requestCloudflareApiOrThrow.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerName, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedWorkerName: "provider-current-worker",
      }),
    ).rejects.toThrow("provider unavailable");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("updates a Worker root through the public action after exact repository verification", async () => {
    const fixture = await createFixture();
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      triggers: [buildTrigger({ rootDirectory: "apps/new" })],
    });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerRootDirectory, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/new",
      }),
    ).resolves.toBeNull();
    await expect(readStoredCoordinates(fixture)).resolves.toMatchObject({
      worker: { workerName: "old-worker", rootDirectory: "apps/new" },
      plan: { cloudflare: { workerName: "old-worker", rootDirectory: "apps/new" } },
    });
  });

  it("rejects a Worker root connected to another repository without changing storage", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      triggers: [buildTrigger({ repoId: "other-repository", rootDirectory: "apps/new" })],
    });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerRootDirectory, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/new",
      }),
    ).rejects.toThrow("does not have one verified root for this repository");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it.each([
    {
      label: "missing",
      triggers: [buildTrigger({ rootDirectory: undefined })],
    },
    {
      label: "ambiguous",
      triggers: [
        buildTrigger({ rootDirectory: "apps/first" }),
        { ...buildTrigger({ rootDirectory: "apps/second" }), trigger_uuid: "second-trigger" },
      ],
    },
  ])("rejects a $label provider root without changing storage", async ({ triggers }) => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({ workerName: "provider-current-worker", triggers });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerRootDirectory, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/new",
      }),
    ).rejects.toThrow("does not have one verified root for this repository");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("rejects a stale provider root approval without changing stored coordinates", async () => {
    const fixture = await createFixture();
    const before = await readStoredCoordinates(fixture);
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      triggers: [buildTrigger({ rootDirectory: "apps/provider-current" })],
    });

    await expect(
      fixture.member.action(api.vault.cloudflare.updateWorkerRootDirectory, {
        vaultId: fixture.ids.vaultId,
        workerId: fixture.ids.workerId,
        expectedRootDirectory: "apps/stale",
      }),
    ).rejects.toThrow("root changed before the update was approved");
    await expect(readStoredCoordinates(fixture)).resolves.toEqual(before);
  });

  it("uses only the stored root for Builds repair and fails closed for a legacy missing root", async () => {
    const storedFixture = await createFixture();
    await expect(
      storedFixture.member.action(api.vault.cloudflare.configureWorkersBuildsForGitHub, {
        vaultId: storedFixture.ids.vaultId,
        workerId: storedFixture.ids.workerId,
        rootDirectory: "apps/different",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toThrow("root changed before Workers Builds configuration");
    expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();
    await expect(readStoredCoordinates(storedFixture)).resolves.toMatchObject({
      worker: { rootDirectory: "apps/old" },
      plan: { cloudflare: { rootDirectory: "apps/old" } },
    });

    const legacyFixture = await createFixture();
    await legacyFixture.t.run(async (ctx) => {
      await ctx.db.patch(legacyFixture.ids.workerId, { rootDirectory: undefined });
    });
    await expect(
      legacyFixture.member.action(api.vault.cloudflare.configureWorkersBuildsForGitHub, {
        vaultId: legacyFixture.ids.vaultId,
        workerId: legacyFixture.ids.workerId,
        rootDirectory: "apps/live",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toThrow("Approve this Cloudflare Worker root");
    expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();
    await expect(
      legacyFixture.t.run(
        async (ctx) => (await ctx.db.get(legacyFixture.ids.workerId))?.rootDirectory,
      ),
    ).resolves.toBeNull();
  });

  it("stores the current provider name when it attaches an existing Worker", async () => {
    const fixture = await createFixture();
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      workerTag: "drift-worker-tag",
      triggers: [buildTrigger({ rootDirectory: "apps/drift", workerTag: "drift-worker-tag" })],
    });

    const [attachedWorkerId] = await fixture.owner.action(api.vault.cloudflare.attachWorkers, {
      vaultId: fixture.ids.vaultId,
      accountId: "cloudflare-account",
      workers: [{ workerName: "stale-discovery-name", workerTag: "drift-worker-tag" }],
    });
    await expect(
      fixture.t.run(async (ctx) => (attachedWorkerId ? await ctx.db.get(attachedWorkerId) : null)),
    ).resolves.toMatchObject({
      workerName: "provider-current-worker",
      workerTag: "drift-worker-tag",
      rootDirectory: "apps/drift",
    });
  });

  it("stores the current provider name when it connects an existing Worker", async () => {
    const fixture = await createFixture();
    providerMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: CloudflareTestRequest) => {
        if (request.path === "/accounts") {
          return [{ id: "cloudflare-account", name: "Cloudflare account" }];
        }
        if (request.path === "/accounts/{account_id}/builds/tokens") {
          return [{ build_token_uuid: "build-token", build_token_name: "Build token" }];
        }
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          return workerResponse({
            workerName: "provider-current-worker",
            workerTag: "connect-worker-tag",
          });
        }
        if (
          request.path === "/accounts/{account_id}/builds/workers/{external_script_id}/triggers"
        ) {
          return [];
        }
        if (request.path === "/accounts/{account_id}/builds/repos/connections") {
          throw new Error("stop after attachment");
        }
        throw new Error(`Unexpected Cloudflare request: ${request.method} ${request.path}`);
      },
    );

    const result = await fixture.owner.action(api.vault.cloudflare.connectWorker, {
      vaultId: fixture.ids.vaultId,
      accountId: "cloudflare-account",
      workerName: "stale-discovery-name",
      workerTag: "connect-worker-tag",
      rootDirectory: "apps/connect",
      buildTokenUuid: "build-token",
    });
    expect(result.state).toBe("added_with_notice");
    await expect(
      fixture.t.run(async (ctx) => await ctx.db.get(result.workerId)),
    ).resolves.toMatchObject({
      workerName: "provider-current-worker",
      workerTag: "connect-worker-tag",
      rootDirectory: "apps/connect",
    });
  });

  it("verifies and backfills a legacy managed row from its matching checkpoint", async () => {
    const { ids, t } = await createFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.workerId, { rootDirectory: undefined });
    });

    await expect(
      t.action(internal.vault.cloudflareWorkerRootDirectoryBackfill.verifyBatch, {
        organizationId: ids.organizationId,
        userId: ids.memberId,
        cursor: null,
      }),
    ).resolves.toMatchObject({
      isDone: true,
      results: [
        {
          state: "ready",
          workerId: ids.workerId,
          rootDirectory: "apps/old",
          source: "managed_plan",
        },
      ],
    });
    const legacyWorker = await t.run(async (ctx) => await ctx.db.get(ids.workerId));
    expect(legacyWorker?.rootDirectory).toBeUndefined();

    await expect(
      t.action(internal.vault.cloudflareWorkerRootDirectoryBackfill.backfillBatch, {
        organizationId: ids.organizationId,
        userId: ids.memberId,
        cursor: null,
      }),
    ).resolves.toMatchObject({
      isDone: true,
      results: [
        {
          state: "updated",
          workerId: ids.workerId,
          rootDirectory: "apps/old",
          source: "managed_plan",
        },
      ],
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.get(ids.workerId))?.rootDirectory),
    ).resolves.toBe("apps/old");
  });

  it("backfills a provider-verified root while normal work is billing limited", async () => {
    const fixture = await createFixture();
    await fixture.t.run(async (ctx) => {
      const extraMemberId = await ctx.db.insert("users", {
        state: "active",
        email: "billing-limited-member@example.invalid",
        isApproved: true,
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: fixture.ids.organizationId,
        userId: extraMemberId,
        role: "member",
      });
      await ctx.db.patch(fixture.ids.workerId, {
        rootDirectory: undefined,
        origin: "selected_existing",
      });
    });
    useCloudflareReadFixture({
      workerName: "provider-current-worker",
      triggers: [buildTrigger({ rootDirectory: "apps/live" })],
    });

    await expect(
      fixture.t.action(internal.vault.cloudflareWorkerRootDirectoryBackfill.verifyBatch, {
        organizationId: fixture.ids.organizationId,
        userId: fixture.ids.memberId,
        cursor: null,
      }),
    ).resolves.toMatchObject({
      isDone: true,
      results: [
        {
          state: "ready",
          workerId: fixture.ids.workerId,
          rootDirectory: "apps/live",
          source: "cloudflare",
        },
      ],
    });
    await expect(
      fixture.t.action(internal.vault.cloudflareWorkerRootDirectoryBackfill.backfillBatch, {
        organizationId: fixture.ids.organizationId,
        userId: fixture.ids.memberId,
        cursor: null,
      }),
    ).resolves.toMatchObject({
      isDone: true,
      results: [
        {
          state: "updated",
          workerId: fixture.ids.workerId,
          rootDirectory: "apps/live",
          source: "cloudflare",
        },
      ],
    });
  });

  it.each(expiredTokenBackfillCases)(
    "refreshes expired $authMethod through the billing-limited backfill authority",
    async ({ authMethod, tokenEndpoint }) => {
      if (authMethod === "oauth") {
        vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
        vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
      }
      const fixture = await createFixture();
      await prepareBillingLimitedExpiredTokenBackfill(fixture, authMethod);
      const refresh = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof Request ? input.url : input.toString();
        expect(requestUrl).toBe(tokenEndpoint);
        if (authMethod === "mcp_oauth") {
          expect(init?.body).toBe(
            `grant_type=refresh_token&client_id=${mcpClientId}&refresh_token=refresh-token`,
          );
        }
        return Response.json({
          access_token: "refreshed-access-token",
          refresh_token: "refreshed-refresh-token",
          expires_in: 3_600,
        });
      });
      vi.stubGlobal("fetch", refresh);
      useCloudflareReadFixture({
        workerName: "provider-current-worker",
        triggers: [buildTrigger({ rootDirectory: "apps/refreshed" })],
        expectedToken: "refreshed-access-token",
      });

      await expect(
        fixture.t.action(internal.vault.cloudflareWorkerRootDirectoryBackfill.backfillBatch, {
          organizationId: fixture.ids.organizationId,
          userId: fixture.ids.memberId,
          cursor: null,
        }),
      ).resolves.toMatchObject({
        isDone: true,
        results: [
          {
            state: "updated",
            workerId: fixture.ids.workerId,
            rootDirectory: "apps/refreshed",
            source: "cloudflare",
          },
        ],
      });
      expect(refresh).toHaveBeenCalledOnce();
      expect(providerMocks.requestCloudflareApiOrThrow).toHaveBeenCalledWith(
        expect.objectContaining({ token: "refreshed-access-token" }),
      );
      const stored = await fixture.t.run(async (ctx) => {
        const credentials = await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", fixture.ids.organizationId),
          )
          .unique();
        return {
          rootDirectory: (await ctx.db.get(fixture.ids.workerId))?.rootDirectory,
          credential: credentials?.cloudflare,
        };
      });
      expect(stored.rootDirectory).toBe("apps/refreshed");
      expect(stored.credential?.auth).toEqual({
        method: authMethod,
        credential: "refreshed-access-token",
        refreshCredential: "refreshed-refresh-token",
        credentialExpiresAt: expect.any(Number),
        ...(authMethod === "mcp_oauth" ? { clientId: mcpClientId } : {}),
      });
      expect(stored.credential?.tokenHealth).toMatchObject({
        status: "valid",
        source: "refresh_attempt",
      });
      expect(stored.credential?.tokenRefreshLease).toBeUndefined();
      expect(stored.credential?.lastTokenRefreshAt).toEqual(expect.any(Number));
    },
  );

  it.each(expiredTokenBackfillCases)(
    "does not write a root when the billing-limited $authMethod refresh fails",
    async ({ authMethod, tokenEndpoint }) => {
      if (authMethod === "oauth") {
        vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
        vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");
      }
      const fixture = await createFixture();
      await prepareBillingLimitedExpiredTokenBackfill(fixture, authMethod);
      const refresh = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = input instanceof Request ? input.url : input.toString();
        expect(requestUrl).toBe(tokenEndpoint);
        if (authMethod === "mcp_oauth") {
          expect(init?.body).toBe(
            `grant_type=refresh_token&client_id=${mcpClientId}&refresh_token=refresh-token`,
          );
        }
        return Response.json({ error: "invalid_grant" }, { status: 400 });
      });
      vi.stubGlobal("fetch", refresh);

      await expect(
        fixture.t.action(internal.vault.cloudflareWorkerRootDirectoryBackfill.backfillBatch, {
          organizationId: fixture.ids.organizationId,
          userId: fixture.ids.memberId,
          cursor: null,
        }),
      ).resolves.toMatchObject({
        isDone: true,
        results: [
          {
            state: "unresolved",
            workerId: fixture.ids.workerId,
            reason: "provider_request_failed",
          },
        ],
      });
      expect(refresh).toHaveBeenCalledOnce();
      expect(providerMocks.requestCloudflareApiOrThrow).not.toHaveBeenCalled();
      const stored = await fixture.t.run(async (ctx) => {
        const credentials = await ctx.db
          .query("organizationProviderCredentials")
          .withIndex("by_organization", (query) =>
            query.eq("organizationId", fixture.ids.organizationId),
          )
          .unique();
        return {
          rootDirectory: (await ctx.db.get(fixture.ids.workerId))?.rootDirectory,
          credential: credentials?.cloudflare,
        };
      });
      expect(stored.rootDirectory).toBeUndefined();
      expect(stored.credential?.auth).toEqual({
        method: authMethod,
        credential: "expired-access-token",
        refreshCredential: "refresh-token",
        credentialExpiresAt: 0,
        ...(authMethod === "mcp_oauth" ? { clientId: mcpClientId } : {}),
      });
      expect(stored.credential?.tokenHealth).toMatchObject({
        status: "invalid",
        source: "refresh_attempt",
      });
      expect(stored.credential?.tokenRefreshLease).toBeUndefined();
      expect(stored.credential?.lastTokenRefreshAt).toBeUndefined();
    },
  );

  it("audits all Worker attachments in bounded global pages", async () => {
    const fixture = await createFixture();
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.workerId, { rootDirectory: undefined });
    });

    await expect(
      fixture.t.query(internal.vault.cloudflareWorkerRootDirectoryBackfill.auditBatch, {
        cursor: null,
      }),
    ).resolves.toMatchObject({
      isDone: true,
      scannedCount: 1,
      missingWorkerIds: [fixture.ids.workerId],
    });
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.ids.workerId, { rootDirectory: "apps/old" });
    });
    await expect(
      fixture.t.query(internal.vault.cloudflareWorkerRootDirectoryBackfill.auditBatch, {
        cursor: null,
      }),
    ).resolves.toMatchObject({
      isDone: true,
      scannedCount: 1,
      missingWorkerIds: [],
    });
  });
});
