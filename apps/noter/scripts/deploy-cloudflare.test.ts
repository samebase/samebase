import { describe, expect, it } from "vite-plus/test";

import { buildWranglerArgs } from "./deploy-cloudflare.ts";

describe("deploy-cloudflare", () => {
  it("tags Workers preview uploads with branch-scoped metadata", () => {
    const args = buildWranglerArgs({
      mode: "preview",
      workerName: "noter",
      extraArgs: [],
      env: {
        WORKERS_CI_BRANCH: "codex/preview-cleanup",
      },
    });

    expect(args.slice(0, 4)).toEqual(["versions", "upload", "--name", "noter"]);
    expect(args).toContain("--tag");
    expect(args).toContain("--message");
    expect(args).toContain("--preview-alias");
    expect(args).toContain("noter.md PR preview for codex/preview-cleanup");
  });

  it("leaves explicit preview metadata alone", () => {
    expect(
      buildWranglerArgs({
        mode: "preview",
        workerName: "noter",
        extraArgs: [
          "--tag",
          "manual-tag",
          "--message",
          "manual message",
          "--preview-alias",
          "manual",
        ],
        env: {
          WORKERS_CI_BRANCH: "codex/preview-cleanup",
        },
      }),
    ).toEqual([
      "versions",
      "upload",
      "--name",
      "noter",
      "--tag",
      "manual-tag",
      "--message",
      "manual message",
      "--preview-alias",
      "manual",
    ]);
  });

  it("does not add preview metadata without a Workers branch", () => {
    expect(
      buildWranglerArgs({
        mode: "preview",
        workerName: "noter",
        extraArgs: ["--dry-run"],
        env: {},
      }),
    ).toEqual(["versions", "upload", "--name", "noter", "--dry-run"]);
  });

  it("does not tag production deploys", () => {
    expect(
      buildWranglerArgs({
        mode: "deploy",
        workerName: "noter",
        extraArgs: [],
        env: {
          WORKERS_CI_BRANCH: "main",
        },
      }),
    ).toEqual(["deploy", "--name", "noter"]);
  });
});
