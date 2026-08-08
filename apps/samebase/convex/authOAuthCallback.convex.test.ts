import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

describe("OAuth callback errors", () => {
  beforeEach(() => {
    vi.stubEnv("AUTH_GITHUB_ID", "github-client-id");
    vi.stubEnv("AUTH_GITHUB_SECRET", "github-client-secret");
    vi.stubEnv("AUTH_GOOGLE_ID", "google-client-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "google-client-secret");
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

  it("returns the account-linking code after GitHub verifies an existing Google email", async () => {
    const t = makeConvexTest();
    await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
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

    const start = await t.action(api.auth.signIn, {
      provider: "github",
      params: { redirectTo: "/" },
    });
    if (start.redirect === undefined) {
      throw new Error("OAuth sign-in did not return a redirect.");
    }
    const internalRedirect = new URL(start.redirect);
    const signInResponse = await t.fetch(`${internalRedirect.pathname}${internalRedirect.search}`);
    const providerRedirect = signInResponse.headers.get("location");
    const setCookie = signInResponse.headers.get("set-cookie");
    if (providerRedirect === null || setCookie === null) {
      throw new Error("OAuth sign-in did not return its provider state.");
    }
    const cookie = setCookie
      .split(/, (?=[^;,]+=)/)
      .map((value) => value.split(";", 1)[0])
      .join("; ");

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
          // Source: https://api.github.com/users/octocat, captured 2026-08-08.
          return new Response(
            JSON.stringify({
              login: "octocat",
              id: 583231,
              avatar_url: "https://avatars.githubusercontent.com/u/583231?v=4",
              name: "The Octocat",
              email: null,
            }),
            { headers: { "content-type": "application/json" } },
          );
        }
        if (url.origin === "https://api.github.com" && url.pathname === "/user/emails") {
          // Source: GitHub REST email response documentation, captured 2026-08-08.
          return new Response(
            JSON.stringify([
              {
                email: "octocat@github.com",
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

    const callbackResponse = await t.fetch(`/api/auth/callback/github?code=github-code`, {
      headers: { cookie },
    });

    expect(callbackResponse.status).toBe(302);
    expect(callbackResponse.headers.get("location")).toBe(
      "https://samebase.test/?authorization-provider=github-sign-in&authorization-error=account-link-required",
    );
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
