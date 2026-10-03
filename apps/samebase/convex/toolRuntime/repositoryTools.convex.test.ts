import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const providerMocks = vi.hoisted(() => ({
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
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";

const convexTeamProject = (id: string, name: string) => ({
  createTime: 1,
  id,
  name,
  slug: name,
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
        auth: { method: "api_key", credential: "convex-token" },
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
  return {
    ...ids,
    t,
    viewer: t.withIdentity({
      subject: `${ids.userId}|test-session`,
      tokenIdentifier: `test:${ids.userId}`,
    }),
  };
}

async function readAttachments(fixture: Awaited<ReturnType<typeof createScoutFixture>>) {
  return await fixture.t.run(async (ctx) => ({
    workers: await ctx.db
      .query("repositoryCloudflareWorkers")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.repositoryId))
      .collect(),
    projects: await ctx.db
      .query("repositoryConvexProjects")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.repositoryId))
      .collect(),
    writeLock: await ctx.db
      .query("workflow_repositoryProvisioning_writeLocks")
      .withIndex("by_repository", (q) => q.eq("repositoryId", fixture.repositoryId))
      .unique(),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
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
  providerMocks.requestConvexManagementApiOrThrow.mockImplementation(
    async (
      _token: string,
      method: string,
      path: string,
      init: { params: { path: { project_id?: string } } },
    ) => {
      if (method === "POST" && path === "/teams/{team_id}/create_project") {
        return { id: "created-project", projectId: "created-project" };
      }
      if (method === "GET" && path === "/projects/{project_id}") {
        const projectId = init.params.path.project_id ?? "missing";
        return convexTeamProject(projectId, projectId === "free-project" ? "free-app" : projectId);
      }
      throw new Error(`Unexpected Convex request: ${method} ${path}`);
    },
  );
});

describe("repository_detachResource", () => {
  it("detaches only the requested kind when a Worker and a Convex project share a name", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryDetachResourceTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "Scout-Owner/Scout",
        kind: "cloudflare_worker",
        resourceName: "scout",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Removed the Cloudflare Worker scout from scout-owner/scout in Samebase. It keeps running in its provider account.",
      structuredContent: { kind: "cloudflare_worker", resourceName: "scout" },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      workers: [],
      projects: [{ projectId: "scout-project" }],
    });

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryDetachResourceTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: fixture.repositoryId,
        kind: "convex_project",
        resourceName: "scout",
      }),
    ).resolves.toMatchObject({
      status: "ok",
      structuredContent: { kind: "convex_project", resourceName: "scout" },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ workers: [], projects: [] });
  });

  it("names the attached resources when the name matches none", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.repositoryDetachResourceTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        kind: "convex_project",
        resourceName: "free-app",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "No attached Convex project of scout-owner/scout is named free-app. Attached Convex projects: scout (convex.json).",
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      workers: [{ workerName: "scout" }],
      projects: [{ projectId: "scout-project" }],
    });
  });

  it("detaches one attachment by ID from the dashboard without a provider call", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.viewer.mutation(api.repository.detachResource, {
        repositoryId: fixture.repositoryId,
        resource: { kind: "convex_project", convexProjectId: fixture.convexProjectId },
      }),
    ).resolves.toBeNull();

    await expect(readAttachments(fixture)).resolves.toMatchObject({
      workers: [{ workerName: "scout" }],
      projects: [],
    });
    expect(providerMocks.listConvexManagementProjects).not.toHaveBeenCalled();
  });
});

describe("repository_list", () => {
  it("names each attached Convex project with its live Convex name", async () => {
    const fixture = await createScoutFixture();

    const result = await fixture.t.action(internal.toolRuntime.runtime.repositoryListTool, {
      userId: fixture.userId,
      grantedScopes: ["access_dashboard"],
    });

    expect(result).toMatchObject({
      status: "ok",
      structuredContent: {
        repositories: [
          {
            repositoryId: fixture.repositoryId,
            githubRepositoryFullName: "scout-owner/scout",
            cloudflareWorkers: [{ workerName: "scout", rootDirectory: "/" }],
            convexProjects: [{ projectName: "scout", codeLocation: "convex.json" }],
          },
        ],
      },
    });
  });
});

