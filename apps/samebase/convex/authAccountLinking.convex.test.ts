import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vite-plus/test";

import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { createOrUpdateSamebaseUser, type CreateOrUpdateAuthUserArgs } from "./authAccountLinking";
import type { AuthAccountProvider } from "./authAccountModel";
import { makeConvexTest } from "./test.setup";

function oauthArgs(args: {
  email: string;
  existingSessionId: Id<"authSessions"> | null;
  existingUserId: Id<"users"> | null;
  provider: AuthAccountProvider;
  providerAccountId: string;
}): CreateOrUpdateAuthUserArgs {
  const provider =
    args.provider === "google"
      ? Google({ clientId: "google-client-id", clientSecret: "google-client-secret" })
      : GitHub({ clientId: "github-client-id", clientSecret: "github-client-secret" });
  return {
    type: "oauth",
    provider,
    providerAccountId: args.providerAccountId,
    existingSessionId: args.existingSessionId,
    existingUserId: args.existingUserId,
    profile: {
      email: args.email,
      emailVerified: true,
      name: "OAuth User",
      image: "https://example.com/avatar.png",
      ...(args.provider === "github" ? { githubLogin: "oauth-user" } : {}),
    },
  };
}

async function insertUser(ctx: MutationCtx, email: string): Promise<Id<"users">> {
  return await ctx.db.insert("users", {
    state: "active",
    email,
    emailVerificationTime: Date.now(),
    isApproved: true,
  });
}

async function insertLinkSession(
  ctx: MutationCtx,
  args: {
    expiresAt: number;
    provider: AuthAccountProvider;
    sessionExpiresAt?: number;
    userId: Id<"users">;
  },
): Promise<Id<"authSessions">> {
  return await ctx.db.insert("authSessions", {
    userId: args.userId,
    expirationTime: args.sessionExpiresAt ?? Date.now() + 60_000,
    accountLinkIntent: {
      provider: args.provider,
      expiresAt: args.expiresAt,
    },
  });
}

