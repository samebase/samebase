import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementDefaultProductionDeployments: vi.fn(),
  listConvexManagementProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
}));

const githubMocks = vi.hoisted(() => ({
  fetchGitHubConvexCodeLocationDiscovery: vi.fn(),
  resolveGitHubAppAccess: vi.fn(),
}));

vi.mock("../convexManagementApi/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../convexManagementApi/client")>();
  return {
    ...actual,
    listConvexManagementDefaultProductionDeployments:
      providerMocks.listConvexManagementDefaultProductionDeployments,
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
import { ConvexManagementApiError } from "../convexManagementApi/errors";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../test.setup";

async function createRegionOrganization(t: ReturnType<typeof makeConvexTest>) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "region-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "region-owner",
      githubOwnerType: "organization",
      githubOwnerLogin: "region-owner",
      githubOwnerLoginNormalized: "region-owner",
      githubInstallationId: "region-installation",
      defaultConvexDeploymentRegion: "aws-us-east-1",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: {
        accountId: "cloudflare-account",
        accountName: "Cloudflare account",
      },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "api_key", credential: testCredential("convex-token") },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    return { organizationId, userId };
  });
  await sealTestCredentials(t);
  return ids;
}

async function createManagedRegionFixture() {
  const t = makeConvexTest();
  const { organizationId, userId } = await createRegionOrganization(t);
  const ids = await t.run(async (ctx) => {
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
      githubRepositoryFullName: "region-owner/region-app",
      trigger: "create",
      state: "running",
      currentStep: "attach_convex",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId,
      githubRepositoryDatabaseId: "github-repository",
      githubRepositoryName: "region-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
      repositoryId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 1,
    });
    await ctx.db.insert("workflow_repositoryProvisioning_plans", {
      repositoryId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "region-app",
        deploymentRegion: "aws-eu-west-1",
      },
      cloudflare: {
        state: "planned",
        workerName: "region-app",
        rootDirectory: "/",
        buildTokenUuid: null,
      },
      createdAt: 1,
      updatedAt: 1,
    });
    return { runId, userId, repositoryId };
  });
  return { ...ids, t };
}

