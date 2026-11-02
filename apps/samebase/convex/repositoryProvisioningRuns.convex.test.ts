/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "./_generated/api";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "./test.setup";
import schema from "./schema";

const modules = import.meta.glob([
  "./**/*.ts",
  "./_generated/*.js",
  "!./**/*.test.ts",
  "!./**/*.convex.test.ts",
  "!./**/*.generated.ts",
  "!./test.setup.ts",
]);

type RetryBlocker = "none" | "active_managed_lock" | "manual_write" | "deletion";

async function createRetryFixture(
  blocker: RetryBlocker,
  t = makeConvexTest(),
  plan: "repository_actions" | "old" | "none" = "repository_actions",
) {
  const ids = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "retry-guard-installation",
      githubOwnerId: "retry-guard-owner",
      githubOwnerLogin: "ada",
      githubOwnerLoginNormalized: "ada",
      githubOwnerType: "user",
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", { organizationId, userId, role: "owner" });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "not_connected",
    });
    const failedRunId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
      organizationId,
      userId,
      repositoryId,
      githubRepositoryFullName: "ada/retry-guard",
      trigger: "create",
      state: "failed",
      currentStep: "write_actions_secrets",
      lastError: "GitHub Actions setup failed.",
      createdAt: 1,
      updatedAt: 2,
      completedAt: 2,
    });
    await ctx.db.replace(repositoryId, {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "cloudflare-account",
      deletion: { state: "not_deleting" },
      createdAt: 1,
      state: "connected",
      githubMode: "create_repository",
      runId: failedRunId,
      githubRepositoryDatabaseId: "github-repository",
      githubRepositoryName: "retry-guard",
      visibility: "private",
      defaultBranch: "main",
      connectedAt: 3,
    });
    switch (plan) {
      case "repository_actions":
        await ctx.db.insert("workflow_repositoryProvisioning_plans", {
          provisioning: "repository_actions",
          repositoryId,
          convexConfigPath: "convex.json",
          ciSecrets: { state: "planned" },
          seed: { state: "planned" },
          createdAt: 1,
          updatedAt: 1,
        });
        break;
      case "old":
        await ctx.db.insert("workflow_repositoryProvisioning_plans", {
          repositoryId,
          convexConfigPath: "convex.json",
          convex: {
            state: "planned",
            projectName: "retry-guard",
            deploymentRegion: "aws-us-east-1",
          },
          cloudflare: {
            state: "planned",
            workerName: "retry-guard",
            rootDirectory: "/",
            buildTokenUuid: "build-token",
          },
          createdAt: 1,
          updatedAt: 1,
        });
        break;
      case "none":
        break;
      default:
        plan satisfies never;
    }

    switch (blocker) {
      case "none":
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId,
          owner: { kind: "managed_run", runId: failedRunId },
          state: "failed",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "active_managed_lock":
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId,
          owner: { kind: "managed_run", runId: failedRunId },
          state: "active",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "manual_write":
        await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
          repositoryId,
          owner: {
            kind: "manual_provider_write",
            userId,
            actionId: "manual-action",
            action: "create_convex_project",
            expiresAt: 20,
          },
          state: "active",
          lastWriteAt: {},
          updatedAt: 10,
        });
        break;
      case "deletion": {
        const deletionRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
          state: "queued",
          organizationId,
          userId,
          repositoryId,
          githubRepositoryFullName: "ada/retry-guard",
          createdAt: 10,
          updatedAt: 10,
          attempt: { kind: "initial" },
          workflow: { state: "not_started" },
          currentStep: "initialize_deletion",
          snapshot: {
            state: "retained_for_retry",
            plan: {
              target: {
                kind: "samebase_managed_repository",
                githubRepositoryDatabaseId: "github-repository",
                githubOwnerLogin: "ada",
                githubRepositoryName: "retry-guard",
                githubRepositoryFullName: "ada/retry-guard",
              },
              convex: { action: "skip", reason: "not_requested" },
              cloudflare: { action: "skip", reason: "not_requested" },
              githubRepository: { action: "skip", reason: "not_requested" },
            },
          },
        });
        await ctx.db.patch(repositoryId, {
          deletion: {
            state: "deleting",
            runId: deletionRunId,
            requestedAt: 10,
          },
        });
        break;
      }
      default:
        blocker satisfies never;
    }

    return { failedRunId, organizationId, userId, repositoryId };
  });

  return { ids, t };
}

