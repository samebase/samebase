import { describe, expect, it } from "vitest";
import {
  resolveDeploymentProfileFromEnv,
  resolvePasswordAuthMode,
} from "./deploymentProfile";

describe("deploymentProfile", () => {
  it("classifies anonymous deployments as local worktrees", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_DEPLOYMENT: "anonymous:anonymous-agent",
        DAYTONA_CONVEX_DEPLOY_KEY: "dev:quiet-robin-508|secret",
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

  it("falls back to the Daytona deploy key when the deployment env is absent", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        DAYTONA_CONVEX_DEPLOY_KEY: "preview:nicu:noter|secret",
      }),
    ).toEqual({ kind: "preview" });
  });

  it("falls back to localhost runtime URLs for local development", () => {
    expect(
      resolveDeploymentProfileFromEnv({
        CONVEX_SITE_URL: "http://localhost:5174",
      }),
    ).toEqual({ kind: "local_development" });
  });

  it("fails closed to production when the deployment cannot be inferred", () => {
    expect(resolveDeploymentProfileFromEnv({})).toEqual({
      kind: "production",
    });
  });

  it("derives password auth mode from the explicit deployment profile", () => {
    expect(resolvePasswordAuthMode({ kind: "local_worktree" })).toBe(
      "local_worktree_seed",
    );
    expect(resolvePasswordAuthMode({ kind: "preview" })).toBe("preview_seed");
    expect(resolvePasswordAuthMode({ kind: "local_development" })).toBe("off");
    expect(resolvePasswordAuthMode({ kind: "convex_dev" })).toBe("off");
    expect(resolvePasswordAuthMode({ kind: "production" })).toBe("off");
  });
});
