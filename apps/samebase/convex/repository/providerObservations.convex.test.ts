import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const cloudflareMocks = vi.hoisted(() => ({
  getSubdomain: vi.fn(),
  getWorker: vi.fn(),
  getBuildSettings: vi.fn(),
  getBuilds: vi.fn(),
}));

const convexMocks = vi.hoisted(() => ({
  requestConvexManagementApi: vi.fn(),
  requestConvexManagementApiOrThrow: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  createRepositoryOctokit: vi.fn(),
  getRepository: vi.fn(),
}));

vi.mock("../cloudflareApi/generated/sdk.gen", () => ({
  Cloudflare: {
    GET: {
      "/accounts/{account_id}/workers/subdomain": cloudflareMocks.getSubdomain,
      "/accounts/{account_id}/workers/workers/{worker_id}": cloudflareMocks.getWorker,
      "/accounts/{account_id}/builds/workers/{script_tag}": cloudflareMocks.getBuildSettings,
      "/accounts/{account_id}/builds/workers/{external_script_id}/builds":
        cloudflareMocks.getBuilds,
    },
  },
}));

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
import { CloudflareApiResponseError } from "../cloudflareApi/client";
import type { Cloudflare } from "../cloudflareApi/generated/sdk.gen";
import { observedNativeWorkerBuildSettings } from "../cloudflareApi/fixtures/observedWorkerBuildSettings";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  for (const endpoint of Object.values(cloudflareMocks)) endpoint.mockReset();
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

describe("repository provider observations", () => {
  it.each([true, false])("reads Builds with native previews enabled: %s", async (preview) => {
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
      const repositoryId = await ctx.db.insert("repositories", {
        createdAt: 1,
        state: "not_connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      const now = Date.now();
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "samebase/samebase",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      });
      await ctx.db.replace(repositoryId, {
        createdAt: 1,
        state: "connected",
        githubMode: "connect_existing_repository",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
        runId,
        githubRepositoryDatabaseId: "github-repository",
        defaultBranch: "main",
        connectedAt: now,
        githubRepositoryName: "samebase",
        visibility: "private",
      });
      const firstWorkerId = await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId,
        organizationId,
        accountId: "cloudflare-account",
        workerName: "a-stored-domain-router",
        workerTag: "domain-router-tag",
        rootDirectory: "apps/live",
        origin: "selected_existing",
      });
      const secondWorkerId = await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId,
        organizationId,
        accountId: "cloudflare-account",
        workerName: "samebase-worker",
        workerTag: "samebase-worker-tag",
        rootDirectory: "apps/live",
        origin: "selected_existing",
      });
      const convexProjectId = await ctx.db.insert("repositoryConvexProjects", {
        repositoryId,
        organizationId,
        teamId: "convex-team",
        projectId: "convex-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      return { convexProjectId, firstWorkerId, secondWorkerId, userId, repositoryId };
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
    cloudflareMocks.getSubdomain.mockResolvedValue({ result: { subdomain: "samebase" } });
    cloudflareMocks.getWorker.mockImplementation(
      async (
        request: Parameters<
          (typeof Cloudflare.GET)["/accounts/{account_id}/workers/workers/{worker_id}"]
        >[0],
      ) => {
        const workerTag = request.path.worker_id;
        const workerName = workerTag.replace(/-tag$/, "");
        return {
          result: {
            id: workerTag,
            name: workerName,
            references: { domains: [] },
            subdomain: {
              enabled: true,
              previews_enabled: true,
              url: `https://${workerName}.samebase.workers.dev`,
            },
          },
        };
      },
    );
    cloudflareMocks.getBuildSettings.mockImplementation(
      async (
        request: Parameters<
          (typeof Cloudflare.GET)["/accounts/{account_id}/builds/workers/{script_tag}"]
        >[0],
      ) => {
        const workerTag = request.path.script_tag;
        return {
          result: {
            ...observedNativeWorkerBuildSettings,
            script_tag: workerTag,
            git_repository: {
              ...observedNativeWorkerBuildSettings.git_repository,
              repo_id: "github-repository",
            },
            production_settings: {
              ...observedNativeWorkerBuildSettings.production_settings,
              build_token_uuid: "build-token",
              root_directory: "apps/live",
            },
            previews_enabled: preview,
            previews_base_config: {
              ...observedNativeWorkerBuildSettings.previews_base_config,
              build_token_uuid: "build-token",
              root_directory: "apps/live",
            },
          },
        };
      },
    );
    cloudflareMocks.getBuilds.mockImplementation(
      async (
        request: Parameters<
          (typeof Cloudflare.GET)["/accounts/{account_id}/builds/workers/{external_script_id}/builds"]
        >[0],
      ) => {
        const workerTag = request.path.external_script_id;
        return {
          result: [
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
        };
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
      viewer.action(api.repository.providerObservations.observeCloudflareWorkers, {
        repositoryId: ids.repositoryId,
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
      api.repository.providerObservations.observeCloudflareWorkerBuilds,
      { repositoryId: ids.repositoryId },
    );
    expect(observation).toMatchObject({
      state: "available",
      workerId: ids.firstWorkerId,
      builds: { state: preview ? "connected" : "not_connected" },
      productionBuild: {
        state: "available",
        logsUrl:
          "https://dash.cloudflare.com/cloudflare-account/workers/services/view/domain-router/production/builds/domain-router-tag-build",
      },
    });
    cloudflareMocks.getBuilds.mockResolvedValue({ result: [] });
    await expect(
      viewer.action(api.repository.providerObservations.observeCloudflareWorkerBuilds, {
        repositoryId: ids.repositoryId,
      }),
    ).resolves.toMatchObject([
      { productionBuild: { state: "absent" } },
      { productionBuild: { state: "absent" } },
    ]);
    cloudflareMocks.getBuilds.mockRejectedValue(
      new CloudflareApiResponseError(
        "GET",
        "/accounts/{account_id}/builds/workers/{external_script_id}/builds",
        "invalid_json",
      ),
    );
    await expect(
      viewer.action(api.repository.providerObservations.observeCloudflareWorkerBuilds, {
        repositoryId: ids.repositoryId,
      }),
    ).resolves.toMatchObject([
      { productionBuild: { state: "unavailable", reasons: ["response_parse_failed"] } },
      { productionBuild: { state: "unavailable", reasons: ["response_parse_failed"] } },
    ]);
    await expect(
      viewer.action(api.repository.providerObservations.observeConvexProjects, {
        repositoryId: ids.repositoryId,
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