type RetryFixture = Awaited<ReturnType<typeof createRetryFixture>>;

/** One dashboard retry call; without `confirmation` it asks for the confirmation. */
async function retry(
  { ids, t }: RetryFixture,
  confirmation?: { token: string; acknowledgement: string },
) {
  return await t.mutation(internal.repositoryProvisioningRuns.createRetryForRepository, {
    userId: ids.userId,
    repositoryId: ids.repositoryId,
    surface: { kind: "dashboard" },
    confirmation,
  });
}

/** The approved confirmation of a retry, as the dashboard dialog sends it. */
async function approveRetry(fixture: RetryFixture) {
  const challenge = await retry(fixture);
  if (!challenge) {
    throw new Error("Expected a confirmation request.");
  }
  return { token: challenge.token, acknowledgement: challenge.acknowledgement };
}

async function readConfirmationRows({ t }: RetryFixture) {
  return await t.run(async (ctx) => ({
    tokens: await ctx.db.query("actionConfirmationTokens").collect(),
    audit: await ctx.db.query("audit_confirmedActions_events").collect(),
  }));
}

describe("app provisioning retry admission", () => {
  // These tests check retry admission only. Fake timers hold the Workflow runs that an admitted
  // retry schedules, so no run continues and logs after its test or after the file ends.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [
      "an active managed lock",
      "active_managed_lock",
      "Another Samebase setup or provider change is running for this repository, so nothing changed. Try again after it finishes.",
    ],
    ["repository removal", "deletion", "Removal from Samebase is in progress."],
  ] as const)(
    "rejects retry while %s is active, before any confirmation request",
    async (_label, blocker, message) => {
      const fixture = await createRetryFixture(blocker);

      await expect(retry(fixture)).rejects.toThrow(message);
      await expect(readConfirmationRows(fixture)).resolves.toEqual({ tokens: [], audit: [] });
    },
  );

  it("leaves the token unused when the approved retry can no longer start", async () => {
    const fixture = await createRetryFixture("none");
    const { ids, t } = fixture;
    const confirmation = await approveRetry(fixture);
    await t.run(async (ctx) => {
      const write = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      if (!write) {
        throw new Error("Expected managed provider write.");
      }
      await ctx.db.patch(write._id, { state: "active" });
    });

    await expect(retry(fixture, confirmation)).rejects.toThrow(
      "Another Samebase setup or provider change is running for this repository, so nothing changed. Try again after it finishes.",
    );
    const rows = await readConfirmationRows(fixture);
    expect(rows.audit).toEqual([]);
    expect(rows.tokens).toEqual([expect.objectContaining({ action: "retry_provider_setup" })]);
    expect(rows.tokens[0]?.consumedAt).toBeUndefined();
  });

  it("admits only one of two simultaneous retries", async () => {
    const fixture = await createRetryFixture("none");
    const { ids, t } = fixture;
    const [first, second] = [await approveRetry(fixture), await approveRetry(fixture)];

    const results = await Promise.allSettled([retry(fixture, first), retry(fixture, second)]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const admitted = await t.run(async (ctx) => {
      const queuedRuns = await ctx.db
        .query("workflow_repositoryProvisioning_runs")
        .withIndex("by_repository_and_state", (q) =>
          q.eq("repositoryId", ids.repositoryId).eq("state", "queued"),
        )
        .collect();
      const writeLock = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      return { queuedRuns, writeLock };
    });
    expect(admitted.queuedRuns).toHaveLength(1);
    expect(admitted.queuedRuns[0]).toMatchObject({
      organizationId: ids.organizationId,
      workflowId: expect.any(String),
    });
    expect(admitted.writeLock).toMatchObject({
      owner: { kind: "managed_run", runId: admitted.queuedRuns[0]?._id },
      state: "active",
    });
  });

  it("rolls back retry admission and the confirmation when Workflow start fails", async () => {
    const fixture = await createRetryFixture("none", convexTest(schema, modules));
    const { ids, t } = fixture;
    const confirmation = await approveRetry(fixture);

    await expect(retry(fixture, confirmation)).rejects.toThrow();

    await expect(
      t.run(async (ctx) => {
        const runs = await ctx.db
          .query("workflow_repositoryProvisioning_runs")
          .withIndex("by_repository_and_updated_at", (q) => q.eq("repositoryId", ids.repositoryId))
          .collect();
        const lock = await ctx.db
          .query("workflow_repositoryProvisioning_writeLocks")
          .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
          .unique();
        return { runs, lock };
      }),
    ).resolves.toMatchObject({
      runs: [{ _id: ids.failedRunId, state: "failed" }],
      lock: {
        owner: { kind: "managed_run", runId: ids.failedRunId },
        state: "failed",
      },
    });
    const rows = await readConfirmationRows(fixture);
    expect(rows.audit).toEqual([]);
    expect(rows.tokens[0]?.consumedAt).toBeUndefined();
  });

  it("starts a retry over MCP only after the confirmation, and audits the confirming grant", async () => {
    const { ids, t } = await createRetryFixture("none");
    const toolArgs = {
      userId: ids.userId,
      grantedScopes: ["access_app_create"],
      grantId: "grant-1",
      clientId: "client-1",
      repository: "ada/retry-guard",
    };
    const readRetryState = async () =>
      await t.run(async (ctx) => ({
        queuedRuns: await ctx.db
          .query("workflow_repositoryProvisioning_runs")
          .withIndex("by_repository_and_state", (q) =>
            q.eq("repositoryId", ids.repositoryId).eq("state", "queued"),
          )
          .collect(),
        audit: await ctx.db.query("audit_confirmedActions_events").collect(),
      }));

    const first = await t.action(
      internal.toolRuntime.runtime.repositoryRetryProviderSetupTool,
      toolArgs,
    );
    if (first.status !== "ok" || first.structuredContent.state !== "needs_confirmation") {
      throw new Error(`Expected a confirmation request: ${JSON.stringify(first)}`);
    }
    expect(first.structuredContent).toEqual({
      state: "needs_confirmation",
      effect:
        "Samebase starts a new setup run for ada/retry-guard. It writes the credential of the organization's Convex connection into the repository's GitHub Actions secret CONVEX_ACCESS_TOKEN and the Convex team id into its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.",
      acknowledgement:
        "I confirm that the user approved a new setup run for ada/retry-guard, which replaces its GitHub Actions secret and variable with the organization's Convex connection credential and team id",
      token: expect.any(String),
      expiresAt: expect.any(Number),
    });
    await expect(readRetryState()).resolves.toEqual({ queuedRuns: [], audit: [] });

    const { acknowledgement, token } = first.structuredContent;
    await expect(
      t.action(internal.toolRuntime.runtime.repositoryRetryProviderSetupTool, {
        ...toolArgs,
        confirmation: { token, acknowledgement },
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Started a provider setup run for ada/retry-guard. Poll repository_list for progress.",
      structuredContent: { state: "setup_started" },
    });
    await expect(readRetryState()).resolves.toMatchObject({
      queuedRuns: [expect.objectContaining({ trigger: "retry" })],
      audit: [
        {
          action: "retry_provider_setup",
          repositoryId: ids.repositoryId,
          resource: { kind: "repository", githubRepositoryFullName: "ada/retry-guard" },
          acknowledgement,
          surface: { kind: "mcp", grantId: "grant-1", clientId: "client-1" },
        },
      ],
    });
  });

  it("rejects retry after successful managed setup", async () => {
    const fixture = await createRetryFixture("none");
    const { ids, t } = fixture;
    await t.run(async (ctx) => {
      const write = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      if (!write || write.owner.kind !== "managed_run") {
        throw new Error("Expected managed provider write.");
      }
      await Promise.all([
        ctx.db.patch(write.owner.runId, {
          state: "succeeded",
          currentStep: "finish",
          lastError: undefined,
        }),
        ctx.db.patch(write._id, {
          state: "succeeded",
        }),
      ]);
    });

    // The first call already refuses, so the user is never asked to approve a retry that cannot start.
    // MCP shows the refusal as it is, because it holds no provider text.
    await expect(
      t.action(internal.toolRuntime.runtime.repositoryRetryProviderSetupTool, {
        userId: ids.userId,
        grantedScopes: ["access_app_create"],
        grantId: "grant-1",
        clientId: "client-1",
        repository: "ada/retry-guard",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Samebase setup of this repository has not failed, so there is nothing to retry and nothing changed. Check the repository status for its current state.",
    });
    await expect(readConfirmationRows(fixture)).resolves.toEqual({ tokens: [], audit: [] });
  });

  it.each(["old", "none"] as const)(
    "refuses a failed setup whose plan is %s, before any confirmation request",
    async (plan) => {
      const fixture = await createRetryFixture("none", makeConvexTest(), plan);

      await expect(retry(fixture)).rejects.toThrow(
        "A provider setup retry cannot repair this failed setup, so nothing changed. Check this repository in the Samebase dashboard for recovery steps.",
      );
      await expect(readConfirmationRows(fixture)).resolves.toEqual({ tokens: [], audit: [] });
    },
  );

  it.each(["active", "succeeded", "failed"] as const)(
    "rejects retry after an old %s manual write replaced the failed managed setup",
    async (state) => {
      const fixture = await createRetryFixture("manual_write");
      const { ids, t } = fixture;
      await t.run(async (ctx) => {
        const write = await ctx.db
          .query("workflow_repositoryProvisioning_writeLocks")
          .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
          .unique();
        if (!write) {
          throw new Error("Expected the manual write.");
        }
        await ctx.db.patch(write._id, { state });
      });

      await expect(retry(fixture)).rejects.toThrow(
        "Samebase setup of this repository has not failed, so there is nothing to retry and nothing changed. Check the repository status for its current state.",
      );
      await expect(readConfirmationRows(fixture)).resolves.toEqual({ tokens: [], audit: [] });
    },
  );

  it("rejects provider retry after source setup fails", async () => {
    const fixture = await createRetryFixture("none");
    const { ids, t } = fixture;
    await t.run(async (ctx) => {
      const write = await ctx.db
        .query("workflow_repositoryProvisioning_writeLocks")
        .withIndex("by_repository", (q) => q.eq("repositoryId", ids.repositoryId))
        .unique();
      if (!write || write.owner.kind !== "managed_run") {
        throw new Error("Expected managed provider write.");
      }
      await ctx.db.patch(write.owner.runId, {
        currentStep: "connect_github_repository",
        lastError: "Source setup failed.",
      });
    });

    await expect(retry(fixture)).rejects.toThrow(
      "A provider setup retry cannot repair this failed setup, so nothing changed. Check this repository in the Samebase dashboard for recovery steps.",
    );
  });

  it("admits only one of a retry and repository deletion", async () => {
    const fixture = await createRetryFixture("none");
    const { ids, t } = fixture;
    const confirmation = await approveRetry(fixture);

    const results = await Promise.allSettled([
      retry(fixture, confirmation),
      t.mutation(internal.repository.deletion.runs.createInitialRun, {
        userId: ids.userId,
        repositoryId: ids.repositoryId,
        options: {
          removeGithubRepo: false,
        },
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const state = await t.run(async (ctx) => {
      const repository = await ctx.db.get(ids.repositoryId);
      const queuedRuns = await ctx.db
        .query("workflow_repositoryProvisioning_runs")
        .withIndex("by_repository_and_state", (q) =>
          q.eq("repositoryId", ids.repositoryId).eq("state", "queued"),
        )
        .collect();
      if (repository === null) {
        throw new Error("Repository fixture is missing.");
      }
      return { deletion: repository.deletion, queuedRunCount: queuedRuns.length };
    });
    if (state.deletion.state === "deleting") {
      expect(state.queuedRunCount).toBe(0);
    } else {
      expect(state.deletion).toEqual({ state: "not_deleting" });
      expect(state.queuedRunCount).toBe(1);
    }
  });
});