async function createManualRegionFixture() {
  const t = makeConvexTest();
  const { organizationId, userId } = await createRegionOrganization(t);
  const ids = await t.run(async (ctx) => {
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "region-owner/manual-region-app",
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
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      githubRepositoryDatabaseId: "github-repository",
      githubRepositoryName: "manual-region-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    return { organizationId, userId, repositoryId };
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

beforeEach(() => {
  vi.clearAllMocks();
  githubMocks.resolveGitHubAppAccess.mockResolvedValue({ octokit: {} });
  githubMocks.fetchGitHubConvexCodeLocationDiscovery.mockResolvedValue({
    completeness: "complete",
    defaultBranch: "main",
    commitSha: "commit-sha",
    treeSha: "tree-sha",
    locations: [
      {
        kind: "config",
        convexConfigPath: "convex.json",
        rootDirectory: "/",
        blobSha: "convex-json-sha",
      },
    ],
  });
  providerMocks.listConvexManagementDefaultProductionDeployments.mockResolvedValue([]);
  providerMocks.listConvexManagementProjects.mockResolvedValue([]);
  providerMocks.createProject.mockResolvedValue({
    id: "convex-project",
    projectId: "convex-project",
    slug: "region-app",
    deploymentName: "region-app-prod",
    deploymentUrl: "https://region-app.convex.cloud",
  });
  providerMocks.getProject.mockResolvedValue({
    createTime: 1,
    id: "convex-project",
    name: "region-app",
    slug: "region-app",
    teamId: "convex-team",
    teamSlug: "convex-team",
  });
});

describe("Convex project regions", () => {
  it("sends the planned region on create and reuses the checkpoint on retry", async () => {
    const { runId, t, userId, repositoryId } = await createManagedRegionFixture();

    const firstProjectId = await t.action(
      internal.repository.convex.ensureConvexProjectConnection,
      {
        repositoryId,
        runId,
        userId,
        convexConfigPath: "convex.json",
        projectName: "region-app",
      },
    );

    expect(providerMocks.createProject).toHaveBeenCalledWith({
      client: expect.anything(),
      path: { team_id: "convex-team" },
      body: {
        projectName: "region-app",
        deploymentType: "prod",
        deploymentRegion: "aws-eu-west-1",
      },
    });
    vi.clearAllMocks();
    const retriedProjectId = await t.action(
      internal.repository.convex.ensureConvexProjectConnection,
      {
        repositoryId,
        runId,
        userId,
        convexConfigPath: "convex.json",
        projectName: "region-app",
      },
    );
    expect(retriedProjectId).toBe(firstProjectId);
    expect(providerMocks.listConvexManagementProjects).not.toHaveBeenCalled();
    expect(providerMocks.createProject).not.toHaveBeenCalled();
    expect(providerMocks.getProject).toHaveBeenCalledOnce();
    expect(providerMocks.getProject).toHaveBeenCalledWith({
      client: expect.anything(),
      path: { project_id: "convex-project" },
    });
  });

  it("sends a manual region without changing the organization default", async () => {
    const { organizationId, t, repositoryId, viewer } = await createManualRegionFixture();

    await expect(
      viewer.action(api.repository.convex.createProject, {
        repositoryId,
        projectName: "manual-region-app",
        deploymentRegion: "aws-eu-west-1",
        codeLocation: {
          kind: "config",
          convexConfigPath: "convex.json",
          blobSha: "convex-json-sha",
        },
      }),
    ).resolves.toBeDefined();
    expect(providerMocks.createProject).toHaveBeenCalledWith({
      client: expect.anything(),
      path: { team_id: "convex-team" },
      body: {
        projectName: "manual-region-app",
        deploymentType: "prod",
        deploymentRegion: "aws-eu-west-1",
      },
    });
    await expect(
      t.run(async (ctx) => {
        const organization = await ctx.db.get(organizationId);
        const projects = await ctx.db
          .query("repositoryConvexProjects")
          .withIndex("by_repository", (query) => query.eq("repositoryId", repositoryId))
          .collect();
        return {
          defaultDeploymentRegion: organization?.defaultConvexDeploymentRegion,
          projects,
        };
      }),
    ).resolves.toMatchObject({
      defaultDeploymentRegion: "aws-us-east-1",
      projects: [
        {
          teamId: "convex-team",
          projectId: "convex-project",
          convexConfigPath: "convex.json",
          origin: "provisioned",
        },
      ],
    });
  });

  it("returns a public name conflict when the provider create loses a race", async () => {
    const { t, repositoryId, viewer } = await createManualRegionFixture();
    providerMocks.listConvexManagementProjects.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        createTime: 1,
        id: "racing-project",
        name: "race-app",
        slug: "race-app",
        teamId: "convex-team",
        teamSlug: "convex-team",
      },
    ]);
    providerMocks.createProject.mockRejectedValue(
      new ConvexManagementApiError({
        status: 409,
        path: "/teams/{team_id}/create_project",
        responseBodySummary: "Raw Convex request 123 failed.",
      }),
    );

    await expect(
      viewer.action(api.repository.convex.createProject, {
        repositoryId,
        projectName: "race-app",
        deploymentRegion: "aws-us-east-1",
        codeLocation: {
          kind: "config",
          convexConfigPath: "convex.json",
          blobSha: "convex-json-sha",
        },
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "A Convex project named race-app already exists.",
    });
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("repositoryConvexProjects")
            .withIndex("by_repository", (query) => query.eq("repositoryId", repositoryId))
            .collect(),
      ),
    ).resolves.toEqual([]);
  });

  it("joins each discovered project to its production deployment region", async () => {
    const { repositoryId, viewer } = await createManualRegionFixture();
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      {
        createTime: 1,
        id: "convex-project",
        name: "Manual region app",
        slug: "manual-region-app",
        teamId: "convex-team",
        teamSlug: "manual-region-owner",
      },
    ]);
    providerMocks.listConvexManagementDefaultProductionDeployments.mockResolvedValue([
      {
        class: "s16",
        createTime: 1,
        creator: "convex-member",
        deploymentType: "prod",
        deploymentUrl: "https://manual-region-app.convex.cloud",
        id: "convex-deployment",
        isDefault: true,
        kind: "cloud",
        name: "manual-region-app-prod",
        projectId: "convex-project",
        reference: "prod",
        region: "aws-eu-west-1",
      },
    ]);

    await expect(
      viewer.action(api.repository.convex.findProjects, { repositoryId }),
    ).resolves.toMatchObject({
      projects: [
        {
          projectId: "convex-project",
          productionDeployment: { state: "available", region: "aws-eu-west-1" },
        },
      ],
    });
  });

  it("marks the projects that this app or another Samebase app records", async () => {
    const { t, organizationId, repositoryId, viewer } = await createManualRegionFixture();
    const otherRepositoryId = await t.run(async (ctx) => {
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId,
        organizationId,
        teamId: "convex-team",
        projectId: "attached-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      const otherRepositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 2,
        state: "not_connected",
      });
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: otherRepositoryId,
        organizationId,
        teamId: "convex-team",
        projectId: "other-app-project",
        convexConfigPath: "convex.json",
        origin: "provisioned",
      });
      return otherRepositoryId;
    });
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      {
        createTime: 1,
        id: "attached-project",
        name: "Attached app",
        slug: "attached-app",
        teamId: "convex-team",
        teamSlug: "manual-region-owner",
      },
      {
        createTime: 2,
        id: "free-project",
        name: "Free app",
        slug: "free-app",
        teamId: "convex-team",
        teamSlug: "manual-region-owner",
      },
      {
        createTime: 3,
        id: "other-app-project",
        name: "Other app",
        slug: "other-app",
        teamId: "convex-team",
        teamSlug: "manual-region-owner",
      },
    ]);

    const discovery = await viewer.action(api.repository.convex.findProjects, {
      repositoryId,
    });

    expect(discovery.projects.map((project) => [project.projectId, project.attachment])).toEqual([
      ["attached-project", "attached"],
      ["free-project", "attachable"],
      ["other-app-project", "attached_elsewhere"],
    ]);
    expect(JSON.stringify(discovery)).not.toContain(otherRepositoryId);
  });
});
