import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { insertTestOrganizationBillingAccount, makeConvexTest } from "../test.setup";
import type { ConfirmedActionRequest } from "./confirmations";

/*
State axes of the confirmation check: whether a confirmation is sent; whether its token exists, is
the caller's, is unused, is unexpired, was issued for this action and this normalized request; and
whether the acknowledgement is exact. Only the last row of that table confirms.
*/

const dashboard = { kind: "dashboard" as const };

/** scout-owner/scout with one Worker and one Convex project, an owner, and a second member. */
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
      cloudflareAccount: { accountId: "cloudflare-account", accountName: "Cloudflare account" },
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
      userId: ownerId,
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
    return { convexProjectId, memberId, organizationId, ownerId, repositoryId, workerId };
  });

  const detachWorker: ConfirmedActionRequest = {
    action: "detach_resource",
    repositoryId: ids.repositoryId,
    resource: { kind: "cloudflare_worker", workerId: ids.workerId },
  };
  const connectWorker = (
    rootDirectory: string,
    convexProjectSlug: string | null = "scout",
  ): ConfirmedActionRequest => ({
    action: "connect_cloudflare_worker",
    repositoryId: ids.repositoryId,
    workerName: "legacy-landing",
    workerTag: "legacy-landing-tag",
    rootDirectory,
    buildTokenUuid: "build-token",
    convexProjectId: ids.convexProjectId,
    convexProjectSlug,
  });
  const check = async (args: {
    request: ConfirmedActionRequest;
    userId?: Id<"users">;
    confirmation?: { token: string; acknowledgement: string };
  }) =>
    await t.mutation(internal.repository.confirmations.check, {
      userId: args.userId ?? ids.ownerId,
      surface: dashboard,
      request: args.request,
      confirmation: args.confirmation,
    });
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

  return { check, connectWorker, detachWorker, ids, issue, readRows, t };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("action confirmation check", () => {
  it("returns the effect, the acknowledgement, and a token, and stores only the token hash", async () => {
    const { check, detachWorker, readRows } = await createFixture();

    const challenge = await check({ request: detachWorker });

    expect(challenge).toEqual({
      state: "needs_confirmation",
      effect:
        "Samebase removes the Worker scout from scout-owner/scout. The Worker keeps running in Cloudflare, and Samebase changes no Cloudflare setting or key.",
      acknowledgement: "I approve removing Worker scout from scout-owner/scout in Samebase",
      token: expect.stringMatching(/^sbcf_/),
      expiresAt: expect.any(Number),
    });
    const { audit, tokens } = await readRows();
    expect(audit).toEqual([]);
    expect(tokens).toEqual([
      expect.objectContaining({
        action: "detach_resource",
        acknowledgement: "I approve removing Worker scout from scout-owner/scout in Samebase",
        expiresAt: challenge.state === "needs_confirmation" ? challenge.expiresAt : 0,
      }),
    ]);
    expect(JSON.stringify(tokens)).not.toContain(
      challenge.state === "needs_confirmation" ? challenge.token : "missing",
    );
    expect(tokens[0]?.consumedAt).toBeUndefined();
    expect(tokens[0]?.expiresAt).toBe((tokens[0]?.createdAt ?? 0) + 10 * 60 * 1000);
  });

  it("describes the retry that the repository's provisioning mode runs", async () => {
    const { ids, issue } = await createFixture();

    const samebase = await issue({
      action: "retry_provider_setup",
      repositoryId: ids.repositoryId,
      provisioning: "samebase",
    });
    const repositoryActions = await issue({
      action: "retry_provider_setup",
      repositoryId: ids.repositoryId,
      provisioning: "repository_actions",
    });

    expect(samebase).toMatchObject({
      effect:
        "Samebase starts a new provider setup run for scout-owner/scout. It creates missing Convex and Cloudflare resources. When the setup includes Cloudflare, it rewrites the Workers Builds settings of the Worker, revokes and replaces the Convex deploy keys that it recorded, and starts a production build.",
      acknowledgement:
        "I approve a new provider setup run for scout-owner/scout, which can rewrite its Workers Builds settings and revoke and replace its Convex deploy keys",
    });
    expect(repositoryActions).toMatchObject({
      effect:
        "Samebase starts a new setup run for scout-owner/scout. It writes the credential of the organization's Convex connection into the repository's GitHub Actions secret CONVEX_ACCESS_TOKEN and the Convex team id into its variable CONVEX_TEAM_ID, replacing their values. If the starter is not seeded yet, it seeds the starter, which starts a deployment in the repository's GitHub Actions. Then it syncs the default branch tree.",
      acknowledgement:
        "I approve a new setup run for scout-owner/scout, which replaces its GitHub Actions secret and variable with the organization's Convex connection credential and team id",
    });
    const repositoryActionsText = `${repositoryActions.effect} ${repositoryActions.acknowledgement}`;
    for (const samebaseOnly of [
      "Workers Builds",
      "deploy key",
      "Convex and Cloudflare resources",
    ]) {
      expect(repositoryActionsText).not.toContain(samebaseOnly);
    }
  });

  it("asks an MCP caller to state the user's approval, naming the arguments that change the effect", async () => {
    const { connectWorker, ids, t } = await createFixture();

    await expect(
      t.mutation(internal.repository.confirmations.check, {
        userId: ids.ownerId,
        surface: { kind: "mcp", grantId: "grant-1", clientId: "client-1" },
        request: connectWorker("apps/site"),
      }),
    ).resolves.toMatchObject({
      state: "needs_confirmation",
      effect:
        "Samebase attaches the Worker legacy-landing to scout-owner/scout, sets its Workers Builds settings to build scout-owner/scout from root directory apps/site, installs the deploy key of the Convex project scout at convex.json, and starts a production build. That build replaces what the Worker serves now.",
      acknowledgement:
        "I confirm that the user approved replacing the live deployment of Worker legacy-landing with a build of scout-owner/scout from root directory apps/site that deploys the Convex project scout at convex.json",
    });
  });

  it("confirms once with the token and the exact sentence, and writes the audit row", async () => {
    const { check, detachWorker, ids, issue, readRows } = await createFixture();
    const challenge = await issue(detachWorker);
    const confirmation = { token: challenge.token, acknowledgement: challenge.acknowledgement };

    await expect(check({ request: detachWorker, confirmation })).resolves.toEqual({
      state: "confirmed",
    });

    const { audit, tokens } = await readRows();
    expect(tokens[0]?.consumedAt).toEqual(expect.any(Number));
    expect(audit).toEqual([
      expect.objectContaining({
        userId: ids.ownerId,
        organizationId: ids.organizationId,
        repositoryId: ids.repositoryId,
        action: "detach_resource",
        resource: {
          kind: "cloudflare_worker",
          accountId: "cloudflare-account",
          workerTag: "scout-tag",
          workerName: "scout",
        },
        requestDigest: tokens[0]?.requestDigest,
        effect: challenge.effect,
        acknowledgement: challenge.acknowledgement,
        surface: { kind: "dashboard" },
        issuedAt: tokens[0]?.createdAt,
        confirmedAt: tokens[0]?.consumedAt,
      }),
    ]);
    await expect(check({ request: detachWorker, confirmation })).rejects.toMatchObject({
      data: "This confirmation token was already used. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [expect.anything()] });
  });

  it("rejects an unknown token, another user's token, and an expired token", async () => {
    const { check, detachWorker, ids, issue, readRows, t } = await createFixture();
    const challenge = await issue(detachWorker);
    const notValid = {
      data: "This confirmation token is not valid. Nothing changed. Start the action again to get a new confirmation.",
    };

    await expect(
      check({
        request: detachWorker,
        confirmation: { token: "sbcf_unknown", acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toMatchObject(notValid);
    await expect(
      check({
        request: detachWorker,
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
        request: detachWorker,
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toMatchObject({
      data: "This confirmation token expired. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });
  });

  it("accepts a token only from the surface that received it", async () => {
    const { detachWorker, ids, readRows, t } = await createFixture();
    const checkFrom = async (
      surface: { kind: "dashboard" } | { kind: "mcp"; grantId: string; clientId: string },
      confirmation?: { token: string; acknowledgement: string },
    ) =>
      await t.mutation(internal.repository.confirmations.check, {
        userId: ids.ownerId,
        surface,
        request: detachWorker,
        confirmation,
      });
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

  it("rejects a token for another action or another resource", async () => {
    const { check, detachWorker, ids, issue, readRows } = await createFixture();
    const retryChallenge = await issue({
      action: "retry_provider_setup",
      repositoryId: ids.repositoryId,
      provisioning: "samebase",
    });
    const workerChallenge = await issue(detachWorker);

    await expect(
      check({
        request: detachWorker,
        confirmation: {
          token: retryChallenge.token,
          acknowledgement: retryChallenge.acknowledgement,
        },
      }),
    ).rejects.toMatchObject({
      data: "This confirmation token belongs to another action. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(
      check({
        request: {
          action: "detach_resource",
          repositoryId: ids.repositoryId,
          resource: { kind: "convex_project", convexProjectId: ids.convexProjectId },
        },
        confirmation: {
          token: workerChallenge.token,
          acknowledgement: workerChallenge.acknowledgement,
        },
      }),
    ).rejects.toMatchObject({
      data: "The request changed after it was approved. Nothing changed. Start the action again to get a new confirmation.",
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });
  });

  it("rejects a changed argument and a wrong sentence without using the token", async () => {
    const { check, connectWorker, issue, readRows } = await createFixture();
    const challenge = await issue(connectWorker("apps/site"));

    await expect(
      check({
        request: connectWorker("apps/admin"),
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toMatchObject({
      data: expect.stringContaining("The request changed after it was approved."),
    });
    await expect(
      check({
        request: connectWorker("apps/site"),
        confirmation: {
          token: challenge.token,
          acknowledgement: "I approve replacing the live deployment of Worker legacy-landing",
        },
      }),
    ).rejects.toMatchObject({
      data: `The acknowledgement does not match, so nothing changed. Send exactly: ${challenge.acknowledgement}`,
    });
    await expect(readRows()).resolves.toMatchObject({ audit: [] });

    await expect(
      check({
        request: connectWorker("apps/site"),
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).resolves.toEqual({ state: "confirmed" });
  });

  it("accepts an unchanged request when the Convex slug cannot be read on the second call", async () => {
    const { check, connectWorker, issue } = await createFixture();
    const challenge = await issue(connectWorker("apps/site"));

    await expect(
      check({
        request: connectWorker("apps/site", null),
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).resolves.toEqual({ state: "confirmed" });
  });

  it("refuses connect, rotation, and detach while another provider operation runs, and keeps the token unused", async () => {
    const { check, connectWorker, detachWorker, ids, issue, readRows, t } = await createFixture();
    const challenge = await issue(connectWorker("apps/site"));
    await t.mutation(internal.repository.infrastructureOperation.claimManualProviderWrite, {
      repositoryId: ids.repositoryId,
      userId: ids.ownerId,
      actionId: "manual-repair",
      action: "create_convex_project",
    });
    const busy =
      "Another Samebase setup or provider change is running for this repository, so nothing changed. Try again after it finishes.";

    await expect(
      check({
        request: connectWorker("apps/site"),
        confirmation: { token: challenge.token, acknowledgement: challenge.acknowledgement },
      }),
    ).rejects.toThrow(busy);
    await expect(
      check({
        request: {
          action: "rotate_convex_deploy_keys",
          repositoryId: ids.repositoryId,
          workerId: ids.workerId,
          convexProjectId: ids.convexProjectId,
          convexProjectSlug: "scout",
        },
      }),
    ).rejects.toThrow(busy);
    // Detach checks the lock again after the check, so its first call refuses before a challenge.
    await expect(check({ request: detachWorker })).rejects.toThrow(busy);

    const { audit, tokens } = await readRows();
    expect(audit).toEqual([]);
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.consumedAt).toBeUndefined();
  });

  it("deletes a token at its expiry", async () => {
    vi.useFakeTimers();
    const { detachWorker, issue, readRows, t } = await createFixture();
    await issue(detachWorker);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await expect(readRows()).resolves.toEqual({ tokens: [], audit: [] });
  });
});
