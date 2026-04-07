import { describe, expect, it } from "vite-plus/test";
import {
  buildCloudDeploymentUrl,
  extractMatchingDeploymentDeployKey,
  normalizeEnvQueryResult,
} from "../../../../runtime/convexSyncDevEnv.js";

describe("convexSyncDevEnv", () => {
  it("uses a matching deployment deploy key for direct env reads", () => {
    expect(
      extractMatchingDeploymentDeployKey({
        rawDeployKey: "dev:quiet-robin-508|secret-token",
        sourceDeployment: {
          type: "dev",
          name: "quiet-robin-508",
          raw: "dev:quiet-robin-508",
        },
      }),
    ).toBe("dev:quiet-robin-508|secret-token");
  });

  it("ignores deploy keys that target a different deployment", () => {
    expect(
      extractMatchingDeploymentDeployKey({
        rawDeployKey: "dev:clear-butterfly-858|secret-token",
        sourceDeployment: {
          type: "dev",
          name: "quiet-robin-508",
          raw: "dev:quiet-robin-508",
        },
      }),
    ).toBeNull();
  });

  it("ignores project-scoped keys", () => {
    expect(
      extractMatchingDeploymentDeployKey({
        rawDeployKey: "project:nicu:noter|secret-token",
        sourceDeployment: {
          type: "dev",
          name: "quiet-robin-508",
          raw: "dev:quiet-robin-508",
        },
      }),
    ).toBeNull();
  });

  it("builds the canonical Convex cloud URL from the deployment name", () => {
    expect(buildCloudDeploymentUrl("quiet-robin-508")).toBe(
      "https://quiet-robin-508.convex.cloud",
    );
  });

  it("normalizes valid env query results", () => {
    expect(
      normalizeEnvQueryResult([
        { name: "SITE_URL", value: "https://noter.md" },
        { name: "VITE_SITE_URL", value: "https://noter.md" },
      ]),
    ).toEqual([
      { name: "SITE_URL", value: "https://noter.md" },
      { name: "VITE_SITE_URL", value: "https://noter.md" },
    ]);
  });

  it("rejects malformed env query results", () => {
    expect(() =>
      normalizeEnvQueryResult([{ name: "SITE_URL", value: 123 }]),
    ).toThrow("Convex environment query returned invalid entries.");
  });
});
