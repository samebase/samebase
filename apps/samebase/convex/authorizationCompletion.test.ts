import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vite-plus/test";

import { buildAuthorizationCompletionResponse } from "./authorizationCompletion";

async function readCompletionScript(returnUrl: string): Promise<string> {
  const response = buildAuthorizationCompletionResponse({
    eventType: "convex-oauth-complete",
    returnUrl,
    title: "Convex OAuth",
  });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const html = await response.text();
  const scriptMatch = /<script>([\s\S]*?)<\/script>/.exec(html);
  if (scriptMatch?.[1] === undefined) {
    throw new Error("Authorization completion script is missing.");
  }
  return scriptMatch[1];
}

describe("authorization completion page", () => {
  it("navigates and closes a popup through its opener", async () => {
    const returnUrl = "https://samebase.com/org/acme/providers?prod-ui#connections";
    const openerReplace = vi.fn();
    const close = vi.fn();
    const selfReplace = vi.fn();

    runInNewContext(await readCompletionScript(returnUrl), {
      window: {
        close,
        location: { replace: selfReplace },
        opener: {
          closed: false,
          location: { replace: openerReplace },
          postMessage: vi.fn(),
        },
      },
    });

    expect(openerReplace).toHaveBeenCalledWith(returnUrl);
    expect(close).toHaveBeenCalledOnce();
    expect(selfReplace).not.toHaveBeenCalled();
  });

  it("uses a checked message when direct opener navigation is blocked", async () => {
    const returnUrl = "https://samebase.com/org/acme/providers?prod-ui#connections";
    const postMessage = vi.fn();
    const close = vi.fn();

    runInNewContext(await readCompletionScript(returnUrl), {
      window: {
        close,
        location: { replace: vi.fn() },
        opener: {
          closed: false,
          location: {
            replace: () => {
              throw new Error("Cross-origin navigation blocked.");
            },
          },
          postMessage,
        },
      },
    });

    expect(postMessage).toHaveBeenCalledWith(
      { type: "convex-oauth-complete", returnTo: returnUrl },
      "https://samebase.com",
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("navigates the current window for direct callback navigation", async () => {
    const returnUrl = "https://samebase.com/org/acme/providers?prod-ui#connections";
    const selfReplace = vi.fn();

    runInNewContext(await readCompletionScript(returnUrl), {
      window: {
        location: { replace: selfReplace },
        opener: null,
      },
    });

    expect(selfReplace).toHaveBeenCalledWith(returnUrl);
  });
});
