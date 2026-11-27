import * as accounts from "@distilled.cloud/cloudflare/accounts";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

const callCloudflareMcpTool = vi.hoisted(() => vi.fn());
vi.mock("./cloudflareMcp", () => ({ callCloudflareMcpTool }));

import { runCloudflare } from "./cloudflareApi";

afterEach(() => {
  callCloudflareMcpTool.mockReset();
});

describe("Cloudflare API over MCP", () => {
  it("sends the request through the execute tool and decodes the envelope it answers", async () => {
    callCloudflareMcpTool.mockResolvedValue(
      JSON.stringify({
        success: true,
        errors: [],
        messages: [],
        result: [{ id: "a".repeat(32), name: "Example account", type: "standard" }],
        result_info: { page: 1, per_page: 5, count: 1, total_count: 1 },
      }),
    );

    const { result } = await runCloudflare(
      { token: "token", transport: "mcp" },
      accounts.listAccounts({ page: 1, perPage: 5 }),
    );

    expect(result).toEqual([
      expect.objectContaining({ id: "a".repeat(32), name: "Example account" }),
    ]);
    expect(callCloudflareMcpTool).toHaveBeenCalledWith({
      token: "token",
      toolName: "execute",
      toolArgs: { code: expect.stringContaining(`path: "/accounts?page=1&per_page=5"`) },
    });
  });

  it("returns the typed error of a Cloudflare error that the tool reports", async () => {
    callCloudflareMcpTool.mockRejectedValue(
      new Error("Cloudflare API error: 10000: Authentication error"),
    );

    await expect(
      runCloudflare({ token: "token", transport: "mcp" }, accounts.listAccounts({})),
    ).rejects.toMatchObject({ _tag: "Unauthorized", message: "Authentication error" });
  });
});
