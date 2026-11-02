import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  resolveGitHubAppAccess: vi.fn(),
}));

vi.mock("../convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementProjects: providerMocks.listConvexManagementProjects,
  };
});

vi.mock("../convexManagementApi/generated/sdk.gen", () => ({
  ConvexManagement: {
    GET: { "/projects/{project_id}": providerMocks.getProject },
    POST: { "/teams/{team_id}/create_project": providerMocks.createProject },
  },
}));

vi.mock("../githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccess: githubMocks.resolveGitHubAppAccess,
  };
});

import { api, internal } from "../_generated/api";
import type { ConvexManagement } from "../convexManagementApi/generated/sdk.gen";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../test.setup";

const convexTeamProject = (id: string, name: string, slug = name) => ({
  createTime: 1,
  id,
  name,
  slug,
  teamId: "convex-team",
  teamSlug: "scout-team",
});

/**
The repository scout-owner/scout with a Worker named scout and a Convex project named scout: the
default creation names, which make a Worker and a Convex project share the repository name.
*/
async function createScoutFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "scout-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "scout-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "scout-owner",
      githubOwnerLoginNormalized: "scout-owner",
      githubInstallationId: "scout-installation",
      defaultConvexDeploymentRegion: "aws-eu-west-1",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: { accountId: "cloudflare-account", accountName: "Cloudflare account" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: testCredential("convex-token") },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "scout-owner/scout",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "github-repository",
      githubRepositoryName: "scout",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    const workerId = await ctx.db.insert("repositoryCloudflareWorkers", {
      repositoryId,
      organizationId,
      accountId: "cloudflare-account",
      workerName: "scout",
      workerTag: "scout-tag",
      rootDirectory: "/",
      origin: "selected_existing",
    });
    const convexProjectId = await ctx.db.insert("repositoryConvexProjects", {
      repositoryId,
      organizationId,
      teamId: "convex-team",
      projectId: "scout-project",
      convexConfigPath: "convex.json",
      origin: "selected_existing",
    });
    return { convexProjectId, organizationId, repositoryId, userId, workerId };
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

beforeEach(() => {
  vi.clearAllMocks();
  githubMocks.resolveGitHubAppAccess.mockResolvedValue({ octokit: {} });
  providerMocks.listConvexManagementProjects.mockResolvedValue([
    convexTeamProject("scout-project", "scout"),
    convexTeamProject("free-project", "free-app"),
  ]);
  providerMocks.createProject.mockResolvedValue({
    id: "created-project",
    projectId: "created-project",
  });
  providerMocks.getProject.mockImplementation(
    async ({ path }: Parameters<(typeof ConvexManagement.GET)["/projects/{project_id}"]>[0]) => {
      const projectId = path.project_id;
      return convexTeamProject(projectId, projectId === "free-project" ? "free-app" : projectId);
    },
  );
});

describe("repository_list", () => {
  it("reports setup state without attachments and reads no provider", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryListTool, {
        userId: fixture.userId,
        grantedScopes: ["access_dashboard"],
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Found 1 repository.",
      structuredContent: {
        repositories: [
          {
            repositoryId: fixture.repositoryId,
            githubRepositoryFullName: "scout-owner/scout",
            githubOwnerLogin: "scout-owner",
            isSamebaseManaged: false,
            sourceSetup: { status: "ready" },
            providerSetup: { status: "not_applicable" },
            deletion: { state: "not_deleting" },
          },
        ],
      },
    });
    expect(providerMocks.listConvexManagementProjects).not.toHaveBeenCalled();

    // The dashboard list reads the same rows and keeps the attachments.
    await expect(fixture.viewer.query(api.repository.list, {})).resolves.toMatchObject([
      {
        repositoryId: fixture.repositoryId,
        cloudflareWorkers: [{ workerName: "scout" }],
        convexProjects: [{ projectId: "scout-project" }],
      },
    ]);
  });
});

