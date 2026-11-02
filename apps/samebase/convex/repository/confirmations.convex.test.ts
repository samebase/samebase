import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { Id } from "../_generated/dataModel";
import { sha256Hex } from "../mcp/tokens";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import type { ConfirmationSurface } from "./confirmationModel";
import { checkActionConfirmation, type ConfirmedActionRequest } from "./confirmations";

/*
State axes of the confirmation check: whether a confirmation is sent; whether its token exists, is
the caller's, is unused, is unexpired, was issued for this action and this normalized request; and
whether the acknowledgement is exact. Only the last row of that table confirms.
*/

const dashboard = { kind: "dashboard" as const };
const retryEffect =
  "Samebase starts a new setup run for scout-owner/scout. It writes the credential of the organization's Convex connection into the repository's GitHub Actions secret CONVEX_ACCESS_TOKEN and the Convex team id into its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.";
const retryApproval =
  "a new setup run for scout-owner/scout, which replaces its GitHub Actions secret and variable with the organization's Convex connection credential and team id";

/** scout-owner/scout and scout-owner/admin, an owner, and a second member. */
async function createFixture() {
  const t = makeConvexTest();
  const ids = await t.run(async (ctx) => {
    const ownerId = await ctx.db.insert("users", {
      state: "active",
      email: "scout-owner@example.test",
      isApproved: true,
      termsVersion: "2026-08-12",
      termsAcceptedAt: 1,
    });
    const memberId = await ctx.db.insert("users", {
      state: "active",
      email: "scout-member@example.test",
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
      convexTeam: { teamId: "convex-team" },
    });
    await insertTestOrganizationBillingAccount(ctx.db, organizationId);
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: ownerId,
      role: "owner",
    });
    await ctx.db.insert("organizationMemberships", {
      organizationId,
      userId: memberId,
      role: "member",
    });
    const insertConnectedRepository = async (githubRepositoryName: string) => {
      const repositoryId = await ctx.db.insert("repositories", {
        organizationId,
        convexTeamId: "convex-team",
        deletion: { state: "not_deleting" },
        createdAt: 1,
        state: "not_connected",
      });
      const runId = await ctx.db.insert("workflow_repositoryProvisioning_runs", {
        organizationId,
        userId: ownerId,
        repositoryId,
        githubRepositoryFullName: `scout-owner/${githubRepositoryName}`,
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
        githubRepositoryDatabaseId: `github-${githubRepositoryName}`,
        githubRepositoryName,
        visibility: "private",
        defaultBranch: "main",
        connectedAt: 1,
      });
      return repositoryId;
    };
    return {
      memberId,
      organizationId,
      ownerId,
      otherRepositoryId: await insertConnectedRepository("admin"),
      repositoryId: await insertConnectedRepository("scout"),
    };
  });

  const retry: ConfirmedActionRequest = {
    action: "retry_provider_setup",
    repositoryId: ids.repositoryId,
  };
  const check = async (args: {
    request: ConfirmedActionRequest;
    userId?: Id<"users">;
    surface?: ConfirmationSurface;
    confirmation?: { token: string; acknowledgement: string };
  }) =>
    await t.run(
      async (ctx) =>
        await checkActionConfirmation(ctx, {
          userId: args.userId ?? ids.ownerId,
          surface: args.surface ?? dashboard,
          request: args.request,
          confirmation: args.confirmation,
        }),
    );
  const issue = async (request: ConfirmedActionRequest) => {
    const challenge = await check({ request });
    if (challenge.state !== "needs_confirmation") {
      throw new Error("Expected a confirmation request.");
    }
    return challenge;
  };
  const readRows = async () =>
    await t.run(async (ctx) => ({
      tokens: await ctx.db.query("actionConfirmationTokens").collect(),
      audit: await ctx.db.query("audit_confirmedActions_events").collect(),
    }));

  return { check, ids, issue, readRows, retry, t };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("action confirmation check", () => {
  it("returns the effect, the acknowledgement, and a token, and stores only the token hash", async () => {
    const { check, readRows, retry } = await createFixture();

    const challenge = await check({ request: retry });

    expect(challenge).toEqual({
      state: "needs_confirmation",
      effect: retryEffect,
      acknowledgement: `I approve ${retryApproval}`,
      token: expect.stringMatching(/^sbcf_/),
      expiresAt: expect.any(Number),
    });
    const { audit, tokens } = await readRows();
    expect(audit).toEqual([]);
    expect(tokens).toEqual([
      expect.objectContaining({
        action: "retry_provider_setup",
        acknowledgement: `I approve ${retryApproval}`,
        expiresAt: challenge.state === "needs_confirmation" ? challenge.expiresAt : 0,
      }),
    ]);
    expect(JSON.stringify(tokens)).not.toContain(
      challenge.state === "needs_confirmation" ? challenge.token : "missing",
    );
    expect(tokens[0]?.consumedAt).toBeUndefined();
    expect(tokens[0]?.expiresAt).toBe((tokens[0]?.createdAt ?? 0) + 10 * 60 * 1000);
  });

  it("describes the retry of the GitHub Actions setup", async () => {
    const { issue, retry } = await createFixture();

    const repositoryActions = await issue(retry);

    const repositoryActionsText = `${repositoryActions.effect} ${repositoryActions.acknowledgement}`;
    for (const samebaseOnly of [
      "Workers Builds",
      "deploy key",
      "Convex and Cloudflare resources",
    ]) {
      expect(repositoryActionsText).not.toContain(samebaseOnly);
    }
  });

  it("asks an MCP caller to state the user's approval", async () => {
    const { check, retry } = await createFixture();

    await expect(
      check({
        request: retry,
        surface: { kind: "mcp", grantId: "grant-1", clientId: "client-1" },
      }),
    ).resolves.toMatchObject({
      state: "needs_confirmation",
      effect: retryEffect,
      acknowledgement: `I confirm that the user approved ${retryApproval}`,
    });
  });

  it("confirms once with the token and the exact sentence, and writes the audit row", async () => {
    const { check, ids, issue, readRows, retry } = await createFixture();
    const challenge = await issue(retry);
    const confirmation = { token: challenge.token, acknowledgement: challenge.acknowledgement };

    await expect(check({ request: retry, confirmation })).resolves.toEqual({
      state: "confirmed",
    });

    const { audit, tokens } = await readRows();
    expect(tokens[0]?.consumedAt).toEqual(expect.any(Number));
    expect(audit).toEqual([
      expect.objectContaining({
        userId: ids.ownerId,
        organizationId: ids.organizationId,
        repositoryId: ids.repositoryId,
        action: "retry_provider_setup",
        resource: { kind: "repository", githubRepositoryFullName: "scout-owner/scout" },
        requestDigest: tokens[0]?.requestDigest,
        effect: challenge.effect,
        acknowledgement: challenge.acknowledgement,
        surface: { kind: "dashboard" },
        issuedAt: tokens[0]?.createdAt,
        confirmedAt: tokens[0]?.consumedAt,
      }),
    ]);
    await expect(check({ request: retry, confirmation })).rejects.toMatchObject({
      data: "This confirmation token was already used. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [expect.anything()] });
  });

  it("rejects an unknown token, another user's token, and an expired token", async () => {
    const { check, ids, issue, readRows, retry, t } = await createFixture();
    const challenge = await issue(retry);
    const notValid = {
      data: "This confirmation token is not valid. Nothing changed. Start the action again to get a new confirmation.",
    };

    await expect(
      check({
        request: retry,
        confirmation: { token: "sbcf_unknown", acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toMatchObject(notValid);
    await expect(
      check({
        request: retry,
        userId: ids.memberId,
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toMatchObject(notValid);

    await t.run(async (ctx) => {
      const token = await ctx.db.query("actionConfirmationTokens").first();
      if (!token) {
        throw new Error("Expected the issued token.");
      }
      await ctx.db.patch(token._id, { expiresAt: Date.now() - 1 });
    });
    await expect(
      check({
        request: retry,
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toMatchObject({
      data: "This confirmation token expired. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });
  });

  it("accepts a token only from the surface that received it", async () => {
    const { check, readRows, retry } = await createFixture();
    const checkFrom = async (
      surface: ConfirmationSurface,
      confirmation?: { token: string; acknowledgement: string },
    ) => await check({ request: retry, surface, confirmation });
    const firstClient = { kind: "mcp" as const, grantId: "grant-1", clientId: "client-1" };
    const challenge = await checkFrom(firstClient);
    if (challenge.state !== "needs_confirmation") {
      throw new Error("Expected a confirmation request.");
    }
    const confirmation = { token: challenge.token, acknowledgement: challenge.acknowledgement };
    const anotherClient = {
      data: "This confirmation token was issued to another client. Nothing changed. Call the action again without confirmation to get a new confirmation request.",
    };

    await expect(
      checkFrom({ kind: "mcp", grantId: "grant-2", clientId: "client-2" }, confirmation),
    ).rejects.toMatchObject(anotherClient);
    await expect(
      checkFrom({ kind: "mcp", grantId: "grant-1", clientId: "client-2" }, confirmation),
    ).rejects.toMatchObject(anotherClient);
    await expect(checkFrom(dashboard, confirmation)).rejects.toMatchObject({
      data: expect.stringContaining("This confirmation token was issued to another client."),
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });

    await expect(checkFrom(firstClient, confirmation)).resolves.toEqual({ state: "confirmed" });
    await expect(readRows()).resolves.toMatchObject({ audit: [{ surface: firstClient }] });
  });

  it("rejects a token of a retired action and a token for another repository", async () => {
    const { check, ids, issue, readRows, retry, t } = await createFixture();
    await t.run(async (ctx) => {
      await ctx.db.insert("actionConfirmationTokens", {
        tokenHash: await sha256Hex("sbcf_old_detach"),
        userId: ids.ownerId,
        surface: dashboard,
        action: "detach_resource",
        requestDigest: "old-digest",
        effect: "Samebase removes the Worker scout from scout-owner/scout.",
        acknowledgement: "I approve removing Worker scout from scout-owner/scout in Samebase",
        createdAt: Date.now(),
        expiresAt: Date.now() + 60_000,
      });
    });
    const otherChallenge = await issue({
      action: "retry_provider_setup",
      repositoryId: ids.otherRepositoryId,
    });

    await expect(
      check({
        request: retry,
        confirmation: {
          token: "sbcf_old_detach",
          acknowledgement: "I approve removing Worker scout from scout-owner/scout in Samebase",
        },
      }),
    ).rejects.toMatchObject({
      data: "This confirmation token belongs to another action. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(
      check({
        request: retry,
        confirmation: {
          token: otherChallenge.token,
          acknowledgement: otherChallenge.acknowledgement,
        },
      }),
    ).rejects.toMatchObject({
      data: "The request changed after it was approved. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });
  });

  it("rejects a wrong sentence without using the token", async () => {
    const { check, issue, readRows, retry } = await createFixture();
    const challenge = await issue(retry);

    await expect(
      check({
        request: retry,
        confirmation: { token: challenge.token, acknowledgement: "I approve a new setup run" },
      }),
    ).rejects.toMatchObject({
      data: `The acknowledgement does not match, so nothing changed. Send exactly: ${challenge.acknowledgement}`,
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });

    await expect(
      check({
        request: retry,
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).resolves.toEqual({ state: "confirmed" });
  });

  it("deletes a token at its expiry", async () => {
    vi.useFakeTimers();
    const { issue, readRows, retry, t } = await createFixture();
    await issue(retry);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(readRows()).resolves.toEqual({ tokens: [], audit: [] });
  });
});
