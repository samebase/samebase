import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const githubMocks = vi.hoisted(() => ({
  createInstallationAuth: vi.fn(),
  graphql: vi.fn(),
  request: vi.fn(),
}));

type MockOctokitOptions = {
  auth?: string | { installationId?: number };
};

vi.mock("@octokit/auth-app", () => ({
  createAppAuth: () => githubMocks.createInstallationAuth,
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly graphql: (query: string, parameters: unknown) => Promise<unknown>;
    readonly request: (route: string, parameters: unknown) => Promise<unknown>;

    constructor(options: MockOctokitOptions = {}) {
      const installationId =
        typeof options.auth === "object" ? options.auth.installationId : undefined;
      this.request = async (route, parameters) =>
        await githubMocks.request(installationId, route, parameters);
      this.graphql = async (query, parameters) => await githubMocks.graphql(query, parameters);
    }
  },
}));

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeConvexTest } from "./test.setup";

type ConvexTest = ReturnType<typeof makeConvexTest>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GITHUB_APP_ID", "42");
  vi.stubEnv("GITHUB_APP_SLUG", "samebase-test");
  vi.stubEnv("GITHUB_APP_CLIENT_ID", "client-id");
  vi.stubEnv("GITHUB_APP_CLIENT_SECRET", "client-secret");
  vi.stubEnv("GITHUB_APP_PRIVATE_KEY", "private-key");
  vi.stubEnv("GITHUB_APP_OAUTH_CALLBACK_URL", "https://samebase.test/oauth/github/callback");
  githubMocks.createInstallationAuth.mockResolvedValue({ token: "repository-scoped-token" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createOrganization(
  t: ConvexTest,
  args: {
    userId: Id<"users">;
    ownerId: string;
    ownerLogin: string;
    installationId: string;
  },
): Promise<Id<"organizations">> {
  const organization = await t.mutation(
    internal.organizations.createOrReconnectVerifiedOrganization,
    {
      userId: args.userId,
      githubOwnerId: args.ownerId,
      githubOwnerType: "organization",
      githubOwnerLogin: args.ownerLogin,
      githubInstallationId: args.installationId,
    },
  );
  await t.run(async (ctx) => {
    await ctx.db.patch(organization.organizationId, {
      convexTeam: { teamId: `convex-team-${args.ownerId}` },
      cloudflareAccount: {
        accountId: `cloudflare-account-${args.ownerId}`,
        accountName: `${args.ownerLogin} account`,
      },
    });
  });
  return organization.organizationId;
}

async function createConnectedVault(
  t: ConvexTest,
  args: {
    organizationId: Id<"organizations">;
    userId: Id<"users">;
    ownerId: string;
    owner: string;
    name: string;
    repositoryId: string;
  },
): Promise<Id<"vaults">> {
  const vault = await t.mutation(
    internal.vault.records.createInitializingExistingRepositoryVaultForUser,
    {
      organizationId: args.organizationId,
      userId: args.userId,
      ghRepoOwner: args.owner,
      ghRepoName: args.name,
    },
  );
  await t.mutation(internal.vault.records.connectExistingRepositoryVaultGitHub, {
    ...vault,
    userId: args.userId,
    ghRepoId: args.repositoryId,
    expectedGithubOwnerId: args.ownerId,
    expectedGithubOwnerLogin: args.owner,
    expectedRepositoryName: args.name,
    ghRepoOwner: args.owner,
    ghRepoName: args.name,
    defaultBranch: "main",
    visibility: "private",
  });
  return vault.vaultId;
}

async function createSidebarFixture() {
  const t = makeConvexTest();
  const userId = await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      state: "active",
      email: "github-sidebar@example.com",
      isApproved: true,
    });
  });
  const firstOrganizationId = await createOrganization(t, {
    userId,
    ownerId: "101",
    ownerLogin: "blocked-owner",
    installationId: "1001",
  });
  const secondOrganizationId = await createOrganization(t, {
    userId,
    ownerId: "1",
    ownerLogin: "octocat",
    installationId: "2002",
  });
  const firstVaultId = await createConnectedVault(t, {
    organizationId: firstOrganizationId,
    userId,
    ownerId: "101",
    owner: "blocked-owner",
    name: "blocked-repository",
    repositoryId: "10001",
  });
  const secondVaultId = await createConnectedVault(t, {
    organizationId: secondOrganizationId,
    userId,
    ownerId: "1",
    owner: "octocat",
    name: "Hello-World",
    repositoryId: "1296269",
  });
  return {
    asUser: t.withIdentity({
      subject: `${userId}|github-sidebar`,
      tokenIdentifier: `test:${userId}`,
    }),
    firstVaultId,
    secondOrganizationId,
    secondVaultId,
    t,
  };
}

