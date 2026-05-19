import { describe, expect, it } from "vite-plus/test";

import { parseArgs, parseGithubPrPayload } from "./clean-pr-preview.ts";

describe("clean-pr-preview", () => {
  it("defaults to a dry-run for both providers", () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      allowUnmerged: false,
      branch: null,
      help: false,
      skipCloudflare: false,
      skipConvex: false,
    });
  });

  it("parses cleanup options", () => {
    expect(
      parseArgs([
        "--",
        "--branch",
        "codex/preview-cleanup",
        "--apply",
        "--allow-unmerged",
        "--skip-cloudflare",
      ]),
    ).toEqual({
      apply: true,
      allowUnmerged: true,
      branch: "codex/preview-cleanup",
      help: false,
      skipCloudflare: true,
      skipConvex: false,
    });
  });

  it("parses merged PR metadata from gh", () => {
    expect(
      parseGithubPrPayload({
        number: 42,
        state: "MERGED",
        mergedAt: "2026-05-19T10:00:00Z",
        headRefName: "codex/preview-cleanup",
        url: "https://github.com/notermd/noter/pull/42",
      }),
    ).toEqual({
      number: 42,
      state: "MERGED",
      mergedAt: "2026-05-19T10:00:00Z",
      headRefName: "codex/preview-cleanup",
      url: "https://github.com/notermd/noter/pull/42",
    });
  });

  it("rejects malformed PR metadata", () => {
    expect(parseGithubPrPayload({ state: "MERGED" })).toBeNull();
  });
});
