import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const githubRepos = vi.hoisted(() => ({ delete: vi.fn(), get: vi.fn() }));

vi.mock("../../githubAppAccess", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../githubAppAccess")>();
  return {
    ...actual,
    resolveGitHubAppAccessForRepositoryDeletionRun: async () => ({
      octokit: { rest: { repos: githubRepos } },
    }),
  };
});

import { api } from "../../_generated/api";
import {
  insertTestOrganizationBillingAccount,
  makeConvexTest,
  sealTestCredentials,
  testCredential,
} from "../../test.setup";

const HUB_ISSUER = "https://hub.example.test";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

/**
A Samebase-created repository in an organization with working credentials for both providers. Its
rows are every kind that removal leaves in the user's accounts: `provisioned` rows, an attached row,
and rows on an account or team other than the repository's.
*/
async function seedRepository() {
  vi.stubEnv("HUB_ISSUER", HUB_ISSUER);
  vi.stubEnv("HUB_CLIENT_ID", "samebase-production-client");
  vi.stubEnv("HUB_REGISTRATION_KEY", "hub-registration-key");
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      email: "octocat@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubOwnerId: "65",
      githubOwnerType: "organization",
      githubOwnerLogin: "octo-org",
      githubOwnerLoginNormalized: "octo-org",
      githubInstallationId: "installation-65",
      convexTeam: { teamId: "convex-team" },
      cloudflareAccount: { accountId: "cloudflare-account", accountName: "Cloudflare account" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    await ctx.db.insert("organizationProviderCredentials", {
      organizationId,
      convex: {
        auth: { method: "oauth", credential: testCredential("convex-oauth-token") },
        connectedByUserId: userId,
        updatedAt: 1,
      },
      cloudflare: {
        auth: {
          method: "oauth",
          credential: testCredential("cloudflare-access-token"),
          refreshCredential: testCredential("cloudflare-refresh-token"),
          credentialExpiresAt: 2_000_000_000_000,
        },
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
      githubRepositoryFullName: "octo-org/app",
      trigger: "create",
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
      githubMode: "create_repository",
      runId,
      githubRepositoryDatabaseId: "74",
      githubRepositoryName: "app",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 1,
    });
    const workers = [
      { accountId: "cloudflare-account", workerName: "app", origin: "provisioned" },
      { accountId: "other-account", workerName: "app-moved", origin: "provisioned" },
      { accountId: "cloudflare-account", workerName: "app-attached", origin: "selected_existing" },
    ] as const;
    for (const worker of workers) {
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId,
        organizationId,
        accountId: worker.accountId,
        workerName: worker.workerName,
        workerTag: `${worker.workerName}-tag`,
        rootDirectory: "/",
        origin: worker.origin,
      });
    }
    const projects = [
      { teamId: "convex-team", projectId: "app", origin: "provisioned" },
      { teamId: "other-team", projectId: "app-moved", origin: "provisioned" },
      { teamId: "convex-team", projectId: "app-attached", origin: "selected_existing" },
    ] as const;
    for (const project of projects) {
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId,
        organizationId,
        teamId: project.teamId,
        projectId: project.projectId,
        convexConfigPath: `${project.projectId}/convex.json`,
        origin: project.origin,
      });
    }
    return { organizationId, repositoryId, userId };
  });
  await sealTestCredentials(t);
  return {
    ...ids,
    t,
    viewer: t.withIdentity({ subject: ids.userId, tokenIdentifier: `test:${ids.userId}` }),
  };
}

/** Records every outgoing request, so a provider call cannot pass unseen. */
function recordRequests() {
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(new Request(input, init).url);
      return new Response(null, { status: 204 });
    }),
  );
  return requests;
}

async function readRemoval({ repositoryId, t }: Awaited<ReturnType<typeof seedRepository>>) {
  return await t.run(async (ctx) => ({
    repository: await ctx.db.get(repositoryId),
    workers: await ctx.db.query("repositoryCloudflareWorkers").collect(),
    projects: await ctx.db.query("repositoryConvexProjects").collect(),
    runStates: (await ctx.db.query("workflow_repositoryDeletion_runs").collect()).map(
      (run) => run.state,
    ),
  }));
}

describe("repository removal", () => {
  it("removes the repository and its rows, suspends the hub tenant, and calls no provider", async () => {
    vi.useFakeTimers();
    const fixture = await seedRepository();
    const requests = recordRequests();

    await fixture.viewer.action(api.repository.actions.deleteRepository, {
      repositoryId: fixture.repositoryId,
    });
    await fixture.t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect(await readRemoval(fixture)).toEqual({
      repository: null,
      workers: [],
      projects: [],
      runStates: ["succeeded"],
    });
    expect(requests).toEqual([`${HUB_ISSUER}/tenant-connection`]);
    expect(githubRepos.delete).not.toHaveBeenCalled();
  });

  it("still deletes the GitHub repository when asked", async () => {
    vi.useFakeTimers();
    const fixture = await seedRepository();
    const requests = recordRequests();
    githubRepos.get.mockResolvedValue({ data: { id: 74 } });
    githubRepos.delete.mockResolvedValue({});

    await fixture.viewer.action(api.repository.actions.deleteRepository, {
      repositoryId: fixture.repositoryId,
      removeGithubRepo: true,
    });
    await fixture.t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect((await readRemoval(fixture)).runStates).toEqual(["succeeded"]);
    expect(requests).toEqual([`${HUB_ISSUER}/tenant-connection`]);
    expect(githubRepos.delete).toHaveBeenCalledExactlyOnceWith({ owner: "octo-org", repo: "app" });
  });

  it("finishes a retry of a run that kept an old provider plan and calls no provider", async () => {
    vi.useFakeTimers();
    const fixture = await seedRepository();
    const { organizationId, repositoryId, userId } = fixture;
    const requests = recordRequests();
    const runId = await fixture.t.run(async (ctx) => {
      const failedRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
        state: "failed",
        organizationId,
        userId,
        repositoryId,
        githubRepositoryFullName: "octo-org/app",
        createdAt: 1,
        updatedAt: 1,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "old-workflow" },
        currentStep: "delete_cloudflare",
        lastError: "Cloudflare connection is required to remove resources.",
        completedAt: 1,
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "samebase_managed_repository",
              githubRepositoryDatabaseId: "74",
              githubOwnerLogin: "octo-org",
              githubRepositoryName: "app",
              githubRepositoryFullName: "octo-org/app",
            },
            convex: {
              action: "delete_projects",
              projects: [{ teamId: "convex-team", projectId: "app" }],
            },
            cloudflare: {
              action: "delete_workers",
              workers: [
                { accountId: "cloudflare-account", workerName: "app", workerTag: "app-tag" },
              ],
            },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      });
      await ctx.db.patch(repositoryId, {
        deletion: { state: "delete_failed", runId: failedRunId, failedAt: 1 },
      });
      return failedRunId;
    });

    await fixture.viewer.action(api.repository.actions.retryDeleteRepository, { runId });
    await fixture.t.finishAllScheduledFunctions(vi.runAllTimers, 1_000);

    expect(await readRemoval(fixture)).toEqual({
      repository: null,
      workers: [],
      projects: [],
      runStates: ["failed", "succeeded"],
    });
    expect(requests).toEqual([]);
  });
});
