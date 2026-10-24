import { describe, expect, it } from "vite-plus/test";

import {
  createPostHogOriginRequest,
  createPostHogProxyPreflightResponse,
  isPostHogAssetPath,
  withPostHogProxyCorsHeaders,
} from "./index";

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

  it("adds browser CORS headers for Samebase app requests", async () => {
    const response = withPostHogProxyCorsHeaders(
      new Response("config", {
        headers: {
          "content-type": "application/javascript",
          vary: "Accept-Encoding",
        },
      }),
      new Request("https://e.samebase.com/array/phc_test/config.js", {
        headers: {
          origin: "https://samebase.com",
        },
      }),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://samebase.com");
    expect(response.headers.get("Vary")).toBe("Accept-Encoding, Origin");
    expect(await response.text()).toBe("config");
  });

  it("does not add CORS headers for other origins", () => {
    const response = withPostHogProxyCorsHeaders(
      new Response("config"),
      new Request("https://e.samebase.com/array/phc_test/config.js", {
        headers: {
          origin: "https://example.com",
        },
      }),
    );

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers Samebase CORS preflights without forwarding to PostHog", () => {
    const response = createPostHogProxyPreflightResponse(
      new Request("https://e.samebase.com/e/", {
        headers: {
          "Access-Control-Request-Headers": "content-type",
          origin: "https://samebase.com",
        },
        method: "OPTIONS",
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://samebase.com");
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe("content-type");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, HEAD, POST, OPTIONS");
  });
});
