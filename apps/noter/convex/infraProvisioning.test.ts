import { describe, expect, it } from "vite-plus/test";

import {
  resolveConnectionFailureProvider,
  selectCloudflareBuildConfigTreeData,
  selectExistingCloudflareWorker,
} from "./infraProvisioning";
import type { GithubTreeData } from "./schema";
import { buildVaultCloudflareBuildConfigForAppRoot } from "./vault/model";

const branchTreeData = {
  sha: "branch-tree",
  truncated: false,
  tree: [
    {
      path: "apps/noter/package.json",
      mode: "100644",
      type: "blob",
      sha: "package-sha",
    },
  ],
} satisfies GithubTreeData;

const rootCloudflareBuild = buildVaultCloudflareBuildConfigForAppRoot({
  appRoot: ".",
});

describe("selectCloudflareBuildConfigTreeData", () => {
  it("prefers the branch tree cache", () => {
    expect(
      selectCloudflareBuildConfigTreeData({
        branchTreeData,
      }),
    ).toBe(branchTreeData);
  });

  it("fails before provider side effects when no tree is cached", () => {
    expect(() =>
      selectCloudflareBuildConfigTreeData({
        branchTreeData: null,
      }),
    ).toThrow("Default branch tree is not synced yet.");
  });
});

describe("selectExistingCloudflareWorker", () => {
  it("prefers the provisional Worker tag recorded for retries", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflareTarget: {
          state: "created",
          accountId: "account-1",
          workerName: "noter",
          workerTag: "provisional-worker-tag",
          workersDevUrl: "https://noter.example.workers.dev",
          build: rootCloudflareBuild,
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "created", workerTag: "provisional-worker-tag" });
  });

  it("keeps missing Worker identity adoptable without a recorded tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflareTarget: {
          state: "planned",
          accountId: "account-1",
          workerName: "noter",
          build: rootCloudflareBuild,
        },
        accountId: "account-1",
      }),
    ).toEqual({ state: "planned" });
  });

  it("keeps planned Worker names adoptable without a recorded tag", () => {
    expect(
      selectExistingCloudflareWorker({
        cloudflareTarget: {
          state: "planned",
          accountId: "account-2",
          workerName: "noter",
          build: rootCloudflareBuild,
        },
        accountId: "account-2",
      }),
    ).toEqual({ state: "planned" });
  });
});

describe("resolveConnectionFailureProvider", () => {
  it("detects Cloudflare connection failures", () => {
    expect(
      resolveConnectionFailureProvider(
        "Cloudflare connection is required to provision infrastructure.",
      ),
    ).toBe("cloudflare");
  });

  it("detects Convex connection failures", () => {
    expect(
      resolveConnectionFailureProvider(
        "Convex connection is required to provision infrastructure.",
      ),
    ).toBe("convex");
  });

  it("leaves unrelated failures unattributed", () => {
    expect(
      resolveConnectionFailureProvider(
        "GitHub connection is required to provision infrastructure.",
      ),
    ).toBe(null);
  });
});
