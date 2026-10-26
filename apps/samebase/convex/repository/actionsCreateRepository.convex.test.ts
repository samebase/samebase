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
  verifyConvexTeamAccessToken: vi.fn(),
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
    verifyConvexTeamAccessToken: providerMocks.verifyConvexTeamAccessToken,
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

import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

type ConvexTestHandle = ReturnType<typeof makeConvexTest>;

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
        auth: { method: "api_key", credential: "cloudflare-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    return { organizationId, userId };
  });

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
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/**
Cloudflare's answers to the CI token check: the token is active, and a path in `denied` answers
like a token without that permission (403, code 10000 Authentication error).
*/
function stubCloudflareCiToken({ denied = [] }: { denied?: string[] } = {}) {
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    if (url.pathname === "/client/v4/user/tokens/verify") {
      return Response.json({
        success: true,
        errors: [],
        messages: [],
        result: { id: "c".repeat(32), status: "active" },
      });
    }
    return denied.includes(url.pathname)
      ? Response.json(
          {
            success: false,
            errors: [{ code: 10000, message: "Authentication error" }],
            messages: [],
            result: null,
          },
          { status: 403 },
        )
      : Response.json({ success: true, errors: [], messages: [], result: [] });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
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
  providerMocks.verifyConvexTeamAccessToken.mockResolvedValue(undefined);
});

async function saveCiCredentials(
  t: ConvexTestHandle,
  args: { organizationId: Id<"organizations">; userId: Id<"users"> },
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("organizationCiCredentials", {
      organizationId: args.organizationId,
      cloudflare: {
        apiToken: "cloudflare-ci-test-token",
        accountId: "cloudflare-account",
        connectedByUserId: args.userId,
        updatedAt: 2,
      },
      convex: {
        accessToken: "convex-ci-test-token",
        teamId: "convex-team",
        connectedByUserId: args.userId,
        updatedAt: 3,
      },
    });
  });
}

const repositoryActionsCreateArgs = {
  githubRepositoryName: "actions-app",
  convexProjectName: "actions-app",
  cloudflareWorkerName: "actions-app",
  cloudflareBuildTokenUuid: null,
  provisioning: "repository_actions",
} as const;

describe("create repository with provisioning repository_actions", () => {
  it("refuses before it creates anything when the CI tokens are not saved", async () => {
    const { organizationId, t, viewer } = await createRepositoryFixture();

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toMatchObject({
      data: "Save the Cloudflare and Convex CI tokens on the Providers page (/org/samebase/providers) before you create a repository that its GitHub Actions set up.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });

  it("refuses an installation that has not accepted the Secrets and Variables permissions", async () => {
    const { organizationId, t, userId, viewer } = await createRepositoryFixture();
    await saveCiCredentials(t, { organizationId, userId });
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

  it("refuses a saved Cloudflare CI token that lost a permission group", async () => {
    const { organizationId, t, userId, viewer } = await createRepositoryFixture();
    await saveCiCredentials(t, { organizationId, userId });
    stubCloudflareCiToken({
      denied: ["/client/v4/accounts/cloudflare-account/secrets_store/stores"],
    });

    await expect(
      viewer.action(api.repository.create, { organizationId, ...repositoryActionsCreateArgs }),
    ).rejects.toMatchObject({
      data: "Cloudflare could not confirm that the Cloudflare CI token has Secrets Store Edit in the Cloudflare account Cloudflare account. Save a new token from the Cloudflare API tokens link under CI credentials on the Providers page, which preselects every permission that the setup stack needs, or try again.",
    });
    await expect(
      t.run(async (ctx) => await ctx.db.query("repositories").collect()),
    ).resolves.toEqual([]);
  });

  it("refuses before it creates anything when the organization has fewer than three connections left", async () => {
    const { organizationId, t, userId, viewer } = await createRepositoryFixture();
    await saveCiCredentials(t, { organizationId, userId });
    stubCloudflareCiToken();
    // Four of the organization's six free connections: Workers of another repository.
    const otherRepositoryId = await t.run(async (ctx) => {
      const repositoryId = await ctx.db.insert("repositories", {
        createdAt: 1,
        state: "not_connected",
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "cloudflare-account",
        deletion: { state: "not_deleting" },
      });
      for (const index of [1, 2, 3, 4]) {
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
    ).rejects.toMatchObject({
      data: "Organization connection limit reached (6). This takes 3 connections, and the organization has 2 left.",
    });
    await expect(
      t.run(async (ctx) => (await ctx.db.query("repositories").collect()).map((row) => row._id)),
    ).resolves.toEqual([otherRepositoryId]);
  });

  it("writes the repository_actions plan after every check passes", async () => {
    const { organizationId, t, userId, viewer } = await createRepositoryFixture();
    await saveCiCredentials(t, { organizationId, userId });
    const fetch = stubCloudflareCiToken();

    const result = await viewer.action(api.repository.create, {
      organizationId,
      ...repositoryActionsCreateArgs,
    });

    expect(
      fetch.mock.calls
        .map(([input]) => (input instanceof Request ? input.url : input.toString()))
        .sort(),
    ).toEqual([
      "https://api.cloudflare.com/client/v4/accounts/cloudflare-account",
      "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/builds/tokens?page=1&per_page=1",
      "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/secrets_store/stores?page=1&per_page=1",
      "https://api.cloudflare.com/client/v4/accounts/cloudflare-account/workers/scripts",
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
    ]);
    expect(providerMocks.verifyConvexTeamAccessToken).toHaveBeenCalledWith({
      token: "convex-ci-test-token",
      teamId: "convex-team",
    });
    expect(providerMocks.isCloudflareWorkerNameAvailable).toHaveBeenCalledWith(
      expect.objectContaining({ workerName: "actions-app" }),
    );
    expect(providerMocks.requireCloudflareBuildTokenUuid).not.toHaveBeenCalled();
    await expect(
      t.run(async (ctx) => ({
        plan: await ctx.db
          .query("workflow_repositoryProvisioning_plans")
          .withIndex("by_repository", (q) => q.eq("repositoryId", result.repositoryId))
          .unique(),
        repository: await ctx.db.get(result.repositoryId),
      })),
    ).resolves.toMatchObject({
      plan: { provisioning: "repository_actions", ciSecrets: { state: "planned" } },
      repository: { githubMode: "create_repository", githubRepositoryName: "actions-app" },
    });
  });

  it("refuses custom provider names, because the GitHub Actions use the repository name", async () => {
    const { organizationId, t, userId, viewer } = await createRepositoryFixture();
    await saveCiCredentials(t, { organizationId, userId });

    await expect(
      viewer.action(api.repository.create, {
        organizationId,
        ...repositoryActionsCreateArgs,
        cloudflareWorkerName: "custom-worker",
      }),
    ).rejects.toMatchObject({
      data: "The GitHub Actions of the repository name the Convex project and the Worker after the repository: actions-app and actions-app. Remove the custom names.",
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
