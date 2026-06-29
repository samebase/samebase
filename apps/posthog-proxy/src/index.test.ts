import { describe, expect, it } from "vite-plus/test";

import { createPostHogOriginRequest, isPostHogAssetPath } from "./index";

describe("posthog proxy worker", () => {
  it("routes PostHog SDK assets to the asset host", () => {
    expect(isPostHogAssetPath("/static/posthog-recorder.js")).toBe(true);
    expect(isPostHogAssetPath("/array/phc_test/config.js")).toBe(true);
    expect(isPostHogAssetPath("/i/v0/e/")).toBe(false);
    expect(isPostHogAssetPath("/e/")).toBe(false);
  });

  it("forwards capture requests to the EU ingest host without Samebase cookies", async () => {
    const originRequest = await createPostHogOriginRequest(
      new Request("https://e.samebase.com/i/v0/e/?compression=gzip-js", {
        body: "compressed-event-body",
        headers: {
          "CF-Connecting-IP": "203.0.113.10",
          cookie: "samebase_session=secret",
          "content-type": "text/plain",
        },
        method: "POST",
      }),
      "/i/v0/e/?compression=gzip-js",
    );

    expect(originRequest.url).toBe("https://eu.i.posthog.com/i/v0/e/?compression=gzip-js");
    expect(originRequest.method).toBe("POST");
    expect(originRequest.headers.get("cookie")).toBeNull();
    expect(originRequest.headers.get("content-type")).toBe("text/plain");
    expect(originRequest.headers.get("X-Forwarded-For")).toBe("203.0.113.10");
    expect(await originRequest.text()).toBe("compressed-event-body");
  });
});
