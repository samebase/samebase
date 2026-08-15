import { describe, expect, it } from "vite-plus/test";

import {
  buildConvexEnvSetSpec,
  parseSyncPreviewGitHubSeedOptions,
} from "./sync-preview-github-seed.ts";

describe("sync preview GitHub seed", () => {
  it("selects exact GitHub owners and an optional existing preview", () => {
    expect(
      parseSyncPreviewGitHubSeedOptions([
        "--owner",
        "Nicu-Chiciuc",
        "--owner",
        "samebase",
        "--preview-name",
        "feature-branch",
      ]),
    ).toEqual({
      ownerLogins: ["nicu-chiciuc", "samebase"],
      previewName: "feature-branch",
    });
  });

  it("passes the authorization through standard input instead of command arguments", () => {
    const serializedAuthorization = JSON.stringify({
      accessToken: "github-access-token",
      refreshToken: "github-refresh-token",
    });
    const defaultSpec = buildConvexEnvSetSpec({
      serializedAuthorization,
      previewName: null,
    });
    const previewSpec = buildConvexEnvSetSpec({
      serializedAuthorization,
      previewName: "feature-branch",
    });

    expect(defaultSpec.input).toBe(serializedAuthorization);
    expect(previewSpec.input).toBe(serializedAuthorization);
    expect(defaultSpec.args.join(" ")).not.toContain("github-access-token");
    expect(defaultSpec.args.join(" ")).not.toContain("github-refresh-token");
    expect(previewSpec.args.join(" ")).not.toContain("github-access-token");
    expect(previewSpec.args.join(" ")).not.toContain("github-refresh-token");
  });
});