describe("Convex project selection for deploy keys", () => {
  async function addAdminProject(fixture: Awaited<ReturnType<typeof createScoutFixture>>) {
    providerMocks.listConvexManagementProjects.mockResolvedValue([
      convexTeamProject("scout-project", "scout"),
      convexTeamProject("admin-project", "admin"),
    ]);
    return await fixture.t.run(
      async (ctx) =>
        await ctx.db.insert("repositoryConvexProjects", {
          repositoryId: fixture.repositoryId,
          organizationId: fixture.organizationId,
          teamId: "convex-team",
          projectId: "admin-project",
          convexConfigPath: "apps/admin/convex.json",
          origin: "selected_existing",
        }),
    );
  }

  it("fails deploy-key rotation closed when several Convex projects are attached and none is named", async () => {
    const fixture = await createScoutFixture();
    await addAdminProject(fixture);

    const result = await fixture.t.action(
      internal.toolRuntime.runtime.cloudflareRotateConvexDeployKeysTool,
      {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        workerName: "scout",
      },
    );

    expect(result).toMatchObject({
      status: "error",
      text: expect.stringMatching(
        /^scout-owner\/scout has several attached Convex projects: .*admin \(apps\/admin\/convex\.json\).*scout \(convex\.json\).*pass its name as convexProjectName\.$/,
      ),
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ writeLock: null });
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });

  it("fails a dashboard Worker create closed when several Convex projects are attached and none is chosen", async () => {
    const fixture = await createScoutFixture();
    await addAdminProject(fixture);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      fixture.viewer.action(api.repository.cloudflare.createWorker, {
        repositoryId: fixture.repositoryId,
        workerName: "scout-site",
        rootDirectory: "/",
        buildTokenUuid: "build-token",
      }),
    ).rejects.toMatchObject({
      name: "ConvexError",
      data: "Several Convex projects are attached to this repository (apps/admin/convex.json, convex.json). Choose the Convex project whose deploy key the Worker gets.",
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({ writeLock: null });
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("repository_convex tools", () => {
  it("attaches an attachable project by name at the only code location", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexAttachProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        projectName: "free-app",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Attached Convex project free-app to scout-owner/scout at convex.json.",
      structuredContent: { projectName: "free-app", codeLocation: "convex.json" },
    });
    await expect(readAttachments(fixture)).resolves.toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ projectId: "free-project", convexConfigPath: "convex.json" }),
      ]),
    });
  });

  it("says that a project is already attached instead of attaching it again", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexAttachProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        projectName: "scout",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Convex project scout is already attached to scout-owner/scout.",
    });
  });

  it("creates a project in the organization default region at the only code location", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexCreateProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        projectName: "scout-api",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Created Convex project scout-api in aws-eu-west-1 and attached it to scout-owner/scout at convex.json.",
      structuredContent: {
        projectName: "scout-api",
        codeLocation: "convex.json",
        deploymentRegion: "aws-eu-west-1",
      },
    });
    expect(providerMocks.requestConvexManagementApiOrThrow).toHaveBeenCalledWith(
      "convex-token",
      "POST",
      "/teams/{team_id}/create_project",
      {
        params: { path: { team_id: "convex-team" } },
        body: {
          projectName: "scout-api",
          deploymentType: "prod",
          deploymentRegion: "aws-eu-west-1",
        },
      },
    );
  });

  it("lists the code locations instead of guessing when there are several", async () => {
    const fixture = await createScoutFixture();
    githubMocks.fetchGitHubConvexCodeLocationDiscovery.mockResolvedValue({
      completeness: "complete",
      defaultBranch: "main",
      commitSha: "commit-sha",
      treeSha: "tree-sha",
      locations: [configLocation("convex.json"), configLocation("apps/admin/convex.json")],
    });

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.convexCreateProjectTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        projectName: "scout-api",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "scout-owner/scout has several Convex code locations: convex.json, apps/admin/convex.json. Ask the user which one to use, then pass it as codeLocation.",
    });
    expect(providerMocks.requestConvexManagementApiOrThrow).not.toHaveBeenCalled();
  });
});

describe("repository_cloudflare_configureBuilds", () => {
  it("keeps the recorded root directory instead of rewriting it", async () => {
    const fixture = await createScoutFixture();

    await expect(
      fixture.t.action(internal.toolRuntime.runtime.cloudflareConfigureBuildsTool, {
        userId: fixture.userId,
        grantedScopes: ["access_provider_connections"],
        repository: "scout-owner/scout",
        workerName: "scout",
        rootDirectory: "apps/site",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Worker scout is recorded at root directory /. Omit rootDirectory, or change the recorded root in the Samebase dashboard.",
    });
  });
});
