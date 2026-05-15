import { describe, expect, it } from "vite-plus/test";

import {
  isWorkersBuildsInvalidTokenMessage,
  readCloudflareWorkerTag,
  selectCurrentBuildTokenUuid,
} from "./cloudflareResources";

describe("cloudflare resources", () => {
  it("uses the Workers service id as the Workers Builds tag", () => {
    expect(
      readCloudflareWorkerTag(
        {
          id: "775e3115b5f8411988e4a6b1411d0022",
          name: "noter-app",
        },
        "noter-app",
      ),
    ).toBe("775e3115b5f8411988e4a6b1411d0022");
  });

  it("recognizes Workers Builds invalid token failures from MCP errors", () => {
    expect(
      isWorkersBuildsInvalidTokenMessage({
        path: "/accounts/account-id/builds/repos/connections",
        message:
          "Cloudflare MCP tool call failed: Error: Cloudflare API error: 12006: Invalid token",
      }),
    ).toBe(true);
  });

  it("selects the build token backed by the current Cloudflare token", () => {
    expect(
      selectCurrentBuildTokenUuid({
        cloudflareTokenId: "current-token-id",
        tokens: [
          {
            name: "app-workers build token",
            uuid: "stale-build-token",
            cloudflareTokenId: "old-token-id",
          },
          {
            name: "noter build token",
            uuid: "current-build-token",
            cloudflareTokenId: "current-token-id",
          },
        ],
      }),
    ).toBe("current-build-token");
  });

  it("does not select stale build tokens with unrelated Cloudflare token ids", () => {
    expect(
      selectCurrentBuildTokenUuid({
        cloudflareTokenId: "current-token-id",
        tokens: [
          {
            name: "noter build token",
            uuid: "stale-build-token",
            cloudflareTokenId: "old-token-id",
          },
        ],
      }),
    ).toBe(undefined);
  });
});
