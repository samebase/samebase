import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  canonicalizeCommitPinnedDaytonaBranch,
  DAYTONA_COMMIT_PINNED_BRANCH,
  DAYTONA_SNAPSHOT_RETENTION_COUNT,
  calculateSnapshotRetryDelayMs,
  inferCommitPinnedSnapshotName,
  inferCommitPinnedSnapshotPrefix,
  inferDaytonaWorkspaceSandboxName,
  isCommitPinnedDaytonaBranch,
  shortenCommitSha,
} from "./snapshotPolicy";

const originalConvexDeployment = process.env.CONVEX_DEPLOYMENT;
const originalDaytonaDeployKey = process.env.DAYTONA_CONVEX_DEPLOY_KEY;

beforeAll(() => {
  process.env.DAYTONA_CONVEX_DEPLOY_KEY = "dev:test";
  delete process.env.CONVEX_DEPLOYMENT;
});

afterEach(() => {
  process.env.DAYTONA_CONVEX_DEPLOY_KEY = "dev:test";
  delete process.env.CONVEX_DEPLOYMENT;
});

afterAll(() => {
  if (originalConvexDeployment === undefined) {
    delete process.env.CONVEX_DEPLOYMENT;
  } else {
    process.env.CONVEX_DEPLOYMENT = originalConvexDeployment;
  }
  if (originalDaytonaDeployKey === undefined) {
    delete process.env.DAYTONA_CONVEX_DEPLOY_KEY;
    return;
  }
  process.env.DAYTONA_CONVEX_DEPLOY_KEY = originalDaytonaDeployKey;
});

describe("daytonaSnapshotPolicy", () => {
  it("pins commit snapshots to main for the first rollout", () => {
    expect(DAYTONA_COMMIT_PINNED_BRANCH).toBe("main");
    expect(DAYTONA_SNAPSHOT_RETENTION_COUNT).toBe(3);
    expect(isCommitPinnedDaytonaBranch("main")).toBe(true);
    expect(isCommitPinnedDaytonaBranch("MAIN")).toBe(true);
    expect(isCommitPinnedDaytonaBranch("feature/demo")).toBe(false);
    expect(canonicalizeCommitPinnedDaytonaBranch(" MAIN ")).toBe("main");
    expect(canonicalizeCommitPinnedDaytonaBranch("feature/demo")).toBe(
      "feature/demo",
    );
  });

  it("includes the exact commit in snapshot names", () => {
    const commitSha = " ABCDEF1234567890 ";
    const snapshotName = inferCommitPinnedSnapshotName({
      owner: "OpenAI",
      repo: "Noter",
      branch: "main",
      commitSha,
    });

    expect(snapshotName).toContain("OpenAI");
    expect(snapshotName).toContain("Noter");
    expect(snapshotName).toContain("main");
    expect(snapshotName).toContain("abcdef1234567890");
    expect(
      inferCommitPinnedSnapshotPrefix({ owner: "OpenAI", repo: "Noter" }),
    ).toContain("OpenAI");
  });

  it("names dev Daytona resources by deployment scope", () => {
    process.env.CONVEX_DEPLOYMENT = "dev:anonymous-1c49";

    const snapshotName = inferCommitPinnedSnapshotName({
      owner: "OpenAI",
      repo: "Noter",
      branch: "main",
      commitSha: "abcdef1234567890",
    });
    const snapshotPrefix = inferCommitPinnedSnapshotPrefix({
      owner: "OpenAI",
      repo: "Noter",
    });
    const sandboxName = inferDaytonaWorkspaceSandboxName({
      owner: "OpenAI",
      repo: "Noter",
      branch: "main",
      commitSha: "abcdef1234567890",
      vaultId: "vault123",
    });

    expect(snapshotName).toContain("dev-anonymous-1c49");
    expect(snapshotPrefix).toContain("dev-anonymous-1c49");
    expect(sandboxName).toContain("dev-anonymous-1c49");
  });

  it("keeps prod Daytona resources on the stable prod scope", () => {
    process.env.DAYTONA_CONVEX_DEPLOY_KEY = "prod:test";
    process.env.CONVEX_DEPLOYMENT = "prod:noter";

    const snapshotName = inferCommitPinnedSnapshotName({
      owner: "OpenAI",
      repo: "Noter",
      branch: "main",
      commitSha: "abcdef1234567890",
    });
    const sandboxName = inferDaytonaWorkspaceSandboxName({
      owner: "OpenAI",
      repo: "Noter",
      branch: "main",
      commitSha: "abcdef1234567890",
      vaultId: "vault123",
    });

    expect(snapshotName).toContain("noter-prebuild-prod-");
    expect(snapshotName).not.toContain("prod-noter");
    expect(sandboxName).toContain("noter-prod-");
    expect(sandboxName).not.toContain("prod-noter");
  });

  it("shortens commit shas for labels and messages", () => {
    expect(shortenCommitSha("abcdef1234567890")).toBe("abcdef1");
    expect(shortenCommitSha("abc123")).toBe("abc123");
    expect(shortenCommitSha(" ABCDEF1234567890 ")).toBe("abcdef1");
  });

  it("backs off retries and caps the delay", () => {
    expect(calculateSnapshotRetryDelayMs(1)).toBe(60_000);
    expect(calculateSnapshotRetryDelayMs(2)).toBe(120_000);
    expect(calculateSnapshotRetryDelayMs(4)).toBe(480_000);
    expect(calculateSnapshotRetryDelayMs(10)).toBe(900_000);
  });
});