describe("repository_getStatus", () => {
  it("reads the status by repository name and reports an unreadable store as unreadable", async () => {
    const fixture = await createScoutFixture();
    providerMocks.listConvexManagementProjects.mockRejectedValue(
      new Error("Provider request failed in the test."),
    );

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
      repository: "Scout-Owner/Scout",
    });
    const dashboardStatus = await fixture.viewer.action(api.repository.getStatus, {
      repositoryId: fixture.repositoryId,
    });

    const attention = [
      {
        tool: null,
        problem:
          "The team's Alchemy state store could not be read, so this status does not say what scout-owner/scout has deployed. Call repository_getStatus again.",
      },
    ];
    expect(result).toEqual({
      status: "ok",
      text: `scout-owner/scout: stacks unreadable, pull requests unavailable. Needs attention: ${attention[0].problem} Could not read the default branch head.`,
      structuredContent: {
        repository: "scout-owner/scout",
        defaultBranch: null,
        openPullRequestCount: null,
        stacks: { state: "unreadable" },
        pullRequests: [],
        setupStack: null,
        attention,
      },
    });
    expect(dashboardStatus).toEqual({
      pullRequests: { state: "unavailable" },
      stacks: { state: "unreadable" },
      setupStack: null,
      attention,
    });
  });

  const headCommit = "9d1c2f4a7b6e8c0d3f5a1b2c4e6d8f0a2b4c6e8d";

  /**
  The GitHub reads of scout: GitHub names `defaultBranch` as the default branch, `heads` gives the
  head commit of each branch, and each head has the completed check runs `checks`.
  */
  function stubGitHubReads(args: {
    defaultBranch: string;
    heads: Record<string, string>;
    checks: Array<{ name: string; conclusion: "SUCCESS" | "FAILURE" }>;
  }) {
    const countChecks = (conclusion: "SUCCESS" | "FAILURE") =>
      args.checks.filter((check) => check.conclusion === conclusion).length;
    const getRepository = vi.fn(async () => ({
      data: { id: 4242, owner: { id: 1 }, default_branch: args.defaultBranch },
    }));
    const graphql = vi.fn(async (_query: string, variables: { defaultBranchRef: string }) => {
      const branch = variables.defaultBranchRef.replace(/^refs\/heads\//, "");
      const head = args.heads[branch];
      return {
        repository: {
          id: "R_scout",
          databaseId: 4242,
          nameWithOwner: "scout-owner/scout",
          defaultBranch: head
            ? {
                name: branch,
                target: {
                  __typename: "Commit",
                  oid: head,
                  messageHeadline: `Head of ${branch}`,
                  committedDate: "2026-09-29T20:45:00Z",
                  url: `https://github.com/scout-owner/scout/commit/${head}`,
                  statusCheckRollup:
                    args.checks.length === 0
                      ? null
                      : {
                          contexts: {
                            totalCount: args.checks.length,
                            checkRunCount: args.checks.length,
                            statusContextCount: 0,
                            checkRunCountsByState: [
                              { state: "SUCCESS", count: countChecks("SUCCESS") },
                              { state: "FAILURE", count: countChecks("FAILURE") },
                            ].filter((counts) => counts.count > 0),
                            statusContextCountsByState: [],
                            nodes: args.checks.map((check) => ({
                              __typename: "CheckRun",
                              name: check.name,
                              status: "COMPLETED",
                              conclusion: check.conclusion,
                              detailsUrl: `https://github.com/scout-owner/scout/actions/runs/1/job/${check.name}`,
                              title: null,
                            })),
                          },
                        },
                },
              }
            : null,
          pullRequests: {
            totalCount: 0,
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [],
          },
        },
      };
    });
    githubMocks.resolveGitHubAppAccess.mockResolvedValue({
      octokit: { rest: { repos: { get: getRepository } }, graphql },
      githubOwnerLogin: "scout-owner",
    });
    return { getRepository, graphql };
  }

  async function matchGitHubRepositoryId(fixture: Awaited<ReturnType<typeof createScoutFixture>>) {
    await fixture.t.run(async (ctx) => {
      await ctx.db.patch(fixture.repositoryId, { githubRepositoryDatabaseId: "4242" });
    });
  }

  it("reads the head of GitHub's current default branch", async () => {
    const fixture = await createScoutFixture();
    await matchGitHubRepositoryId(fixture);
    // The recorded default branch is still main, which keeps its own head.
    const { getRepository, graphql } = stubGitHubReads({
      defaultBranch: "release",
      heads: { main: "0".repeat(40), release: headCommit },
      checks: [{ name: "test", conclusion: "SUCCESS" }],
    });

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
      repository: "scout-owner/scout",
    });

    expect(result).toMatchObject({
      status: "ok",
      text: expect.stringContaining("scout-owner/scout: 0 stacks, 0 open pull requests."),
      structuredContent: { defaultBranch: { name: "release" }, stacks: { state: "no_store" } },
    });
    expect(getRepository).toHaveBeenCalledOnce();
    expect(graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ defaultBranchRef: "refs/heads/release" }),
    );
  });

  it("names the failed checks of the default branch head", async () => {
    const fixture = await createScoutFixture();
    await matchGitHubRepositoryId(fixture);
    stubGitHubReads({
      defaultBranch: "main",
      heads: { main: headCommit },
      checks: [
        { name: "lint", conclusion: "FAILURE" },
        { name: "test", conclusion: "SUCCESS" },
        { name: "typecheck", conclusion: "FAILURE" },
      ],
    });

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
        userId: fixture.userId,
        grantedScopes: ["access_dashboard"],
        repository: "scout-owner/scout",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      text: expect.stringContaining("2 checks failed on main: lint, typecheck."),
      structuredContent: {
        defaultBranch: { checks: { failed: 2, failedNames: ["lint", "typecheck"] } },
      },
    });
  });
});
