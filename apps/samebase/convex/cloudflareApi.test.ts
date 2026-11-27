import * as user from "@distilled.cloud/cloudflare/user";
import * as workers from "@distilled.cloud/cloudflare/workers";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { runCloudflare } from "./cloudflareApi";
import { listCloudflareAccountsForToken } from "./cloudflareAccountDiscovery";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function answer(body: BodyInit) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(body));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("runCloudflare", () => {
  it("lists the accounts of a token from the first page of five", async () => {
    const fetch = answer(
      JSON.stringify({
        success: true,
        errors: [],
        messages: [],
        result: [{ id: "a".repeat(32), name: "Example account", type: "standard" }],
        result_info: { page: 1, per_page: 5, count: 1, total_count: 1 },
      }),
    );

    await expect(listCloudflareAccountsForToken("token")).resolves.toEqual([
      { accountId: "a".repeat(32), accountName: "Example account" },
    ]);
    const [input, init] = fetch.mock.calls[0] ?? ["missing request"];
    const request = new Request(input, init);
    expect(request.url).toBe("https://api.cloudflare.com/client/v4/accounts?page=1&per_page=5");
    expect(request.headers.get("authorization")).toBe("Bearer token");
  });

  it.each([
    ["a text body", "<html>gateway</html>"],
    ["a token without an id", JSON.stringify({ success: true, result: { status: "active" } })],
  ])("rejects a 2xx response with %s", async (_case, body) => {
    answer(body);

    await expect(runCloudflare("token", user.verifyToken({}))).rejects.toBeDefined();
  });

  it("rejects a 2xx text body for an operation with an opaque result", async () => {
    answer("<html>gateway</html>");

    await expect(
      runCloudflare("token", workers.getAccountSetting({ accountId: "a".repeat(32) })),
    ).rejects.toBeDefined();
  });

  it("gives up on a response body that stalls", async () => {
    vi.useFakeTimers();
    answer(new ReadableStream({ start: () => undefined }));

    const result = runCloudflare("token", user.verifyToken({})).then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toBe("rejected");
  });
});
