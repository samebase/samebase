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
  });

  it("returns a safe provider cancellation code to the app", async () => {
    const response = await makeConvexTest().fetch("/api/auth/callback/github?error=access_denied");

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://samebase.test/?authorization-provider=github-sign-in&authorization-error=canceled",
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
