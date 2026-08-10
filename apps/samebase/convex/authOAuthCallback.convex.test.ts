import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

type OAuthActor = Pick<ReturnType<typeof makeConvexTest>, "action">;

async function startGitHubOAuth(
  t: ReturnType<typeof makeConvexTest>,
  options: {
    actor?: OAuthActor;
    redirectTo?: string;
  } = {},
) {
  const start = await (options.actor ?? t).action(api.auth.signIn, {
    provider: "github",
    params: { redirectTo: options.redirectTo ?? "/" },
  });
  if (start.redirect === undefined) {
    throw new Error("OAuth sign-in did not return a redirect.");
  }
  const internalRedirect = new URL(start.redirect);
  const signInResponse = await t.fetch(`${internalRedirect.pathname}${internalRedirect.search}`);
  const setCookie = signInResponse.headers.get("set-cookie");
  if (setCookie === null) {
    throw new Error("OAuth sign-in did not return its provider state.");
  }
  return setCookie
    .split(/, (?=[^;,]+=)/)
    .map((value) => value.split(";", 1)[0])
    .join("; ");
}

function stubGitHubOAuthProfile(args: { email: string; id: number; login: string }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") {
        return new Response(
          JSON.stringify({
            access_token: "github-access-token",
            token_type: "bearer",
            scope: "read:user,user:email",
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.origin === "https://api.github.com" && url.pathname === "/user") {
        // Source shape: https://api.github.com/users/octocat, captured 2026-08-08.
        return new Response(
          JSON.stringify({
            login: args.login,
            id: args.id,
            avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
            name: "The Octocat",
            email: null,
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      if (url.origin === "https://api.github.com" && url.pathname === "/user/emails") {
        // Source shape: GitHub REST email response documentation, captured 2026-08-08.
        return new Response(
          JSON.stringify([
            {
              email: args.email,
              primary: true,
              verified: true,
              visibility: "private",
            },
          ]),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected GitHub OAuth request: ${url.toString()}`);
    }),
  );
}

describe("OAuth callback errors", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_GITHUB_ID", "github-client-id");
    vi.stubEnv("AUTH_GITHUB_SECRET", "github-client-secret");
    vi.stubEnv("AUTH_GOOGLE_ID", "google-client-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "google-client-secret");
    vi.stubEnv("CONVEX_DEPLOYMENT", "local:auth-oauth-test");
    vi.stubEnv("CONVEX_SITE_URL", "https://convex.test");
    vi.stubEnv("SITE_URL", "https://samebase.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("returns a safe provider cancellation code to the app", async () => {
    const response = await makeConvexTest().fetch("/api/auth/callback/github?error=access_denied");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://samebase.test/?authorization-provider=github-sign-in&authorization-error=canceled",
    );
  });

  it("fails safely without linking when a signed-in callback has no Connect intent", async () => {
    const t = makeConvexTest();
    const { sessionId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "missing-intent@example.com",
        emailVerificationTime: Date.now(),
        isApproved: true,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-missing-intent",
        emailVerified: "missing-intent@example.com",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      return { sessionId, userId };
    });
    const actor = t.withIdentity({
      subject: `${userId}|${sessionId}`,
      tokenIdentifier: `test:${userId}`,
    });
    const cookie = await startGitHubOAuth(t, { actor, redirectTo: "/settings" });
    stubGitHubOAuthProfile({
      email: "selected-github@example.com",
      id: 583233,
      login: "selected-github",
    });

    const callbackResponse = await t.fetch("/api/auth/callback/github?code=missing-intent-code", {
      headers: { cookie },
    });

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(
      "https://samebase.test/settings?authorization-provider=github-sign-in&authorization-error=failed",
    );
    await expect(
      t.run(async (ctx) => {
        return await ctx.db
          .query("authAccounts")
          .withIndex("providerAndAccountId", (query) =>
            query.eq("provider", "github").eq("providerAccountId", "583233"),
          )
          .unique();
      }),
    ).resolves.toBeNull();
  });

  it("returns the account-linking code after GitHub verifies an existing Google email", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "octocat@github.com",
        emailVerificationTime: Date.now(),
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-octocat",
        emailVerified: "octocat@github.com",
      });
    });

    const cookie = await startGitHubOAuth(t);
    stubGitHubOAuthProfile({ email: "octocat@github.com", id: 583231, login: "octocat" });

    const callbackResponse = await t.fetch(`/api/auth/callback/github?code=github-code`, {
      headers: { cookie },
    });

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(
      "https://samebase.test/?authorization-provider=github-sign-in&authorization-error=account-link-required",
    );
  });

  it("returns a safe target mismatch when another GitHub identity connects before callback", async () => {
    const t = makeConvexTest();
    const { sessionId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        state: "active",
        email: "callback-race@example.com",
        emailVerificationTime: Date.now(),
        isApproved: true,
      });
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "google",
        providerAccountId: "google-callback-race",
        emailVerified: "callback-race@example.com",
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId,
        expirationTime: Date.now() + 60_000,
      });
      return { sessionId, userId };
    });
    const asUser = t.withIdentity({
      subject: `${userId}|${sessionId}`,
      tokenIdentifier: `test:${userId}`,
    });
    await asUser.mutation(api.users.beginAuthAccountLink, { provider: "github" });
    const cookie = await startGitHubOAuth(t, { actor: asUser, redirectTo: "/settings" });
    await t.run(async (ctx) => {
      await ctx.db.insert("authAccounts", {
        userId,
        provider: "github",
        providerAccountId: "github-connected-first",
        emailVerified: "callback-race@example.com",
      });
    });
    stubGitHubOAuthProfile({
      email: "callback-selection@example.com",
      id: 583232,
      login: "callback-selection",
    });

    const callbackResponse = await t.fetch("/api/auth/callback/github?code=github-race-code", {
      headers: { cookie },
    });

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(
      "https://samebase.test/settings?authorization-provider=github-sign-in&authorization-error=target-mismatch",
    );
    const snapshot = await t.run(async (ctx) => ({
      account: await ctx.db
        .query("authAccounts")
        .withIndex("userIdAndProvider", (query) =>
          query.eq("userId", userId).eq("provider", "github"),
        )
        .unique(),
      session: await ctx.db.get(sessionId),
    }));
    expect(snapshot.account).toMatchObject({ providerAccountId: "github-connected-first" });
    expect(snapshot.session).toMatchObject({ accountLinkIntent: { provider: "github" } });
  });

  it("stores and refreshes the GitHub login on its sign-in account", async () => {
    const t = makeConvexTest();
    const firstCookie = await startGitHubOAuth(t);
    stubGitHubOAuthProfile({ email: "octocat@github.com", id: 583231, login: "octocat" });

    const firstCallback = await t.fetch("/api/auth/callback/github?code=first-github-code", {
      headers: { cookie: firstCookie },
    });
    expect(firstCallback.status).toBe(302);

    const secondCookie = await startGitHubOAuth(t);
    stubGitHubOAuthProfile({
      email: "renamed-octocat@github.com",
      id: 583231,
      login: "renamed-octocat",
    });
    const secondCallback = await t.fetch("/api/auth/callback/github?code=second-github-code", {
      headers: { cookie: secondCookie },
    });
    expect(secondCallback.status).toBe(302);

    const snapshot = await t.run(async (ctx) => {
      const account = await ctx.db
        .query("authAccounts")
        .withIndex("providerAndAccountId", (query) =>
          query.eq("provider", "github").eq("providerAccountId", "583231"),
        )
        .unique();
      return {
        account,
        user: account === null ? null : await ctx.db.get(account.userId),
      };
    });
    expect(snapshot.account).toMatchObject({
      provider: "github",
      providerAccountId: "583231",
      emailVerified: "renamed-octocat@github.com",
      githubLogin: "renamed-octocat",
    });
    expect(snapshot.user).toMatchObject({ email: "octocat@github.com" });
  });

  it.each([
    ["google", "https://accounts.google.com", "openid profile email"],
    ["github", "https://github.com", "read:user user:email"],
  ] as const)(
    "asks the user to select a %s account with the expected scopes",
    async (provider, providerOrigin, scope) => {
      const t = makeConvexTest();
      const start = await t.action(api.auth.signIn, {
        provider,
        params: { redirectTo: "/settings" },
      });
      if (start.redirect === undefined) {
        throw new Error("OAuth sign-in did not return a redirect.");
      }

      if (provider === "google") {
        vi.stubGlobal(
          "fetch",
          vi.fn(async (input: string | URL | Request) => {
            const url = new URL(input instanceof Request ? input.url : String(input));
            if (url.toString() !== "https://accounts.google.com/.well-known/openid-configuration") {
              throw new Error(`Unexpected Google OAuth request: ${url.toString()}`);
            }
            return new Response(
              JSON.stringify({
                issuer: "https://accounts.google.com",
                authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
                token_endpoint: "https://oauth2.googleapis.com/token",
                userinfo_endpoint: "https://openidconnect.googleapis.com/v1/userinfo",
                jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
              }),
              { headers: { "content-type": "application/json" } },
            );
          }),
        );
      }

      const internalRedirect = new URL(start.redirect);
      const response = await t.fetch(`${internalRedirect.pathname}${internalRedirect.search}`);
      const providerRedirect = response.headers.get("location");
      if (providerRedirect === null) {
        throw new Error("OAuth sign-in did not return a provider redirect.");
      }
      const providerUrl = new URL(providerRedirect);

      expect(providerUrl.origin).toBe(providerOrigin);
      expect(providerUrl.searchParams.get("prompt")).toBe("select_account");
      expect(providerUrl.searchParams.get("scope")).toBe(scope);
    },
  );
});
