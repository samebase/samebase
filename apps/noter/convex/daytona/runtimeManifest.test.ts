import { describe, expect, it } from "vite-plus/test";
import {
  diffDaytonaRuntimeManifests,
  normalizeDaytonaEnvFileContents,
} from "../../../../runtime/daytonaRuntimeManifest.js";

describe("daytonaRuntimeManifest", () => {
  it("normalizes and redacts Daytona env file contents", () => {
    expect(
      normalizeDaytonaEnvFileContents(
        [
          "CONVEX_DEPLOY_KEY=dev:quiet-robin-508|secret-token",
          "CONVEX_DEPLOYMENT=local:fast-meadow-123",
          "VITE_CONVEX_URL=http://127.0.0.1:3210",
          "FOO=bar",
          "",
        ].join("\n"),
      ),
    ).toEqual({
      keys: [
        "CONVEX_DEPLOY_KEY",
        "CONVEX_DEPLOYMENT",
        "FOO",
        "VITE_CONVEX_URL",
      ],
      normalizedLines: [
        "CONVEX_DEPLOY_KEY=<redacted>",
        "CONVEX_DEPLOYMENT=local:<redacted>",
        "FOO=bar",
        "VITE_CONVEX_URL=http://127.0.0.1:3210",
      ],
      normalizedHash:
        "c8603c13b9fe96ebc067da3330ebadd81e4e9c8030e3450722ee1a36c94a3892",
    });
  });

  it("diffs mismatched manifests by field path", () => {
    expect(
      diffDaytonaRuntimeManifests(
        {
          repo: { headSha: "aaaaaaa" },
          services: { previewPortListening: true },
        },
        {
          repo: { headSha: "bbbbbbb" },
          services: { previewPortListening: false },
        },
      ),
    ).toEqual([
      'repo.headSha: "aaaaaaa" !== "bbbbbbb"',
      "services.previewPortListening: true !== false",
    ]);
  });
});
