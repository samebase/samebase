import { describe, expect, it } from "vite-plus/test";

import {
  extractDaytonaDeploymentSpecifier,
  resolveSourceDeployment,
} from "./daytona-write-source-env.ts";

describe("daytona-write-source-env", () => {
  it("extracts the deployment specifier from the Daytona deploy key", () => {
    expect(
      extractDaytonaDeploymentSpecifier("dev:steady-harbor|token-value"),
    ).toBe("dev:steady-harbor");
  });

  it("returns null when the Daytona deploy key is empty", () => {
    expect(extractDaytonaDeploymentSpecifier("   ")).toBe(null);
  });

  it("prefers the explicit Daytona deployment over CONVEX_DEPLOYMENT", () => {
    expect(
      resolveSourceDeployment({
        daytonaDeployKey: "dev:steady-harbor|token-value",
        convexDeployment: "dev:ignored-source",
      }),
    ).toEqual({
      status: "ok",
      deployment: "dev:steady-harbor",
    });
  });

  it("rejects preview deployments for Daytona local bootstrap", () => {
    expect(
      resolveSourceDeployment({
        daytonaDeployKey: undefined,
        convexDeployment: "preview:steady-harbor",
      }),
    ).toEqual({
      status: "invalid",
      message:
        'CONVEX_DEPLOYMENT must reference a cloud dev deployment for Daytona local mode (received "preview:steady-harbor").',
    });
  });

  it("treats anonymous-like deployments as missing", () => {
    expect(
      resolveSourceDeployment({
        daytonaDeployKey: undefined,
        convexDeployment: "anonymous:local-worktree",
      }),
    ).toEqual({ status: "missing" });
  });
});
