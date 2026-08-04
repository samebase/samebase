import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { api, internal } from "./_generated/api";
import { makeConvexTest } from "./test.setup";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getCloudflareMcpOAuthUrl", () => {
  it("registers the Cloudflare OAuth client with the Samebase display name", async () => {
    const t = makeConvexTest();
    const { organizationId, userId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "test@example.invalid",
        isApproved: true,
      });
      const organizationId = await ctx.db.insert("organizations", {
        name: "Cloudflare MCP organization",
      });
      await ctx.db.insert("organizationMemberships", { organizationId, userId });
      return { organizationId, userId };
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
    const returnToPath = `/providers?organization=${organizationId}`;

    const authorizeUrl = await t
      .withIdentity({
        subject: `${userId}|test-session`,
        tokenIdentifier: `test:${userId}`,
      })
      .action(api.cloudflareMcpOAuth.getCloudflareMcpOAuthUrl, {
        organizationId,
        returnToPath,
      });

    expect(authorizeUrl).toContain("client_id=registered-client");
    expect(fetch).toHaveBeenCalledOnce();
    await expect(
      t.query(internal.oauthState.getOauthStateByState, {
        provider: "cloudflare_mcp",
        state: new URL(authorizeUrl).searchParams.get("state") ?? "",
      }),
    ).resolves.toMatchObject({ organizationId, returnToPath, userId });
  });
});
