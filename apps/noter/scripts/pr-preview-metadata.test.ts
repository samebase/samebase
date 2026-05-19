import { describe, expect, it } from "vite-plus/test";

import {
  buildPrPreviewAlias,
  buildPrPreviewMetadata,
  buildPrPreviewTag,
} from "./pr-preview-metadata.ts";

describe("prPreviewMetadata", () => {
  it("builds stable short tags for Cloudflare Worker versions", () => {
    expect(buildPrPreviewTag("codex/preview-cleanup")).toMatch(
      /^noter-pr-preview:[0-9a-f]{12}$/,
    );
    expect(buildPrPreviewTag("codex/preview-cleanup").length).toBeLessThan(100);
    expect(buildPrPreviewTag("codex/preview-cleanup")).toBe(
      buildPrPreviewTag("codex/preview-cleanup"),
    );
  });

  it("builds DNS-safe aliases that preserve a branch hint and hash", () => {
    expect(
      buildPrPreviewAlias({
        branch: "codex/Preview Cleanup!",
        workerName: "noter",
      }),
    ).toMatch(/^codex-preview-cleanup-[0-9a-f]{12}$/);
  });

  it("keeps aliases within the worker preview DNS label limit", () => {
    const alias = buildPrPreviewAlias({
      branch:
        "codex/this-is-a-very-long-branch-name-that-needs-to-be-truncated",
      workerName: "noter-workers-production",
    });

    expect(alias).not.toBeNull();
    if (!alias) {
      return;
    }
    expect(`${alias}-noter-workers-production`.length).toBeLessThanOrEqual(63);
    expect(alias).toMatch(/[0-9a-f]{12}$/);
  });

  it("omits aliases when the worker name leaves no safe DNS room", () => {
    expect(
      buildPrPreviewAlias({
        branch: "codex/preview-cleanup",
        workerName: "noter-worker-name-that-is-too-long-for-useful-aliases",
      }),
    ).toBeNull();
  });

  it("builds the shared metadata used by upload and cleanup", () => {
    expect(
      buildPrPreviewMetadata({
        branch: "codex/preview-cleanup",
        workerName: "noter",
      }),
    ).toMatchObject({
      branch: "codex/preview-cleanup",
      message: "noter.md PR preview for codex/preview-cleanup",
    });
  });
});
