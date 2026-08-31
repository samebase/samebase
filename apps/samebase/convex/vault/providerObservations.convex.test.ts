import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const cloudflareMocks = vi.hoisted(() => ({
  requestCloudflareApi: vi.fn(),
  requestCloudflareApiOrThrow: vi.fn(),
}));

const convexMocks = vi.hoisted(() => ({
  requestConvexManagementApi: vi.fn(),
  requestConvexManagementApiOrThrow: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  getRepository: vi.fn(),
}));

vi.mock("../cloudflareApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareApi/client")>();
  return {
    ...actual,
    requestCloudflareApi: cloudflareMocks.requestCloudflareApi,
    requestCloudflareApiOrThrow: cloudflareMocks.requestCloudflareApiOrThrow,
  };
});

vi.mock("../convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convexManagementApi/client")>();
  return {
    ...actual,
    requestConvexManagementApi: convexMocks.requestConvexManagementApi,
    requestConvexManagementApiOrThrow: convexMocks.requestConvexManagementApiOrThrow,
  };
});

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubRepositoryInstallationOctokit: githubMocks.createRepositoryOctokit,
  };
});

import { api } from "../_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  cloudflareMocks.requestCloudflareApi.mockReset();
  cloudflareMocks.requestCloudflareApiOrThrow.mockReset();
  convexMocks.requestConvexManagementApi.mockReset();
  convexMocks.requestConvexManagementApiOrThrow.mockReset();
  githubMocks.getRepository.mockReset();
  githubMocks.createRepositoryOctokit.mockReset();
  githubMocks.getRepository.mockResolvedValue({
    data: {
      id: "github-repository",
      default_branch: "main",
      owner: { id: "github-owner" },
    },
  });
  githubMocks.createRepositoryOctokit.mockResolvedValue({
    rest: { repos: { get: githubMocks.getRepository } },
  });
});

