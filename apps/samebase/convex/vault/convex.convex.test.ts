import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const octokitMocks = vi.hoisted(() => ({
  getRepository: vi.fn(),
  getRef: vi.fn(),
  getCommit: vi.fn(),
  getTree: vi.fn(),
  getBlob: vi.fn(),
}));

vi.mock("@octokit/rest", () => ({
  Octokit: class {
    readonly rest = {
      repos: { get: octokitMocks.getRepository },
      git: {
        getRef: octokitMocks.getRef,
        getCommit: octokitMocks.getCommit,
        getTree: octokitMocks.getTree,
        getBlob: octokitMocks.getBlob,
      },
    };
  },
}));

import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { makeConvexTest } from "../test.setup";

type GitHubConfigFixture = {
  path: string;
  sha: string;
};

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function setGitHubConfigs(configs: GitHubConfigFixture[], truncated = false): void {
  octokitMocks.getTree.mockResolvedValue({
    data: {
      truncated,
      tree: configs.map((config) => ({
        type: "blob",
        mode: "100644",
        path: config.path,
        sha: config.sha,
      })),
    },
  });
}

function convexProjectResponse(projectId: string, teamId: string): Response {
  return jsonResponse({
    createTime: 1_710_000_000_000,
    id: Number(projectId),
    name: `Project ${projectId}`,
    slug: `project-${projectId}`,
    teamId: Number(teamId),
    teamSlug: `team-${teamId}`,
  });
}

async function createConnectedVault(teamId = "1000") {
  const t = makeConvexTest();
  const { userId, vaultId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
    });
    await Promise.all([
      ctx.db.insert("providerConnections", {
        kind: "convex",
        userId,
        auth: { method: "oauth", credential: "convex-token" },
        teamId,
        teamSlug: `team-${teamId}`,
        createdAt: 1,
        updatedAt: 1,
      }),
      ctx.db.insert("providerConnections", {
        kind: "github",
        userId,
        auth: { method: "api_key", credential: "github-token" },
        username: "ada",
        createdAt: 1,
        updatedAt: 1,
      }),
    ]);
    const vaultId = await ctx.db.insert("vaults", {
      userId,
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId,
      vaultId,
      repositoryFullName: "ada/demo",
      trigger: "connect_existing_repository",
      state: "succeeded",
      currentStep: "finish",
      createdAt: 2,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(vaultId, {
      userId,
      deletion: { state: "not_deleting" },
      state: "connected",
      githubMode: "connect_existing_repository",
      runId,
      ghRepoId: "123",
      owner: "ada",
      name: "demo",
      visibility: "private",
      defaultBranch: "stale-main",
      connectedAt: 2,
    });
    return { userId, vaultId };
  });
  return {
    asUser: t.withIdentity({
      subject: `${userId}|test-session`,
      tokenIdentifier: `test:${userId}`,
    }),
    t,
    userId,
    vaultId,
  };
}

async function seedConvexProjectsAtFreeLimit(
  t: ReturnType<typeof makeConvexTest>,
  args: { userId: Id<"users">; vaultId: Id<"vaults"> },
): Promise<void> {
  await t.run(async (ctx) => {
    for (let index = 0; index < 5; index += 1) {
      await ctx.db.insert("vaultConvexProjects", {
        ...args,
        teamId: "existing-team",
        projectId: `existing-project-${index}`,
        convexConfigPath: `apps/existing-${index}/convex.json`,
        origin: "selected_existing",
      });
    }
  });
}

