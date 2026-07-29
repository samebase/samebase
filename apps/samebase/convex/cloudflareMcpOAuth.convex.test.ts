import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getCloudflareMcpOAuthUrl", () => {
  it("registers the Cloudflare OAuth client with the Samebase display name", async () => {
    const t = makeConvexTest();
    const userId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "test@example.invalid",
        isApproved: true,
      });
    });
    vi.stubEnv(
      "PROVIDER_CLOUDFLARE_MCP_REDIRECT_URL",
      "https://samebase.test/api/auth/cloudflare/callback",
    );
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("https://mcp.cloudflare.com/register");
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Content-Type")).toBe("application/json");
      expect(init?.body).toBe(
        JSON.stringify({
          redirect_uris: ["https://samebase.test/api/auth/cloudflare/callback"],
          token_endpoint_auth_method: "none",
          response_types: ["code"],
          grant_types: ["authorization_code", "refresh_token"],
          client_name: "Samebase",
        }),
      );
      return new Response(JSON.stringify({ client_id: "registered-client" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetch);

    const authorizeUrl = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .action(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl, {});

    expect(authorizeUrl).toContain("client_id=registered-client");
    expect(fetch).toHaveBeenCalledOnce();
  });
});
