import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api, components, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { readGitHubSignInMatch } from "../githubUserAuthorizations";
import { makeConvexTest } from "../test.setup";
import { readHubProfile } from "./signIn";

type ConvexTest = ReturnType<typeof makeConvexTest>;

beforeEach(() => {
  vi.stubEnv("AUTO_APPROVE_NEW_USERS", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

type HubIdentity = {
  /** The connector's own account id, which `authAccounts` keys the identity by. */
  id: string;
  email: string;
  emailVerified?: boolean;
};

/**
The sign-in that a hub method hands to the user callbacks: the profile mapping of convex/auth.ts
applied to id_token claims. The claims have the shape of `signIdToken` in
`packages/identity-broker/src/client/jwt.ts` of samebase/identity-broker, with
`connector_account_id` from its next release.
*/
function hubProvider(connector: "github" | "google", identity: HubIdentity) {
  // The hub's pairwise subject differs from the connector's account id.
  const subject = `${connector}-subject-${identity.id}`;
  return {
    name: `hub-${connector}` as const,
    accountId: subject,
    profile: readHubProfile({
      iss: "https://auth.samebase.com",
      aud: "samebase-client",
      iat: 1_800_000_000,
      exp: 1_800_000_300,
      sub: subject,
      connector,
      connector_account_id: identity.id,
      email: identity.email,
      email_verified: identity.emailVerified ?? true,
      name: "OAuth User",
      picture: "https://example.com/avatar.png",
    }),
  };
}

function githubProvider(identity: HubIdentity) {
  return hubProvider("github", identity);
}

function googleProvider(identity: HubIdentity) {
  return hubProvider("google", identity);
}

/** Runs the two user callbacks the way the core runs them for one hub sign-in. */
async function signIn(
  t: ConvexTest,
  provider: ReturnType<typeof hubProvider>,
  knownUserId?: Id<"users">,
) {
  const userId =
    knownUserId ?? (await t.mutation(internal.identity.signIn.createUser, { provider }));
  await t.mutation(internal.identity.signIn.onSignIn, { provider, userId });
  return userId;
}

async function insertUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  return await ctx.db.insert("users", {
    state: "active",
    email,
    emailVerificationTime: Date.now(),
    isApproved: true,
    termsVersion: "2026-08-12",
    termsAcceptedAt: 1,
  });
}

async function readAccounts(t: ConvexTest, userId: Id<"users">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (query) => query.eq("userId", userId))
        .collect(),
  );
}