async function createManagedProjectCreatingFixture() {
  const fixture = await createConnectedVault();
  const runId = await fixture.t.run(async (ctx) => {
    const runId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
      userId: fixture.userId,
      vaultId: fixture.vaultId,
      repositoryFullName: "ada/demo",
      trigger: "retry",
      state: "running",
      currentStep: "attach_convex",
      createdAt: 3,
      updatedAt: 3,
    });
    await ctx.db.insert("workflow_vaultProvisioning_writeLocks", {
      vaultId: fixture.vaultId,
      owner: { kind: "managed_run", runId },
      state: "active",
      lastWriteAt: {},
      updatedAt: 3,
    });
    await ctx.db.insert("workflow_vaultProvisioning_plans", {
      vaultId: fixture.vaultId,
      userId: fixture.userId,
      convexConfigPath: "convex.json",
      convex: {
        state: "planned",
        projectName: "managed-project",
        teamId: "1000",
      },
      cloudflare: {
        state: "planned",
        accountId: "cloudflare-account",
        workerName: "managed-worker",
        rootDirectory: "/",
      },
      createdAt: 3,
      updatedAt: 3,
    });
    return runId;
  });
  await fixture.t.mutation(internal.vault.convexMutations.beginManagedProjectCreate, {
    vaultId: fixture.vaultId,
    runId,
    userId: fixture.userId,
    projectName: "managed-project",
    teamId: "1000",
  });
  return { ...fixture, runId };
}