describe("vault provider observations", () => {
  it("observes current Worker names and the Convex production region", async () => {
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_ID", "cloudflare-client");
    vi.stubEnv("PROVIDER_CLOUDFLARE_OAUTH_CLIENT_SECRET", "cloudflare-secret");

    const t = makeConvexTest();
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "provider-observations@example.test",
        isApproved: true,
        termsVersion: "2026-08-12",
        termsAcceptedAt: 1,
      });
      const organizationId = await ctx.db.insert("organizations", {
        githubOwnerId: "provider-observations-owner",
        githubOwnerType: "organization",
        githubOwnerLogin: "samebase",
        githubOwnerLoginNormalized: "samebase",
        githubInstallationId: "provider-observations-installation",
        convexTeam: { teamId: "convex-team" },
        cloudflareAccount: {
          accountId: "cloudflare-account",
          accountName: "Cloudflare account",
        },
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId,
        userId,
        role: "owner",
      });
      await insertTestOrganizationBillingAccount(ctx.db, organizationId);
      await ctx.db.insert("organizationProviderCredentials", {
        organizationId,
        convex: {
          auth: { method: "api_key", credential: "convex-token" },
          connectedByUserId: userId,
          updatedAt: 1,
        },
        cloudflare: {
          auth: {
            method: "oauth",
            credential: "expired-access-token",
            refreshCredential: "refresh-token",
            credentialExpiresAt: 0,
          },
          connectedByUserId: userId,
          updatedAt: 1,
        },
      });
      const vaultId = await ctx.db.insert("vaults", {
        state: "not_connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const now = Date.now();
      const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId,
        vaultId,
        repositoryFullName: "samebase/samebase",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.db.replace(vaultId, {
        state: "connected",
        githubMode: "connect_existing_repository",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        runId,
        ghRepoId: "github-repository",
        defaultBranch: "main",
        connectedAt: now,
        name: "samebase",
        visibility: "private",
      });
      const firstWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        organizationId,
        accountId: "cloudflare-account",
        workerName: "a-stored-domain-router",
        workerTag: "domain-router-tag",
        rootDirectory: "apps/live",
        origin: "selected_existing",
      });
      const secondWorkerId = await ctx.db.insert("vaultCloudflareWorkers", {
        vaultId,
        organizationId,
        accountId: "cloudflare-account",
        workerName: "samebase-worker",
        workerTag: "samebase-worker-tag",
        rootDirectory: "apps/live",
        origin: "selected_existing",
      });
      const convexProjectId = await ctx.db.insert("vaultConvexProjects", {
        vaultId,
        organizationId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      return { convexProjectId, firstWorkerId, secondWorkerId, userId, vaultId };
    });
    const refresh = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof Request ? input.url : String(input);
      expect(url).toBe("https://dash.cloudflare.com/oauth2/token");
      await new Promise<void>((resolve) => setTimeout(resolve, 20));
      return Response.json({
        access_token: "refreshed-access-token",
        refresh_token: "refreshed-refresh-token",
        expires_in: 3_600,
      });
    });
    vi.stubGlobal("fetch", refresh);
    cloudflareMocks.requestCloudflareApiOrThrow.mockImplementation(
      async (request: { path: string; params?: { path?: Record<string, string> } }) => {
        if (request.path === "/accounts/{account_id}/workers/subdomain") {
          return { subdomain: "samebase" };
        }
        if (request.path === "/accounts/{account_id}/workers/workers/{worker_id}") {
          const workerTag = request.params?.path?.["worker_id"];
          if (!workerTag) {
            throw new Error("Worker request is missing its tag.");
          }
          const workerName = workerTag.replace(/-tag$/, "");
          return {
            id: workerTag,
            name: workerName,
            references: { domains: [] },
            subdomain: {
              enabled: true,
              previews_enabled: true,
              url: `https://${workerName}.samebase.workers.dev`,
            },
          };
        }
        if (
          request.path === "/accounts/{account_id}/builds/workers/{external_script_id}/triggers"
        ) {
          const workerTag = request.params?.path?.["external_script_id"];
          if (!workerTag) {
            throw new Error("Build trigger request is missing its Worker tag.");
          }
          const repository = {
            repo_id: "github-repository",
            provider_type: "github",
          };
          return [
            {
              trigger_uuid: `${workerTag}-production`,
              external_script_id: workerTag,
              build_token_uuid: "build-token",
              branch_includes: ["main"],
              branch_excludes: [],
              repo_connection: repository,
              root_directory: "apps/live",
            },
            {
              trigger_uuid: `${workerTag}-preview`,
              external_script_id: workerTag,
              build_token_uuid: "build-token",
              branch_includes: ["*"],
              branch_excludes: ["main"],
              repo_connection: repository,
              root_directory: "apps/live",
            },
          ];
        }
        throw new Error(`Unexpected Cloudflare request: ${request.path}`);
      },
    );
    cloudflareMocks.requestCloudflareApi.mockImplementation(
      async (request: { params?: { path?: Record<string, string> } }) => {
        const workerTag = request.params?.path?.["external_script_id"];
        if (!workerTag) {
          throw new Error("Build request is missing its Worker tag.");
        }
        return [
          true,
          [
            {
              build_uuid: `${workerTag}-build`,
              status: "stopped",
              build_outcome: "success",
              created_on: "2026-08-15T08:00:00Z",
              stopped_on: "2026-08-15T08:01:00Z",
              build_trigger_metadata: {
                branch: "main",
                root_directory: "apps/live",
                deploy_command: "pnpm run deploy",
              },
              trigger: {
                trigger_uuid: `${workerTag}-production`,
                external_script_id: workerTag,
                root_directory: "apps/live",
                deploy_command: "pnpm run deploy",
                repo_connection: { repo_id: "github-repository" },
              },
            },
          ],
        ];
      },
    );
    convexMocks.requestConvexManagementApi.mockResolvedValue([
      true,
      {
        createTime: 1,
        id: "convex-project",
        name: "Samebase",
        slug: "samebase",
        teamId: "convex-team",
        teamSlug: "samebase-team",
      },
    ]);
    convexMocks.requestConvexManagementApiOrThrow.mockResolvedValue({
      class: "s16",
      createTime: 1,
      creator: "convex-member",
      deploymentType: "prod",
      deploymentUrl: "https://samebase.convex.cloud",
      id: "convex-deployment",
      isDefault: true,
      kind: "cloud",
      name: "samebase-prod",
      projectId: "convex-project",
      reference: "prod",
      region: "aws-eu-west-1",
    });
    const viewer = t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    });

    await expect(
      viewer.action(api.vault.providerObservations.observeCloudflareWorkers, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toEqual([
      {
        state: "available",
        workerId: ids.firstWorkerId,
        workerName: "domain-router",
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://domain-router.samebase.workers.dev",
        },
      },
      {
        state: "available",
        workerId: ids.secondWorkerId,
        workerName: "samebase-worker",
        customDomains: [],
        workersDev: {
          state: "enabled",
          url: "https://samebase-worker.samebase.workers.dev",
        },
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
    const [observation] = await viewer.action(
      api.vault.providerObservations.observeCloudflareWorkerBuilds,
      { vaultId: ids.vaultId },
    );
    expect(observation).toMatchObject({
      state: "available",
      workerId: ids.firstWorkerId,
      builds: {
        productionBuild: {
          state: "available",
          logsUrl:
            "https://dash.cloudflare.com/cloudflare-account/workers/services/view/domain-router/production/builds/domain-router-tag-build",
        },
      },
    });
    await expect(
      viewer.action(api.vault.providerObservations.observeConvexProjects, {
        vaultId: ids.vaultId,
      }),
    ).resolves.toMatchObject([
      {
        convexProjectId: ids.convexProjectId,
        provider: {
          state: "current",
          productionDeployment: { state: "available", region: "aws-eu-west-1" },
        },
      },
    ]);
  });
});
