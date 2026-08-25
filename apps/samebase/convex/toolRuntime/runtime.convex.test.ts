import type { FunctionReturnType } from "convex/server";
import type { Infer } from "convex/values";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import { makeConvexTest } from "../test.setup";
import { cloudflareCreateWorkerContract } from "../vault/contracts/cloudflareAttachments";

type CloudflareCreateWorkerToolResult = FunctionReturnType<
  typeof internal.toolRuntime.runtime.cloudflareCreateWorkerTool
>;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function seedToolRuntimeOwner() {
  const t = makeConvexTest();
  const { organizationId, userId, vaultId } = await t.run(async (ctx) => {
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
    const vaultId = await ctx.db.insert("vaults", {
      organizationId,
      convexTeamId: "convex-team",
      cloudflareAccountId: "account_1",
      deletion: { state: "not_deleting" },
      state: "not_connected",
    });
    return { organizationId, userId, vaultId };
  });
  return { organizationId, t, userId, vaultId };
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
    const { t, userId, vaultId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      grantedScopes: [],
      vaultId,
      accountId: "account_1",
      workerName: "worker-new",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for vault_cloudflare_createWorker.",
    });
  });

  it("blocks the Workers Builds token list before organization resolution", async () => {
    const { t, userId } = await seedToolRuntimeOwner();

    const result = await t.action(
      internal.toolRuntime.runtime.cloudflareListWorkersBuildTokensTool,
      {
        userId,
        grantedScopes: [],
        githubOwnerLogin: "tool-runtime-owner",
      },
    );

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for cloudflare_listWorkersBuildTokens.",
    });
  });

  it("lists vaults across every current organization membership", async () => {
    const { organizationId, t, userId } = await seedToolRuntimeOwner();
    const { authorizedVaultId, otherOrganizationId } = await t.run(async (ctx) => {
      const authorizedVaultId = await ctx.db.insert("vaults", {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "account_1",
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const authorizedRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId,
        userId,
        vaultId: authorizedVaultId,
        repositoryFullName: "tool-runtime-owner/authorized",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(authorizedVaultId, {
        organizationId,
        convexTeamId: "convex-team",
        cloudflareAccountId: "account_1",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: authorizedRunId,
        ghRepoId: "authorized-repository",
        name: "authorized",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
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
      const otherRunVaultId = await ctx.db.insert("vaults", {
        organizationId: otherOrganizationId,
        convexTeamId: "other-convex-team",
        cloudflareAccountId: "other-cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "not_connected",
      });
      const otherRunId = await ctx.db.insert("workflow_vaultProvisioning_runs", {
        organizationId: otherOrganizationId,
        userId,
        vaultId: otherRunVaultId,
        repositoryFullName: "other-owner/hidden",
        trigger: "connect_existing_repository",
        state: "succeeded",
        currentStep: "finish",
        createdAt: 1,
        updatedAt: 1,
        completedAt: 1,
      });
      await ctx.db.replace(otherRunVaultId, {
        organizationId: otherOrganizationId,
        convexTeamId: "other-convex-team",
        cloudflareAccountId: "other-cloudflare-account",
        deletion: { state: "not_deleting" },
        state: "connected",
        githubMode: "connect_existing_repository",
        runId: otherRunId,
        ghRepoId: "hidden-repository",
        name: "hidden",
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
      return { authorizedVaultId, otherOrganizationId };
    });

    const result = await t.action(internal.toolRuntime.runtime.getUserVaultsTool, {
      userId,
      grantedScopes: ["access_dashboard"],
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      throw new Error(result.text);
    }
    expect(result.structuredContent.vaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ _id: authorizedVaultId, organizationId }),
        expect.objectContaining({ organizationId: otherOrganizationId }),
      ]),
    );
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
          },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.toolRuntime.runtime.submitFeedbackTool, {
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
    expect(JSON.parse(request.body)).toEqual({
      to: "contact@samebase.com",
      from: {
        address: "notifications@samebase.com",
        name: "Samebase",
      },
      subject: "[Development] Samebase agent feedback",
      text: report,
    });
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("mcpFeedbackRateLimits")
          .withIndex("by_user_id", (query) => query.eq("userId", userId))
          .unique();
      }),
    ).resolves.toMatchObject({ count: 1, userId });
  });

  it.each([" \n ", "x".repeat(6_001)])("rejects invalid feedback without email", async (report) => {
    const { t, userId } = await seedToolRuntimeOwner();
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:local-agent");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expect(
      t.action(internal.toolRuntime.runtime.submitFeedbackTool, {
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
      t.action(internal.toolRuntime.runtime.submitFeedbackTool, {
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
        t.mutation(internal.mcp.feedback.reserveFeedbackSend, {
          userId,
        }),
      ).resolves.toBeNull();
    }

    await expect(
      t.mutation(internal.mcp.feedback.reserveFeedbackSend, {
        userId,
      }),
    ).rejects.toThrow("Feedback rate limit reached. Try again later.");
  });

  it("converts a product helper error into a tool error without a provider write", async () => {
    const { t, userId, vaultId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.cloudflareCreateWorkerTool, {
      userId,
      grantedScopes: ["access_provider_connections"],
      vaultId,
      accountId: "account_1",
      workerName: "invalid worker name",
      rootDirectory: "/",
      buildTokenUuid: "build-token",
    });

    expect(result).toMatchObject({
      status: "error",
      text: expect.stringContaining("Worker name"),
    });
    expect(result).not.toHaveProperty("structuredContent");
  });

  it("keeps browser handoff behind its dedicated trusted scope", async () => {
    const { t, userId } = await seedToolRuntimeOwner();

    const result = await t.action(internal.toolRuntime.runtime.createBrowserHandoffTool, {
      userId,
      grantId: "grant_1",
      clientId: "client_1",
      grantedScopes: [],
    });

    expect(result).toEqual({
      status: "blocked",
      text: "Insufficient scope for create_browser_handoff.",
    });
  });
});