function installationRepositoriesResponse(
  installationId: number | undefined,
  overrides: { ownerLogin?: string; repositoryName?: string } = {},
) {
  switch (installationId) {
    case 1001: {
      const ownerLogin = overrides.ownerLogin ?? "blocked-owner";
      const repositoryName = overrides.repositoryName ?? "blocked-repository";
      return {
        data: {
          total_count: 1,
          repositories: [
            {
              id: 10_001,
              name: repositoryName,
              full_name: `${ownerLogin}/${repositoryName}`,
              default_branch: "main",
              owner: { id: 101, login: ownerLogin },
            },
          ],
        },
      };
    }
    case 2002: {
      const ownerLogin = overrides.ownerLogin ?? "octocat";
      const repositoryName = overrides.repositoryName ?? "Hello-World";
      // Subset of GitHub's official GET /installation/repositories response example.
      // https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
      return {
        data: {
          total_count: 1,
          repositories: [
            {
              id: 1_296_269,
              name: repositoryName,
              full_name: `${ownerLogin}/${repositoryName}`,
              default_branch: "master",
              owner: { id: 1, login: ownerLogin },
            },
          ],
        },
      };
    }
    default:
      throw new Error(`Unexpected GitHub installation: ${installationId}`);
  }
}

function sidebarGraphqlResponse(args: {
  repositoryId: number;
  ownerId: number;
  defaultBranch: string;
}) {
  return {
    repository0: {
      databaseId: args.repositoryId,
      owner: { databaseId: args.ownerId },
      defaultBranch: {
        name: args.defaultBranch,
        target: {
          __typename: "Commit",
          statusCheckRollup: null,
        },
      },
    },
  };
}

function expectedSidebarSummaries(args: {
  firstVaultId: Id<"vaults">;
  secondVaultId: Id<"vaults">;
}) {
  return [
    { vaultId: args.firstVaultId, repository: null },
    {
      vaultId: args.secondVaultId,
      repository: {
        statusCheckRollup: null,
      },
    },
  ];
}

