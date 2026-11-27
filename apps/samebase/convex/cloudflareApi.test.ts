import * as user from "@distilled.cloud/cloudflare/user";
import * as workers from "@distilled.cloud/cloudflare/workers";
import * as workersBuilds from "@distilled.cloud/cloudflare/workers_builds";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { runCloudflare } from "./cloudflareApi";
import { listCloudflareAccountsForToken } from "./cloudflareAccountDiscovery";

const accountId = "a".repeat(32);

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function answer(response: () => Response) {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => response());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("runCloudflare", () => {
  it("lists the accounts of a token from the first page of five", async () => {
    const fetch = answer(() =>
      Response.json({
        success: true,
        errors: [],
        messages: [],
        result: [{ id: accountId, name: "Example account", type: "standard" }],
        result_info: { page: 1, per_page: 5, count: 1, total_count: 1 },
      }),
    );

    await expect(listCloudflareAccountsForToken("token")).resolves.toEqual([
      { accountId, accountName: "Example account" },
    ]);
    const [input, init] = fetch.mock.calls[0] ?? ["missing request"];
    const request = new Request(input, init);
    expect(request.url).toBe("https://api.cloudflare.com/client/v4/accounts?page=1&per_page=5");
    expect(request.headers.get("authorization")).toBe("Bearer token");
  });

  it.each([
    {
      name: "an HTML page",
      response: () => new Response("<html>gateway</html>"),
      operation: workersBuilds.listTokens({ accountId, page: 1, perPage: 1 }),
    },
    {
      name: "an empty body",
      response: () => new Response(null, { status: 204 }),
      operation: workers.getAccountSetting({ accountId }),
    },
    {
      name: "a result without the success flag",
      response: () => Response.json({ result: { id: "c".repeat(32), status: "active" } }),
      operation: user.verifyToken({}),
    },
  ])("rejects a 2xx answer with $name", async ({ response, operation }) => {
    answer(response);

    await expect(runCloudflare<unknown, unknown>("token", operation)).rejects.toThrow(
      "without a success envelope",
    );
  });

  it("rejects without the provider body or the account ID", async () => {
    answer(() => new Response("private provider detail", { status: 503 }));

    const error = await runCloudflare("token", workers.getAccountSetting({ accountId })).catch(
      (rejection: unknown) => rejection,
    );

    expect(error).toBeInstanceOf(Error);
    const message = error instanceof Error ? error.message : "";
    expect(message).toContain("GET /accounts/{account_id}/workers/account-settings");
    expect(message).not.toContain("private provider detail");
    expect(message).not.toContain(accountId);
  });

  it("gives up on a response body that stalls", async () => {
    vi.useFakeTimers();
    answer(() => new Response(new ReadableStream({ start: () => undefined })));

    const result = runCloudflare("token", user.verifyToken({})).then(
      () => "resolved",
      () => "rejected",
    );
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(result).resolves.toBe("rejected");
  });
});