describe("Samebase OAuth sign-in callbacks", () => {
  it("keeps a new signup when its scheduled notification fails", async () => {
    // Convex uses V8; the edge-runtime test host lacks the SDK's Node process metadata.
    vi.stubGlobal("EdgeRuntime", undefined);
    vi.useFakeTimers();
    vi.stubEnv("CONVEX_DEPLOYMENT", "prod:samebase");
    vi.stubEnv("CLOUDFLARE_EMAIL_ACCOUNT_ID", "account-id");
    vi.stubEnv("CLOUDFLARE_EMAIL_API_TOKEN", "email-token");
    const fetch = vi.fn(async () => {
      // Cloudflare REST error example, checked 2026-10-01:
      // https://developers.cloudflare.com/email-service/api/send-emails/rest-api/
      return new Response(
        JSON.stringify({
          success: false,
          errors: [{ code: 10001, message: "email.sending.error.invalid_request_schema" }],
          messages: [],
          result: null,
        }),
        { status: 400 },
      );
    });
    vi.stubGlobal("fetch", fetch);
    const t = makeConvexTest();

    const userId = await signIn(
      t,
      googleProvider({ id: "google-new-notification-failure", email: "new-signup@example.com" }),
    );

    expect(fetch).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    await t.finishInProgressScheduledFunctions();
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(
      t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(2)),
    ).resolves.toMatchObject([{ state: { kind: "failed" } }]);
    await expect(t.run(async (ctx) => ctx.db.get(userId))).resolves.toMatchObject({
      state: "active",
      email: "new-signup@example.com",
    });
    const threads = await t.query(components.mail.mail.listThreads, {
      inboxId: null,
      paginationOpts: { numItems: 10, cursor: null },
    });
    const messages = await t.query(components.mail.mail.listMessages, {
      threadId: threads.page[0]._id,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(messages.page).toMatchObject([{ status: "rejected", to: ["nicuchiciuc@gmail.com"] }]);
  });

  it("creates an approved verified user with its GitHub identity", async () => {
    const t = makeConvexTest();

    const userId = await signIn(
      t,
      githubProvider({ id: "github-new", email: " NEW-GITHUB@example.com " }),
    );

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user).toMatchObject({
      state: "active",
      email: "new-github@example.com",
      name: "OAuth User",
      image: "https://example.com/avatar.png",
      emailVerificationTime: expect.any(Number),
      isApproved: true,
    });
    expect(user).not.toHaveProperty("termsVersion");
    // The GitHub row holds the raw GitHub user id; the hub reports no GitHub login.
    const accounts = await readAccounts(t, userId);
    expect(accounts).toMatchObject([
      {
        provider: "github",
        providerAccountId: "github-new",
        emailVerified: "new-github@example.com",
      },
    ]);
    expect(accounts[0]).not.toHaveProperty("githubLogin");
    await expect(
      t.withIdentity({ subject: userId }).query(api.users.currentViewerAccess, {}),
    ).resolves.toMatchObject({ role: "role_terms_pending" });
  });

  it.each([
    { autoApprove: "false" as const, label: "disabled" },
    { autoApprove: undefined, label: "unset" },
  ])("creates an unapproved user when automatic approval is $label", async ({ autoApprove }) => {
    if (autoApprove === undefined) {
      vi.unstubAllEnvs();
    } else {
      vi.stubEnv("AUTO_APPROVE_NEW_USERS", autoApprove);
    }
    const t = makeConvexTest();

    const userId = await signIn(
      t,
      googleProvider({ id: "google-pending", email: "p@example.com" }),
    );

    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      email: "p@example.com",
      isApproved: false,
    });
  });

  it("returns the user of a GitHub identity from before the hub and keeps its account email", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "original@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "github-known",
        emailVerified: "original@example.com",
        githubLogin: "old-login",
      });
      return userId;
    });

    await expect(
      signIn(t, githubProvider({ id: "github-known", email: "changed@example.com" })),
    ).resolves.toBe(userId);

    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      email: "original@example.com",
    });
    await expect(readAccounts(t, userId)).resolves.toMatchObject([
      {
        providerAccountId: "github-known",
        emailVerified: "changed@example.com",
        githubLogin: "old-login",
      },
    ]);
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toHaveLength(
      1,
    );
  });

  it("returns the user of a Google identity from before the hub when its email changed", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "google-original@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-known",
        emailVerified: "google-original@example.com",
      });
      return userId;
    });

    await expect(
      signIn(t, googleProvider({ id: "google-known", email: "google-changed@example.com" })),
    ).resolves.toBe(userId);

    await expect(
      t.run(async (ctx) => await ctx.db.query("users").collect()),
    ).resolves.toMatchObject([{ _id: userId, email: "google-original@example.com" }]);
    await expect(readAccounts(t, userId)).resolves.toMatchObject([
      {
        provider: "google",
        providerAccountId: "google-known",
        emailVerified: "google-changed@example.com",
      },
    ]);
  });

  it("writes the missing GitHub row with the raw GitHub user id on a GitHub sign-in", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => await insertUser(ctx, "raw-id@example.com"));

    // The core already knows the hub subject, so only onSignIn runs.
    await signIn(t, githubProvider({ id: "12345", email: "raw-id@example.com" }), userId);

    await expect(readAccounts(t, userId)).resolves.toMatchObject([
      { provider: "github", providerAccountId: "12345", emailVerified: "raw-id@example.com" },
    ]);
    await expect(
      t.run(async (ctx) => await readGitHubSignInMatch(ctx.db, { userId, githubUserId: "12345" })),
    ).resolves.toBe("matched");
  });

  it("leaves the GitHub row unchanged on a Google sign-in", async () => {
    const t = makeConvexTest();
    const { githubAccount, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "both@example.com");
      const githubAccountId = await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "67890",
        emailVerified: "github-observation@example.com",
        githubLogin: "both-login",
      });
      return { githubAccount: await ctx.db.get(githubAccountId), userId };
    });

    await expect(
      signIn(t, googleProvider({ id: "google-both", email: "Both@Example.com" })),
    ).resolves.toBe(userId);

    const accounts = await readAccounts(t, userId);
    expect(accounts).toHaveLength(2);
    expect(accounts.find((account) => account.provider === "github")).toEqual(githubAccount);
  });

  it("attaches a new identity to the user with the same verified account email", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "shared@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-shared",
        emailVerified: "shared@example.com",
      });
      return userId;
    });

    await expect(
      signIn(t, githubProvider({ id: "github-shared", email: "Shared@Example.com" })),
    ).resolves.toBe(userId);
    await expect(readAccounts(t, userId)).resolves.toHaveLength(2);
  });

  it("rejects an identity whose email belongs to an unverified account", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      await ctx.db.insert("users", { state: "active", email: "unverified@example.com" });
    });

    await expect(
      signIn(t, githubProvider({ id: "github-unverified-owner", email: "unverified@example.com" })),
    ).rejects.toMatchObject({
      data: "The email on this GitHub account belongs to a Samebase account that cannot use it. Sign in with an existing method.",
    });
  });

  it("rejects a provider email that the provider did not verify", async () => {
    const t = makeConvexTest();

    await expect(
      signIn(
        t,
        githubProvider({ id: "github-unverified", email: "u@example.com", emailVerified: false }),
      ),
    ).rejects.toMatchObject({ data: "GitHub did not provide a verified email address." });
    await expect(
      signIn(
        t,
        googleProvider({ id: "google-unverified", email: "u@example.com", emailVerified: false }),
      ),
    ).rejects.toMatchObject({ data: "Google did not provide a verified email address." });
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toEqual([]);
  });

  it("rejects a second GitHub identity for a user that already has one", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "one-github@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "github-first",
        emailVerified: "one-github@example.com",
        githubLogin: "first",
      });
      return userId;
    });

    await expect(
      signIn(t, githubProvider({ id: "github-second", email: "one-github@example.com" })),
    ).rejects.toMatchObject({
      data: "This Samebase account already uses a different GitHub account. Sign in with that account.",
    });
    await expect(readAccounts(t, userId)).resolves.toMatchObject([
      { providerAccountId: "github-first" },
    ]);
  });

  it("rejects a GitHub identity that provides access to another user", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "github-access-owner@example.com");
      const now = Date.now();
      await ctx.db.insert("githubUserAuthorizations", {
        userId,
        githubUserId: "github-access-owner",
        githubUserLogin: "access-owner",
        accessToken: "access-token",
        accessTokenExpiresAt: now + 60_000,
        refreshToken: "refresh-token",
        refreshTokenExpiresAt: now + 120_000,
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(
      signIn(
        t,
        githubProvider({ id: "github-access-owner", email: "different-email@example.com" }),
      ),
    ).rejects.toMatchObject({
      data: "This GitHub account already provides access for another Samebase account.",
    });
  });

  it("rejects sign-in for deleting and deleted users", async () => {
    const t = makeConvexTest();
    const { deletedUserId, deletingUserId } = await t.run(async (ctx) => {
      const deletingUserId = await insertUser(ctx, "deleting@example.com");
      const now = Date.now();
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: { state: "active", userId: deletingUserId, email: "deleting@example.com" },
        completionCapability: "c".repeat(64),
        currentStep: "request_accepted",
        requestedAt: now,
        updatedAt: now,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "deleting-sign-in-workflow", attempt: 1 },
      });
      await ctx.db.patch(deletingUserId, { state: "deleting", runId, requestedAt: now });
      const deletedUserId = await insertUser(ctx, "deleted@example.com");
      await ctx.db.replace(deletedUserId, { state: "deleted", deletedAt: now });
      return { deletedUserId, deletingUserId };
    });

    await expect(
      signIn(t, googleProvider({ id: "google-deleting", email: "deleting@example.com" })),
    ).rejects.toMatchObject({ data: "Account deletion is in progress." });
    await expect(
      signIn(t, googleProvider({ id: "google-deleted", email: "x@example.com" }), deletedUserId),
    ).rejects.toMatchObject({ data: "Account is unavailable." });
    await expect(readAccounts(t, deletingUserId)).resolves.toEqual([]);
  });

  it("creates a new user when the email belongs only to a deleted account", async () => {
    const t = makeConvexTest();
    const deletedUserId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "returning@example.com");
      await ctx.db.replace(userId, { state: "deleted", deletedAt: 1 });
      return userId;
    });

    const newUserId = await signIn(
      t,
      githubProvider({ id: "github-returning", email: "returning@example.com" }),
    );

    expect(newUserId).not.toBe(deletedUserId);
    await expect(t.run(async (ctx) => await ctx.db.get(newUserId))).resolves.toMatchObject({
      state: "active",
      email: "returning@example.com",
    });
  });
});

describe("hub profile mapping", () => {
  it("refuses claims without the connector's account id", () => {
    // The broker before `connector_account_id`: its users cannot be mapped to existing accounts.
    expect(() =>
      readHubProfile({
        sub: "github-subject",
        connector: "github",
        email: "x@example.com",
        email_verified: true,
      }),
    ).toThrow();
  });
});