describe("listVaultSidebarSummaries", () => {
  it("keeps another owner's summary when one installation is unavailable", async () => {
    const fixture = await createSidebarFixture();

    githubMocks.request.mockImplementation(async (installationId, route) => {
      if (route !== "GET /installation/repositories") {
        throw new Error(`Unexpected GitHub route: ${route}`);
      }
      if (installationId === 1001) {
        throw new Error("Installation is unavailable.");
      }
      return installationRepositoriesResponse(installationId);
    });
    githubMocks.graphql.mockResolvedValue(
      sidebarGraphqlResponse({ repositoryId: 1_296_269, ownerId: 1, defaultBranch: "master" }),
    );

    await expect(
      fixture.asUser.action(api.repositoryPullRequests.listVaultSidebarSummaries, {}),
    ).resolves.toEqual(expectedSidebarSummaries(fixture));
    expect(githubMocks.graphql).toHaveBeenCalledOnce();
  });

  it("keeps another owner's summary when GraphQL authorization fails", async () => {
    const fixture = await createSidebarFixture();
    githubMocks.request.mockImplementation(async (installationId, route) => {
      if (route !== "GET /installation/repositories") {
        throw new Error(`Unexpected GitHub route: ${route}`);
      }
      return installationRepositoriesResponse(installationId);
    });
    githubMocks.graphql
      .mockRejectedValueOnce(new Error("GraphQL authorization failed."))
      .mockResolvedValueOnce(
        sidebarGraphqlResponse({ repositoryId: 1_296_269, ownerId: 1, defaultBranch: "master" }),
      );

    await expect(
      fixture.asUser.action(api.repositoryPullRequests.listVaultSidebarSummaries, {}),
    ).resolves.toEqual(expectedSidebarSummaries(fixture));
    expect(githubMocks.graphql).toHaveBeenCalledTimes(2);
  });

  it("repairs a repository name but preserves the stored owner display", async () => {
    const fixture = await createSidebarFixture();
    githubMocks.request.mockImplementation(async (installationId, route) => {
      if (route !== "GET /installation/repositories") {
        throw new Error(`Unexpected GitHub route: ${route}`);
      }
      if (installationId === 1001) {
        throw new Error("Installation is unavailable.");
      }
      return installationRepositoriesResponse(installationId, {
        ownerLogin: "OctoCat",
        repositoryName: "Renamed-World",
      });
    });
    githubMocks.graphql.mockResolvedValue(
      sidebarGraphqlResponse({ repositoryId: 1_296_269, ownerId: 1, defaultBranch: "master" }),
    );

    await expect(
      fixture.asUser.action(api.repositoryPullRequests.listVaultSidebarSummaries, {}),
    ).resolves.toEqual(expectedSidebarSummaries(fixture));
    await expect(
      fixture.t.run(async (ctx) => ({
        organization: await ctx.db.get(fixture.secondOrganizationId),
        vault: await ctx.db.get(fixture.secondVaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "octocat", githubOwnerLoginNormalized: "octocat" },
      vault: { name: "Renamed-World" },
    });
  });

  it("does not use a repository whose owner login needs verified reconnect", async () => {
    const fixture = await createSidebarFixture();
    githubMocks.request.mockImplementation(async (installationId, route) => {
      if (route !== "GET /installation/repositories") {
        throw new Error(`Unexpected GitHub route: ${route}`);
      }
      if (installationId === 1001) {
        throw new Error("Installation is unavailable.");
      }
      return installationRepositoriesResponse(installationId, { ownerLogin: "monalisa" });
    });

    await expect(
      fixture.asUser.action(api.repositoryPullRequests.listVaultSidebarSummaries, {}),
    ).resolves.toEqual([
      { vaultId: fixture.firstVaultId, repository: null },
      { vaultId: fixture.secondVaultId, repository: null },
    ]);
    expect(githubMocks.graphql).not.toHaveBeenCalled();
    await expect(
      fixture.t.run(async (ctx) => ({
        organization: await ctx.db.get(fixture.secondOrganizationId),
        vault: await ctx.db.get(fixture.secondVaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "octocat", githubOwnerLoginNormalized: "octocat" },
      vault: { name: "Hello-World" },
    });
  });
});

describe("repository identity refresh", () => {
  it("repairs the repository name and keeps the stored owner display", async () => {
    const fixture = await createSidebarFixture();
    githubMocks.request.mockImplementation(async (installationId, route) => {
      if (installationId !== undefined || route !== "GET /installation/repositories") {
        throw new Error(`Unexpected GitHub request: ${installationId} ${route}`);
      }
      return installationRepositoriesResponse(2002, {
        ownerLogin: "OctoCat",
        repositoryName: "Renamed-World",
      });
    });
    githubMocks.graphql.mockResolvedValue({ repository: null });

    await expect(
      fixture.asUser.action(api.repositoryPullRequests.listOpenPullRequests, {
        vaultId: fixture.secondVaultId,
        first: 20,
        after: null,
      }),
    ).resolves.toEqual({ repository: null });
    expect(githubMocks.graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ owner: "octocat", name: "Renamed-World" }),
    );
    await expect(
      fixture.t.run(async (ctx) => ({
        organization: await ctx.db.get(fixture.secondOrganizationId),
        vault: await ctx.db.get(fixture.secondVaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "octocat", githubOwnerLoginNormalized: "octocat" },
      vault: { name: "Renamed-World" },
    });
  });

  it("requires verified reconnect when the owner login changes", async () => {
    const fixture = await createSidebarFixture();
    githubMocks.request.mockImplementation(async (installationId, route) => {
      if (installationId !== undefined || route !== "GET /installation/repositories") {
        throw new Error(`Unexpected GitHub request: ${installationId} ${route}`);
      }
      return installationRepositoriesResponse(2002, { ownerLogin: "monalisa" });
    });

    await expect(
      fixture.asUser.action(api.repositoryPullRequests.listOpenPullRequests, {
        vaultId: fixture.secondVaultId,
        first: 20,
        after: null,
      }),
    ).rejects.toThrow(
      "GitHub owner login changed. An organization owner must reconnect the GitHub App.",
    );
    expect(githubMocks.graphql).not.toHaveBeenCalled();
    await expect(
      fixture.t.run(async (ctx) => ({
        organization: await ctx.db.get(fixture.secondOrganizationId),
        vault: await ctx.db.get(fixture.secondVaultId),
      })),
    ).resolves.toMatchObject({
      organization: { githubOwnerLogin: "octocat", githubOwnerLoginNormalized: "octocat" },
      vault: { name: "Hello-World" },
    });
  });
});
