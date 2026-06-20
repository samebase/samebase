import { describe, expect, it } from "vite-plus/test";

import { readEnvFileValue, resolveBrowserConvexProxyTarget } from "./browserConvexProxy";

describe("browserConvexProxy", () => {
  it("prefers the local Convex URL when the dev frontend has a public origin", () => {
    expect(
      resolveBrowserConvexProxyTarget({
        devOrigin: "https://preview.samebase.example",
        envProxyTarget: "http://127.0.0.1:11310",
        localEnvConvexUrl: "http://127.0.0.1:11036",
      }),
    ).toBe("http://127.0.0.1:11036");
  });

  it("falls back to the explicit proxy target without a public dev origin", () => {
    expect(
      resolveBrowserConvexProxyTarget({
        devOrigin: undefined,
        envProxyTarget: "http://127.0.0.1:11310",
        localEnvConvexUrl: "http://127.0.0.1:11036",
      }),
    ).toBe("http://127.0.0.1:11310");
  });

  it("does not proxy Convex for loopback frontend origins", () => {
    expect(
      resolveBrowserConvexProxyTarget({
        devOrigin: "http://localhost:5175",
        envProxyTarget: undefined,
        localEnvConvexUrl: "http://127.0.0.1:11036",
      }),
    ).toBeUndefined();
  });

  it("reads raw env file values without process env overrides", () => {
    const envPath = new URL("./fixtures/browser-convex-proxy.env", import.meta.url);

    expect(readEnvFileValue(envPath.pathname, "VITE_CONVEX_URL")).toBe("http://127.0.0.1:11036");
  });
});
