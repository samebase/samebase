import { describe, expect, it } from "vite-plus/test";

import { resolveCloudflareMcpRefreshClient } from "./cloudflareMcpOAuth";

describe("resolveCloudflareMcpRefreshClient", () => {
  it("uses the persisted Cloudflare OAuth client id for refresh", () => {
    expect(
      resolveCloudflareMcpRefreshClient({
        clientId: " 4L50pCGEnfQ9zea4 ",
      }),
    ).toEqual({
      clientId: "4L50pCGEnfQ9zea4",
      source: "stored_auth",
    });
  });

  it("treats legacy connections without stored client metadata as reconnect-required", () => {
    expect(
      resolveCloudflareMcpRefreshClient({
        clientId: undefined,
      }),
    ).toEqual({
      clientId: null,
      source: "missing",
    });
  });
});
