import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { api, internal } from "./_generated/api";
import { makeConvexTest, stubConvexAuthEnv } from "./test.setup";

const PASSWORD = "manual-account-password";

beforeEach(() => {
  // convex/auth.ts builds the hub sign-in methods from HUB_ISSUER when it loads.
  vi.stubEnv("HUB_ISSUER", "https://hub.example.invalid");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function createManualAccount() {
  vi.stubEnv("CONVEX_AGENT_MODE", "");
  vi.stubEnv("CONVEX_DEPLOYMENT", "dev:test");
  vi.stubEnv("PASSWORD_AUTH_ENABLED", "true");
  await stubConvexAuthEnv();
  const t = makeConvexTest();
  await t.mutation(internal.authAdmin.createOrUpdatePasswordAccount, {
    email: "manual@example.com",
    password: PASSWORD,
  });
  const userId = await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (query) => query.eq("email", "manual@example.com"))
      .unique();
    if (user === null) {
      throw new Error("The operator-created user is missing.");
    }
    return user._id;
  });
  return { t, userId };
}

describe("password sign-in", () => {
  it("rejects password flows while the manual switch is disabled", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "");
    vi.stubEnv("CONVEX_DEPLOYMENT", "dev:test");
    vi.stubEnv("PASSWORD_AUTH_ENABLED", "");
    const t = makeConvexTest();

    await expect(
      t.mutation(api.auth.signInWithPassword, { email: "manual@example.com", password: PASSWORD }),
    ).rejects.toThrowError("Password authentication is disabled");
    await expect(
      t.mutation(api.auth.signUpWithPassword, { email: "manual@example.com", password: PASSWORD }),
    ).rejects.toThrowError("Password authentication is disabled");
  });

  it("signs in to an operator-created account and keeps sign-up blocked", async () => {
    const { t, userId } = await createManualAccount();

    await expect(
      t.mutation(api.auth.signUpWithPassword, { email: "other@example.com", password: PASSWORD }),
    ).rejects.toThrowError(
      "Manual password authentication only allows sign-in for operator-created accounts",
    );
    await expect(
      t.mutation(api.auth.signInWithPassword, {
        email: "manual@example.com",
        password: "wrong-account-password",
      }),
    ).resolves.toEqual({ status: "error", userError: { error: "INVALID_CREDENTIALS" } });
    await expect(
      t.mutation(api.auth.signInWithPassword, { email: "unknown@example.com", password: PASSWORD }),
    ).resolves.toEqual({ status: "error", userError: { error: "INVALID_CREDENTIALS" } });

    await expect(
      t.mutation(api.auth.signInWithPassword, {
        email: " Manual@Example.com ",
        password: PASSWORD,
      }),
    ).resolves.toMatchObject({ status: "complete", tokens: { userId } });
    await expect(
      t.mutation(api.auth.signInWithPassword, { email: "manual@example.com", password: PASSWORD }),
    ).resolves.toMatchObject({ status: "complete", tokens: { userId } });
  });

  it("rejects a password sign-in for an account that is being deleted", async () => {
    const { t, userId } = await createManualAccount();
    await t.run(async (ctx) => {
      const runId = await ctx.db.insert("workflow_accountDeletion_runs", {
        state: "running",
        identity: { state: "active", userId, email: "manual@example.com" },
        completionCapability: "a".repeat(64),
        currentStep: "request_accepted",
        requestedAt: 1,
        updatedAt: 1,
        retryCount: 0,
        outcomes: {
          providerRevocation: { state: "not_started" },
          completionEmail: { state: "not_started" },
        },
        workflow: { state: "started", workflowId: `deleting-${userId}`, attempt: 1 },
      });
      await ctx.db.replace(userId, {
        state: "deleting",
        email: "manual@example.com",
        runId,
        requestedAt: 1,
      });
    });

    await expect(
      t.mutation(api.auth.signInWithPassword, { email: "manual@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ data: "Account deletion is in progress." });
  });

  it("creates and signs in to a local worktree account", async () => {
    vi.stubEnv("CONVEX_AGENT_MODE", "anonymous");
    await stubConvexAuthEnv();
    const t = makeConvexTest();

    const signUp = await t.mutation(api.auth.signUpWithPassword, {
      email: "local@example.com",
      password: PASSWORD,
    });
    await expect(
      t.mutation(api.auth.signUpWithPassword, { email: "local@example.com", password: PASSWORD }),
    ).rejects.toMatchObject({ data: "An account with this email already exists." });
    await expect(
      t.mutation(api.auth.signUpWithPassword, { email: "short@example.com", password: "short" }),
    ).rejects.toMatchObject({ data: "Password must have at least 10 characters." });
    await expect(
      t.mutation(api.auth.signInWithPassword, { email: "local@example.com", password: PASSWORD }),
    ).resolves.toMatchObject({ status: "complete", tokens: { userId: signUp.tokens.userId } });
  });
});
