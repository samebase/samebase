import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { callCloudflareMcpTool } from "./mcpClient";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("Cloudflare MCP client", () => {
  it("omits browser Origin headers from backend requests", async () => {
    vi.stubEnv("SITE_URL", "https://preview-branch.example.com");
    vi.stubEnv("CONVEX_SITE_URL", "https://preview-backend.example.com");

    const requests: RequestInit[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
        if (!init) {
          throw new Error("Expected Cloudflare MCP request options.");
        }
        requests.push(init);

        switch (requests.length) {
          case 1:
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: {},
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  "Mcp-Session-Id": "session-id",
                },
              },
            );
          case 2:
            return new Response(null, { status: 202 });
          case 3:
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 2,
                result: {
                  content: [{ type: "text", text: "tool result" }],
                },
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          case 4:
            return new Response(null, { status: 200 });
          default:
            throw new Error("Unexpected Cloudflare MCP request.");
        }
      }),
    );

    await expect(
      callCloudflareMcpTool({
        token: "mcp-oauth-token",
        toolName: "code_mode",
        toolArgs: {
          code: "return await cloudflare.request({ method: 'GET', path: '/accounts' });",
        },
      }),
    ).resolves.toBe("tool result");

    expect(requests).toHaveLength(4);
    expect(requests[0]?.body).toBe(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: {
            name: "Samebase",
            version: "0.0.0",
          },
        },
      }),
    );
    for (const request of requests) {
      expect(new Headers(request.headers).has("Origin")).toBe(false);
    }
  });
});
