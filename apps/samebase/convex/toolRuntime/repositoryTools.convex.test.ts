import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  fetchGitHubConvexCodeLocationDiscovery: vi.fn(),
  resolveGitHubAppAccess: vi.fn(),
}));

const cloudflareMocks = vi.hoisted(() => ({
  getWorker: vi.fn(),
  getBuildSettings: vi.fn(),
  getBuilds: vi.fn(),
}));

vi.mock("../cloudflareApi/generated/sdk.gen", () => ({
  Cloudflare: {
    GET: {
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

vi.mock("../githubRepoApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../githubRepoApi")>();
  return {
    ...actual,
    fetchGitHubConvexCodeLocationDiscovery: githubMocks.fetchGitHubConvexCodeLocationDiscovery,
  };
});

import { api, internal } from "../_generated/api";
import type { ConvexManagement } from "../convexManagementApi/generated/sdk.gen";
import { observedNativeWorkerBuildSettings } from "../cloudflareApi/fixtures/observedWorkerBuildSettings";
import { observedNativePreviewsProductionBuild } from "../cloudflareApi/fixtures/observedWorkerBuilds";
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

const configLocation = (convexConfigPath: string) => ({
  kind: "config" as const,
  convexConfigPath,
  rootDirectory: "/",
  blobSha: `${convexConfigPath}-sha`,
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
  for (const endpoint of Object.values(cloudflareMocks)) endpoint.mockReset();
  githubMocks.resolveGitHubAppAccess.mockResolvedValue({ octokit: {} });
  githubMocks.fetchGitHubConvexCodeLocationDiscovery.mockResolvedValue({
    completeness: "complete",
    defaultBranch: "main",
    commitSha: "commit-sha",
    treeSha: "tree-sha",
    locations: [configLocation("convex.json")],
  });
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
            providerSetup: { status: "ready" },
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
  it("reads the status by repository name and reports unreadable providers as unavailable", async () => {
    const fixture = await createScoutFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Provider request failed in the test.");
      }),
    );

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
      repository: "Scout-Owner/Scout",
    });
    const dashboardStatus = await fixture.viewer.action(api.repository.getStatus, {
      repositoryId: fixture.repositoryId,
    });
    vi.unstubAllGlobals();

    expect(result).toEqual({
      status: "ok",
      text: "scout-owner/scout: 1 app, 1 Convex project, pull requests unavailable. Could not read the default branch head, the production build of scout, the Convex production deployment at convex.json.",
      structuredContent: {
        repository: "scout-owner/scout",
        defaultBranch: null,
        openPullRequestCount: null,
        apps: [
          {
            workerName: "scout",
            rootDirectory: "/",
            productionBuild: { state: "unavailable" },
            urls: [],
          },
        ],
        convexProjects: [
          {
            codeLocation: "convex.json",
            projectSlug: null,
            productionDeployment: { state: "unavailable" },
          },
        ],
        pullRequests: [],
        setupStack: null,
        attention: [],
      },
    });
    expect(dashboardStatus).toMatchObject({
      workers: [{ state: "failed", workerId: fixture.workerId }],
      convexProjects: [{ convexProjectId: fixture.convexProjectId }],
      pullRequests: { state: "unavailable" },
      pullRequestResources: [],
      attention: [],
    });
  });

  const builtCommit = observedNativePreviewsProductionBuild.build_trigger_metadata.commit_hash;
  const workerTag = observedNativePreviewsProductionBuild.trigger.external_script_id;
  const githubRepositoryId = observedNativePreviewsProductionBuild.trigger.repo_connection.repo_id;

  /**
  The live reads of scout with only its Worker attached. GitHub names `defaultBranch` as the default
  branch, `heads` gives the head commit of each branch, and each head has the completed check runs
  `checks`. Workers Builds builds `defaultBranch`, and its latest production build is of
  `builtCommit` with `buildOutcome`.
  */
  async function stubLiveStatusReads(
    fixture: Awaited<ReturnType<typeof createScoutFixture>>,
    args: {
      defaultBranch: string;
      heads: Record<string, string>;
      checks: Array<{ name: string; conclusion: "SUCCESS" | "FAILURE" }>;
      buildOutcome: "success" | "fail";
    },
  ) {
    const countChecks = (conclusion: "SUCCESS" | "FAILURE") =>
      args.checks.filter((check) => check.conclusion === conclusion).length;
    await fixture.t.run(async (ctx) => {
      await ctx.db.delete(fixture.convexProjectId);
      await ctx.db.patch(fixture.repositoryId, { githubRepositoryDatabaseId: githubRepositoryId });
      await ctx.db.patch(fixture.workerId, { workerTag });
      const credentials = await ctx.db.query("organizationProviderCredentials").unique();
      if (credentials === null) {
        throw new Error("The scout fixture has provider credentials.");
      }
      await ctx.db.patch(credentials._id, {
        cloudflare: {
          auth: { method: "api_key", credential: testCredential("cloudflare-token") },
          connectedByUserId: fixture.userId,
          updatedAt: 1,
        },
      });
    });
    await sealTestCredentials(fixture.t);
    const getRepository = vi.fn(async () => ({
      data: {
        id: Number(githubRepositoryId),
        owner: { id: 1 },
        default_branch: args.defaultBranch,
      },
    }));
    const graphql = vi.fn(async (_query: string, variables: { defaultBranchRef: string }) => {
      const branch = variables.defaultBranchRef.replace(/^refs\/heads\//, "");
      const head = args.heads[branch];
      return {
        repository: {
          id: "R_scout",
          databaseId: Number(githubRepositoryId),
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
    cloudflareMocks.getWorker.mockResolvedValue({
      result: {
        id: workerTag,
        name: "scout",
        references: { domains: [] },
        subdomain: { enabled: false, previews_enabled: false },
      },
    });
    cloudflareMocks.getBuildSettings.mockResolvedValue({
      result: {
        ...observedNativeWorkerBuildSettings,
        script_tag: workerTag,
        git_repository: {
          ...observedNativeWorkerBuildSettings.git_repository,
          repo_id: githubRepositoryId,
          branch: args.defaultBranch,
        },
      },
    });
    cloudflareMocks.getBuilds.mockResolvedValue({
      result: [
        {
          ...observedNativePreviewsProductionBuild,
          build_outcome: args.buildOutcome,
          build_trigger_metadata: {
            ...observedNativePreviewsProductionBuild.build_trigger_metadata,
            branch: args.defaultBranch,
          },
        },
      ],
    });
    return { getRepository, graphql };
  }

  it("compares the production build with the head of GitHub's current default branch", async () => {
    const fixture = await createScoutFixture();
    // The recorded default branch is still main, which keeps its own head.
    const { getRepository, graphql } = await stubLiveStatusReads(fixture, {
      defaultBranch: "release",
      heads: { main: "0".repeat(40), release: builtCommit },
      checks: [{ name: "test", conclusion: "SUCCESS" }],
      buildOutcome: "success",
    });

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
      repository: "scout-owner/scout",
    });

    expect(result).toMatchObject({
      status: "ok",
      text: "scout-owner/scout: 1 app, 0 Convex projects, 0 open pull requests. Nothing needs attention.",
      structuredContent: {
        defaultBranch: { name: "release" },
        apps: [{ workerName: "scout", productionBuild: { commit: "matches_head" } }],
        attention: [],
      },
    });
    expect(getRepository).toHaveBeenCalledOnce();
    expect(graphql).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ defaultBranchRef: "refs/heads/release" }),
    );
  });

  it("names a failed production build that no setup repair fixes", async () => {
    const fixture = await createScoutFixture();
    await stubLiveStatusReads(fixture, {
      defaultBranch: "main",
      heads: { main: builtCommit },
      checks: [],
      buildOutcome: "fail",
    });

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
        userId: fixture.userId,
        grantedScopes: ["access_dashboard"],
        repository: "scout-owner/scout",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      text: "scout-owner/scout: 1 app, 0 Convex projects, 0 open pull requests. The latest production build of scout failed.",
      structuredContent: {
        apps: [{ workerName: "scout", productionBuild: { buildState: "failure" } }],
        attention: [],
      },
    });
  });

  it("names the failed checks of the default branch head", async () => {
    const fixture = await createScoutFixture();
    await stubLiveStatusReads(fixture, {
      defaultBranch: "main",
      heads: { main: builtCommit },
      checks: [
        { name: "lint", conclusion: "FAILURE" },
        { name: "test", conclusion: "SUCCESS" },
        { name: "typecheck", conclusion: "FAILURE" },
      ],
      buildOutcome: "success",
    });

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryGetStatusTool, {
        userId: fixture.userId,
        grantedScopes: ["access_dashboard"],
        repository: "scout-owner/scout",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      text: "scout-owner/scout: 1 app, 0 Convex projects, 0 open pull requests. 2 checks failed on main: lint, typecheck.",
      structuredContent: {
        defaultBranch: { checks: { failed: 2, failedNames: ["lint", "typecheck"] } },
        attention: [],
      },
    });
  });
});
