import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("password auth provider", () => {
  it("rejects direct password flows while the manual switch is disabled", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:test");
    vi.stubEnv("PASSWORD_AUTH_ENABLED", "");
    const t = makeConvexTest();

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          email: "manual@example.com",
          flow: "signIn",
          password: "valid-password",
        },
      }),
    ).rejects.toThrowError("Password authentication is disabled");
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          email: "manual@example.com",
          flow: "signUp",
          password: "valid-password",
        },
      }),
    ).rejects.toThrowError("Password authentication is disabled");
  });

  it("accepts an operator-created account and keeps public sign-up blocked", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:test");
    vi.stubEnv("PASSWORD_AUTH_ENABLED", "true");
    const t = makeConvexTest();

    await t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
      email: "manual@example.com",
      password: "valid-password",
    });

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          email: "other@example.com",
          flow: "signUp",
          password: "valid-password",
        },
      }),
    ).rejects.toThrowError(
      "Manual password authentication only allows sign-in for operator-created accounts",
    );

    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          email: "manual@example.com",
          flow: "signIn",
          password: "valid-password",
        },
      }),
    ).rejects.toThrowError("Missing environment variable `JWT_PRIVATE_KEY`");
  });

  it("rejects password operations before Convex Auth debug logs can process credentials", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:test");
    vi.stubEnv("PASSWORD_AUTH_ENABLED", "true");
    vi.stubEnv("AUTH_LOG_LEVEL", "DEBUG");
    const t = makeConvexTest();

    await expect(
      t.action(internal.authAdmin.createOrUpdatePasswordAccount, {
        email: "manual@example.com",
        password: "valid-password",
      }),
    ).rejects.toThrowError("Password authentication is unavailable while AUTH_LOG_LEVEL is DEBUG");
    await expect(
      t.action(api.auth.signIn, {
        provider: "password",
        params: {
          email: "manual@example.com",
          flow: "signIn",
          password: "valid-password",
        },
      }),
    ).rejects.toThrowError("Password authentication is unavailable while AUTH_LOG_LEVEL is DEBUG");
  });
});
