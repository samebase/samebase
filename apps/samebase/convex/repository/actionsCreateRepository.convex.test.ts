import { RequestError } from "@octokit/request-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  createGitHubInstallationOctokit: vi.fn(),
  createGitHubUserOctokit: vi.fn(),
  discoverPreviewSeedGitHubAppInstallations: vi.fn(),
  getRepository: vi.fn(),
  isCloudflareWorkerNameAvailable: vi.fn(),
  listCloudflareBuildTokens: vi.fn(),
  listConvexManagementProjects: vi.fn(),
  readGitHubAppInstallation: vi.fn(),
  requireCloudflareBuildTokenUuid: vi.fn(),
}));

vi.mock("../githubApp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubApp")>();
  return {
    ...actual,
    createGitHubInstallationOctokit: providerMocks.createGitHubInstallationOctokit,
    createGitHubUserOctokit: providerMocks.createGitHubUserOctokit,
    discoverPreviewSeedGitHubAppInstallations:
      providerMocks.discoverPreviewSeedGitHubAppInstallations,
    readGitHubAppInstallation: providerMocks.readGitHubAppInstallation,
  };
});

vi.mock("../convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementProjects: providerMocks.listConvexManagementProjects,
  };
});

vi.mock("../cloudflareResources", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../cloudflareResources")>();
  return {
    ...actual,
    isCloudflareWorkerNameAvailable: providerMocks.isCloudflareWorkerNameAvailable,
    listCloudflareBuildTokens: providerMocks.listCloudflareBuildTokens,
    requireCloudflareBuildTokenUuid: providerMocks.requireCloudflareBuildTokenUuid,
  };
});

import { api, internal } from "../_generated/api";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../test.setup";

function githubRequestError(status: number): RequestError {
  return new RequestError(`GitHub request failed with status ${status}.`, status, {
    request: {
      method: "GET",
      url: "https://api.github.com/repos/samebase/new-app",
      headers: {},
    },
  });
}

async function createRepositoryFixture(
  args: {
    email?: string;
    githubOwnerId?: string;
    githubOwnerLogin?: string;
    githubOwnerType?: "organization" | "user";
    passwordAccount?: true;
    /** Connect only GitHub and this Convex auth method, with no Cloudflare connection. */
    convexOnly?: "api_key" | "oauth";
  } = {},
) {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const email = args.email ?? "create-without-build-token@example.test";
    const userId = await ctx.db.insert("users", {
      state: "active",
      email,
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    if (args.passwordAccount) {
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "password",
        providerAccountId: email,
      });
    }
    const githubOwnerLogin = args.githubOwnerLogin ?? "samebase";
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "installation-1",
      githubOwnerId: args.githubOwnerId ?? "owner-1",
      githubOwnerLogin,
      githubOwnerLoginNormalized: githubOwnerLogin.toLowerCase(),
      githubOwnerType: args.githubOwnerType ?? "organization",
      convexTeam: { teamId: "convex-team" },
      ...(args.convexOnly
        ? {}
        : {
            cloudflareAccount: {
              accountId: "cloudflare-account",
              accountName: "Cloudflare account",
            },
          }),
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
        auth: { method: args.convexOnly ?? "api_key", credential: testCredential("convex-token") },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      ...(args.convexOnly
        ? {}
        : {
            cloudflare: {
              auth: { method: "api_key" as const, credential: testCredential("cloudflare-token") },
              connectedByUserId: userId,
              updatedAt: 1,
            },
          }),
    });
    return { organizationId, userId };
  });
  await sealTestCredentials(t);

  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: ids.userId,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  // `repository.create` starts the provisioning workflow. These tests check only what it saves, so
  // the workflow stays queued. If it ran, it could log after Vitest closes the worker, and Vitest
  // would then fail the run with an unhandled error.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.clearAllMocks();
  providerMocks.createGitHubInstallationOctokit.mockReturnValue({
    hook: { wrap: vi.fn() },
    rest: { repos: { get: providerMocks.getRepository } },
  });
  providerMocks.getRepository.mockRejectedValue(githubRequestError(404));
  providerMocks.createGitHubUserOctokit.mockReturnValue({ hook: { wrap: vi.fn() } });
  providerMocks.isCloudflareWorkerNameAvailable.mockResolvedValue(true);
  providerMocks.listConvexManagementProjects.mockResolvedValue([]);
  providerMocks.requireCloudflareBuildTokenUuid.mockResolvedValue("selected-token");
  providerMocks.readGitHubAppInstallation.mockResolvedValue({
    permissions: [
      { access: "write", key: "actions_variables" },
      { access: "write", key: "contents" },
      { access: "write", key: "secrets" },
    ],
  });
});

