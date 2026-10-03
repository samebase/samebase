import type { FunctionReturnType } from "convex/server";
import type { Infer } from "convex/values";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { components, internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { cloudflareCreateWorkerContract } from "../repository/contracts/cloudflareAttachments";

type CloudflareCreateWorkerToolResult = FunctionReturnType<
  typeof internal.toolRuntime.runtime.cloudflareCreateWorkerTool
>;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedToolRuntimeOwner() {
  const t = makeConvexTest();
  const { organizationId, userId, repositoryId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      state: "active",
      name: "Ada",
      email: "ada@example.com",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const organizationId = await ctx.db.insert("organizations", {
      githubInstallationId: "tool_runtime_installation",
      githubOwnerId: "tool_runtime_owner",
      githubOwnerLogin: "tool-runtime-owner",
      githubOwnerLoginNormalized: "tool-runtime-owner",
      githubOwnerType: "organization",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId,
      role: "owner",
    });
    const repositoryId = await ctx.db.insert("repositories", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "account_1",
      deletion: { state: "not_deleting" },
      state: "not_connected",
      createdAt: 1,
    });
    return { organizationId, userId, repositoryId };
  });
  return { organizationId, t, userId, repositoryId };
}

describe("MCP tool runtime boundaries", () => {
  it("keeps the exact result type through the generic runtime factory", () => {
    expectTypeOf<CloudflareCreateWorkerToolResult>().not.toBeAny();
    expectTypeOf<CloudflareCreateWorkerToolResult>().toEqualTypeOf<
      | {
          status: "ok";
          text: string;
          structuredContent: Infer<typeof cloudflareCreateWorkerContract.structuredContent>;
        }
      | {
          status: "error" | "blocked";
          text: string;
        }
    >();
  });

  it("blocks a generic runtime tool before its product helper runs", async () => {
    const { t, userId, repositoryId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      grantedScopes: [],
      repository: repositoryId,
      workerName: "worker-new",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for repository_cloudflare_createWorker.",
    });
  });

  it("lists repositories across every current organization membership", async () => {
    const { organizationId, t, userId } = await seedToolRuntimeOwner();
    const {
      authorizedRepositoryId,
      otherRunRepositoryId,
      pendingRepositoryId,
      pendingPlanId,
      pendingConvexProjectId,
    } = await t.run(async (ctx) => {
      const authorizedRepositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "account_1",
        deletion: { state: "not_deleting" },
        state: "not_connected",
        createdAt: 1,
      });
      const authorizedRunId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId: authorizedRepositoryId,
        githubRepositoryFullName: "tool-runtime-owner/authorized",
        trigger: "connect_existing_repository",
        state: "failed",
        currentStep: "seed_starter",
        lastError: "private-diagnostic@example.com source failure",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(authorizedRepositoryId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "account_1",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: authorizedRunId,
        githubRepositoryDatabaseId: "authorized-repository",
        githubRepositoryName: "authorized",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
        createdAt: 1,
      });
      const otherOrganizationId = await ctx.db.insert("organizations", {
        githubInstallationId: "other_installation",
        githubOwnerId: "other_owner",
        githubOwnerLogin: "other-owner",
        githubOwnerLoginNormalized: "other-owner",
        githubOwnerType: "organization",
      });
      await ctx.db.insert("organizationMemberships", {
        organizationId: otherOrganizationId,
        userId,
        role: "member",
      });
      const otherRunRepositoryId = await ctx.db.insert("repositories", {
        organizationId: otherOrganizationId,
        convexTeamId: "other-convex-team",
        cloudflareAccountId: "other-cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "not_connected",
        createdAt: 1,
      });
      const otherRunId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId: otherOrganizationId,
        userId,
        repositoryId: otherRunRepositoryId,
        githubRepositoryFullName: "other-owner/hidden",
        trigger: "connect_existing_repository",
        state: "failed",
        currentStep: "attach_convex",
        lastError: "private-diagnostic@example.com provider failure",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(otherRunRepositoryId, {
        organizationId: otherOrganizationId,
        convexTeamId: "other-convex-team",
        cloudflareAccountId: "other-cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: otherRunId,
        githubRepositoryDatabaseId: "hidden-repository",
        githubRepositoryName: "hidden",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
        createdAt: 1,
      });
      await ctx.db.insert("workflow_repositoryProvisioning_writeLocks", {
        repositoryId: otherRunRepositoryId,
        owner: { kind: "managed_run", runId: otherRunId },
        state: "failed",
        lastWriteAt: { convex: 1 },
        updatedAt: 1,
      });
      const pendingRepositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "account_1",
        deletion: { state: "not_deleting" },
        state: "not_connected",
        createdAt: 1,
      });
      const pendingRunId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId,
        repositoryId: pendingRepositoryId,
        githubRepositoryFullName: "tool-runtime-owner/pending-app",
        trigger: "create",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(pendingRepositoryId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "account_1",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "create_repository",
        runId: pendingRunId,
        githubRepositoryDatabaseId: "pending-repository",
        githubRepositoryName: "pending-app",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
        createdAt: 1,
      });
      const pendingPlanId = await ctx.db.insert("workflow_repositoryProvisioning_plans", {
        repositoryId: pendingRepositoryId,
        convexConfigPath: "apps/web/convex.json",
        convex: {
          state: "created",
          projectName: "pending-app",
          deploymentRegion: "aws-us-east-1",
          projectId: "pending-provider-project",
        },
        cloudflare: {
          state: "planned",
          workerName: "pending-worker",
          rootDirectory: "apps/web",
          buildTokenUuid: null,
        },
        createdAt: 1,
        updatedAt: 1,
      });
      await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: pendingRepositoryId,
        organizationId,
        teamId: "convex-team",
        projectId: "unrelated-provider-project",
        convexConfigPath: "convex.json",
        origin: "selected_existing",
      });
      const pendingConvexProjectId = await ctx.db.insert("repositoryConvexProjects", {
        repositoryId: pendingRepositoryId,
        organizationId,
        teamId: "convex-team",
        projectId: "pending-provider-project",
        convexConfigPath: "apps/web/convex.json",
        origin: "provisioned",
      });
      return {
        authorizedRepositoryId,
        otherRunRepositoryId,
        pendingRepositoryId,
        pendingPlanId,
        pendingConvexProjectId,
      };
    });

    const result = await t.action(internal.toolRuntime.runtime.repositoryListTool, {
      userId,
      grantedScopes: ["access_dashboard"],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error(result.text);
    }
    expect(result.structuredContent.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ repositoryId: authorizedRepositoryId }),
        expect.objectContaining({ repositoryId: otherRunRepositoryId }),
      ]),
    );
    for (const repository of result.structuredContent.repositories) {
      expect(repository).not.toHaveProperty("organizationId");
      expect(repository).not.toHaveProperty("fileCount");
      expect(repository).not.toHaveProperty("lastEditTime");
      expect(repository).not.toHaveProperty("canRemoveConvexProvision");
      expect(repository).not.toHaveProperty("canRemoveCloudflareProvision");
      expect(repository).not.toHaveProperty("providerPlan");
      expect(repository).not.toHaveProperty("providerWrite");
      expect(repository).not.toHaveProperty("convexTeamId");
      expect(repository).not.toHaveProperty("defaultBranch");
      expect(repository).not.toHaveProperty("hasConnectedGitHubRepository");
    }
    expect(result.structuredContent.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          repositoryId: authorizedRepositoryId,
          pendingCloudflareSetup: null,
          sourceSetup: {
            status: "failed",
            message: "Source setup failed. Check this repository in Samebase for recovery steps.",
          },
        }),
        expect.objectContaining({
          repositoryId: otherRunRepositoryId,
          pendingCloudflareSetup: null,
          providerSetup: {
            status: "failed",
            provider: "convex",
            message: "Provider setup failed. Check this repository in Samebase before retrying.",
          },
        }),
        expect.objectContaining({
          repositoryId: pendingRepositoryId,
          githubRepositoryFullName: "tool-runtime-owner/pending-app",
          pendingCloudflareSetup: {
            workerName: "pending-worker",
            rootDirectory: "apps/web",
          },
          // No Convex credential is stored, so the live project names are unreadable.
          convexProjects: [
            { projectSlug: null, projectName: null, codeLocation: "apps/web/convex.json" },
            { projectSlug: null, projectName: null, codeLocation: "convex.json" },
          ],
        }),
      ]),
    );
    const output = JSON.stringify(result);
    expect(output).not.toContain(pendingConvexProjectId);
    expect(output).not.toContain("private-diagnostic@example.com");
    expect(output).not.toContain('"runId"');
    expect(output).not.toContain('"step"');
    expect(output).not.toContain('"updatedAt"');
    expect(output).not.toContain('"lastWriteAt"');
    expect(output).not.toContain('"buildTokenUuid"');
    expect(output).not.toContain('"deploymentRegion"');
    const webRepositories = await t.query(internal.repository.listForUser, {
      userId,
    });
    expect(
      webRepositories.find((repository) => repository.repositoryId === authorizedRepositoryId),
    ).toMatchObject({
      organizationId,
      sourceSetup: {
        runId: expect.any(String),
        updatedAt: 1,
        message: "private-diagnostic@example.com source failure",
      },
    });
    expect(
      webRepositories.find((repository) => repository.repositoryId === pendingRepositoryId),
    ).toMatchObject({
      providerPlan: {
        convexConfigPath: "apps/web/convex.json",
        convex: {
          state: "created",
          teamId: "convex-team",
          projectId: "pending-provider-project",
        },
        cloudflare: { accountId: "account_1", buildTokenUuid: null },
      },
    });

    for (const scenario of [
      {
        convexState: "created",
        projectId: "pending-provider-project",
        buildTokenUuid: "historical-build-token-uuid",
      },
      {
        convexState: "planned",
        projectId: null,
        buildTokenUuid: null,
      },
      {
        convexState: "created",
        projectId: "missing-provider-project",
        buildTokenUuid: null,
      },
    ] as const) {
      await t.run(async (ctx) => {
        await ctx.db.patch(pendingPlanId, {
          convex:
            scenario.convexState === "created"
              ? {
                  state: scenario.convexState,
                  projectName: "pending-app",
                  deploymentRegion: "aws-us-east-1",
                  projectId: scenario.projectId,
                }
              : {
                  state: scenario.convexState,
                  projectName: "pending-app",
                  deploymentRegion: "aws-us-east-1",
                },
          cloudflare: {
            state: "planned",
            workerName: "pending-worker",
            rootDirectory: "apps/web",
            buildTokenUuid: scenario.buildTokenUuid,
          },
        });
      });
      const unavailable = await t.action(internal.toolRuntime.runtime.repositoryListTool, {
        userId,
        grantedScopes: ["access_dashboard"],
      });
      expect(unavailable.status).toBe("ok");
      if (unavailable.status !== "ok") {
        throw new Error(unavailable.text);
      }
      expect(
        unavailable.structuredContent.repositories.find(
          (repository) => repository.repositoryId === pendingRepositoryId,
        ),
      ).toMatchObject({ pendingCloudflareSetup: null });
      expect(JSON.stringify(unavailable)).not.toContain("historical-build-token-uuid");
    }

    await t.run(async (ctx) => {
      await ctx.db.patch(pendingPlanId, {
        convex: {
          state: "created",
          projectName: "pending-app",
          deploymentRegion: "aws-us-east-1",
          projectId: "pending-provider-project",
        },
      });
      await ctx.db.insert("repositoryCloudflareWorkers", {
        repositoryId: pendingRepositoryId,
        organizationId,
        accountId: "account_1",
        workerName: "existing-worker",
        workerTag: "existing-worker-tag",
        rootDirectory: "apps/web",
        origin: "selected_existing",
      });
    });
    const withWorker = await t.action(internal.toolRuntime.runtime.repositoryListTool, {
      userId,
      grantedScopes: ["access_dashboard"],
    });
    expect(withWorker.status).toBe("ok");
    if (withWorker.status !== "ok") {
      throw new Error(withWorker.text);
    }
    expect(
      withWorker.structuredContent.repositories.find(
        (repository) => repository.repositoryId === pendingRepositoryId,
      ),
    ).toMatchObject({ pendingCloudflareSetup: null });

    await t.run(async (ctx) => {
      const deletionRun = {
        organizationId,
        userId,
        githubRepositoryFullName: "tool-runtime-owner/authorized",
        createdAt: 1,
        updatedAt: 1,
        attempt: { kind: "initial" },
        workflow: { state: "started", workflowId: "tool-runtime-deletion" },
        snapshot: {
          state: "retained_for_retry",
          plan: {
            target: {
              kind: "existing_repository",
              githubRepositoryDatabaseId: "authorized-repository",
              githubOwnerLogin: "tool-runtime-owner",
              githubRepositoryName: "authorized",
              githubRepositoryFullName: "tool-runtime-owner/authorized",
            },
            convex: { action: "skip", reason: "not_requested" },
            cloudflare: { action: "skip", reason: "not_requested" },
            githubRepository: { action: "skip", reason: "not_requested" },
          },
        },
      } as const;
      const deletingRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
        ...deletionRun,
        state: "running",
        repositoryId: authorizedRepositoryId,
        currentStep: "delete_github_repository",
      });
      const failedRunId = await ctx.db.insert("workflow_repositoryDeletion_runs", {
        ...deletionRun,
        state: "failed",
        repositoryId: pendingRepositoryId,
        currentStep: "delete_convex",
        lastError: "Convex deletion failed.",
        completedAt: 1,
      });
      await ctx.db.patch(authorizedRepositoryId, {
        deletion: { state: "deleting", runId: deletingRunId, requestedAt: 1 },
      });
      await ctx.db.patch(pendingRepositoryId, {
        deletion: { state: "delete_failed", runId: failedRunId, failedAt: 1 },
      });
    });
    const withDeletions = await t.action(internal.toolRuntime.runtime.repositoryListTool, {
      userId,
      grantedScopes: ["access_dashboard"],
    });
    expect(withDeletions.status).toBe("ok");
    if (withDeletions.status !== "ok") {
      throw new Error(withDeletions.text);
    }
    expect(
      withDeletions.structuredContent.repositories.map((repository) => [
        repository.repositoryId,
        repository.deletion,
      ]),
    ).toEqual(
      expect.arrayContaining([
        [authorizedRepositoryId, { state: "deleting" }],
        [otherRunRepositoryId, { state: "not_deleting" }],
        [pendingRepositoryId, { state: "delete_failed" }],
      ]),
    );
  });

  it.each([
    { status: 400, text: "Samebase could not send the feedback email." },
    {
      status: 500,
      text: "Feedback delivery could not be confirmed. Do not submit it again until Samebase has checked its delivery status.",
    },
  ])("returns a safe failure result for feedback HTTP $status", async ({ status, text }) => {
    vi.stubGlobal("EdgeRuntime", undefined);
    const { t, userId } = await seedToolRuntimeOwner();
    vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:samebase");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: false,
              errors: [
                { code: 1000, message: "private-diagnostic@example.com provider debug detail" },
              ],
            }),
            { status },
          ),
      ),
    );

    await expect(
      t.action(internal.feedback.submit, {
        userId,
        grantedScopes: ["access_feedback_submit"],
        report: "The app failed to load.",
      }),
    ).resolves.toEqual({
      status: "error",
      text,
    });
  });

  it.each([
    {
      expectedLength: 5_235,
      label: "5,235-character incident report",
      report: `  Samebase incident report.\n`.padEnd(5_233, "x") + "  ",
    },
    {
      expectedLength: 6_000,
      label: "6,000-character maximum report",
      report: "x".repeat(6_000),
    },
  ])("emails an approved $label without account metadata", async ({ expectedLength, report }) => {
    // Convex uses V8; the edge-runtime test host lacks the SDK's Node process metadata.
    vi.stubGlobal("EdgeRuntime", undefined);
    const { t, userId } = await seedToolRuntimeOwner();
    expect(report).toHaveLength(expectedLength);
    vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:samebase");
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            delivered: ["contact@samebase.com"],
            message_id: "<message-id@samebase.com>",
            permanent_bounces: [],
            queued: [],
            suppressed_recipients: [],
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.feedback.submit, {
        userId,
        grantedScopes: ["access_feedback_submit"],
        report,
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Feedback submitted to Samebase.",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, request] = fetch.mock.calls[0];
    if (typeof request?.body !== "string") {
      throw new Error("Expected a JSON request body.");
    }
    expect(JSON.parse(request.body)).toMatchObject({
      to: ["contact@samebase.com"],
      subject: "[Development] Samebase agent feedback",
      text: report,
    });
    const threads = await t.query(components.mail.mail.listThreads, {
      inboxId: null,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const messages = await t.query(components.mail.mail.listMessages, {
      threadId: threads.page[0]._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(messages.page).toMatchObject([
      {
        status: "accepted",
        bodyText: report,
        to: ["contact@samebase.com"],
      },
    ]);
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("mcpFeedbackRateLimits")
          .withIndex("by_user_id", (query) => query.eq("userId", userId))
          .unique();
      }),
    ).resolves.toMatchObject({ count: 1, userId });
  });

  it("reports throttled feedback as queued without asking for another submission", async () => {
    vi.stubGlobal("EdgeRuntime", undefined);
    vi.useFakeTimers();
    const { t, userId } = await seedToolRuntimeOwner();
    vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:samebase");
    const fetch = vi.fn(async () =>
      Response.json(
        {
          success: false,
          errors: [{ code: 10004, message: "email.sending.error.throttled" }],
          messages: [],
          result: null,
        },
        { status: 429, headers: { "Retry-After": "30" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.feedback.submit, {
        userId,
        grantedScopes: ["access_feedback_submit"],
        report: "The app failed to load.",
      }),
    ).resolves.toEqual({
      status: "ok",
      text: "Feedback is queued for delivery to Samebase. Cloudflare has delayed sending. Do not submit it again; the email component will retry automatically.",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const threads = await t.query(components.mail.mail.listThreads, {
      inboxId: null,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const messages = await t.query(components.mail.mail.listMessages, {
      threadId: threads.page[0]._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(messages.page).toMatchObject([{ status: "queued" }]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(
      await t.query(components.mail.delivery.get, {
        messageId: messages.page[0]._id,
      }),
    ).toMatchObject({ kind: "rejected", code: "cloudflare_http_429" });
  });

  it.each([" \n ", "x".repeat(6_001)])("rejects invalid feedback without email", async (report) => {
    const { t, userId } = await seedToolRuntimeOwner();
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:local-agent");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.feedback.submit, {
        userId,
        grantedScopes: ["access_feedback_submit"],
        report,
      }),
    ).resolves.toMatchObject({
      status: "error",
      text: expect.stringContaining("Feedback report"),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not report success when local email sending is disabled", async () => {
    const { t, userId } = await seedToolRuntimeOwner();
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:local-agent");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.feedback.submit, {
        userId,
        grantedScopes: ["access_feedback_submit"],
        report: "Samebase returned the wrong setup state.",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Feedback email is not configured in local development.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("limits feedback to five submission attempts per user in 24 hours", async () => {
    const { t, userId } = await seedToolRuntimeOwner();

    for (let reservationNumber = 1; reservationNumber <= 5; reservationNumber += 1) {
      await expect(
        t.mutation(internal.feedback.reserveSend, {
          userId,
        }),
      ).resolves.toBeNull();
    }

    await expect(
      t.mutation(internal.feedback.reserveSend, {
        userId,
      }),
    ).rejects.toThrow("Feedback rate limit reached. Try again later.");
    await expect(
      t.action(internal.feedback.submit, {
        userId,
        grantedScopes: ["access_feedback_submit"],
        report: "The app failed to load.",
      }),
    ).resolves.toEqual({
      status: "error",
      text: "Feedback rate limit reached. Try again later.",
    });
  });

  it("converts a product helper error into a tool error without a provider write", async () => {
    const { t, userId } = await seedToolRuntimeOwner();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      grantedScopes: ["access_provider_connections"],
      repository: "tool-runtime-owner/missing",
      workerName: "worker-new",
    });

    expect(result).toEqual({
      status: "error",
      text: "No Samebase repository matches tool-runtime-owner/missing. Pass owner/name or a repositoryId from repository_list. To add an existing GitHub repository to Samebase, call repository_connect.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps browser handoff behind its dedicated trusted scope", async () => {
    const { t, userId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.account.createSignInLink, {
      userId,
      grantId: "grant_1",
      clientId: "client_1",
      grantedScopes: [],
    });

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for account_createSignInLink.",
    });
  });
});