describe("Samebase OAuth account linking", () => {
  it("returns the known user for a signed-out Google provider identity", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "known-google@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-known",
        emailVerified: "known-google@example.com",
      });
      return userId;
    });

    const resolvedUserId = await t.run(async (ctx) =>
      createOrUpdateSamebaseUser(
        ctx,
        oauthArgs({
          provider: "google",
          providerAccountId: "google-known",
          email: "known-google@example.com",
          existingSessionId: null,
          existingUserId: userId,
        }),
      ),
    );

    expect(resolvedUserId).toBe(userId);
    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toHaveLength(
      1,
    );
  });

  it("keeps the Samebase account email when a known GitHub identity changes email", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "stable-account@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "github-known",
        emailVerified: "old-github@example.com",
      });
      return userId;
    });

    const resolvedUserId = await t.run(async (ctx) =>
      createOrUpdateSamebaseUser(
        ctx,
        oauthArgs({
          provider: "github",
          providerAccountId: "github-known",
          email: "new-github@example.com",
          existingSessionId: null,
          existingUserId: userId,
        }),
      ),
    );

    expect(resolvedUserId).toBe(userId);
    await expect(t.run(async (ctx) => await ctx.db.get(userId))).resolves.toMatchObject({
      email: "stable-account@example.com",
    });
  });

  it("requires explicit linking when GitHub uses an existing Google account email", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "matching@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-existing",
        emailVerified: "matching@example.com",
      });
    });

    const linkAttempt = t.run(async (ctx) =>
      createOrUpdateSamebaseUser(
        ctx,
        oauthArgs({
          provider: "github",
          providerAccountId: "github-new",
          email: " MATCHING@example.com ",
          existingSessionId: null,
          existingUserId: null,
        }),
      ),
    );

    await expect(linkAttempt).rejects.toBeInstanceOf(ConvexError);
    await expect(linkAttempt).rejects.toMatchObject({ data: "account-link-required" });

    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toHaveLength(
      1,
    );
  });

  it("creates a verified Samebase user from a new GitHub identity", async () => {
    const t = makeConvexTest();

    const userId = await t.run(async (ctx) =>
      createOrUpdateSamebaseUser(
        ctx,
        oauthArgs({
          provider: "github",
          providerAccountId: "github-new",
          email: " NEW-GITHUB@example.com ",
          existingSessionId: null,
          existingUserId: null,
        }),
      ),
    );

    const user = await t.run(async (ctx) => await ctx.db.get(userId));
    expect(user).toMatchObject({
      email: "new-github@example.com",
      emailVerificationTime: expect.any(Number),
    });
    expect(user).not.toHaveProperty("name");
    expect(user).not.toHaveProperty("image");
  });

  it("links GitHub to the user whose current session has a valid intent", async () => {
    const t = makeConvexTest();
    const { sessionId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "current-session@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-current",
        emailVerified: "current-session@example.com",
      });
      const sessionId = await insertLinkSession(ctx, {
        userId,
        provider: "github",
        expiresAt: Date.now() + 60_000,
      });
      return { sessionId, userId };
    });

    const resolvedUserId = await t.run(async (ctx) =>
      createOrUpdateSamebaseUser(
        ctx,
        oauthArgs({
          provider: "github",
          providerAccountId: "github-linked",
          email: "different-provider-email@example.com",
          existingSessionId: sessionId,
          existingUserId: null,
        }),
      ),
    );

    expect(resolvedUserId).toBe(userId);
    const snapshot = await t.run(async (ctx) => ({
      session: await ctx.db.get(sessionId),
      user: await ctx.db.get(userId),
    }));
    expect(snapshot.session?.accountLinkIntent).toBeUndefined();
    expect(snapshot.user).toMatchObject({
      email: "current-session@example.com",
    });
  });

  it("rejects a provider that does not match the current session link intent", async () => {
    const t = makeConvexTest();
    const sessionId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "wrong-intent@example.com");
      const sessionId = await insertLinkSession(ctx, {
        userId,
        provider: "google",
        expiresAt: Date.now() + 60_000,
      });
      return sessionId;
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "github",
            providerAccountId: "github-wrong-intent",
            email: "wrong-intent@example.com",
            existingSessionId: sessionId,
            existingUserId: null,
          }),
        ),
      ),
    ).rejects.toThrow(
      "Sign out before you sign in with GitHub, or connect it in Account settings.",
    );

    await expect(t.run(async (ctx) => await ctx.db.get(sessionId))).resolves.toMatchObject({
      accountLinkIntent: {
        provider: "google",
      },
    });
  });

  it("rejects an expired link intent", async () => {
    const t = makeConvexTest();
    const sessionId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "expired-intent@example.com");
      const sessionId = await insertLinkSession(ctx, {
        userId,
        provider: "google",
        expiresAt: Date.now() - 1,
      });
      return sessionId;
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "google",
            providerAccountId: "google-expired-intent",
            email: "expired-intent@example.com",
            existingSessionId: sessionId,
            existingUserId: null,
          }),
        ),
      ),
    ).rejects.toThrow(
      "Sign out before you sign in with Google, or connect it in Account settings.",
    );

    await expect(t.run(async (ctx) => await ctx.db.get(sessionId))).resolves.toMatchObject({
      accountLinkIntent: {
        provider: "google",
      },
    });
  });

  it("rejects a Connect callback after its session expires", async () => {
    const t = makeConvexTest();
    const sessionId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "expired-session@example.com");
      return await insertLinkSession(ctx, {
        userId,
        provider: "github",
        expiresAt: Date.now() + 60_000,
        sessionExpiresAt: Date.now() - 1,
      });
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "github",
            providerAccountId: "github-expired-session",
            email: "new-after-expiry@example.com",
            existingSessionId: sessionId,
            existingUserId: null,
          }),
        ),
      ),
    ).rejects.toThrow("The account-linking session expired. Start again from Account settings.");

    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toHaveLength(
      1,
    );
  });

  it("rejects a Connect callback after its session is deleted", async () => {
    const t = makeConvexTest();
    const sessionId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "deleted-session@example.com");
      const sessionId = await insertLinkSession(ctx, {
        userId,
        provider: "google",
        expiresAt: Date.now() + 60_000,
      });
      await ctx.db.delete(sessionId);
      return sessionId;
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "google",
            providerAccountId: "google-deleted-session",
            email: "new-after-deletion@example.com",
            existingSessionId: sessionId,
            existingUserId: null,
          }),
        ),
      ),
    ).rejects.toThrow("The account-linking session expired. Start again from Account settings.");

    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toHaveLength(
      1,
    );
  });

  it("does not start Connect from an expired current session", async () => {
    const t = makeConvexTest();
    const { sessionId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "begin-expired@example.com");
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() - 1,
      });
      return { sessionId, userId };
    });

    await expect(
      t
        .withIdentity({
          subject: `${userId}|${sessionId}`,
          tokenIdentifier: `test:${userId}`,
        })
        .mutation(api.users.beginAuthAccountLink, { provider: "github" }),
    ).rejects.toThrow("The current sign-in session expired.");

    await expect(t.run(async (ctx) => await ctx.db.get(sessionId))).resolves.not.toHaveProperty(
      "accountLinkIntent",
    );
  });

  it("returns a safe error when the sign-in method connects before Connect starts", async () => {
    const t = makeConvexTest();
    const { sessionId, userId } = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "begin-race@example.com");
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "github-already-connected",
        emailVerified: "begin-race@example.com",
      });
      return { sessionId, userId };
    });

    await expect(
      t
        .withIdentity({
          subject: `${userId}|${sessionId}`,
          tokenIdentifier: `test:${userId}`,
        })
        .mutation(api.users.beginAuthAccountLink, { provider: "github" }),
    ).rejects.toMatchObject({
      data: "This sign-in method is already connected.",
    });

    await expect(t.run(async (ctx) => await ctx.db.get(sessionId))).resolves.not.toHaveProperty(
      "accountLinkIntent",
    );
  });

  it("rejects a provider identity that belongs to another Samebase user", async () => {
    const t = makeConvexTest();
    const { otherUserId, sessionId } = await t.run(async (ctx) => {
      const currentUserId = await insertUser(ctx, "current-owner@example.com");
      const otherUserId = await insertUser(ctx, "other-owner@example.com");
      await ctx.db.insert("authAccounts", {
        userId: otherUserId,
        provider: "github",
        providerAccountId: "github-other-owner",
        emailVerified: "other-owner@example.com",
      });
      const sessionId = await insertLinkSession(ctx, {
        userId: currentUserId,
        provider: "github",
        expiresAt: Date.now() + 60_000,
      });
      return { otherUserId, sessionId };
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "github",
            providerAccountId: "github-other-owner",
            email: "other-owner@example.com",
            existingSessionId: sessionId,
            existingUserId: otherUserId,
          }),
        ),
      ),
    ).rejects.toThrow("This GitHub account belongs to another Samebase account.");

    await expect(t.run(async (ctx) => await ctx.db.get(sessionId))).resolves.toMatchObject({
      accountLinkIntent: {
        provider: "github",
      },
    });
  });

  it("does not create GitHub sign-in for an identity that provides access to another user", async () => {
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
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "github",
            providerAccountId: "github-access-owner",
            email: "different-github-email@example.com",
            existingSessionId: null,
            existingUserId: null,
          }),
        ),
      ),
    ).rejects.toThrow("This GitHub account already provides access for another Samebase account.");

    await expect(t.run(async (ctx) => await ctx.db.query("users").collect())).resolves.toHaveLength(
      1,
    );
  });

  it("rejects a known provider identity whose Samebase user is deleted", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "deleted-provider@example.com");
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-deleted-provider",
        emailVerified: "deleted-provider@example.com",
      });
      await ctx.db.replace(userId, { state: "deleted", deletedAt: Date.now() });
      return userId;
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "google",
            providerAccountId: "google-deleted-provider",
            email: "deleted-provider@example.com",
            existingSessionId: null,
            existingUserId: userId,
          }),
        ),
      ),
    ).rejects.toThrow("Account is unavailable.");
  });

  it("creates a new user ID when a deleted person signs up again", async () => {
    const t = makeConvexTest();
    const deletedUserId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "returning@example.com");
      await ctx.db.replace(userId, { state: "deleted", deletedAt: 1 });
      return userId;
    });

    const newUserId = await t.run(async (ctx) =>
      createOrUpdateSamebaseUser(
        ctx,
        oauthArgs({
          provider: "github",
          providerAccountId: "github-returning",
          email: "returning@example.com",
          existingSessionId: null,
          existingUserId: null,
        }),
      ),
    );

    expect(newUserId).not.toBe(deletedUserId);
    const rows = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row._id === deletedUserId)).toMatchObject({
      state: "deleted",
      deletedAt: 1,
    });
    expect(rows.find((row) => row._id === newUserId)).toMatchObject({
      state: "active",
      email: "returning@example.com",
    });
  });

  it("rejects sign-in for a deleting account", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      const userId = await insertUser(ctx, "deleting-sign-in@example.com");
      const initiatingSessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      const now = Date.now();
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: {
          state: "active",
          userId,
          email: "deleting-sign-in@example.com",
        },
        completionCapability: "c".repeat(64),
        currentStep: "request_accepted",
        requestedAt: now,
        updatedAt: now,
        initiatingSessionId,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: "deleting-sign-in-workflow", attempt: 1 },
      });
      await ctx.db.patch(userId, {
        state: "deleting",
        runId,
        requestedAt: now,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-deleting-sign-in",
        emailVerified: "deleting-sign-in@example.com",
      });
      return userId;
    });

    await expect(
      t.run(async (ctx) =>
        createOrUpdateSamebaseUser(
          ctx,
          oauthArgs({
            provider: "google",
            providerAccountId: "google-deleting-sign-in",
            email: "deleting-sign-in@example.com",
            existingSessionId: null,
            existingUserId: userId,
          }),
        ),
      ),
    ).rejects.toThrow("Account deletion is in progress.");
  });
});