const repositoryActionsCreateArgs = {
  githubRepositoryName: "actions-app",
  convexProjectName: "actions-app",
  cloudflareWorkerName: "actions-app",
  cloudflareBuildTokenUuid: null,
  provisioning: "repository_actions",
} as const;

describe("create repository with provisioning repository_actions", () => {
  it.each(["oauth", "api_key"] as const)(
    "creates with a %s Convex connection, no Cloudflare connection, and no CI credentials",
    async (convexOnly) => {
      const { organizationId, t, viewer } = await createRepositoryFixture({ convexOnly });
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);

      const result = await viewer.action(api.repository.create, {
        organizationId,
        ...repositoryActionsCreateArgs,
      });

      // The name check is the Convex call: it uses the connection that the repository receives.
      expect(providerMocks.listConvexManagementProjects).toHaveBeenCalledWith({
        token: "convex-token",
        teamId: "convex-team",
      });
      // Nothing reads Cloudflare.
      expect(fetch).not.toHaveBeenCalled();
      expect(providerMocks.isCloudflareWorkerNameAvailable).not.toHaveBeenCalled();
      expect(providerMocks.requireCloudflareBuildTokenUuid).not.toHaveBeenCalled();
      const rows = await t.run(async (ctx) => ({
        plan: await ctx.db
          .query("workflow_repositoryProvisioning_plans")
          .withIndex("by_repository", (q) => q.eq("repositoryId", result.repositoryId))
          .unique(),
        repository: await ctx.db.get(result.repositoryId),
      }));
      expect(rows).toMatchObject({
        plan: { provisioning: "repository_actions", ciSecrets: { state: "planned" } },
        repository: {
          convexTeamId: "convex-team",
          githubMode: "create_repository",
          githubRepositoryName: "actions-app",
        },
      });
      expect(rows.repository).not.toHaveProperty("cloudflareAccountId");
    },
  );

  it("refuses a member who is not an owner, because the repository receives the Convex credential", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();
    await t.run(async (ctx) => {
      for (const membership of await ctx.db.query("organizationMemberships").collect()) {
        await ctx.db.patch(membership._id, { role: "member" });
      }
    });

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toThrow("Only an organization owner can create a repository");
  });

  it("records no Cloudflare account when the organization has one", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();

    const result = await viewer.action(api.repository.create, {
      organizationId,
      ...repositoryActionsCreateArgs,
    });

    expect(providerMocks.isCloudflareWorkerNameAvailable).not.toHaveBeenCalled();
    expect(await t.run(async (ctx) => await ctx.db.get(result.repositoryId))).not.toHaveProperty(
      "cloudflareAccountId",
    );
  });

  it("reports no Worker to an MCP caller", async () => {
    const { t, userId } = await createRepositoryFixture({ convexOnly: "oauth" });

    await expect(
      t.action(internal.toolRuntime.runtime.repositoryCreateTool, {
        userId,
        grantedScopes: ["access_app_create"],
        githubOwnerLogin: "samebase",
        name: "actions-app",
        provisioning: "repository_actions",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      structuredContent: {
        githubRepositoryFullName: "samebase/actions-app",
        cloudflare: { state: "none" },
      },
    });
  });

  it("refuses before it creates anything without a Convex connection", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture({ convexOnly: "oauth" });
    await t.run(async (ctx) => {
      const credentials = await ctx.db.query("organizationProviderCredentials").unique();
      if (credentials) {
        await ctx.db.delete(credentials._id);
      }
    });

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toMatchObject({
      data: "Convex connection is required to provision infrastructure. Connect Convex and retry.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });

  it("refuses an installation that has not accepted the Secrets and Variables permissions", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture({ convexOnly: "oauth" });
    providerMocks.readGitHubAppInstallation.mockResolvedValue({
      permissions: [{ access: "write", key: "contents" }],
    });

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toMatchObject({
      data: "The Samebase GitHub App installation for samebase has not granted the Secrets and Variables repository permissions (read and write). Accept the new permissions on the installation (https://github.com/organizations/samebase/settings/installations), then create the repository again.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });

  it("refuses a Convex project that already has the repository's name", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture({ convexOnly: "oauth" });
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      {
        createTime: 1,
        id: "existing-project",
        name: "actions-app",
        slug: "actions-app",
        teamId: "convex-team",
        teamSlug: "convex-team",
      },
    ]);

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toMatchObject({
      data: "A Convex project named actions-app already exists, and the GitHub Actions of the repository would use that name. Choose another repository name.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });

  it("refuses before it creates anything when the organization has no connection left", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture({ convexOnly: "oauth" });
    // All six of the organization's free connections: Workers of another repository.
    const otherRepositoryId = await t.run(async (ctx) => {
      const repositoryId = await ctx.db.insert("repositories", {
        createdAt: 1,
        state: "not_connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      for (const index of [1, 2, 3, 4, 5, 6]) {
        await ctx.db.insert("repositoryCloudflareWorkers", {
          repositoryId,
          organizationId,
          accountId: "cloudflare-account",
          workerName: `other-worker-${index}`,
          workerTag: `other-worker-tag-${index}`,
          rootDirectory: "/",
          origin: "selected_existing",
        });
      }
      return repositoryId;
    });

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toThrow("Organization connection limit reached");
    await expect(
      t.run(async (ctx) => (await ctx.db.query("repositories").collect()).map((row) => row._id)),
    ).resolves.toEqual([otherRepositoryId]);
  });

  it("refuses a custom Convex project name, because the GitHub Actions use the repository name", async () => {
    const { organizationId, viewer } = await createRepositoryFixture({ convexOnly: "oauth" });

    await expect(
      viewer.action(api.repository.create, {
        organizationId,
        ...repositoryActionsCreateArgs,
        convexProjectName: "custom-project",
      }),
    ).rejects.toMatchObject({
      data: "The GitHub Actions of the repository name the Convex project after the repository: actions-app. Remove the custom name.",
    });
  });

  it("refuses a custom Worker name, because Cloudflare takes no part", async () => {
    const { organizationId, viewer } = await createRepositoryFixture({ convexOnly: "oauth" });

    await expect(
      viewer.action(api.repository.create, {
        organizationId,
        ...repositoryActionsCreateArgs,
        cloudflareWorkerName: "custom-worker",
      }),
    ).rejects.toMatchObject({
      data: "A Cloudflare Worker name, a Workers Builds token, and a Convex region apply only when Samebase sets up the app. Remove them.",
    });
  });
});

describe("preview personal repository authorization", () => {
  it("uses the seeded GitHub credential for nicu-chiciuc without storing OAuth data", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:personal-repository");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.test");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-api-key");
    providerMocks.discoverPreviewSeedGitHubAppInstallations.mockResolvedValue([
      {
        githubInstallationId: "installation-1",
        githubOwnerId: "personal-owner-1",
        githubOwnerType: "user",
        githubOwnerLogin: "nicu-chiciuc",
      },
    ]);
    const { organizationId, t, viewer } = await createRepositoryFixture({
      email: "preview@example.test",
      githubOwnerId: "personal-owner-1",
      githubOwnerLogin: "nicu-chiciuc",
      githubOwnerType: "user",
      passwordAccount: true,
    });

    await expect(viewer.query(api.organizations.listForViewer, {})).resolves.toMatchObject([
      { organizationId, canCreateRepository: true },
    ]);
    const result = await viewer.action(api.repository.create, {
      organizationId,
      githubRepositoryName: "preview-personal-app",
      convexProjectName: "preview-personal-app",
      cloudflareWorkerName: "preview-personal-app",
      cloudflareBuildTokenUuid: null,
    });

    expect(providerMocks.discoverPreviewSeedGitHubAppInstallations).toHaveBeenCalledWith(
      "preview-api-key",
    );
    expect(providerMocks.createGitHubUserOctokit).toHaveBeenCalledWith("preview-api-key");
    await expect(
      t.run(async (ctx) => ({
        authorizationCount: (await ctx.db.query("githubUserAuthorizations").collect()).length,
        plan: await ctx.db
          .query("workflow_repositoryProvisioning_plans")
          .withIndex("by_repository", (query) => query.eq("repositoryId", result.repositoryId))
          .unique(),
        run: await ctx.db.get(result.runId),
        repository: await ctx.db.get(result.repositoryId),
      })),
    ).resolves.toMatchObject({
      authorizationCount: 0,
      plan: {
        convex: { deploymentRegion: "aws-us-east-1" },
      },
      run: { organizationId, trigger: "create" },
      repository: { organizationId, githubMode: "create_repository" },
    });
  });

  it("rejects a personal owner that does not match the seeded GitHub credential", async () => {
    vi.stubEnv("CONVEX_DEPLOYMENT", "preview:personal-repository");
    vi.stubEnv("DEV_SEED_AUTH_EMAIL", "preview@example.test");
    vi.stubEnv("DEV_SEED_AUTH_PASSWORD", "preview-password");
    vi.stubEnv("DEV_SEED_GITHUB_API_KEY", "preview-api-key");
    providerMocks.discoverPreviewSeedGitHubAppInstallations.mockResolvedValue([
      {
        githubInstallationId: "installation-1",
        githubOwnerId: "personal-owner-1",
        githubOwnerType: "user",
        githubOwnerLogin: "nicu-chiciuc",
      },
    ]);
    const { organizationId, t, viewer } = await createRepositoryFixture({
      email: "preview@example.test",
      githubOwnerId: "other-personal-owner",
      githubOwnerLogin: "other-personal-owner",
      githubOwnerType: "user",
      passwordAccount: true,
    });

    await expect(
      viewer.action(api.repository.create, {
        organizationId,
        githubRepositoryName: "preview-personal-app",
        convexProjectName: "preview-personal-app",
        cloudflareWorkerName: "preview-personal-app",
        cloudflareBuildTokenUuid: null,
      }),
    ).rejects.toThrow("Preview GitHub access does not match the personal repository owner.");
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });
});

describe("create repository Workers Builds token admission", () => {
  it("returns a public provider name conflict before it creates the repository", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      {
        createTime: 1,
        id: "existing-project",
        name: "new-app",
        slug: "new-app",
        teamId: "convex-team",
        teamSlug: "convex-team",
      },
    ]);

    await expect(
      viewer.action(api.repository.create, {
        organizationId,
        githubRepositoryName: "new-app",
        convexProjectName: "new-app",
        cloudflareWorkerName: "new-app",
        cloudflareBuildTokenUuid: null,
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "A Convex project named new-app already exists.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });

  it("uses the saved EU default and accepts null without another provider-list request", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();
    await t.run(async (ctx) => {
      await ctx.db.patch(organizationId, { defaultConvexDeploymentRegion: "aws-eu-west-1" });
    });

    const result = await viewer.action(api.repository.create, {
      organizationId,
      githubRepositoryName: "new-app",
      convexProjectName: "new-app",
      cloudflareWorkerName: "not a valid Worker name",
      cloudflareBuildTokenUuid: null,
    });

    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("workflow_repositoryProvisioning_plans")
          .withIndex("by_repository", (q) => q.eq("repositoryId", result.repositoryId))
          .unique();
      }),
    ).resolves.toMatchObject({
      convex: {
        state: "planned",
        projectName: "new-app",
        deploymentRegion: "aws-eu-west-1",
      },
      cloudflare: {
        state: "planned",
        workerName: "new-app",
        buildTokenUuid: null,
      },
    });
    expect(providerMocks.listCloudflareBuildTokens).not.toHaveBeenCalled();
    expect(providerMocks.isCloudflareWorkerNameAvailable).not.toHaveBeenCalled();
    expect(providerMocks.requireCloudflareBuildTokenUuid).not.toHaveBeenCalled();
  });

  it("does not validate or read Worker-name availability for a null token selection", async () => {
    const { organizationId, viewer } = await createRepositoryFixture();

    await expect(
      viewer.action(api.repository.actions.checkCreateRepositoryResourceNames, {
        organizationId,
        githubRepositoryName: "new-app",
        convexProjectName: "new-app",
        cloudflareWorkerName: "not a valid Worker name",
        cloudflareBuildTokenUuid: null,
      }),
    ).resolves.toMatchObject({
      github: { status: "available" },
      convex: { status: "available" },
      cloudflare: { status: "not_required", message: null, suggestion: null },
    });
    expect(providerMocks.isCloudflareWorkerNameAvailable).not.toHaveBeenCalled();
  });
});
