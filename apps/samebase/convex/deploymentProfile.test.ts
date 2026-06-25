import { describe, expect, it } from "vite-plus/test";
import {
  assertPasswordAuthFlowAllowed,
  resolveDeploymentProfileFromEnv,
  resolvePasswordAuthMode,
  resolvePasswordAuthModeFromEnv,
} from "./deploymentProfile";

describe("deploymentProfile", () => {
  it("classifies anonymous deployments as local worktrees", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_DEPLOYMENT: "anonymous:anonymous-agent",
      }),
    ).toEqual({ kind: "local_worktree" });
  });

  it("classifies anonymous agent mode as a local worktree", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_AGENT_MODE: "anonymous",
        CONVEX_DEPLOYMENT: "local:fast-meadow-123",
      }),
    ).toEqual({ kind: "local_worktree" });
  });

  it("classifies local Convex deployments as local development", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_DEPLOYMENT: "local:fast-meadow-123",
      }),
    ).toEqual({ kind: "local_development" });
  });

  it("classifies preview deployments from the deployment prefix", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_DEPLOYMENT: "preview:decisive-kangaroo-742",
      }),
    ).toEqual({ kind: "preview" });
  });

  it("classifies Convex dev deployments from the deployment prefix", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_DEPLOYMENT: "dev:quiet-robin-508",
      }),
    ).toEqual({ kind: "convex_dev" });
  });

  it("classifies production deployments from the deployment prefix", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_DEPLOYMENT: "prod:noter",
      }),
    ).toEqual({ kind: "production" });
  });

  it("falls back to localhost runtime URLs for local development", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_SITE_URL: "http://localhost:5174",
      }),
    ).toEqual({ kind: "local_development" });
  });

  it("falls back to preview seed envs when runtime deployment metadata is absent", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        PREVIEW_SEED_AUTH_EMAIL: "preview@example.com",
        PREVIEW_SEED_AUTH_PASSWORD: "secret-password",
      }),
    ).toEqual({ kind: "preview" });
  });

  it("fails closed to the shared non-production deployment when the deployment cannot be inferred", () => {
    expect(resolveDeploymentProfileFromEnv({})).toEqual({
      kind: "convex_dev",
    });
  });

  it("derives password auth mode from the explicit deployment profile", () => {
    expect(resolvePasswordAuthMode({ kind: "local_worktree" })).toBe("local_worktree_seed");
    expect(resolvePasswordAuthMode({ kind: "preview" })).toBe("preview_seed");
    expect(resolvePasswordAuthMode({ kind: "local_development" })).toBe("off");
    expect(resolvePasswordAuthMode({ kind: "convex_dev" })).toBe("off");
    expect(resolvePasswordAuthModeFromEnv({ kind: "production" }, {})).toBe("off");
  });

  it("enables production review password auth only when both review envs are set", () => {
    expect(
      resolvePasswordAuthModeFromEnv(
        { kind: "production" },
        {
          OPENAI_REVIEW_AUTH_EMAIL: "noter.guest@gmail.com",
          OPENAI_REVIEW_AUTH_PASSWORD: "review-password",
        },
      ),
    ).toBe("production_review_seed");

    expect(resolvePasswordAuthModeFromEnv({ kind: "production" }, {})).toBe("off");
    expect(() =>
      resolvePasswordAuthModeFromEnv(
        { kind: "production" },
        { OPENAI_REVIEW_AUTH_EMAIL: "noter.guest@gmail.com" },
      ),
    ).toThrowError("OPENAI_REVIEW_AUTH_EMAIL and OPENAI_REVIEW_AUTH_PASSWORD must be set together");
  });

  it("blocks preview password sign-up while keeping preview sign-in enabled", () => {
    expect(() => assertPasswordAuthFlowAllowed("preview_seed", "signUp")).toThrowError(
      "Preview deployments only allow password sign-in for the seeded account",
    );

    expect(() => assertPasswordAuthFlowAllowed("preview_seed", "signIn")).not.toThrow();
  });

  it("blocks production review password sign-up while keeping sign-in enabled", () => {
    expect(() => assertPasswordAuthFlowAllowed("production_review_seed", "signUp")).toThrowError(
      "Production review only allows password sign-in for the review account",
    );

    expect(() => assertPasswordAuthFlowAllowed("production_review_seed", "signIn")).not.toThrow();
  });
});