describe("vault Convex project attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    octokitMocks.getRepository.mockResolvedValue({
      data: { id: 123, default_branch: "trunk", owner: { id: 456 } },
    });
    octokitMocks.getRef.mockResolvedValue({ data: { object: { sha: "commit-sha" } } });
    octokitMocks.getCommit.mockResolvedValue({ data: { tree: { sha: "tree-sha" } } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("re-verifies and atomically attaches several project and config selections", async () => {
    setGitHubConfigs([
      { path: "convex.json", sha: "root-sha" },
      { path: "apps/web/convex.json", sha: "web-sha" },
    ]);
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.endsWith("/projects/1001")) {
        return convexProjectResponse("1001", "1000");
      }
      if (input.url.endsWith("/projects/1002")) {
        return convexProjectResponse("1002", "1000");
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, vaultId } = await createConnectedVault();

    const convexProjectIds = await asUser.action(api.vault.convex.attachProjects, {
      vaultId,
      projects: [
        {
          projectId: "1001",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "root-sha",
          },
        },
        {
          projectId: "1002",
          codeLocation: {
            kind: "config",
            convexConfigPath: "apps/web/convex.json",
            blobSha: "web-sha",
          },
        },
      ],
    });

    expect(convexProjectIds).toHaveLength(2);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("vaultConvexProjects")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .collect(),
      ),
    ).resolves.toMatchObject([
      {
        teamId: "1000",
        projectId: "1001",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      },
      {
        teamId: "1000",
        projectId: "1002",
        convexConfigPath: "apps/web/convex.json",
        origin: "selected_existing",
      },
    ]);
    expect(octokitMocks.getBlob).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("attaches the default Convex directory using repository metadata only", async () => {
    octokitMocks.getTree.mockResolvedValue({
      data: {
        truncated: false,
        tree: [
          {
            type: "blob",
            mode: "100644",
            path: "package.json",
            sha: "package-sha",
          },
          {
            type: "tree",
            mode: "040000",
            path: "convex",
            sha: "convex-tree-sha",
          },
        ],
      },
    });
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.endsWith("/projects/1001")) {
        return convexProjectResponse("1001", "1000");
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, vaultId } = await createConnectedVault();

    const [convexProjectId] = await asUser.action(api.vault.convex.attachProjects, {
      vaultId,
      projects: [
        {
          projectId: "1001",
          codeLocation: {
            kind: "directory",
            convexDirectoryPath: "convex",
            convexDirectoryTreeSha: "convex-tree-sha",
            packageJsonBlobSha: "package-sha",
          },
        },
      ],
    });

    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      teamId: "1000",
      projectId: "1001",
      convexDirectoryPath: "convex",
      origin: "selected_existing",
    });
    expect(octokitMocks.getBlob).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("records a newly created project before refreshing provider metadata", async () => {
    setGitHubConfigs([{ path: "convex.json", sha: "root-sha" }]);
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.includes("/teams/1000/projects?limit=100")) {
        return jsonResponse({ items: [], pagination: { hasMore: false } });
      }
      if (input.url.endsWith("/teams/1000/create_project")) {
        return jsonResponse({ id: 1003, projectId: 1003, slug: "new-project" });
      }
      if (input.url.endsWith("/projects/1003")) {
        return new Response("metadata unavailable", { status: 503 });
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const metadataWarning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { asUser, t, vaultId } = await createConnectedVault();

    const convexProjectId = await asUser.action(api.vault.convex.createProject, {
      vaultId,
      projectName: "new-project",
      codeLocation: {
        kind: "config",
        convexConfigPath: "convex.json",
        blobSha: "root-sha",
      },
    });

    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      teamId: "1000",
      projectId: "1003",
      convexConfigPath: "convex.json",
      origin: "provisioned",
    });
    expect(metadataWarning).toHaveBeenCalledWith(
      "vault:convex:create_project:metadata_refresh_failed",
      expect.objectContaining({ convexProjectId, vaultId }),
    );
  });

  it("blocks a manual Convex create before the provider write at the free limit", async () => {
    setGitHubConfigs([{ path: "convex.json", sha: "root-sha" }]);
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.includes("/teams/1000/projects?limit=100")) {
        return jsonResponse({ items: [], pagination: { hasMore: false } });
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, userId, vaultId } = await createConnectedVault();
    await seedConvexProjectsAtFreeLimit(t, { userId, vaultId });

    await expect(
      asUser.action(api.vault.convex.createProject, {
        vaultId,
        projectName: "new-project",
        codeLocation: {
          kind: "config",
          convexConfigPath: "convex.json",
          blobSha: "root-sha",
        },
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");

    expect(fetchMock.mock.calls.some(([input]) => input.method === "POST")).toBe(false);
  });

  it("blocks a managed Convex create before the provider write at the free limit", async () => {
    const { runId, t, userId, vaultId } = await createManagedProjectCreatingFixture();
    await seedConvexProjectsAtFreeLimit(t, { userId, vaultId });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.convex.ensureConvexProjectConnection, {
        vaultId,
        runId,
        userId,
        convexConfigPath: "convex.json",
        projectName: "managed-project",
      }),
    ).rejects.toThrow("Convex project attachment limit reached (5).");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the manual deadline immediately before the Convex create request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    octokitMocks.getTree.mockImplementationOnce(async () => {
      vi.setSystemTime(1_000 + 5 * 60 * 1_000);
      return {
        data: {
          truncated: false,
          tree: [
            {
              type: "blob",
              mode: "100644",
              path: "convex.json",
              sha: "root-sha",
            },
          ],
        },
      };
    });
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.includes("/teams/1000/projects?limit=100")) {
        return jsonResponse({ items: [], pagination: { hasMore: false } });
      }
      if (input.url.endsWith("/teams/1000/create_project")) {
        return jsonResponse({ id: 1003, projectId: 1003, slug: "new-project" });
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, vaultId } = await createConnectedVault();
    try {
      await expect(
        asUser.action(api.vault.convex.createProject, {
          vaultId,
          projectName: "new-project",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "root-sha",
          },
        }),
      ).rejects.toThrow("Manual provider action time limit expired.");
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock.mock.calls.some(([input]) => input.method === "POST")).toBe(false);
    await expect(
      t.run(
        async (ctx) =>
          await ctx.db
            .query("workflow_vaultProvisioning_writeLocks")
            .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
            .unique(),
      ),
    ).resolves.toMatchObject({
      state: "failed",
      lastWriteAt: { convex: expect.any(Number) },
    });
  });

  it("reports that a project can exist when its local checkpoint expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    setGitHubConfigs([{ path: "convex.json", sha: "root-sha" }]);
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.includes("/teams/1000/projects?limit=100")) {
        return jsonResponse({ items: [], pagination: { hasMore: false } });
      }
      if (input.url.endsWith("/teams/1000/create_project")) {
        vi.setSystemTime(1_000 + 10 * 60 * 1_000);
        return jsonResponse({ id: 1003, projectId: 1003, slug: "new-project" });
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const failureRecordWarning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { asUser, t, userId, vaultId } = await createConnectedVault();
    try {
      await expect(
        asUser.action(api.vault.convex.createProject, {
          vaultId,
          projectName: "new-project",
          codeLocation: {
            kind: "config",
            convexConfigPath: "convex.json",
            blobSha: "root-sha",
          },
        }),
      ).rejects.toThrow(
        "The Convex project new-project can exist, but Samebase could not attach it.",
      );
    } finally {
      vi.useRealTimers();
    }

    expect(fetchMock.mock.calls.filter(([input]) => input.method === "POST")).toHaveLength(1);
    expect(failureRecordWarning).toHaveBeenCalledWith(
      "vault:manual_provider_write:failure_record_failed",
      expect.objectContaining({
        actionId: expect.any(String),
        message: "Manual provider action state changed before result was recorded.",
        vaultId,
      }),
    );
    await expect(
      t.run(async (ctx) => {
        const projects = await ctx.db
          .query("vaultConvexProjects")
          .withIndex("by_vault", (q) => q.eq("vaultId", vaultId))
          .collect();
        const reservations = await ctx.db
          .query("billingResourceReservations")
          .withIndex("by_userId_and_kind_and_expiresAt", (q) =>
            q.eq("userId", userId).eq("kind", "convex_project"),
          )
          .collect();
        return { projects, reservations };
      }),
    ).resolves.toEqual({
      projects: [],
      reservations: [
        expect.objectContaining({
          kind: "convex_project",
          state: "provider_created",
          userId,
        }),
      ],
    });
  });

  it("requires dashboard deletion when an interrupted managed create left a project", async () => {
    const { runId, t, userId, vaultId } = await createManagedProjectCreatingFixture();
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.includes("/teams/1000/projects?limit=100")) {
        return jsonResponse({
          items: [
            {
              createTime: 1_710_000_000_000,
              id: 1003,
              name: "managed-project",
              slug: "managed-project",
              teamId: 1000,
              teamSlug: "team-1000",
            },
          ],
          pagination: { hasMore: false },
        });
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      t.action(internal.vault.convex.ensureConvexProjectConnection, {
        vaultId,
        runId,
        userId,
        convexConfigPath: "convex.json",
        projectName: "managed-project",
      }),
    ).rejects.toThrow("Delete it in the Convex dashboard, then retry.");
    expect(fetchMock.mock.calls.some(([input]) => input.method === "POST")).toBe(false);
    await expect(
      t.run(async (ctx) => await ctx.db.query("vaultConvexProjects").collect()),
    ).resolves.toEqual([]);
  });

  it("retries an interrupted managed create after the project was deleted", async () => {
    const { runId, t, userId, vaultId } = await createManagedProjectCreatingFixture();
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.includes("/teams/1000/projects?limit=100")) {
        return jsonResponse({ items: [], pagination: { hasMore: false } });
      }
      if (input.url.endsWith("/teams/1000/create_project")) {
        return jsonResponse({ id: 1003, projectId: 1003, slug: "managed-project" });
      }
      if (input.url.endsWith("/projects/1003")) {
        return convexProjectResponse("1003", "1000");
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const convexProjectId = await t.action(internal.vault.convex.ensureConvexProjectConnection, {
      vaultId,
      runId,
      userId,
      convexConfigPath: "convex.json",
      projectName: "managed-project",
    });

    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      vaultId,
      userId,
      teamId: "1000",
      projectId: "1003",
      convexConfigPath: "convex.json",
      origin: "provisioned",
    });
    expect(fetchMock.mock.calls.filter(([input]) => input.method === "POST")).toHaveLength(1);
  });

  it("rejects the whole selection when the selected GitHub blob changed", async () => {
    setGitHubConfigs([{ path: "convex.json", sha: "current-sha" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, vaultId } = await createConnectedVault();

    await expect(
      asUser.action(api.vault.convex.attachProjects, {
        vaultId,
        projects: [
          {
            projectId: "1001",
            codeLocation: {
              kind: "config",
              convexConfigPath: "convex.json",
              blobSha: "discovered-sha",
            },
          },
        ],
      }),
    ).rejects.toThrow("GitHub no longer has the selected Convex code location");
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(
      t.run(async (ctx) => await ctx.db.query("vaultConvexProjects").collect()),
    ).resolves.toEqual([]);
  });

  it("rejects the whole selection when a project is no longer under the connected team", async () => {
    setGitHubConfigs([{ path: "convex.json", sha: "root-sha" }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.endsWith("/projects/1001")) {
          return convexProjectResponse("1001", "1000");
        }
        if (input.url.endsWith("/projects/1002")) {
          return convexProjectResponse("1002", "2000");
        }
        throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
      }),
    );
    const { asUser, t, vaultId } = await createConnectedVault();

    await expect(
      asUser.action(api.vault.convex.attachProjects, {
        vaultId,
        projects: [
          {
            projectId: "1001",
            codeLocation: {
              kind: "config",
              convexConfigPath: "convex.json",
              blobSha: "root-sha",
            },
          },
          {
            projectId: "1002",
            codeLocation: {
              kind: "config",
              convexConfigPath: "convex.json",
              blobSha: "root-sha",
            },
          },
        ],
      }),
    ).rejects.toThrow("Convex project is not available under the connected team");
    await expect(
      t.run(async (ctx) => await ctx.db.query("vaultConvexProjects").collect()),
    ).resolves.toEqual([]);
  });

  it("changes only the config path after re-reading its exact GitHub tree metadata", async () => {
    setGitHubConfigs([{ path: "apps/web/convex.json", sha: "web-sha" }]);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, userId, vaultId } = await createConnectedVault();
    const [convexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId,
      userId,
      projects: [
        {
          teamId: "1000",
          projectId: "1001",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });
    if (!convexProjectId) {
      throw new Error("Expected a project attachment.");
    }

    await asUser.action(api.vault.convex.changeProjectCodeLocation, {
      vaultId,
      convexProjectId,
      codeLocation: {
        kind: "config",
        convexConfigPath: "apps/web/convex.json",
        blobSha: "web-sha",
      },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      teamId: "1000",
      projectId: "1001",
      convexConfigPath: "apps/web/convex.json",
      origin: "selected_existing",
    });
  });

  it("preserves project identity while explicitly reconciling a team transfer", async () => {
    const fetchMock = vi.fn(async (input: Request) => {
      if (input.url.endsWith("/projects/1001")) {
        return convexProjectResponse("1001", "2000");
      }
      throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, userId, vaultId } = await createConnectedVault("2000");
    const [convexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId,
      userId,
      projects: [
        {
          teamId: "1000",
          projectId: "1001",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });
    if (!convexProjectId) {
      throw new Error("Expected a project attachment.");
    }

    await asUser.action(api.vault.convex.reconcileProjectTeam, { vaultId, convexProjectId });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      teamId: "2000",
      projectId: "1001",
      convexConfigPath: "convex.json",
    });
  });

  it("reports a 404 as ambiguous and keeps the attachment", async () => {
    setGitHubConfigs([{ path: "convex.json", sha: "root-sha" }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: Request) => {
        if (input.url.endsWith("/projects/1001")) {
          return new Response("missing", { status: 404 });
        }
        throw new Error(`Unexpected Convex request: ${input.method} ${input.url}`);
      }),
    );
    const { asUser, t, userId, vaultId } = await createConnectedVault();
    const [convexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId,
      userId,
      projects: [
        {
          teamId: "1000",
          projectId: "1001",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });
    if (!convexProjectId) {
      throw new Error("Expected a project attachment.");
    }

    const [observation] = await asUser.action(
      api.vault.providerObservations.observeConvexProjects,
      { vaultId },
    );

    expect(observation).toMatchObject({
      convexProjectId,
      projectId: "1001",
      codeLocation: { kind: "config", convexConfigPath: "convex.json" },
      source: { state: "valid", kind: "config" },
      provider: { state: "missing_ambiguous" },
    });
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toMatchObject({
      teamId: "1000",
      projectId: "1001",
    });
  });

  it("detaches explicitly without reading Convex or GitHub", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { asUser, t, userId, vaultId } = await createConnectedVault();
    const [convexProjectId] = await t.mutation(internal.vault.convexMutations.attachProjects, {
      vaultId,
      userId,
      projects: [
        {
          teamId: "1000",
          projectId: "1001",
          codeLocation: { kind: "config", convexConfigPath: "convex.json" },
          origin: "selected_existing",
        },
      ],
    });
    if (!convexProjectId) {
      throw new Error("Expected a project attachment.");
    }

    await asUser.action(api.vault.convex.detachProject, { vaultId, convexProjectId });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(octokitMocks.getRepository).not.toHaveBeenCalled();
    await expect(t.run(async (ctx) => await ctx.db.get(convexProjectId))).resolves.toBeNull();
  });
});
