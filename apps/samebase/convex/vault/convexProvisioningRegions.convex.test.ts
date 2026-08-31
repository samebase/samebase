import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
  listConvexManagementDefaultProductionDeployments: vi.fn(),
  listConvexManagementProjects: vi.fn(),
  requestConvexManagementApiOrThrow: vi.fn(),
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
    requestConvexManagementApiOrThrow: providerMocks.requestConvexManagementApiOrThrow,
  };
});

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
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

async function createRegionOrganization(t: ReturnType<typeof makeConvexTest>) {
  return await t.run(async (ctx) => {
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
        auth: { method: "api_key", credential: "convex-token" },
        connectedByUserId: userId,
        updatedAt: 1,
      },
    });
    return { organizationId, userId };
  });
}

async function createManagedRegionFixture() {
  const t = makeConvexTest();
  const { organizationId, userId } = await createRegionOrganization(t);
  const ids = await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "region-owner/region-app",
      trigger: "create",
      state: "running",
      currentStep: "attach_convex",
      createdAt: 1,
      updatedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "create_repository",
      runId,
      ghRepoId: "github-repository",
      name: "region-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 1,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId,
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
    return { runId, userId, vaultId };
  });
  return { ...ids, t };
}

async function createManualRegionFixture() {
  const t = makeConvexTest();
  const { organizationId, userId } = await createRegionOrganization(t);
  const ids = await t.run(async (ctx) => {
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      organizationId,
      userId,
      vaultId,
      repositoryFullName: "region-owner/manual-region-app",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    });
    await ctx.db.replace(vaultId, {
      organizationId,
      convexTeamId: "convex-team",
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "github-repository",
      name: "manual-region-app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    return { organizationId, userId, vaultId };
  });
  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: `${ids.userId}|test-session`,
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
  providerMocks.requestConvexManagementApiOrThrow.mockImplementation(
    async (_token: string, method: string, path: string) => {
      if (method === "POST" && path === "/teams/{team_id}/create_project") {
        return {
          id: "convex-project",
          projectId: "convex-project",
          slug: "region-app",
          deploymentName: "region-app-prod",
          deploymentUrl: "https://region-app.convex.cloud",
        };
      }
      if (method === "GET" && path === "/projects/{project_id}") {
        return {
          createTime: 1,
          id: "convex-project",
          name: "region-app",
          slug: "region-app",
          teamId: "convex-team",
          teamSlug: "convex-team",
        };
      }
      throw new Error(`Unexpected Convex request: ${method} ${path}`);
    },
  );
});

describe("Convex project regions", () => {
  it("sends the planned region on create and reuses the checkpoint on retry", async () => {
    const { runId, t, userId, vaultId } = await createManagedRegionFixture();

    const firstProjectId = await t.action(internal.vault.convex.ensureConvexProjectConnection, {
      vaultId,
      runId,
      userId,
      convexConfigPath: "convex.json",
      projectName: "region-app",
    });

    expect(providerMocks.requestConvexManagementApiOrThrow).toHaveBeenCalledWith(
      "convex-token",
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: "convex-team" } },
        body: {
          projectName: "region-app",
          deploymentType: "prod",
          deploymentRegion: "aws-eu-west-1",
        },
      },
    );
    vi.clearAllMocks();
    const retriedProjectId = await t.action(internal.vault.convex.ensureConvexProjectConnection, {
      vaultId,
      runId,
      userId,
      convexConfigPath: "convex.json",
      projectName: "region-app",
    });
    expect(retriedProjectId).toBe(firstProjectId);
    expect(providerMocks.listConvexManagementProjects).not.toHaveBeenCalled();
    expect(providerMocks.requestConvexManagementApiOrThrow).toHaveBeenCalledOnce();
    expect(providerMocks.requestConvexManagementApiOrThrow).toHaveBeenCalledWith(
      "convex-token",
      "GET",
      "/projects/{project_id}",
      { params: { path: { project_id: "convex-project" } } },
    );
  });

  it("sends a manual region without changing the organization default", async () => {
    const { organizationId, t, vaultId, viewer } = await createManualRegionFixture();

    await expect(
      viewer.action(api.vault.convex.createProject, {
        vaultId,
        projectName: "manual-region-app",
        deploymentRegion: "aws-eu-west-1",
        codeLocation: {
          kind: "config",
          convexConfigPath: "convex.json",
          blobSha: "convex-json-sha",
        },
      }),
    ).resolves.toBeDefined();
    expect(providerMocks.requestConvexManagementApiOrThrow).toHaveBeenCalledWith(
      "convex-token",
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: "convex-team" } },
        body: {
          projectName: "manual-region-app",
          deploymentType: "prod",
          deploymentRegion: "aws-eu-west-1",
        },
      },
    );
    await expect(
      t.run(async (ctx) => {
        const organization = await ctx.db.get(organizationId);
        const projects = await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
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
    const { t, vaultId, viewer } = await createManualRegionFixture();
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
    providerMocks.requestConvexManagementApiOrThrow.mockImplementation(
      async (_token: string, method: string, path: string) => {
        if (method === "POST" && path === "/teams/{team_id}/create_project") {
          throw new ConvexManagementApiError({
            status: 409,
            path,
            responseBodySummary: "Raw Convex request 123 failed.",
          });
        }
        throw new Error(`Unexpected Convex request: ${method} ${path}`);
      },
    );

    await expect(
      viewer.action(api.vault.convex.createProject, {
        vaultId,
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
            .query("vaultConvexProjects")
            .withIndex("by_vault", (query) => query.eq("vaultId", vaultId))
            .collect(),
      ),
    ).resolves.toEqual([]);
  });

  it("joins each discovered project to its production deployment region", async () => {
    const { vaultId, viewer } = await createManualRegionFixture();
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
      viewer.action(api.vault.convex.discoverProjects, { vaultId }),
    ).resolves.toMatchObject({
      projects: [
        {
          projectId: "convex-project",
          productionDeployment: { state: "available", region: "aws-eu-west-1" },
        },
      ],
    });
  });
});
