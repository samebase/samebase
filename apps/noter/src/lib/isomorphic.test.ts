// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { requestOrigin } = vi.hoisted(() => ({
  requestOrigin: {
    value: "https://noter.md/home",
  },
}));

type IsomorphicClientFactory = () => unknown;
type IsomorphicServerFactory = () => unknown;

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    client: (_clientFactory: IsomorphicClientFactory) => ({
      server: (_serverFactory: IsomorphicServerFactory) => () => requestOrigin.value,
    }),
  }),
}));

vi.mock("@tanstack/react-start/server", () => ({
  getRequestUrl: () => new URL(requestOrigin.value),
}));

beforeEach(() => {
  vi.resetModules();
  requestOrigin.value = "https://noter.md/home";
});

describe("isomorphic origin", () => {
  it("uses the browser origin before TanStack's request URL during browser renders", async () => {
    const { readIsomorphicOrigin } = await import("./isomorphic");

    expect(readIsomorphicOrigin()).toBe(window.location.origin);
    expect(readIsomorphicOrigin()).not.toBe("https://noter.md/home");
  });
});
